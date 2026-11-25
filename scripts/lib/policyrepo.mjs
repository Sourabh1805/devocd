// The company policy repo: one git clone per teammate, and its read-only status.
//
// Nothing here reads policy — that is T110 and T111. This module owns the `policyRepo` state
// field, the URL rules that keep credentials out of it, and the answer to "is this clone where
// the knowledge was built from?". Every git command below is read-only and local: no fetch, no
// network, no writes to the clone.
import { realpathSync, statSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { lstatOrNull } from './fsutil.mjs';
import { runGit } from './protect.mjs';

const MAX_PATH = 1024;
const MAX_REMOTE = 512;
const MAX_INDEX = 256;
const HEX = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

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
 */
export function policyRepoStatus(policyRepo) {
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
