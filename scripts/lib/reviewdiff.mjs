import { execFileSync } from 'node:child_process';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { codedError } from './fsutil.mjs';

/** The diff is printed whole up to this many characters; past it, only the summary, and one file at a time with --path. */
const MAX_DIFF_CHARS = 25000;
const BASE = /^[A-Za-z0-9._/-]+$/;
const USE = 'usage: devocd review-diff <dir> <base|-> [--path <repo-relative-path>]';

/** @param {string} message */
const usage = (message) => codedError('USAGE', message, USE);
/** @param {string} code @param {string} message */
const refuse = (code, message) => codedError(code, message, 'Nothing was changed.');

/**
 * Run git by argv, never through a shell. Read-only options on every call: no external diff or text conversion program,
 * no color, no fsmonitor hook, literal path names. Returns null when git exits non-zero.
 * @param {string} cwd @param {string[]} args
 */
function git(cwd, args) {
  const full = ['-c', 'core.quotepath=off', '-c', 'core.fsmonitor=false', '--literal-pathspecs', ...args];
  try {
    return execFileSync('git', full, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 });
  } catch (e) {
    const err = /** @type {any} */ (e);
    if (err.code === 'ENOENT') throw codedError('NO_GIT', 'git was not found', 'Install git, then run again.');
    if (typeof err.status === 'number') return null;
    throw e;
  }
}

/** @param {string} cwd @param {string} name */
const commit = (cwd, name) => git(cwd, ['rev-parse', '--verify', '--quiet', `${name}^{commit}`])?.trim() || null;

/** Required review reads must never be confused with empty successful output.
 * @param {string} cwd @param {string[]} args
 */
function requiredGit(cwd, args) {
  const out = git(cwd, args);
  if (out === null) throw codedError('GIT_FAILED', `git ${args[0]} failed; review is incomplete`, 'Fix the Git error and rerun the review. No clean result was produced.');
  return out;
}

/**
 * Default base: origin/HEAD's branch, then main, then master. The branch's upstream is not used: a pushed feature branch would diff only its unpushed work.
 * @param {string} top
 */
function defaultBase(top) {
  const originHead = git(top, ['rev-parse', '--abbrev-ref', 'origin/HEAD'])?.trim();
  for (const name of [originHead, 'main', 'master']) if (name && commit(top, name)) return name;
  throw refuse('NO_BASE', 'no default base found: origin/HEAD, main or master must resolve to a commit');
}

/** @param {string} top @param {string} p */
function checkPath(top, p) {
  if (!p || p.startsWith('-') || p.startsWith(':') || p.includes('\0') || p.includes('\n')) throw refuse('BAD_PATH', 'the path must be a repo-relative file path that does not start with - or :');
  const abs = resolve(top, p);
  const rel = relative(top, abs);
  if (rel === '' || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel) || isAbsolute(p)) throw refuse('BAD_PATH', 'the path is not inside the repository');
  return rel.split(sep).join('/');
}

/**
 * Read-only summary and diff of the current branch against a base, uncommitted tracked changes included.
 * @param {string} dir @param {string} base a branch name, or '-' for the default @param {{ path?: string }} [opts]
 * @returns {string}
 */
export function reviewDiff(dir, base, opts = {}) {
  if (base !== '-' && (typeof base !== 'string' || !BASE.test(base) || base.startsWith('-'))) {
    throw usage('the base must match ^[A-Za-z0-9._/-]+$ and not start with -, or be - for the default');
  }
  const top = git(dir, ['rev-parse', '--show-toplevel'])?.trim();
  if (!top) throw codedError('NOT_GIT', `${dir} is not inside a git repository`, 'Run it in a git repository.');
  const rel = opts.path === undefined ? null : checkPath(top, opts.path);
  const name = base === '-' ? defaultBase(top) : base;
  if (!commit(top, name)) throw refuse('NO_BASE', `base '${name}' is not a branch or commit here`);
  const head = commit(top, 'HEAD');
  if (!head) throw refuse('NO_BASE', 'the repository has no commits');
  const mergeBase = git(top, ['merge-base', name, 'HEAD'])?.trim();
  if (!mergeBase) throw refuse('NO_BASE', `no common ancestor between '${name}' and HEAD`);

  const diffArgs = ['diff', '--no-ext-diff', '--no-textconv', '--no-color'];
  const tail = rel === null ? [] : ['--', rel];
  const head1 = [`base: ${name}`, `merge-base: ${mergeBase}`];
  if (rel !== null) {
    const one = requiredGit(top, [...diffArgs, mergeBase, ...tail]);
    return [...head1, `file: ${rel}`, '', one || '(no tracked diff for this path; if it is a new untracked file, read it)'].join('\n');
  }
  const status = requiredGit(top, ['status', '--porcelain']);
  const names = requiredGit(top, [...diffArgs, '--name-status', mergeBase, '--']);
  const diff = requiredGit(top, [...diffArgs, mergeBase, '--']);
  const out = [...head1, '', 'status (uncommitted and untracked):', status.trimEnd() || '(clean)', '', 'changed files (merge-base against working tree):', names.trimEnd() || '(none)', ''];
  if (diff.length > MAX_DIFF_CHARS) {
    out.push(`diff too large: ${diff.length} characters, over ${MAX_DIFF_CHARS}. Not printed. Read one file at a time with: review-diff <dir> <base|-> --path <repo-relative-path>`);
  } else {
    out.push('diff:', diff.trimEnd() || '(no tracked changes)');
  }
  return out.join('\n');
}
