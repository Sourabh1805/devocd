// Content checks for .devocd pages and decisions.md. Every issue is a warning or information note, so
// existing installs never start failing. Messages carry counts, IDs and rule names, never hashes or file text.

import { join } from 'node:path';
import { readTextOrNull } from './fsutil.mjs';
import { fencedLines } from './check.mjs';
import { buildKnowledge } from './knowledge.mjs';
import { inventoryKnowledge } from './inventory.mjs';
import { pageFreshness } from './trace.mjs';
import { isHeaderKeyLine, realDate } from './pagemeta.mjs';
import { scanSecrets } from './secrets.mjs';

/** @typedef {import('./check.mjs').Issue} Issue */

const ID = /^[A-Z][A-Z0-9]*-\d+$/;
const IDLIKE = /^[A-Za-z][A-Za-z0-9]*-\d+$/;
const SKIP_KINDS = new Set(['generated', 'decision']);

/** Path shapes that name a test file, so "the page names its covering test" has one definition. */
const TEST_PATH_PATTERNS = Object.freeze([
  /(?:^|[\\/])(?:tests?|__tests__|spec)[\\/]/i, // tests/ __tests__/ spec/ folders, never the word "test"
  /(?:^|[\\/])src[\\/]test(?:[\\/]|$)/i, // src/test/ (Java, Kotlin)
  /[.-](?:test|spec)\.[a-z]+$/i, // a.test.js, a.spec.ts
  /(?:^|[\\/])test_[^\\/]+\.(?:py|rb|js|ts)$/i, // test_a.py
  /_test\.(?:go|py|rb|exs|js|ts)$/i, // a_test.go
  /(?:^|[\\/])[A-Za-z0-9_]+(?:Test|Tests|IT)\.(?:java|kt|cs|scala)$/, // ATest.java
]);

