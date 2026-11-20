import { constants, copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { checkTarget, prepareTarget, codedError, lstatOrNull, toPosix, walkFiles } from './fsutil.mjs';

const KEEP = 5;
const STAMP = /^\d{8}-\d{6}-\d{3}$/;

/** Existing stamps, oldest first. */
function listStamps(/** @type {string} */ backups) {
  try {
    return readdirSync(backups, { withFileTypes: true })
      .filter((e) => e.isDirectory() && STAMP.test(e.name)).map((e) => e.name).sort();
  } catch { return []; }
}

/** A stamp for now that sorts after every existing one. */
function newStamp(/** @type {string[]} */ existing) {
  const newest = existing.length ? existing[existing.length - 1] : '';
  let t = Date.now();
  for (;;) {
    const d = new Date(t);
    const p = (/** @type {number} */ n, w = 2) => String(n).padStart(w, '0');
    const s = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}-${p(d.getUTCMilliseconds(), 3)}`;
    if (s > newest) return s;
    t++;
  }
}

function kindOf(/** @type {string} */ dir) {
  try { return JSON.parse(readFileSync(join(dir, '.devocd', 'state.json'), 'utf8')).kind; } catch { return null; }
}

/** Real folder (not a link) at path, or throw. */
function assertRealDir(/** @type {string} */ p) {
  const st = lstatOrNull(p);
  if (st && (st.isSymbolicLink() || !st.isDirectory())) {
    throw codedError('NO_DIR', `${toPosix(p)} is a link or not a folder`, 'devocd never writes through symlinks or junctions.');
  }
}

function copyOne(/** @type {string} */ from, /** @type {string} */ to) {
  prepareTarget(to);
  copyFileSync(from, to);
}

/**
 * Copy .devocd (minus .backups), CLAUDE.local.md, and a company's CLAUDE.md into
 * .devocd/.backups/<stamp>/. Keeps the newest 5. Never copies a repo's team CLAUDE.md.
 * @param {string} dir
 * @returns {string} the stamp
 */
export function backupDir(dir) {
  const root = resolve(dir);
  const dev = join(root, '.devocd');
  const st = lstatOrNull(dev);
  if (!st || !st.isDirectory()) throw codedError('NO_DEVOCD', `no .devocd folder in ${toPosix(root)}`, 'Run backup in a folder devocd has set up.');
  assertRealDir(dev);
  const backups = join(dev, '.backups');
  assertRealDir(backups);

  const files = walkFiles(dev, (abs, name) => name === '.backups' && dirname(abs) === dev).map((f) => relative(root, f));
  for (const extra of ['CLAUDE.local.md', ...(kindOf(root) === 'company' ? ['CLAUDE.md'] : [])]) {
    const s = lstatOrNull(join(root, extra));
    if (s && s.isFile()) files.push(extra);
  }

  const existing = listStamps(backups);
  const stamp = newStamp(existing);
  for (const rel of files) copyOne(join(root, rel), join(backups, stamp, rel));
  mkdirSync(join(backups, stamp), { recursive: true });

  for (const old of [...existing, stamp].slice(0, -KEEP)) rmSync(join(backups, old), { recursive: true, force: true });
  return stamp;
}

/**
 * Restore the newest backup, or a named one, byte for byte. Existing durable
 * decisions and history are preserved; missing durable files can be recovered.
 * @param {string} dir
 * @param {string} [stamp]
 * @returns {string} the stamp restored
 */
export function restoreDir(dir, stamp) {
  const root = resolve(dir);
  const backups = join(root, '.devocd', '.backups');
  assertRealDir(join(root, '.devocd'));
  assertRealDir(backups);
  const stamps = listStamps(backups);
  const pick = stamp === undefined ? stamps[stamps.length - 1] : stamps.find((s) => s === stamp);
  if (!pick) {
    throw codedError('NO_BACKUP', stamp === undefined ? `no backup found in ${toPosix(backups)}` : `no backup named '${stamp}'`,
      stamps.length ? `Available: ${stamps.join(', ')}` : 'Run backup before restore.');
  }
  const src = join(backups, pick);
  const pairs = walkFiles(src).map((f) => /** @type {[string, string]} */ ([f, join(root, relative(src, f))]));
  for (const [, to] of pairs) checkTarget(to); // check everything before writing anything
  for (const [from, to] of pairs) {
    const rel = toPosix(relative(root, to));
    const durable = rel === '.devocd/decisions.md' || rel.startsWith('.devocd/decision-history/');
    if (!durable) { copyOne(from, to); continue; }
    if (lstatOrNull(to)) continue;
    prepareTarget(to);
    // A concurrent capture that creates the file wins, even after our preflight.
    try { copyFileSync(from, to, constants.COPYFILE_EXCL); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  return pick;
}
