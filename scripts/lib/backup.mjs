import { constants, copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { checkTarget, prepareTarget, codedError, lstatOrNull, toPosix, walk, walkFiles } from './fsutil.mjs';

const KEEP = 5;
const STAMP = /^\d{8}-\d{6}-\d{3}$/;

/** Folders under `.devocd/` a restore never prunes: they hold state a backup cannot know about. */
const SURVIVES = Object.freeze(['.devocd/.backups/', '.devocd/draft/', '.devocd/journal/', '.devocd/runs/', '.devocd/stale.d/']);

/** Durable knowledge: a restore recovers it when missing, but never overwrites or deletes it. */
const durableRel = (/** @type {string} */ rel) => rel === '.devocd/decisions.md' || rel.startsWith('.devocd/decision-history/');

/** @param {string} rel a POSIX path from the folder root */
const survivesRel = (/** @type {string} */ rel) => SURVIVES.some((p) => rel.startsWith(p));

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
 * @param {{ protect?: string }} [options] `protect` is a stamp this call must never prune: a
 *   restore snapshots the current state while the backup it is restoring is still needed.
 * @returns {string} the stamp
 */
export function backupDir(dir, { protect } = {}) {
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

  const keep = new Set([...existing, stamp].slice(-KEEP));
  if (protect) keep.add(protect);
  for (const old of [...existing, stamp]) {
    if (!keep.has(old)) rmSync(join(backups, old), { recursive: true, force: true });
  }
  return stamp;
}

/**
 * Refuse the whole restore when anything under .devocd/ is a link, a junction or not a
 * regular file or folder. Runs before anything is written, backed up or removed.
 * @param {string} dev
 */
function assertRealTree(/** @type {string} */ dev) {
  walk(dev, {
    includeDirs: true,
    skipDir: (rel) => rel === '.backups',
    onEntry: (rel, entry) => {
      if (entry.isFile() || entry.isDirectory()) return;
      throw codedError('NOT_REGULAR', `${toPosix(join(dev, rel))} is a link or not a regular file or folder`,
        'devocd never writes through symlinks or junctions. Remove it and run restore again.');
    },
  });
}

/** Remove folders under .devocd/ that a restore emptied, deepest first. */
function pruneEmptyDirs(/** @type {string} */ dev) {
  const { dirs } = walk(dev, { includeDirs: true, skipDir: (rel) => rel === '.backups' });
  dirs.sort((a, b) => b.split('/').length - a.split('/').length);
  for (const rel of dirs) {
    if (survivesRel(`.devocd/${rel}/`)) continue; // an exempt folder keeps its place even when empty
    try { if (readdirSync(join(dev, rel)).length === 0) rmSync(join(dev, rel)); } catch { /* already gone */ }
  }
}

/**
 * Restore the newest backup, or a named one, so that `.devocd/` matches it: files created
 * after the backup are removed, except backups, draft, journal, runs, stale.d and durable
 * decisions and history. The current state is backed up first, so the restore can be undone.
 * @param {string} dir
 * @param {string} [stamp]
 * @param {{ dryRun?: boolean }} [options] dryRun reports the plan and writes nothing.
 * @returns {{ stamp: string, backup?: string, copy: string[], remove: string[], keep: string[] }}
 *   POSIX paths from the folder root; `backup` is the pre-restore stamp, absent on a dry run.
 */
export function restoreDir(dir, stamp, { dryRun = false } = {}) {
  const root = resolve(dir);
  const dev = join(root, '.devocd');
  const backups = join(dev, '.backups');
  assertRealDir(dev);
  assertRealDir(backups);
  const stamps = listStamps(backups);
  const pick = stamp === undefined ? stamps[stamps.length - 1] : stamps.find((s) => s === stamp);
  if (!pick) {
    throw codedError('NO_BACKUP', stamp === undefined ? `no backup found in ${toPosix(backups)}` : `no backup named '${stamp}'`,
      stamps.length ? `Available: ${stamps.join(', ')}` : 'Run backup before restore.');
  }
  const src = join(backups, pick);
  const pairs = walkFiles(src).map((f) => /** @type {[string, string]} */ ([f, join(root, relative(src, f))]));

  // Check everything before changing anything.
  assertRealTree(dev);
  for (const [, to] of pairs) checkTarget(to);

  const inBackup = new Set(pairs.map(([, to]) => toPosix(relative(root, to))));
  const current = walkFiles(dev, (abs, name) => name === '.backups' && dirname(abs) === dev).map((f) => toPosix(relative(root, f)));
  /** @type {string[]} */ const copy = [];
  for (const [, to] of pairs) {
    const rel = toPosix(relative(root, to));
    if (durableRel(rel) && lstatOrNull(to)) continue; // a newer capture wins
    copy.push(rel);
  }
  /** @type {string[]} */ const remove = [];
  /** @type {string[]} */ const keep = [];
  for (const rel of current) {
    if (inBackup.has(rel)) continue;
    if (survivesRel(rel) || durableRel(rel)) { keep.push(rel); continue; }
    remove.push(rel);
  }

  if (dryRun) return { stamp: pick, copy, remove, keep };

  const backup = backupDir(root, { protect: pick });
  for (const [from, to] of pairs) {
    const rel = toPosix(relative(root, to));
    if (!durableRel(rel)) { copyOne(from, to); continue; }
    if (lstatOrNull(to)) continue;
    prepareTarget(to);
    // A concurrent capture that creates the file wins, even after our preflight.
    try { copyFileSync(from, to, constants.COPYFILE_EXCL); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  for (const rel of remove) rmSync(join(root, rel), { force: true });
  pruneEmptyDirs(dev);
  return { stamp: pick, backup, copy, remove, keep };
}
