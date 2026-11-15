// @ts-check
// Moment-of-need hooks. Read small local files under .devocd/ only; no network, no transcripts, no model calls.
// The one write is the edit hook's journal and stale marker inside the scope's own .devocd/ folder.
import { appendFileSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { findScope, preference } from './lib/scope.mjs';
import { lstatOrNull, toPosix } from './lib/fsutil.mjs';

const MAX_INDEX = 64 * 1024;
const MAX_SMALL = 1024 * 1024;
const MAX_MATCHES = 3;
const JOURNAL_MAX = 1000;
const JOURNAL_KEEP = 500;
const EDIT_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const IGNORED_TOP = new Set(['.devocd', '.claude', '.git']);
const STOP = new Set(('a an the and or of to in on for with from by at as it its this that these those is are be do does did i we you my our your me ' +
  'please can could should would will not no if so then than into about').split(' '));

/** Same light stemming idea as search.mjs: plural, -ing, -ed, trailing e. */
function stem(/** @type {string} */ w) {
  let s = w;
  if (s.length > 3 && s.endsWith('ies')) s = s.slice(0, -3) + 'y';
  else if (s.length > 3 && s.endsWith('s') && !s.endsWith('ss') && !s.endsWith('us')) s = s.slice(0, -1);
  if (s.length > 5 && s.endsWith('ing')) s = s.slice(0, -3);
  else if (s.length > 4 && s.endsWith('ied')) s = s.slice(0, -3) + 'y';
  else if (s.length > 4 && s.endsWith('ed')) s = s.slice(0, -2);
  if (s.length > 3 && s.endsWith('e')) s = s.slice(0, -1);
  return s;
}
function tokenSet(/** @type {string} */ text) {
  return new Set(text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w && !STOP.has(w)).map(stem));
}

/** Regular, non-linked file read of at most `max` bytes; null on anything else. */
function readSmall(/** @type {string} */ path, max) {
  const stat = lstatOrNull(path);
  if (!stat || !stat.isFile() || stat.isSymbolicLink() || stat.size > max) return null;
  return readFileSync(path, 'utf8');
}
function readJson(/** @type {string} */ path, max = MAX_SMALL) {
  try { const text = readSmall(path, max); return text === null ? null : JSON.parse(text); } catch { return null; }
}
function wrap(event, text) { return { hookSpecificOutput: { hookEventName: event, additionalContext: text } }; }
function enabled(scope) { return preference(scope, 'devocdHooks', true) === true; }

/** A link target must stay inside the standards folder: relative, no scheme, no `..`. */
function safeTarget(/** @type {string} */ raw) {
  const target = raw.split('#')[0];
  if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || /^[\\/]/.test(target) || isAbsolute(target)) return null;
  const parts = target.split(/[\\/]/);
  if (parts.some(p => p === '..' || p === '' || p === '.')) return null;
  return parts.join('/');
}

/** @param {any} input */
export function onPrompt(input) {
  if (input?.hook_event_name !== 'UserPromptSubmit' || typeof input.prompt !== 'string') return null;
  const scope = findScope(input.cwd);
  if (!scope || !enabled(scope)) return null;
  const companyRoot = scope.state.kind === 'company' ? scope.root : scope.company?.root;
  if (!companyRoot) return null;
  const standards = join(companyRoot, '.devocd', 'standards');
  let text;
  try {
    const dir = lstatOrNull(standards);
    if (!dir || !dir.isDirectory() || dir.isSymbolicLink()) return null;
    text = readSmall(join(standards, 'index.md'), MAX_INDEX);
  } catch { return null; }
  if (text === null) return null;
  const words = tokenSet(input.prompt.slice(0, 20000));
  if (!words.size) return null;
  let cwd;
  try { cwd = realpathSync(input.cwd); } catch { return null; }
  /** @type {string[]} */
  const found = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*[-*]\s+(.+?):\s*\[[^\]]*\]\(([^)\s]+)\)/.exec(line);
    if (!m) continue;
    const target = safeTarget(m[2]);
    if (!target) continue;
    const trigger = [...tokenSet(m[1])];
    if (!trigger.length) continue;
    const hits = trigger.filter(w => words.has(w)).length;
    if (trigger.length === 1 ? hits !== 1 : hits < 2) continue;
    const path = toPosix(relative(cwd, join(standards, target)));
    found.push(`${m[1].trim().slice(0, 120)} → read ${path}`);
    if (found.length === MAX_MATCHES) break;
  }
  return found.length ? wrap('UserPromptSubmit', `DevOCD policy for this request: ${found.join('; ')}`) : null;
}

