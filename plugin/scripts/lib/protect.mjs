// @ts-check
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { codedError, lstatOrNull, toPosix } from './fsutil.mjs';

/** Paths devocd keeps out of git. Patterns have no leading slash, so they match at any depth. */
export const EXCLUDE_PATTERNS = Object.freeze(['.devocd/', 'CLAUDE.local.md', '**/.claude/settings.local.json', '**/.claude/rules/devocd/']);
const TRACKED_PATHS = ['.devocd', 'CLAUDE.local.md', '.claude/settings.local.json', '.claude/rules/devocd'];
/** Files that must be ignored once protected; a tracked .gitignore can re-include them, and it wins over the exclude file. */
const MUST_BE_IGNORED = ['CLAUDE.local.md', '.devocd/state.json', '.devocd/PROJECT.md', '.claude/settings.local.json'];

/**
 * Run git with argv only (no shell).
 * @param {string} dir
 * @param {string[]} args
 * @returns {{ ok: boolean, out: string, status: number | null }}
 */
export function runGit(dir, args) {
  const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', windowsHide: true });
  if (r.error) {
    if (/** @type {any} */ (r.error).code === 'ENOENT') {
      throw codedError('GIT_MISSING', 'git was not found on PATH', 'Install git and make sure it is on PATH, then run again.');
    }
    throw codedError('GIT_FAILED', `git could not run: ${r.error.message}`, 'Check that git works in a terminal, then run again.');
  }
  return { ok: r.status === 0, out: (r.stdout || '').trim(), status: r.status };
}

/**
 * Throw NOT_IGNORED naming every path git would still show. One check-ignore call per path: with several, -q exits 0 when any one is ignored.
 * check-ignore also answers for paths that don't exist yet.
 */
function assertIgnored(/** @type {string} */ root) {
  const shown = [];
  for (const p of MUST_BE_IGNORED) {
    const r = runGit(root, ['check-ignore', '-q', '--', p]);
    if (r.status === 1) shown.push(p);
    else if (r.status !== 0) throw codedError('GIT_FAILED', `git check-ignore failed for ${p}`, 'Check that git works in this folder.');
  }
  if (shown.length) {
    throw codedError('NOT_IGNORED', `git would still show ${shown.join(', ')}, even with devocd's lines in .git/info/exclude; nothing else was written`,
      `A tracked .gitignore probably re-includes them with a ! line, which wins over .git/info/exclude. Run git check-ignore -v -- ${shown[0]} to see the line. devocd never edits a tracked .gitignore: change it with your team, or keep devocd out of this repo.`);
  }
}

/** True when dir is inside a git work tree. Throws GIT_MISSING when that cannot be told. */
export function insideWorkTree(/** @type {string} */ dir) {
  try {
    const r = runGit(dir, ['rev-parse', '--is-inside-work-tree']);
    if (r.ok) return r.out === 'true';
    for (let d = resolve(dir); ; d = dirname(d)) {
      if (lstatOrNull(resolve(d, '.git'))) throw codedError('GIT_FAILED', 'Cannot determine Git work-tree status.');
      if (dirname(d) === d) return false;
    }
  } catch (e) {
    if (/** @type {any} */ (e).code !== 'GIT_MISSING') throw e;
    // Without git, a folder with no .git above it is safely not a repo.
    for (let d = resolve(dir); ; d = dirname(d)) {
      if (lstatOrNull(resolve(d, '.git'))) throw e;
      if (dirname(d) === d) return false;
    }
  }
}

/** Throw ALREADY_TRACKED when git tracks any of the paths (relative to dir). */
export function assertNotTracked(/** @type {string} */ dir, /** @type {string[]} */ paths) {
  const result = runGit(dir, ['ls-files', '--', ...paths]);
  if (!result.ok) throw codedError('GIT_FAILED', 'Cannot verify whether generated destinations are tracked.');
  const tracked = result.out.split(/\r?\n/).filter(Boolean);
  if (tracked.length) {
    throw codedError('ALREADY_TRACKED', `already tracked by git: ${tracked.join(', ')}`,
      'Remove them from the index yourself (git rm --cached) or keep them out of devocd; devocd never changes tracked files.');
  }
}

/**
 * Keep devocd files out of git through the repo's local exclude file, then check with git that they really are ignored.
 * Never stages, commits or edits tracked files.
 * @param {string} dir
 * @returns {{ status: 'protected' | 'not-a-repo', added: string[] }}
 */
export function protectRepo(dir) {
  const root = resolve(dir);
  if (!insideWorkTree(root)) return { status: 'not-a-repo', added: [] };

  assertNotTracked(root, TRACKED_PATHS);

  const p = runGit(root, ['rev-parse', '--git-path', 'info/exclude']);
  if (!p.ok || !p.out) throw codedError('GIT_FAILED', 'git did not say where its exclude file is', 'Check that git works in this folder.');
  const exclude = resolve(root, p.out);
  const info = lstatOrNull(dirname(exclude));
  if (info && (info.isSymbolicLink() || !info.isDirectory())) {
    throw codedError('NO_DIR', `${toPosix(dirname(exclude))} is a link or not a folder`, 'devocd never writes through symlinks or junctions.');
  }
  const st = lstatOrNull(exclude);
  if (st && !st.isFile()) {
    throw codedError('NOT_REGULAR', `${toPosix(exclude)} is a link or not a regular file`, 'devocd never writes through symlinks.');
  }
  const existing = st ? readFileSync(exclude, 'utf8') : '';
  const have = new Set(existing.split(/\r?\n/).map((l) => l.trim()));
  const added = EXCLUDE_PATTERNS.filter((pat) => !have.has(pat));
  if (added.length) {
    mkdirSync(dirname(exclude), { recursive: true });
    const lead = existing === '' || existing.endsWith('\n') ? '' : '\n';
    appendFileSync(exclude, lead + added.join('\n') + '\n');
  }
  assertIgnored(root);
  return { status: 'protected', added };
}
