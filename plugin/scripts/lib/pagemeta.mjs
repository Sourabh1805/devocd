// @ts-check
// Parser for the fixed, machine-read header lines of knowledge pages.
// Format: see plugin/skills/add-project/references/knowledge-contract.md.

/**
 * @typedef {{ path: string, start: number|null, end: number|null, sha256: string, date: string }} EvidenceItem
 * @typedef {{ parent: string|null, scope: string[], standards: string[], uses: string[], evidence: EvidenceItem[], problems: Array<{ line: number, message: string }> }} PageMeta
 */

const KEY = /^(Parent|Scope|Standards|Uses):[ \t]*(.*)$/;
const EVIDENCE_ITEM = /^(\S+)[ \t]+sha256:([0-9a-f]{64})[ \t]+(\d{4}-\d{2}-\d{2})$/;

/** @returns {boolean} true when a repo-relative path is unsafe */
function unsafePath(/** @type {string} */ p) {
  return p.includes('..') || p.startsWith('/') || p.startsWith('\\') || /^[A-Za-z]:/.test(p);
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
      if (unsafePath(item)) problem(line, `${label} item rejected: must be repo-relative without ".." (${clip(item)})`);
      else out.push(item);
    }
    return out;
  };

  const seen = new Set();
  let fence = '';
  let inEvidence = false;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const n = i + 1;
    const line = lines[i].replace(/\r$/, '');
    const f = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = '';
      continue;
    }
    if (f) { fence = f[1]; continue; }

    const heading = /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t#]*$/.exec(line);
    if (heading) {
      inEvidence = heading[1] === '##' && heading[2].trim().toLowerCase() === 'evidence';
      continue;
    }

    if (inEvidence) {
      if (!line.trim()) continue;
      const m = /^[-*][ \t]+(.*)$/.exec(line);
      const body = (m ? m[1] : line).trim();
      const parts = EVIDENCE_ITEM.exec(body);
      if (!parts) {
        problem(n, `Evidence item does not match "<path>[#L<start>[-<end>]] sha256:<64 hex> <YYYY-MM-DD>": ${clip(line.trim())}`);
        continue;
      }
      const ref = /^(.+?)(?:#L(\d+)(?:-(\d+))?)?$/.exec(unwrap(parts[1]));
      if (!ref) { problem(n, 'Evidence path is not valid'); continue; }
      if (unsafePath(ref[1])) { problem(n, `Evidence path rejected: must be repo-relative without ".." (${clip(ref[1])})`); continue; }
      const start = ref[2] === undefined ? null : Number(ref[2]);
      const end = ref[3] !== undefined ? Number(ref[3]) : start;
      meta.evidence.push({ path: ref[1], start, end, sha256: parts[2], date: parts[3] });
      continue;
    }

    const k = KEY.exec(line);
    if (!k) continue;
    if (seen.has(k[1])) { problem(n, `Duplicate "${k[1]}:" line ignored; the first one wins`); continue; }
    seen.add(k[1]);
    const rest = k[2];
    if (k[1] === 'Parent') {
      const link = /\[[^\]]*\]\(\s*<?([^)\s>]*)>?[^)]*\)/.exec(rest);
      const target = link ? link[1].split('#')[0] : '';
      meta.parent = target || null;
    } else if (k[1] === 'Scope') {
      meta.scope = list(rest, n, 'Scope');
    } else if (k[1] === 'Uses') {
      meta.uses = list(rest, n, 'Uses');
    } else {
      const topics = rest.split(/ [—-] /)[0].trim();
      meta.standards = /^none/i.test(topics)
        ? []
        : topics.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    }
  }
  return meta;
}
