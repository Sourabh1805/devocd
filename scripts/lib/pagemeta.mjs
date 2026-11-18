// @ts-check
// Parser for the fixed, machine-read header lines of knowledge pages.
// Format: see skills/add-project/references/knowledge-contract.md.

import { fencedLines, linkTargets } from './check.mjs';

/**
 * @typedef {{ path: string, start: number|null, end: number|null, sha256: string, date: string }} EvidenceItem
 * @typedef {{ parent: string|null, scope: string[], standards: string[], uses: string[], evidence: EvidenceItem[], problems: Array<{ line: number, message: string }> }} PageMeta
 */

const KEY = /^(Parent|Scope|Standards|Uses):[ \t]*(.*)$/;
const EVIDENCE_ITEM = /^(\S+)[ \t]+sha256:([0-9a-f]{64})[ \t]+(\d{4}-\d{2}-\d{2})$/;
const EVIDENCE_KEY = /^(Parent|Scope|Standards|Uses):/;

/** @returns {boolean} true for a line that starts with a machine-read header key */
export function isHeaderKeyLine(/** @type {string} */ line) {
  return EVIDENCE_KEY.test(line);
}

/** @returns {boolean} true when a repo-relative path is unsafe */
function unsafePath(/** @type {string} */ p) {
  return p.includes('\\') || p.startsWith('/') || /^[A-Za-z]:/.test(p) || p.split('/').includes('..');
}

/** @returns {boolean} true when a link target is not a plain relative path (parents may use "../") */
function unsafeParent(/** @type {string} */ p) {
  return /^[a-z][a-z0-9+.-]*:/i.test(p) || p.startsWith('/') || p.includes('\\');
}

/** @returns {boolean} true for a real calendar date written YYYY-MM-DD */
export function realDate(/** @type {string} */ d) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) return false;
  const [y, mo, da] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, da));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === da;
}

function unwrap(/** @type {string} */ s) {
  const t = s.trim();
  return t.length >= 2 && t.startsWith('`') && t.endsWith('`') ? t.slice(1, -1).trim() : t;
}

function clip(/** @type {string} */ s) {
  return s.length > 40 ? `${s.slice(0, 40)}...` : s;
}

/**
 * Parse the machine-read lines of a knowledge page. Never throws.
 * @param {string} text
 * @returns {PageMeta}
 */
export function parsePageMeta(text) {
  /** @type {PageMeta} */
  const meta = { parent: null, scope: [], standards: [], uses: [], evidence: [], problems: [] };
  if (typeof text !== 'string' || !text) return meta;
  const problem = (/** @type {number} */ line, /** @type {string} */ message) => meta.problems.push({ line, message });

  /** @param {string} rest @param {number} line @param {string} label */
  const list = (rest, line, label) => {
    /** @type {string[]} */
    const out = [];
    if (/^none$/i.test(rest.trim())) return out;
    let sawNone = false;
    // Split on commas outside {...} so brace globs such as src/{a,b}/** stay whole.
    const parts = [];
    let depth = 0, start = 0;
    for (let k = 0; k < rest.length; k++) {
      if (rest[k] === '{') depth++;
      else if (rest[k] === '}' && depth > 0) depth--;
      else if (rest[k] === ',' && depth === 0) { parts.push(rest.slice(start, k)); start = k + 1; }
    }
    parts.push(rest.slice(start));
    for (const raw of parts) {
      const item = unwrap(raw);
      if (!item) continue;
      if (/^none$/i.test(item)) { sawNone = true; continue; }
      if (unsafePath(item)) problem(line, `${label} item rejected: must be repo-relative without ".." segments, backslashes or a drive letter (${clip(item)})`);
      else out.push(item);
    }
    if (sawNone) problem(line, `${label}: none cannot be combined with other items`);
    return out;
  };

  const seen = new Set();
  const lines = text.split('\n');
  const fenced = fencedLines(text);
  let inEvidence = false;
  let inHeader = true;
  for (let i = 0; i < lines.length; i++) {
    if (fenced[i]) continue;
    const n = i + 1;
    const line = lines[i].replace(/\r$/, '');

    const heading = /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t#]*$/.exec(line);
    if (heading) {
      if (heading[1].length >= 2) inHeader = false;
      inEvidence = heading[1] === '##' && heading[2].trim().toLowerCase() === 'evidence';
      continue;
    }
    if (inEvidence && EVIDENCE_KEY.test(line)) inEvidence = false;

    if (inEvidence) {
      if (!line.trim()) continue;
      const m = /^[-*][ \t]+(.*)$/.exec(line);
      const body = (m ? m[1] : line).trim();
      const parts = EVIDENCE_ITEM.exec(body);
      if (!parts) {
        problem(n, `Evidence item does not match "<path>[#L<start>[-<end>]] sha256:<64 hex> <YYYY-MM-DD>": ${clip(line.trim())}`);
        continue;
      }
      const raw = unwrap(parts[1]);
      const ref = /^(.+?)#L(\d+)(?:-(\d+))?$/.exec(raw);
      const colon = ref ? null : /^(.+?):(\d+)(?:-(\d+))?$/.exec(raw);
      const hit = ref || colon;
      const path = hit ? hit[1] : raw;
      if (unsafePath(path)) { problem(n, `Evidence path rejected: must be repo-relative without ".." segments, backslashes or a drive letter (${clip(path)})`); continue; }
      const start = hit ? Number(hit[2]) : null;
      const end = hit ? (hit[3] !== undefined ? Number(hit[3]) : start) : null;
      if (colon) problem(n, `Evidence uses ":" line numbers; write ${path}#L${hit && hit[2]}${hit && hit[3] !== undefined ? `-${hit[3]}` : ''} instead`);
      if (start !== null && (start < 1 || /** @type {number} */ (end) < start)) { problem(n, `Evidence line range is invalid (${clip(raw)})`); continue; }
      if (!realDate(parts[3])) { problem(n, `Evidence date is not a real calendar date (${parts[3]})`); continue; }
      meta.evidence.push({ path, start, end, sha256: parts[2], date: parts[3] });
      continue;
    }

    const k = KEY.exec(line);
    if (!k) continue;
    if (k[1] !== 'Standards' && !inHeader) continue;
    if (seen.has(k[1])) { problem(n, `Duplicate "${k[1]}:" line ignored; the first one wins`); continue; }
    seen.add(k[1]);
    const rest = k[2];
    if (k[1] === 'Parent') {
      const target = (linkTargets(rest)[0] || '').split('#')[0];
      if (target && unsafeParent(target)) problem(n, `Parent rejected: must be a relative path (${clip(target)})`);
      else meta.parent = target || null;
    } else if (k[1] === 'Scope') {
      meta.scope = list(rest, n, 'Scope');
    } else if (k[1] === 'Uses') {
      meta.uses = list(rest, n, 'Uses');
    } else {
      const topics = rest.split(/ [—-] /)[0].trim();
      meta.standards = /^none\b/i.test(topics)
        ? []
        : topics.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    }
  }
  return meta;
}
