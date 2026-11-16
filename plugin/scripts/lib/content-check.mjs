// @ts-check
// Content checks for .devocd pages and decisions.md. Every issue is a warning or information note, so
// existing installs never start failing. Messages carry counts, IDs and rule names, never hashes or file text.

import { join } from 'node:path';
import { readTextOrNull } from './fsutil.mjs';
import { fencedLines } from './check.mjs';
import { buildKnowledge } from './knowledge.mjs';
import { inventoryKnowledge } from './inventory.mjs';
import { freshnessOf } from './trace.mjs';

/** @typedef {import('./check.mjs').Issue} Issue */

const ID = /^[A-Z][A-Z0-9]*-\d+$/;
const IDLIKE = /^[A-Za-z][A-Za-z0-9]*[-_]?\d[\w-]*$/;
const SKIP_KINDS = new Set(['generated', 'decision']);

/** @returns {boolean} true for a real calendar date written YYYY-MM-DD */
function realDate(/** @type {string} */ d) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) return false;
  const [y, mo, da] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, da));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === da;
}

/**
 * Page checks for a project: header, sections, standards, evidence, per-page staleness.
 * @param {string} root project root
 * @returns {Issue[]}
 */
export function pageIssues(root) {
  /** @type {Issue[]} */ const out = [];
  let graph;
  try { graph = buildKnowledge(root); } catch { return out; }
  const nodes = graph.nodes.filter((n) => !SKIP_KINDS.has(n.kind));
  for (const n of nodes) {
    const file = `.devocd/${n.id}`;
    for (const p of n.meta.problems) {
      out.push({ rule: 'page/header', severity: 'warning', file, line: p.line, message: p.message, hint: 'Fix the header line to match knowledge-contract.md "Page header lines".' });
    }
    if (n.kind !== 'module' && n.kind !== 'flow') continue;
    const lines = n.text.split('\n');
    const fenced = fencedLines(n.text);
    const has = (/** @type {RegExp} */ re) => lines.some((l, i) => !fenced[i] && re.test(l));
    if (n.kind === 'module') {
      const missing = [];
      if (!has(/^\s*(?:[-*]\s+|#{1,6}\s+)?\**\s*Entry points\b/i)) missing.push('Entry points');
      if (!has(/^\s*(?:[-*]\s+|#{1,6}\s+)?\**\s*Pitfalls\b/i)) missing.push('Pitfalls');
      if (missing.length) out.push({ rule: 'page/section-missing', severity: 'warning', file, message: `module page has no ${missing.join(' or ')} section`, hint: 'Add the missing bullets as described in knowledge-contract.md.' });
    }
    if (!has(/^Standards:/)) out.push({ rule: 'page/standards-missing', severity: 'warning', file, message: 'page has no Standards: line', hint: 'End the page with "Standards: <topics>" or "Standards: none".' });
    if (!n.meta.evidence.length) out.push({ rule: 'page/evidence-missing', severity: 'warning', file, message: 'page cites no evidence', hint: 'Add an ## Evidence list of source files with their sha256 and date.' });
  }
  const cited = nodes.filter((n) => n.meta.evidence.length);
  if (cited.length) {
    let inv;
    try { inv = inventoryKnowledge(root); } catch { inv = null; }
    if (!inv) {
      out.push({ rule: 'evidence/unchecked', severity: 'information', file: '.devocd', message: 'evidence freshness could not be checked: the source inventory could not be built', hint: 'Run the knowledge inventory to see why.' });
    } else {
      const fresh = freshnessOf(root, inv);
      const byPath = new Map(inv.files.map((f) => [f.path, f]));
      const skipped = new Set((inv.skipped ?? []).map((s) => s.path));
      for (const n of cited) {
        if (fresh(n) !== 'stale') continue;
        const changed = new Set();
        for (const e of n.meta.evidence) {
          const f = byPath.get(e.path);
          if (!f ? !skipped.has(e.path) : f.status === 'available' && f.sha256 !== e.sha256) changed.add(e.path);
        }
        const k = changed.size;
        out.push({ rule: 'evidence/stale', severity: 'warning', file: `.devocd/${n.id}`, message: `${k} cited file${k === 1 ? '' : 's'} changed or ${k === 1 ? 'is' : 'are'} missing since this page was written`, hint: 'Re-read the changed sources and refresh the page (/devocd:refresh).' });
      }
    }
  }
  return out;
}

/**
 * Check .devocd/decisions.md against the entry format in capture/references/workflow.md.
 * @param {string} root company or project root
 * @returns {Issue[]}
 */
export function decisionIssues(root) {
  const text = readTextOrNull(join(root, '.devocd', 'decisions.md'));
  if (text === null) return [];
  const file = '.devocd/decisions.md';
  /** @type {Issue[]} */ const out = [];
  const lines = text.split('\n').map((l) => l.replace(/\r$/, ''));
  const fenced = fencedLines(text);
  /** @type {{ id: string, line: number, date: string|null, links: string[] }[]} */
  const entries = [];
  /** @type {{ line: number, token: string }[]} */
  const bad = [];
  /** @type {typeof entries[number] | null} */
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    if (fenced[i]) continue;
    const h = /^## (\S+)[ \t]+[—-][ \t]+\S/.exec(lines[i]);
    if (h) {
      if (ID.test(h[1])) { cur = { id: h[1], line: i + 1, date: null, links: [] }; entries.push(cur); }
      else { cur = null; if (IDLIKE.test(h[1])) bad.push({ line: i + 1, token: h[1] }); }
      continue;
    }
    if (/^## /.test(lines[i])) { cur = null; continue; }
    if (!cur) continue;
    const d = /^Date:[ \t]*(.*?)[ \t]*$/.exec(lines[i]);
    if (d && cur.date === null) { cur.date = d[1]; continue; }
    const l = /^(?:Supersedes|Retires):[ \t]*(.*?)[ \t]*$/.exec(lines[i]);
    if (l) cur.links.push(...l[1].split(',').map((s) => s.trim()).filter(Boolean));
  }
  if (!entries.length) {
    return [{ rule: 'decisions/unstructured', severity: 'information', file, message: 'decisions.md has no entries in the machine-readable format', hint: 'Use "## D-0001 — Title" headings with a Date: line; see capture/references/workflow.md "Entry format".' }];
  }
  const warn = (/** @type {string} */ rule, /** @type {number} */ line, /** @type {string} */ message, /** @type {string} */ hint) => out.push({ rule, severity: 'warning', file, line, message, hint });
  for (const b of bad) warn('decisions/format', b.line, `entry ID "${b.token}" is invalid; IDs look like D-0003`, 'Use capital letters, a dash and digits, e.g. D-0003.');
  /** @type {Map<string, typeof entries[number]>} */
  const byId = new Map();
  for (const e of entries) {
    if (byId.has(e.id)) { warn('decisions/duplicate', e.line, `ID ${e.id} is used by more than one entry`, 'Give each entry a unique ID; never reuse one.'); continue; }
    byId.set(e.id, e);
    if (e.date === null) warn('decisions/format', e.line, `entry ${e.id} has no Date: line`, 'Add "Date: YYYY-MM-DD".');
    else if (!realDate(e.date)) warn('decisions/format', e.line, `entry ${e.id} has an invalid Date (use a real YYYY-MM-DD date)`, 'Write the date as YYYY-MM-DD.');
    for (const t of e.links) {
      if (t === e.id) warn('decisions/link', e.line, `entry ${e.id} supersedes or retires itself`, 'Point it at the older entry instead.');
      else if (!byId.has(t) && !entries.some((x) => x.id === t)) warn('decisions/link', e.line, `entry ${e.id} points at ${t.length > 40 ? 'an ID' : t}, which does not exist`, 'Fix the ID or remove the link.');
    }
  }
  // Cycles over supersedes/retires links between existing, distinct entries.
  /** @type {Map<string, number>} */ const state = new Map();
  /** @type {Set<string>} */ const reported = new Set();
  /** @param {string} id @param {string[]} path */
  const visit = (id, path) => {
    state.set(id, 1);
    for (const t of byId.get(id)?.links ?? []) {
      if (t === id || !byId.has(t)) continue;
      if (state.get(t) === 1) {
        const cycle = path.slice(path.indexOf(t)).concat(id);
        const key = [...cycle].sort().join(',');
        if (!reported.has(key)) {
          reported.add(key);
          warn('decisions/cycle', /** @type {number} */ (byId.get(t)?.line), `supersedes/retires links form a cycle: ${[...cycle, t].join(' -> ')}`, 'Break the cycle; a decision cannot replace one that replaced it.');
        }
      } else if (!state.has(t)) visit(t, [...path, id]);
    }
    state.set(id, 2);
  };
  for (const id of byId.keys()) if (!state.has(id)) visit(id, []);
  return out.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
}
