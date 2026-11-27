// The company policy repo: one git clone per teammate, and its read-only status.
//
// Nothing here reads policy — that is T110 and T111. This module owns the `policyRepo` state
// field, the URL rules that keep credentials out of it, and the answer to "is this clone where
// the knowledge was built from?". Every git command below is read-only and local: no fetch, no
// network, no writes to the clone.
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { lstatOrNull, toPosix } from './fsutil.mjs';
import { runGit } from './protect.mjs';
import { scanSecrets } from './secrets.mjs';

const MAX_PATH = 1024;
const MAX_REMOTE = 512;
const MAX_INDEX = 256;
const MAX_POLICY_INDEX_BYTES = 64 * 1024;
const HEX = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
/** The same topic shape the knowledge graph accepts for `Standards: <topic>`. */
const TOPIC = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** The index line format the prompt hook parses today (`scripts/devocd-hooks.mjs`). */
const INDEX_LINE = /^\s*[-*]\s+(.+?):\s*\[[^\]]*\]\(([^)\s]+)\)/;

/** @param {any} v */
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** Why this remote cannot be recorded, or null when it can. Never repeats the URL. */
function remoteProblem(/** @unknown */ value) {
  if (typeof value !== 'string' || value === '' || value.length > MAX_REMOTE) {
    return `policyRepo.remote must be a non-empty string of at most ${MAX_REMOTE} characters`;
  }
  if (value.startsWith('https://')) {
    let url;
    try { url = new URL(value); } catch { return 'policyRepo.remote must be an https:// or git@ URL'; }
    if (url.protocol !== 'https:' || !url.hostname) return 'policyRepo.remote must be an https:// or git@ URL';
    // A username or password in the URL is a credential written into personal state in clear text.
    if (url.username || url.password) return 'policyRepo.remote must not contain a username or password';
    // A query or fragment is where access tokens ride (?access_token=…); a repo URL needs neither.
    if (url.search || url.hash || value.includes('?') || value.includes('#')) return 'policyRepo.remote must not carry a query or fragment';
    if (url.pathname === '/' || url.pathname === '') return 'policyRepo.remote must name a repository';
    return null;
  }
  if (/^git@[^:\s/]+:\S+$/.test(value)) return null;
  return 'policyRepo.remote must be an https:// or git@ URL';
}

/** Why the policyRepo field is invalid, or null when it is valid. Messages never echo a secret. */
export function policyRepoProblem(/** @unknown */ value) {
  if (!isObj(value)) return 'policyRepo must be an object';
  const keys = Object.keys(value).sort().join(',');
  if (keys !== 'builtAt,index,path,remote') return 'policyRepo must have exactly path, remote, index and builtAt';
  if (typeof value.path !== 'string' || value.path === '' || value.path.length > MAX_PATH || !isAbsolute(value.path)) {
    return `policyRepo.path must be an absolute path of at most ${MAX_PATH} characters`;
  }
  if (value.path.includes('\\')) return 'policyRepo.path must use forward slashes';
  const remote = remoteProblem(value.remote);
  if (remote) return remote;
  if (typeof value.index !== 'string' || value.index === '' || value.index.length > MAX_INDEX || !value.index.endsWith('.md')) {
    return `policyRepo.index must be a relative .md path of at most ${MAX_INDEX} characters`;
  }
  if (value.index.includes('\\') || isAbsolute(value.index) ||
    value.index.split('/').some((/** @type {string} */ segment) => segment === '' || segment === '.' || segment === '..')) {
    return 'policyRepo.index must be a relative path with no . or .. segments and forward slashes only';
  }
  if (value.builtAt !== null && !(typeof value.builtAt === 'string' && HEX.test(value.builtAt))) {
    return 'policyRepo.builtAt must be null or a 40- or 64-character lowercase hex commit id';
  }
  return null;
}