function canonicalFile(/** @type {string} */ file) {
  try { return realpathSync(file); } catch { /* may not exist (or be a link target); use its folder */ }
  try { return join(realpathSync(dirname(file)), basename(file)); } catch { return resolve(file); }
}

/** @param {any} input */
export function onEdit(input) {
  if (input?.hook_event_name !== 'PostToolUse' || !EDIT_TOOLS.has(input.tool_name)) return null;
  const ti = input.tool_input;
  const file = typeof ti?.file_path === 'string' ? ti.file_path : typeof ti?.notebook_path === 'string' ? ti.notebook_path : null;
  if (!file || !isAbsolute(file)) return null;
  const scope = findScope(input.cwd);
  if (!scope || !enabled(scope)) return null;
  const rel = toPosix(relative(scope.root, canonicalFile(file)));
  if (!rel || rel === '..' || rel.startsWith('../') || isAbsolute(rel) || IGNORED_TOP.has(rel.split('/')[0])) return null;
  const devocd = join(scope.root, '.devocd');
  const journalDir = join(devocd, 'journal');
  const journal = join(journalDir, 'edits.jsonl');
  const now = new Date().toISOString();
  try {
    const root = lstatOrNull(devocd);
    if (!root || !root.isDirectory() || root.isSymbolicLink()) return null;
    const jd = lstatOrNull(journalDir);
    if (jd && (!jd.isDirectory() || jd.isSymbolicLink())) return null;
    if (!jd) mkdirSync(journalDir);
    const jf = lstatOrNull(journal);
    if (jf && (!jf.isFile() || jf.isSymbolicLink())) return null;
    appendFileSync(journal, JSON.stringify({ t: now, path: rel }) + '\n');
    // A journal line is at least ~20 bytes, so smaller files cannot exceed the cap.
    if (jf && jf.size > 20 * JOURNAL_MAX) {
      const lines = readFileSync(journal, 'utf8').split('\n').filter(Boolean);
      if (lines.length > JOURNAL_MAX) writeFileSync(journal, lines.slice(-JOURNAL_KEEP).join('\n') + '\n');
    }
    const sources = readJson(join(devocd, 'sources.json'));
    const ids = sources && typeof sources === 'object' && Object.hasOwn(sources, rel) && Array.isArray(sources[rel])
      ? sources[rel].filter((/** @type {any} */ id) => typeof id === 'string') : [];
    if (!ids.length) return null;
    const stalePath = join(devocd, 'stale.json');
    const sf = lstatOrNull(stalePath);
    if (sf && (!sf.isFile() || sf.isSymbolicLink())) return null;
    const old = readJson(stalePath, 64 * 1024);
    const had = Array.isArray(old?.pages) ? old.pages.filter((/** @type {any} */ id) => typeof id === 'string') : [];
    const pages = [...new Set([...had, ...ids])].sort();
    if (pages.length === had.length && typeof old?.since === 'string') return null;
    writeFileSync(stalePath, JSON.stringify({ pages, since: typeof old?.since === 'string' ? old.since : now }) + '\n');
  } catch { /* Optional bookkeeping must never interrupt work. */ }
  return null;
}

/** @param {any} input */
export function onSessionStart(input) {
  if (input?.hook_event_name !== 'SessionStart') return null;
  const scope = findScope(input.cwd);
  if (!scope || !enabled(scope)) return null;
  const stale = readJson(join(scope.root, '.devocd', 'stale.json'), 64 * 1024);
  const pages = Array.isArray(stale?.pages) ? stale.pages.filter((/** @type {any} */ id) => typeof id === 'string') : [];
  if (!pages.length) return null;
  const first = pages[0].replace(/[^\x20-\x7e]/g, '').slice(0, 100);
  return wrap('SessionStart', `DevOCD: ${pages.length} knowledge page(s) may be stale after source edits (e.g. ${first}). Verify against source; /devocd:refresh updates them.`);
}

/** @param {any} input */
export function dispatch(input) {
  switch (input?.hook_event_name) {
    case 'UserPromptSubmit': return onPrompt(input);
    case 'PostToolUse': return onEdit(input);
    case 'SessionStart': return onSessionStart(input);
    default: return null;
  }
}

if (process.argv[1] && existsSync(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    process.stdin.setEncoding('utf8');
    let data = '';
    for await (const chunk of process.stdin) {
      data += chunk;
      if (Buffer.byteLength(data) > 256 * 1024) process.exit(0);
    }
    const result = dispatch(JSON.parse(data));
    if (result) process.stdout.write(JSON.stringify(result));
  } catch { /* Optional hooks: malformed input must not interrupt work. */ }
}
