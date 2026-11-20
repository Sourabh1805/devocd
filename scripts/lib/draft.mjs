import { rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { codedError, lstatOrNull } from './fsutil.mjs';
import { assertNotTracked, insideWorkTree } from './protect.mjs';

/**
 * Remove <dir>/.devocd/draft, the unapproved drafts a run writes for the user to inspect. Skills have no delete
 * tool, so this is the one sanctioned way to clear it, before a run writes fresh drafts (a stale file from an
 * earlier, rejected run must never be applied) and after an approved run applies them.
 * Scoped hard because it deletes: only that one folder; refused when .devocd or draft is a link (nothing is ever
 * followed out of the project); refused when git tracks anything in it (devocd never changes tracked files).
 * @param {string} dir
 */
export function cleanDraft(dir) {
  const root = resolve(dir);
  const rootStat = lstatOrNull(root);
  if (!rootStat?.isDirectory() || rootStat.isSymbolicLink()) throw codedError('BAD_TARGET', 'clean-draft requires a real folder.');
  const dev = lstatOrNull(join(root, '.devocd'));
  if (!dev) return { removed: false };
  if (!dev.isDirectory() || dev.isSymbolicLink()) throw codedError('BAD_TARGET', 'clean-draft requires .devocd to be a real folder, not a link.');
  const draft = join(root, '.devocd', 'draft');
  const stat = lstatOrNull(draft);
  if (!stat) return { removed: false };
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw codedError('BAD_TARGET', 'clean-draft requires .devocd/draft to be a real folder, not a link or file.');
  if (insideWorkTree(root)) assertNotTracked(root, ['.devocd/draft']);
  rmSync(draft, { recursive: true, force: true });
  return { removed: true };
}