/** A source reference that carries a line: `path:12`, or `path#L12` / `path#L12-40`. The path must look like a file. */
const COLON_LINE = /(?:^|[\s`'"([<])([^\s`'"()[\]<>]*[./\\][^\s`'"()[\]<>]*?):\d+/;
const HASH_LINE = /(?:^|[\s`'"([<])([^\s`'"()[\]<>]*[./\\][^\s`'"()[\]<>]*?)#L\d+(?:-L?\d+)?/i;

/** A bullet or paragraph that names nothing to do: it reads as "there is nothing here". */
const PLACEHOLDER = /^(?:none|nil|n\/?a|na|tbd|tba|todo|nothing|-+|—+|\*+|\.+)$/i;

/** @param {string} text @param {boolean[]} masked @param {string} label */
function sectionText(text, masked, label) {
  const lines = text.split('\n');
  const re = new RegExp('^\\s*(?:[-*]\\s+|#{1,6}\\s+)?\\*{0,2}\\s*' + label + '\\b', 'i');
  const i = lines.findIndex((l, k) => masked[k] && re.test(l));
  if (i < 0) return null;
  const parts = [lines[i].replace(re, '')];
  const indentOf = (/** @type {string} */ s) => /** @type {RegExpExecArray} */ (/^\s*/.exec(s))[0].length;
  const indent = indentOf(lines[i]);
  for (let k = i + 1; k < lines.length; k++) {
    if (!masked[k] || !lines[k].trim()) break;
    if (/^#{1,6}\s/.test(lines[k]) || isHeaderKeyLine(lines[k])) break;
    // A nested bullet belongs to this item: `- Pitfalls:` with its sub-bullets is one item,
    // not an empty bullet followed by something else. A sibling bullet ends it.
    if (/^\s*[-*]\s+/.test(lines[k])) {
      if (indentOf(lines[k]) <= indent) break;
      parts.push(lines[k]);
      continue;
    }
    parts.push(lines[k]);
  }
  return parts.join('\n');
}

/** @param {string|null} text */
function hasUsefulItem(text) {
  if (text === null) return false;
  return text.split('\n')
    .map((s) => s.replace(/^[\s\-*•]+/, '').replace(/^[:：]\s*/, '').replace(/[`*_]/g, '').trim())
    .some((s) => s && !PLACEHOLDER.test(s));
}

/** @param {string} text @returns {boolean} a file:line, not a bare path or folder */
function hasEntryLine(text) {
  return COLON_LINE.test(text) || HASH_LINE.test(text);
}

/** @param {string[]} lines @param {boolean[]} masked @returns {boolean} the page names a test file outside Evidence and fences */
function namesTest(lines, masked) {
  for (let i = 0; i < lines.length; i++) {
    if (!masked[i] || isHeaderKeyLine(lines[i])) continue;
    // Test each path-like token, not the whole line: a test path is usually wrapped in prose or backticks.
    for (const m of lines[i].matchAll(/[A-Za-z0-9_@][\w./\\@-]*/g)) {
      const token = m[0].replace(/[.,;:)\]}>]+$/, '');
      if (token && TEST_PATH_PATTERNS.some((re) => re.test(token))) return true;
    }
  }
  return false;
}

/** @param {{ kind: string, text: string }} n @returns {string[]} why the page cannot be started from */
function actionabilityReasons(n) {
  const lines = n.text.split('\n');
  const fenced = fencedLines(n.text);
  // Mask what is not prose: fenced code, the ## Evidence list, and the machine-read header lines.
  let evidence = false;
  const masked = lines.map((l, i) => {
    if (/^#{1,6}\s+Evidence\b/i.test(l)) { evidence = true; return false; }
    if (evidence && /^#{1,6}\s/.test(l)) evidence = false;
    return !fenced[i] && !evidence && !isHeaderKeyLine(l);
  });
  const isModule = n.kind === 'module';
  /** @type {string[]} */ const reasons = [];
  const entry = sectionText(n.text, masked, 'Entry points');
  // A section that is entirely absent stays page/section-missing's finding, for module pages only.
  if (!hasEntryLine(entry) && (isModule ? entry !== null : true)) reasons.push('no concrete entry point (file:line)');
  if (isModule) {
    if (!namesTest(lines, masked)) reasons.push('no covering test');
    const ext = sectionText(n.text, masked, 'Extension points');
    const pit = sectionText(n.text, masked, 'Pitfalls');
    if ((ext !== null || pit !== null) && !hasUsefulItem(ext) && !hasUsefulItem(pit)) reasons.push('no extension recipe or pitfall');
  }
  return reasons;
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
    // The sections can exist and still carry nothing a task can start from (T98).
    const reasons = actionabilityReasons(n);
    if (reasons.length) {
      out.push({ rule: 'page/not-actionable', severity: 'warning', file, message: `${n.kind} page has ${reasons.join(', ')}`, hint: 'Name a file:line entry point, the covering test, and a recipe or pitfall observed in the code (knowledge-contract.md).' });
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
      for (const n of cited) {
        const f = pageFreshness(n, inv);
        if (f.status !== 'stale') continue;
        const k = f.changed.length;
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
    const d = /^Date:[ \t]*(.*?)[ \t]*$/i.exec(lines[i]);
    if (d && cur.date === null) { cur.date = d[1]; continue; }
    const l = /^(?:Supersedes|Retires):[ \t]*(.*?)[ \t]*$/i.exec(lines[i]);
    if (l) cur.links.push(...l[1].split(',').map((s) => s.trim()).filter(Boolean));
  }
  if (!entries.length) {
    return [{ rule: 'decisions/unstructured', severity: 'information', file, message: 'decisions.md has no entries in the machine-readable format', hint: 'Use "## D-0001 — Title" headings with a Date: line; see capture/references/workflow.md "Entry format".' }];
  }
  // Echo a token only when it is short and holds no secret; messages never carry other file text.
  const shown = (/** @type {string} */ t, /** @type {string} */ fallback) => (t.length > 40 || scanSecrets(t).length ? fallback : t);
  const warn = (/** @type {string} */ rule, /** @type {number} */ line, /** @type {string} */ message, /** @type {string} */ hint) => out.push({ rule, severity: 'warning', file, line, message, hint });
  for (const b of bad) warn('decisions/format', b.line, `entry ID ${shown(b.token, '(withheld)')} is invalid; IDs look like D-0003`, 'Use capital letters, a dash and digits, e.g. D-0003.');
  /** @type {Map<string, typeof entries[number]>} */
  const byId = new Map();
  for (const e of entries) {
    if (byId.has(e.id)) warn('decisions/duplicate', e.line, `ID ${e.id} is used by more than one entry`, 'Give each entry a unique ID; never reuse one.');
    else byId.set(e.id, e);
    if (e.date === null) warn('decisions/format', e.line, `entry ${e.id} has no Date: line`, 'Add "Date: YYYY-MM-DD".');
    else if (!realDate(e.date)) warn('decisions/format', e.line, `entry ${e.id} has an invalid Date (use a real YYYY-MM-DD date)`, 'Write the date as YYYY-MM-DD.');
    for (const t of e.links) {
      if (t === e.id) warn('decisions/link', e.line, `entry ${e.id} supersedes or retires itself`, 'Point it at the older entry instead.');
      else if (!entries.some((x) => x.id === t)) warn('decisions/link', e.line, `entry ${e.id} points at ${shown(t, 'an ID')}, which does not exist`, 'Fix the ID or remove the link.');
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
