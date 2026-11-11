// @ts-check
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
 * Every regular file under dir (absolute paths), never following links.
 * @param {string} dir
 * @param {(abs: string, name: string) => boolean} [skipDir]
 * @returns {string[]}
 */
export function walkFiles(dir, skipDir = () => false) {
  /** @type {string[]} */
  const out = [];
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); }
  catch (e) { if (e.code === 'ENOENT') return out; throw e; }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) {
      if (!skipDir(full, e.name)) out.push(...walkFiles(full, skipDir));
    } else if (e.isFile()) out.push(full);
  }
  return out;
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
