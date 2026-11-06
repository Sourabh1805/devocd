// @ts-check
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';

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
  try { return lstatSync(p); } catch { return null; }
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
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
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
