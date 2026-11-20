// @ts-check
// T80: check a worker's read-only proposal before a controller persists anything.
// The validator never writes, never mutates its input and exposes no approval path:
// a DONE proposal means "ready to check", never approved or published.
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { lstatOrNull } from './fsutil.mjs';
import { validateClaims } from './claims.mjs';

/** The only statuses a worker may return. */
export const STATUSES = Object.freeze(/** @type {const} */ (['DONE', 'DONE_WITH_CONCERNS', 'NEEDS_CONTEXT', 'BLOCKED']));

const PROPOSAL_FIELDS = Object.freeze(['unit', 'status', 'summary', 'proposals', 'evidence', 'concerns']);
const PAGE_FIELDS = Object.freeze(['kind', 'path', 'content']);
const CLAIM_FIELDS = Object.freeze(['kind', 'claim']);
/** @type {Readonly<Record<string, readonly string[]>>} */
const EVIDENCE_FIELDS = Object.freeze({
  file: Object.freeze(['type', 'path', 'sha256']),
  pr: Object.freeze(['type', 'number']),
  session: Object.freeze(['type', 'id']),
});

const CONTROL = /[\x00-\x1f\x7f\u2028\u2029]/;
const NEWLINE = /[\r\n\u2028\u2029]/;
const SHA256 = /^[a-f0-9]{64}$/i;

/** @typedef {{ rule: string, message: string, index?: number }} Problem */
/** @typedef {{ ok: boolean, problems: Problem[] }} ProposalValidation */
/** @typedef {{ root?: string, permittedPaths?: readonly string[] }} ProposalOptions */

/** @param {unknown} v @returns {v is Record<string, unknown>} */
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
/** @param {unknown} v @returns {v is string} */
const text = (v) => typeof v === 'string' && v.trim() !== '';
/** @param {unknown} v */
const positiveInteger = (v) => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
/** @param {unknown} v @returns {v is string} */
const sha256 = (v) => typeof v === 'string' && SHA256.test(v);

/** The reason a value is not a safe relative POSIX path, or null when it is one.
 * @param {unknown} value @returns {string|null} */
function pathProblem(value) {
  if (!text(value)) return 'must be a non-empty string';
  if (CONTROL.test(value)) return 'contains a control character';
  if (value.includes('\\')) return 'must use forward slashes, not backslashes';
  if (value.startsWith('/') || /^[A-Za-z]:/.test(value)) return 'must be relative, not absolute or a Windows drive path';
  const segments = value.split('/');
  if (segments.includes('')) return 'has an empty segment';
  if (segments.includes('..')) return 'must not contain ".."';
  return null;
}

