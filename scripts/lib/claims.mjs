// Learned statements retain their authority; recording history never certifies current code.
import { scanSecrets } from './secrets.mjs';

export const CLAIM_CATEGORIES = Object.freeze(/** @type {const} */ (['source-fact', 'practice', 'decision', 'policy', 'hypothesis']));
export const CLAIM_AUTHORITIES = Object.freeze(/** @type {const} */ (['observed', 'team-accepted', 'company-policy', 'none']));
export const CLAIM_ORIGINS = Object.freeze(/** @type {const} */ (['human', 'team', 'assistant', 'tool']));
export const CLAIM_STATUSES = Object.freeze(/** @type {const} */ (['proposed', 'accepted', 'superseded', 'rejected']));

/** @typedef {{ type: 'file', path: string, sha256: string, lines?: string }
 * | { type: 'pr', number: number, state: 'merged'|'reverted'|'closed', date: string }
 * | { type: 'review-comment', pr: number, comment: number, outcome: 'accepted'|'rejected'|'unknown' }
 * | { type: 'session', id: string, date: string }} Evidence */
/** @typedef {{ id: string, statement: string, category: typeof CLAIM_CATEGORIES[number],
 * authority: typeof CLAIM_AUTHORITIES[number], scope: { project: string|null, paths: string[], environment: string|null },
 * evidence: Evidence[], origin: typeof CLAIM_ORIGINS[number], status: typeof CLAIM_STATUSES[number],
 * recordedAt: string, verifiedAt: string|null, supersedes: string[] }} Claim */
/** @typedef {{ id: string|null, rule: string, message: string }} ClaimError */
/** @typedef {{ ok: boolean, errors: ClaimError[] }} ClaimValidation */

/** @param {unknown} v @returns {v is Record<string, unknown>} */
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
/** @param {Record<string, unknown>} v @param {string[]} required @param {string[]} [optional] */
const keys = (v, required, optional = []) => required.every(k => Object.hasOwn(v, k)) && Object.keys(v).every(k => required.includes(k) || optional.includes(k));
/** @param {unknown} v @returns {v is string} */
const claimId = v => typeof v === 'string' && v.trim() === v && /^C-\d{4,}$/.test(v);
/** @param {unknown} v @returns {v is string} */
const text = v => typeof v === 'string' && !!v.trim() && !/[\r\n\u2028\u2029]/.test(v);
/** @param {unknown} v */
const positive = v => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
/** @param {unknown} v @param {readonly string[]} values */
const oneOf = (v, values) => typeof v === 'string' && values.includes(v);
/** Relative POSIX paths/globs, without ambiguous segments or Windows absolute paths.
 * @param {unknown} v @param {boolean} [globs] */
