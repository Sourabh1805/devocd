// Moment-of-need hooks. Read small local files under .devocd/ only; no network, no transcripts, no model calls.
// Writes stay inside the scope's own .devocd/ folder: the edit hook's journal and stale marks, the
// prompt hook's session memory (which pointers were already given) and the hook counters.
import { appendFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { findScope, preference } from './lib/scope.mjs';
import { lstatOrNull, toPosix } from './lib/fsutil.mjs';
import { readHookInput } from './lib/hookinput.mjs';

const MAX_INDEX = 64 * 1024;
const MAX_SMALL = 1024 * 1024;
const MAX_MATCHES = 3;
const JOURNAL_MAX = 1000;
const JOURNAL_KEEP = 500;
/** Shortest possible line: {"t":"<24-char ISO>","path":"x"} plus the newline. */
const JOURNAL_MIN_LINE = 44;
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
const GENERIC = new Set('create edit update add make write change fix review open new delete remove modify set get use'.split(' ').map(stem));
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

/** Claude Code's session id becomes part of a file name, so only these characters are allowed. */
const SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/;
/** A session remembers at most this many given pointers; past that, pointers may repeat (safe). */
const SESSION_MAX = 200;
const SESSION_KEEP_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_SCAN_MAX = 500;

/** The journal folder of a scope, created when it is safe to write there; null otherwise. */
function journalFor(/** @type {any} */ scope) {
  try {
    const devocd = join(scope.root, '.devocd');
    const root = lstatOrNull(devocd);
    if (!root || !root.isDirectory() || root.isSymbolicLink()) return null;
    const dir = join(devocd, 'journal');
    const jd = lstatOrNull(dir);
    if (jd && (!jd.isDirectory() || jd.isSymbolicLink())) return null;
    if (!jd) mkdirSync(dir);
    return dir;
  } catch { return null; }
}

/** A journal file safe to read and write: missing is fine, a link or a folder is not. */
function journalFile(/** @type {string} */ dir, /** @type {string} */ name) {
  const path = join(dir, name);
  const f = lstatOrNull(path);
  if (f && (!f.isFile() || f.isSymbolicLink())) return null;
  return path;
}

/** The pointers already given this session, or null when nothing can be remembered. */
function sessionMemory(/** @type {any} */ scope, /** @type {unknown} */ sessionId) {
  if (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId)) return null;
  const dir = journalFor(scope);
  if (!dir) return null;
  const path = journalFile(dir, `session-${sessionId}.json`);
  if (!path) return null;
  const old = readJson(path, 64 * 1024);
  return { path, given: Array.isArray(old?.given) ? old.given.filter((/** @type {any} */ v) => typeof v === 'string') : [] };
}

/** Add what a hook call ran and injected to `.devocd/journal/hook-stats.json`. Approximate by
 * design: concurrent sessions may lose an increment, and a failure adds nothing. */
function bumpHookStats(/** @type {any} */ scope, /** @type {string} */ event, /** @type {any} */ result) {
  try {
    const dir = journalFor(scope);
    if (!dir) return;
    const path = journalFile(dir, 'hook-stats.json');
    if (!path) return;
    const old = readJson(path, 256 * 1024);
    const events = old && typeof old.events === 'object' && old.events && !Array.isArray(old.events) ? old.events : {};
    const prev = events[event] && typeof events[event] === 'object' ? events[event] : {};
    const n = (/** @type {unknown} */ v) => (typeof v === 'number' && Number.isSafeInteger(v) && v > 0 ? v : 0);
    const text = typeof result?.hookSpecificOutput?.additionalContext === 'string' ? result.hookSpecificOutput.additionalContext : '';
    const next = { runs: n(prev.runs) + 1, injected: n(prev.injected) + (text ? 1 : 0), bytes: n(prev.bytes) + Buffer.byteLength(text, 'utf8') };
    writeFileSync(path, JSON.stringify({ since: typeof old?.since === 'string' ? old.since : new Date().toISOString(), events: { ...events, [event]: next } }) + '\n');
  } catch { /* counters are optional */ }
}

/** Drop session files older than a week. Best effort: a failure cleans nothing. */
function cleanSessions(/** @type {any} */ scope) {
  try {
    const dir = journalFor(scope);
    if (!dir) return;
    const now = Date.now();
    for (const name of readdirSync(dir).slice(0, SESSION_SCAN_MAX)) {
      if (!/^session-[^/\\]+\.json$/.test(name)) continue;
      const path = join(dir, name);
      const f = lstatOrNull(path);
      if (!f || !f.isFile() || f.isSymbolicLink()) continue;
      if (now - f.mtimeMs > SESSION_KEEP_MS) rmSync(path, { force: true });
    }
  } catch { /* cleanup is best effort */ }
}

/** @param {any} input */
export function onPrompt(input) {
  if (input?.hook_event_name !== 'UserPromptSubmit' || typeof input.prompt !== 'string') return null;
  const scope = findScope(input.cwd);
  if (!scope || !enabled(scope)) return null;
  // A slash command is the user driving a command; nothing is added to it.
  const result = input.prompt.trimStart().startsWith('/') ? null : promptPointers(input, scope);
  bumpHookStats(scope, 'UserPromptSubmit', result);
  return result;
}

