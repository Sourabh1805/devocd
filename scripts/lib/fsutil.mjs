import { lstatSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';

/** Forward-slash form of a path, for output. */
export function toPosix(/** @type {string} */ p) {
  return p.split(sep).join('/').split('\\').join('/');
}

/** Error with a machine-readable code and an optional hint. */
export function codedError(/** @type {string} */ code, /** @type {string} */ message, hint = '') {
  return Object.assign(new Error(message), { code, hint });
}

/** lstat that returns null when the path does not exist. */
export function lstatOrNull(/** @type {string} */ p) {
  try { return lstatSync(p); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}

/** Regular file, not a link. */
export function isRegularFile(/** @type {string} */ p) {
  return !!lstatOrNull(p)?.isFile();
}

/** Read a regular file as UTF-8, or null if missing, linked or binary. */
export function readTextOrNull(/** @type {string} */ p) {
  if (!isRegularFile(p)) return null;
  const buf = readFileSync(p);
  if (buf.includes(0)) return null;
  return buf.toString('utf8');
}

/**
 * Walk regular files in name-sorted depth-first order, never following links.
 * Depth zero lists root files; depth N also lists files N folders below root.
 * Skipped directories and links count toward maxEntries, but their children do not.
 * includeDirs lists successfully visited descendants (not root or pruned folders).
 * maxBytes limits each file, not the sum. Only an entry-budget overflow truncates.
 * Compatibility hooks keep caller-specific classification and read-error policies
 * in the caller. onEntry runs before link filtering; false prunes the entry without
 * reading its metadata/content. It cannot make the walker follow a link.
 * directory-stack visits a directory's entries before popping its last child;
 * sortEntries=false preserves native enumeration for the legacy dependency cap.
 * @param {string} root
 * @param {{ skipDir?: (rel: string, name: string) => boolean,
 * maxDepth?: number, maxEntries?: number, maxBytes?: number, includeDirs?: boolean,
 * order?: 'depth-first'|'directory-stack', sortEntries?: boolean,
 * onEntry?: (rel: string, entry: import('node:fs').Dirent) => boolean|void,
 * onDirectory?: (rel: string) => void,
 * onReadError?: (error: NodeJS.ErrnoException, rel: string) => void }} [options]
 * @returns {{ files: { abs: string, rel: string, size: number }[], dirs: string[],
 * skipped: { rel: string, reason: 'too-large' }[], truncated: boolean }}
 */
export function walk(root, { skipDir = () => false, maxDepth = Infinity,
  maxEntries = Infinity, maxBytes = Infinity, includeDirs = false,
  order = 'depth-first', sortEntries = true, onEntry, onDirectory, onReadError } = {}) {
  const base = resolve(root);
  /** @type {{ files: { abs: string, rel: string, size: number }[], dirs: string[], skipped: { rel: string, reason: 'too-large' }[], truncated: boolean }} */
  const result = { files: [], dirs: [], skipped: [], truncated: false };
  let st;
  try { st = lstatOrNull(base); }
  catch (error) { if (!onReadError) throw error; onReadError(error, ''); return result; }
  if (!st || st.isSymbolicLink()) return result;
  let seen = 0;
  /** @type {{ rel: string, depth: number }[]} */
  const pending = [];
  /** @param {string} rel @param {number} depth */
  function visit(rel, depth) {
    let entries;
    try {
      // Recheck queued folders: a callback or another process may have replaced one.
      if (lstatSync(join(base, rel)).isSymbolicLink()) return;
      entries = readdirSync(join(base, rel), { withFileTypes: true });
    }
    catch (error) { if (!onReadError) throw error; onReadError(error, rel); return; }
    if (sortEntries) entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    onDirectory?.(rel);
    if (includeDirs && rel) result.dirs.push(rel);
    for (const entry of entries) {
      if (++seen > maxEntries) { result.truncated = true; return; }
      const child = rel ? `${rel}/${entry.name}` : entry.name;
      if (onEntry?.(child, entry) === false || entry.isSymbolicLink()) continue;
      const abs = join(base, child);
      if (entry.isDirectory()) {
        if (depth < maxDepth && !skipDir(child, entry.name)) {
          if (order === 'directory-stack') pending.push({ rel: child, depth: depth + 1 });
          else visit(child, depth + 1);
        }
        if (result.truncated) return;
      } else if (entry.isFile()) {
        let size;
        // A file that vanished or became unreadable mid-walk follows the read-error policy.
        try {
          const stat = lstatSync(abs);
          if (!stat.isFile()) continue;
          size = stat.size;
        } catch (error) {
          if (error.code === 'ENOENT') continue;
          if (!onReadError) throw error;
          onReadError(error, child);
          continue;
        }
        if (size > maxBytes) result.skipped.push({ rel: child, reason: 'too-large' });
        else result.files.push({ abs, rel: child, size });
      }
    }
  }
  visit('', 0);
  while (pending.length && !result.truncated) {
    const next = /** @type {{ rel: string, depth: number }} */ (pending.pop());
    visit(next.rel, next.depth);
  }
  return result;
}

/**
 * Compatibility wrapper: retain caller path spelling and the absolute-path skip callback.
 * @param {string} dir
 * @param {(abs: string, name: string) => boolean} [skipDir]
 * @returns {string[]}
 */
export function walkFiles(dir, skipDir = () => false) {
  return walk(dir, {
    skipDir: (rel, name) => skipDir(join(dir, rel), name),
    onReadError: error => { if (error.code !== 'ENOENT') throw error; },
  })
    .files.map(file => join(dir, file.rel));
}

/** Number of lines, ignoring a final newline. */
export function countLines(/** @type {string} */ text) {
  if (text === '') return 0;
  return text.replace(/\r?\n$/, '').split(/\r?\n/).length;
}

/**
 * Refuse to write target when a folder above it is missing or a link, or when target itself is
 * a link or not a regular file. Folders are checked from the target up to the nearest ancestor
 * holding .devocd or .git (that one too), so system links like macOS /var are never reached.
 * With no such ancestor, only the immediate parent is checked.
 */
export function assertSafeTarget(/** @type {string} */ target) {
  const folders = [];
  for (let d = dirname(target); ; d = dirname(d)) {
    folders.push(d);
    if (lstatOrNull(resolve(d, '.devocd')) || lstatOrNull(resolve(d, '.git'))) break;
    if (dirname(d) === d) { folders.length = 1; break; }
  }
  for (const d of folders) {
    const fst = lstatOrNull(d);
    if (!fst || fst.isSymbolicLink() || !fst.isDirectory()) {
      throw codedError('NO_DIR', `folder ${toPosix(d)} is missing or is a link`, 'Write inside a real folder, not through a symlink or junction.');
    }
  }
  const st = lstatOrNull(target);
  if (st && !st.isFile()) {
    throw codedError('NOT_REGULAR', `${toPosix(target)} is a link or not a regular file`, 'devocd never writes through symlinks. Point at a real file.');
  }
}

/**
 * Check that target could be written safely, without creating anything. The nearest existing
 * folder is checked, so folders created later are real ones.
 */
export function checkTarget(/** @type {string} */ target) {
  let near = dirname(target);
  while (!lstatOrNull(near)) near = dirname(near);
  assertSafeTarget(join(near, 'x'));
  if (near === dirname(target)) assertSafeTarget(target);
}

/** Like checkTarget, but then creates the missing parent folders. */
export function prepareTarget(/** @type {string} */ target) {
  checkTarget(target);
  mkdirSync(dirname(target), { recursive: true });
  assertSafeTarget(target);
}