/** True only when abs is strictly below root, by path arithmetic. */
function inside(/** @type {string} */ root, /** @type {string} */ abs) {
  const rel = relative(root, abs);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

/**
 * Validate a worker proposal. Pure: it reads evidence files to hash them and returns findings.
 * Nothing is written and there is deliberately no approved/published flag.
 * @param {unknown} proposal @param {ProposalOptions} [options] @returns {ProposalValidation}
 */
export function validateProposal(proposal, { root, permittedPaths } = {}) {
  /** @type {Problem[]} */
  const problems = [];
  /** @param {string} rule @param {string} message @param {number} [index] */
  const fail = (rule, message, index) => {
    problems.push(index === undefined ? { rule, message } : { rule, message, index });
  };
  /** @param {unknown} value @param {readonly string[]} allowed @param {number} [index] */
  const unknownKeys = (value, allowed, index) => {
    if (!object(value)) return;
    for (const key of Object.keys(value)) {
      if (!allowed.includes(key)) fail('schema', `Unknown field ${JSON.stringify(key)}.`, index);
    }
  };

  if (!object(proposal)) {
    fail('schema', 'Proposal must be an object.');
    return { ok: false, problems };
  }

  const rootPath = text(root) ? resolve(root) : null;
  if (!rootPath) fail('config', 'root must be a non-empty path.');
  /** @type {string[]} */
  const prefixes = [];
  if (!Array.isArray(permittedPaths)) {
    fail('config', 'permittedPaths must be an array of draft prefixes.');
  } else {
    for (const prefix of permittedPaths) {
      if (!text(prefix)) { fail('config', 'permittedPaths entries must be non-empty strings.'); continue; }
      const clean = prefix.replace(/^\.\//, '');
      prefixes.push(clean.endsWith('/') ? clean : `${clean}/`);
    }
  }

  // 1. Schema: every field present with its type, unknown fields rejected.
  for (const field of PROPOSAL_FIELDS) {
    if (!Object.hasOwn(proposal, field)) fail('schema', `Missing field "${field}".`);
  }
  unknownKeys(proposal, PROPOSAL_FIELDS);
  if (Object.hasOwn(proposal, 'unit') && !text(proposal.unit)) fail('schema', 'unit must be a non-empty string.');
  if (Object.hasOwn(proposal, 'summary') && !(typeof proposal.summary === 'string' && proposal.summary.trim() && !NEWLINE.test(proposal.summary))) {
    fail('schema', 'summary must be a non-empty single-line string.');
  }
  const statusOk = typeof proposal.status === 'string' && /** @type {readonly string[]} */ (STATUSES).includes(proposal.status);
  if (!statusOk) fail('status', `status must be one of ${STATUSES.join(', ')}.`);

  const proposals = Array.isArray(proposal.proposals) ? proposal.proposals : [];
  const evidence = Array.isArray(proposal.evidence) ? proposal.evidence : [];
  const concerns = Array.isArray(proposal.concerns) ? proposal.concerns : [];
  if (Object.hasOwn(proposal, 'proposals') && !Array.isArray(proposal.proposals)) fail('schema', 'proposals must be an array.');
  if (Object.hasOwn(proposal, 'evidence') && !Array.isArray(proposal.evidence)) fail('schema', 'evidence must be an array.');
  if (Object.hasOwn(proposal, 'concerns')) {
    if (!Array.isArray(proposal.concerns)) fail('schema', 'concerns must be an array of strings.');
    else if (!proposal.concerns.every((concern) => typeof concern === 'string')) fail('schema', 'concerns must be an array of strings.');
  }

  if (statusOk) {
    if (proposal.status !== 'NEEDS_CONTEXT' && proposal.status !== 'BLOCKED' && proposals.length === 0) {
      fail('proposal', `${proposal.status} requires at least one proposal.`);
    }
    if (proposal.status === 'DONE' && evidence.length === 0) {
      fail('evidence', 'DONE requires at least one evidence entry.');
    }
    if (proposal.status === 'DONE_WITH_CONCERNS' && !concerns.some((concern) => typeof concern === 'string' && concern.trim())) {
      fail('concerns', 'DONE_WITH_CONCERNS requires at least one non-empty concern.');
    }
  }

  // 2. Permitted paths: every page proposal is relative, POSIX and inside a draft prefix.
  proposals.forEach((entry, index) => {
    if (!object(entry)) { fail('schema', 'Proposal entry must be an object.', index); return; }
    if (entry.kind !== 'page' && entry.kind !== 'claim') {
      fail('schema', 'Proposal kind must be "page" or "claim".', index);
      return;
    }
    unknownKeys(entry, entry.kind === 'page' ? PAGE_FIELDS : CLAIM_FIELDS, index);
    if (entry.kind === 'claim') {
      if (!object(entry.claim)) { fail('schema', 'Claim proposal claim must be an object.', index); return; }
      // The T44 claim validator owns the shape; report only its rule names, never claim text.
      const claim = validateClaims([entry.claim]);
      if (!claim.ok) {
        const failed = [...new Set(claim.errors.map((error) => error.rule))].join(', ');
        fail('claim', `Claim proposal is invalid: ${failed}.`, index);
      }
      return;
    }
    const problem = pathProblem(entry.path);
    if (problem) { fail('path', `Page proposal path ${problem}.`, index); return; }
    const pagePath = /** @type {string} */ (entry.path);
    if (!prefixes.some((prefix) => pagePath.startsWith(prefix))) {
      fail('permitted-path', 'Page proposal path is outside the permitted set.', index);
    }
    if (rootPath && !inside(rootPath, resolve(rootPath, pagePath))) {
      fail('path', 'Page proposal path escapes root.', index);
    }
    if (typeof entry.content !== 'string') fail('schema', 'Page proposal content must be a string.', index);
  });

  // 3. Evidence: files must exist as regular files inside root and match their hash.
  let rootReal = null;
  try { if (rootPath) rootReal = realpathSync(rootPath); }
  catch { fail('config', 'root does not exist.'); }

  evidence.forEach((entry, index) => {
    if (!object(entry)) { fail('schema', 'Evidence entry must be an object.', index); return; }
    const allowed = typeof entry.type === 'string' ? EVIDENCE_FIELDS[entry.type] : undefined;
    if (!allowed) { fail('evidence', 'Evidence type must be "file", "pr" or "session".', index); return; }
    unknownKeys(entry, allowed, index);

    if (entry.type === 'pr') {
      if (!positiveInteger(entry.number)) fail('evidence', 'PR evidence number must be a positive integer.', index);
      return;
    }
    if (entry.type === 'session') {
      if (!text(entry.id)) fail('evidence', 'Session evidence id must be a non-empty string.', index);
      return;
    }

    const problem = pathProblem(entry.path);
    if (problem) { fail('evidence', `File evidence path ${problem}.`, index); return; }
    if (!sha256(entry.sha256)) { fail('evidence', 'File evidence sha256 must be 64 hex characters.', index); return; }
    if (!rootPath) return;
    const file = /** @type {string} */ (entry.path);
    const abs = resolve(rootPath, file);
    if (!inside(rootPath, abs)) { fail('evidence', 'File evidence path escapes root.', index); return; }
    const stat = lstatOrNull(abs);
    if (!stat) { fail('evidence', 'File evidence does not exist.', index); return; }
    if (stat.isSymbolicLink()) { fail('evidence', 'File evidence must not be a symlink.', index); return; }
    if (!stat.isFile()) { fail('evidence', 'File evidence must be a regular file.', index); return; }
    if (rootReal) {
      let real = '';
      try { real = realpathSync(abs); }
      catch { fail('evidence', 'File evidence could not be resolved.', index); return; }
      if (!inside(rootReal, real)) { fail('evidence', 'File evidence resolves outside root.', index); return; }
    }
    let actual = '';
    try { actual = createHash('sha256').update(readFileSync(abs)).digest('hex'); }
    catch { fail('evidence', 'File evidence could not be read.', index); return; }
    if (actual !== /** @type {string} */ (entry.sha256).toLowerCase()) {
      fail('evidence', 'File evidence hash does not match sha256.', index);
    }
  });

  return { ok: problems.length === 0, problems };
}