function path(v, globs = true) {
  return typeof v === 'string' && !!v.trim() && !/^[A-Za-z]:|[\\\x00-\x1f\x7f\u2028\u2029]/.test(v)
    && v.split('/').every(p => p !== '' && p !== '.' && p !== '..') && (globs || !/[*?\[\]{}]/.test(v));
}
/** @param {unknown} v */
function date(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || v.startsWith('0000')) return false;
  const d = new Date(`${v}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
/** @param {unknown} v */
function lines(v) {
  const m = typeof v === 'string' && /^L([1-9]\d*)-([1-9]\d*)$/.exec(v);
  return !!m && m[0] === v && positive(Number(m[1])) && positive(Number(m[2])) && Number(m[1]) <= Number(m[2]);
}
/** @param {unknown} v @returns {v is Evidence} */
function evidenceShape(v) {
  if (!object(v)) return false;
  switch (v.type) {
    case 'file': return keys(v, ['type', 'path', 'sha256'], ['lines']) && path(v.path, false)
      && typeof v.sha256 === 'string' && v.sha256.length === 64 && /^[a-f0-9]{64}$/i.test(v.sha256) && (!Object.hasOwn(v, 'lines') || lines(v.lines));
    case 'pr': return keys(v, ['type', 'number', 'state', 'date']) && positive(v.number)
      && oneOf(v.state, ['merged', 'reverted', 'closed']) && date(v.date);
    case 'review-comment': return keys(v, ['type', 'pr', 'comment', 'outcome']) && positive(v.pr) && positive(v.comment)
      && oneOf(v.outcome, ['accepted', 'rejected', 'unknown']);
    case 'session': return keys(v, ['type', 'id', 'date']) && typeof v.id === 'string' && v.id.length === 8 && /^[a-f0-9]{8}$/i.test(v.id) && date(v.date);
    default: return false;
  }
}
/** @param {unknown} v @returns {v is Claim} */
function claimShape(v) {
  if (!object(v) || !keys(v, ['id', 'statement', 'category', 'authority', 'scope', 'evidence', 'origin', 'status', 'recordedAt', 'verifiedAt', 'supersedes'])) return false;
  const s = v.scope;
  return claimId(v.id) && text(v.statement) && v.statement.length <= 300
    && oneOf(v.category, CLAIM_CATEGORIES) && oneOf(v.authority, CLAIM_AUTHORITIES)
    && oneOf(v.origin, CLAIM_ORIGINS) && oneOf(v.status, CLAIM_STATUSES)
    && object(s) && keys(s, ['project', 'paths', 'environment']) && (s.project === null || text(s.project))
    && (s.environment === null || text(s.environment)) && Array.isArray(s.paths) && Array.from(s.paths).every(p => path(p))
    && Array.isArray(v.evidence) && v.evidence.length >= 1 && v.evidence.length <= 20 && Array.from(v.evidence).every(evidenceShape)
    && date(v.recordedAt) && (v.verifiedAt === null || date(v.verifiedAt))
    && Array.isArray(v.supersedes) && Array.from(v.supersedes).every(claimId);
}

/** Validate JSON-shaped input without quoting any user-supplied text in diagnostics.
 * @param {unknown} list @returns {ClaimValidation} */
export function validateClaims(list) {
  /** @type {ClaimError[]} */ const errors = [];
  /** @param {string|null} id @param {string} rule @param {string} message */
  const fail = (id, rule, message) => errors.push({ id, rule, message });
  if (!Array.isArray(list)) return { ok: false, errors: [{ id: null, rule: 'shape', message: 'Expected a claim array.' }] };
  /** @type {Map<string, Claim>} */ const claims = new Map();
  const ids = new Set();
  for (const v of list) {
    const id = object(v) && claimId(v.id) ? v.id : null;
    if (id && ids.has(id)) fail(id, 'duplicate-id', 'Claim IDs must be unique.');
    if (id) ids.add(id);
    if (object(v) && typeof v.statement === 'string' && scanSecrets(v.statement).length) fail(id, 'secret', 'Statement contains a possible secret.');
    if (!claimShape(v)) { fail(id, 'shape', 'Invalid claim fields, evidence, dates or paths.'); continue; }
    if (!claims.has(v.id)) claims.set(v.id, v);
    const file = v.evidence.some(e => e.type === 'file');
    if (v.category === 'source-fact' && (!file || v.authority !== 'observed')) fail(id, 'source-fact', 'Source facts require file evidence and observed authority.');
    if (v.category === 'practice') {
      const independent = new Set(v.evidence.flatMap(e => e.type === 'pr' ? [`pr:${e.number}`] : e.type === 'file' ? [`file:${e.path}`] : []));
      if (v.authority !== 'observed' || independent.size < 2) fail(id, 'practice', 'Practices require observed authority and two independent PRs or files.');
    }
    if (v.category === 'decision' && v.status === 'accepted' && !v.evidence.some(e => e.type === 'file'
      || e.type === 'pr' && e.state === 'merged' || e.type === 'review-comment' && e.outcome === 'accepted')) {
      fail(id, 'decision', 'Accepted decisions require supporting file, merged PR or accepted review evidence.');
    }
    if (v.category === 'policy' ? v.authority !== 'company-policy' || v.origin === 'assistant' || !file : v.authority === 'company-policy') {
      fail(id, 'policy', 'Only policies carry company-policy authority; policies require file evidence and non-assistant origin.');
    }
    if (v.category === 'hypothesis' && (v.authority !== 'none' || v.status === 'accepted')) fail(id, 'hypothesis', 'Hypotheses require no authority and cannot be accepted.');
    if (v.origin === 'assistant' && v.category !== 'hypothesis') fail(id, 'assistant-origin', 'Assistant origin is restricted to hypotheses.');
    if (v.verifiedAt !== null && (!file || v.verifiedAt < v.recordedAt)) fail(id, 'verified', 'Verification requires file evidence and cannot predate recording.');
  }
  // Kahn traversal checks cycles without recursion, even for long supersession chains.
  const incoming = new Map([...claims.keys()].map(id => [id, 0]));
  for (const c of claims.values()) for (const id of c.supersedes) {
    const target = claims.get(id);
    if (!target || id === c.id || c.status === 'accepted' && target.status !== 'superseded') {
      fail(c.id, 'supersedes', 'Supersession targets must exist, differ from the claim, and be superseded when the claim is accepted.');
    }
    if (target) incoming.set(id, (incoming.get(id) ?? 0) + 1);
  }
  const pending = [...incoming].filter(([, n]) => n === 0).map(([id]) => id);
  let visited = 0;
  while (pending.length) {
    const c = claims.get(/** @type {string} */ (pending.pop()));
    visited++;
    for (const id of c?.supersedes ?? []) if (incoming.has(id)) {
      const n = (incoming.get(id) ?? 0) - 1;
      incoming.set(id, n);
      if (n === 0) pending.push(id);
    }
  }
  if (visited !== claims.size) fail(null, 'supersedes', 'Supersession graph contains a cycle.');
  return { ok: errors.length === 0, errors };
}

/** Approval only changes status. Call validateClaims on the resulting list before using it.
 * @param {Claim} claim @returns {Claim} */
export function approveClaim(claim) { return { ...structuredClone(claim), status: 'accepted' }; }

/** @param {Claim} claim @returns {'verified'|'recorded-only'} */
export function currentness(claim) {
  return claim.verifiedAt !== null && claim.evidence.some(e => e.type === 'file') ? 'verified' : 'recorded-only';
}