/** The pointers this prompt has not been given yet. @param {any} input @param {any} scope */
function promptPointers(input, scope) {
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
  const memory = sessionMemory(scope, input.session_id);
  /** @type {string[]} */
  const found = [];
  /** @type {string[]} */
  const targets = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*[-*]\s+(.+?):\s*\[[^\]]*\]\(([^)\s]+)\)/.exec(line);
    if (!m) continue;
    const target = safeTarget(m[2]);
    if (!target) continue;
    if (memory && memory.given.includes(target)) continue;
    const trigger = [...tokenSet(m[1])].filter(w => !GENERIC.has(w));
    if (!trigger.length) continue;
    const hits = trigger.filter(w => words.has(w)).length;
    if (hits < (trigger.length <= 2 ? 1 : 2)) continue;
    const path = toPosix(relative(cwd, join(standards, target)));
    found.push(`${m[1].trim().slice(0, 120)} → read ${path}`);
    targets.push(target);
    if (found.length === MAX_MATCHES) break;
  }
  if (!found.length) return null;
  // Remember them after a successful match, so the next prompt on the topic adds nothing.
  if (memory && memory.given.length < SESSION_MAX) {
    try { writeFileSync(memory.path, JSON.stringify({ given: [...memory.given, ...targets].slice(0, SESSION_MAX), t: new Date().toISOString() }) + '\n'); } catch { /* remember nothing */ }
  }
  return wrap('UserPromptSubmit', `DevOCD policy for this request: ${found.join('; ')}`);
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
  // The edited file's own scope, not the session's: a session at a company root that edits a
  // project file must journal and mark stale in that project, where its sources.json lives.
  const canonical = canonicalFile(file);
  const scope = findScope(dirname(canonical));
  if (!scope || !enabled(scope)) return null;
  const rel = toPosix(relative(scope.root, canonical));
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
    // Every line has an ISO timestamp, so it is at least JOURNAL_MIN_LINE bytes; smaller files cannot exceed the cap.
    if (jf && jf.size >= JOURNAL_MIN_LINE * JOURNAL_MAX) {
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

/** A notice that an edit could not be tracked, so the next session can say so.
 * @param {unknown} cwd */
export function recordUntracked(cwd) {
  try {
    if (typeof cwd !== 'string') return null;
    const scope = findScope(cwd);
    if (!scope || !enabled(scope)) return null;
    const devocd = join(scope.root, '.devocd');
    const journalDir = join(devocd, 'journal');
    const root = lstatOrNull(devocd);
    if (!root || !root.isDirectory() || root.isSymbolicLink()) return null;
    const jd = lstatOrNull(journalDir);
    if (jd && (!jd.isDirectory() || jd.isSymbolicLink())) return null;
    if (!jd) mkdirSync(journalDir);
    const path = join(journalDir, 'untracked.json');
    const f = lstatOrNull(path);
    if (f && (!f.isFile() || f.isSymbolicLink())) return null;
    const old = readJson(path, 64 * 1024);
    const now = new Date().toISOString();
    const count = typeof old?.count === 'number' && Number.isSafeInteger(old.count) && old.count > 0 ? old.count + 1 : 1;
    const since = typeof old?.since === 'string' ? old.since : now;
    writeFileSync(path, JSON.stringify({ since, last: now, count }) + '\n');
  } catch { /* Optional bookkeeping must never interrupt work. */ }
  return null;
}

/** @param {any} input */
export function onSessionStart(input) {
  if (input?.hook_event_name !== 'SessionStart') return null;
  const scope = findScope(input.cwd);
  if (!scope || !enabled(scope)) return null;
  cleanSessions(scope);
  const stale = readJson(join(scope.root, '.devocd', 'stale.json'), 64 * 1024);
  const pages = Array.isArray(stale?.pages) ? stale.pages.filter((/** @type {any} */ id) => typeof id === 'string') : [];
  const untracked = readJson(join(scope.root, '.devocd', 'journal', 'untracked.json'), 64 * 1024);
  const missed = typeof untracked?.count === 'number' && Number.isSafeInteger(untracked.count) && untracked.count > 0 ? untracked.count : 0;
  const lines = [];
  if (pages.length) {
    const first = pages[0].replace(/[^\x20-\x7e]/g, '').slice(0, 100);
    lines.push(`DevOCD: ${pages.length} knowledge page(s) may be stale after source edits (e.g. ${first}). Verify against source; /devocd:refresh updates them.`);
  }
  if (missed) lines.push(`DevOCD: ${missed} edit(s) could not be tracked; run /devocd:refresh to check what changed.`);
  const message = lines.length ? wrap('SessionStart', lines.join(' ').replace(/[^\x20-\x7e]/g, '')) : null;
  bumpHookStats(scope, 'SessionStart', message);
  return message;
}

/** @param {any} input */
function dispatch(input) {
  switch (input?.hook_event_name) {
    case 'UserPromptSubmit': return onPrompt(input);
    case 'PostToolUse': {
      const ti = input.tool_input;
      const file = typeof ti?.file_path === 'string' ? ti.file_path : typeof ti?.notebook_path === 'string' ? ti.notebook_path : null;
      // A complete edit input with no usable path cannot be journaled, so say so instead of nothing.
      if (EDIT_TOOLS.has(input.tool_name) && (!file || !isAbsolute(file))) return recordUntracked(input.cwd);
      return onEdit(input);
    }
    case 'SessionStart': return onSessionStart(input);
    default: return null;
  }
}

if (process.argv[1] && existsSync(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    const { input, complete } = await readHookInput(process.stdin);
    let result = null;
    if (complete) result = dispatch(input);
    // Cut-off or broken input: still mark the edit as untracked when it looks like one.
    else if (input.hook_event_name === 'PostToolUse' && EDIT_TOOLS.has(input.tool_name)) result = recordUntracked(input.cwd);
    if (result) process.stdout.write(JSON.stringify(result));
  } catch { /* Optional hooks: malformed input must not interrupt work. */ }
}