/**
 * A comparable form of a remote URL: lower-case host, no trailing `.git` and no trailing `/`.
 * `git@host:owner/repo` and `https://host/owner/repo` compare equal. Null when unparseable.
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeRemote(value) {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  let host;
  let path;
  if (/^https:\/\//i.test(raw)) {
    let url;
    try { url = new URL(raw); } catch { return null; }
    if (url.protocol !== 'https:' || !url.hostname) return null;
    host = url.hostname.toLowerCase();
    path = url.pathname;
  } else if (/^ssh:\/\//i.test(raw)) {
    // A clone's origin is often ssh://git@host[:port]/owner/repo; the port is transport, not identity.
    const m = /^ssh:\/\/(?:[^@\s/]+@)?([^:\s/]+)(?::\d+)?\/(.+)$/i.exec(raw);
    if (!m) return null;
    host = m[1].toLowerCase();
    path = m[2];
  } else {
    const m = /^[^@\s]+@([^:\s/]+):(.+)$/.exec(raw);
    if (!m) return null;
    host = m[1].toLowerCase();
    path = m[2];
  }
  const repo = path.replace(/^\/+/, '').replace(/\/+$/, '').replace(/\.git$/i, '');
  if (!repo) return null;
  return `${host}/${repo}`;
}

/**
 * True when both spellings name the same folder. The file system's own identity (volume plus
 * inode) is compared instead of the path string: on Windows one folder can come back as a long
 * name, a short 8.3 name or a junction target, and the string comparison then says they differ.
 */
export function sameDirectory(/** @type {string} */ a, /** @type {string} */ b, stat = statSync) {
  try {
    // bigint: NTFS file ids are 64-bit, and a plain number rounds above 2^53.
    const left = stat(a, { bigint: true });
    const right = stat(b, { bigint: true });
    if (left.ino !== 0n && left.dev !== 0n) return left.dev === right.dev && left.ino === right.ino;
    // No id (FAT, some network drives): fall back to the canonical spelling of both.
    const fold = (/** @type {string} */ p) => { const r = realpathSync.native(p); return process.platform === 'win32' ? r.toLowerCase() : r; };
    return fold(a) === fold(b);
  } catch {
    return false;
  }
}

/**
 * Read-only status of one teammate's clone.
 * @param {any} policyRepo a `policyRepo` field that passed `policyRepoProblem`
 * @returns {{ path: string | null, remote: string | null, index: string | null,
 *   head: string | null, builtAt: string | null,
 *   status: 'ok' | 'missing' | 'no-git' | 'not-a-clone' | 'wrong-remote' | 'moved' }}
 */export function policyRepoStatus(policyRepo) {
  /** @type {{ path: string | null, remote: string | null, index: string | null, head: string | null, builtAt: string | null, status: 'ok' | 'missing' | 'no-git' | 'not-a-clone' | 'wrong-remote' | 'moved' }} */
  const out = {
    path: typeof policyRepo?.path === 'string' ? policyRepo.path : null,
    remote: typeof policyRepo?.remote === 'string' ? policyRepo.remote : null,
    index: typeof policyRepo?.index === 'string' ? policyRepo.index : null,
    head: null,
    builtAt: typeof policyRepo?.builtAt === 'string' ? policyRepo.builtAt : null,
    status: 'missing',
  };
  if (!out.path) return out;
  let stat = null;
  try { stat = lstatOrNull(out.path); } catch { stat = null; }
  if (!stat || !stat.isDirectory() || stat.isSymbolicLink()) return out;

  let top;
  try {
    const r = runGit(out.path, ['rev-parse', '--show-toplevel']);
    if (!r.ok) return { ...out, status: 'not-a-clone' };
    top = r.out;
  } catch {
    // GIT_MISSING or GIT_FAILED: git could not be run at all.
    return { ...out, status: 'no-git' };
  }
  // A subfolder of a repo is not the clone the state names.
  if (!sameDirectory(top, out.path)) return { ...out, status: 'not-a-clone' };

  const origin = runGit(out.path, ['remote', 'get-url', 'origin']);
  const wanted = normalizeRemote(out.remote);
  const actual = origin.ok ? normalizeRemote(origin.out) : null;
  if (!wanted || !actual || wanted !== actual) return { ...out, status: 'wrong-remote' };

  const head = runGit(out.path, ['rev-parse', 'HEAD']);
  out.head = head.ok && head.out ? head.out : null;
  if (out.builtAt !== null && out.head !== out.builtAt) return { ...out, status: 'moved' };
  return { ...out, status: 'ok' };
}

/** True when `abs` is outside the clone root after resolution. */
function escapesClone(/** @type {string} */ clone, /** @type {string} */ abs) {
  const rel = relative(clone, abs);
  return rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel);
}

/**
 * Read the routing index inside a policy-repo clone. File reads only: no git command, no network,
 * nothing written to the clone, so the prompt hook (T110) can reuse it.
 *
 * A topic is the linked file's name without `.md`; a name outside `TOPIC` gives no topic (the
 * entry still routes for the hook). Two entries whose files share a name make that topic
 * ambiguous: it resolves to neither and the duplicate lines are reported.
 * @param {any} policyRepo a `policyRepo` field that passed `policyRepoProblem`
 * @returns {{ entries: { trigger: string, file: string, topic: string | null }[],
 *   topics: Map<string, string>, problems: { line: number, reason: string }[] } | null}
 *   null when the index itself cannot be read (missing, linked, not a regular file, over 64 KiB,
 *   not UTF-8, or outside the clone).
 */
export function readPolicyIndex(policyRepo) {
  let clone;
  try { clone = realpathSync(policyRepo?.path); } catch { return null; }
  const indexAbs = resolve(policyRepo.path, policyRepo.index);
  const indexStat = lstatOrNull(indexAbs);
  if (!indexStat || !indexStat.isFile() || indexStat.isSymbolicLink() || indexStat.size > MAX_POLICY_INDEX_BYTES) return null;
  let realIndex;
  try { realIndex = realpathSync(indexAbs); } catch { return null; }
  if (escapesClone(clone, realIndex)) return null;
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(realIndex)); } catch { return null; }

  /** @type {{ trigger: string, file: string, topic: string | null, line: number }[]} */
  const found = [];
  /** @type {{ line: number, reason: string }[]} */
  const problems = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = INDEX_LINE.exec(lines[i].replace(/\r$/, ''));
    if (!m) continue;
    const trigger = m[1].trim();
    const target = m[2].split('#')[0];
    if (!target) { problems.push({ line: i + 1, reason: 'empty-target' }); continue; }
    // A target that looks like a secret is dropped without being echoed, like every secret hit.
    if (scanSecrets(target).length) continue;
    if (/^[a-z][a-z\d+.-]*:/i.test(target)) { problems.push({ line: i + 1, reason: 'url' }); continue; }
    if (target.startsWith('/') || target.startsWith('\\') || isAbsolute(target)) { problems.push({ line: i + 1, reason: 'absolute' }); continue; }
    if (target.includes('\\')) { problems.push({ line: i + 1, reason: 'backslash' }); continue; }
    const resolved = resolve(dirname(realIndex), target);
    if (escapesClone(clone, resolved)) { problems.push({ line: i + 1, reason: 'leaves-clone' }); continue; }
    const stat = lstatOrNull(resolved);
    if (!stat) { problems.push({ line: i + 1, reason: 'missing-target' }); continue; }
    if (stat.isSymbolicLink()) { problems.push({ line: i + 1, reason: 'symlink' }); continue; }
    if (!stat.isFile()) { problems.push({ line: i + 1, reason: 'not-a-file' }); continue; }
    if (!resolved.endsWith('.md')) { problems.push({ line: i + 1, reason: 'not-markdown' }); continue; }
    let real;
    try { real = realpathSync(resolved); } catch { problems.push({ line: i + 1, reason: 'unreadable' }); continue; }
    if (escapesClone(clone, real)) { problems.push({ line: i + 1, reason: 'leaves-clone' }); continue; }
    const file = toPosix(relative(clone, real));
    const base = file.slice(file.lastIndexOf('/') + 1).replace(/\.md$/, '');
    found.push({ trigger, file, topic: TOPIC.test(base) ? base : null, line: i + 1 });
  }

  // Two files with the same name make that topic ambiguous: it resolves to neither, and every
  // duplicate after the first is a problem row (the first occurrence is not itself wrong).
  const byTopic = new Map();
  for (const e of found) {
    if (!e.topic) continue;
    if (!byTopic.has(e.topic)) byTopic.set(e.topic, []);
    byTopic.get(e.topic).push(e);
  }
  /** @type {Map<string, string>} */
  const topics = new Map();
  for (const topic of [...byTopic.keys()].sort()) {
    const list = byTopic.get(topic);
    if (new Set(list.map((e) => e.file)).size > 1) {
      for (const e of list.slice(1)) problems.push({ line: e.line, reason: 'ambiguous-topic' });
      continue;
    }
    topics.set(topic, list[0].file);
  }
  problems.sort((a, b) => a.line - b.line);
  return { entries: found.map(({ trigger, file, topic }) => ({ trigger, file, topic })), topics, problems };
}
