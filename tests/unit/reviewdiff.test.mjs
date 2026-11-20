import { workspace } from '../helpers/workspace.mjs';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { git, makeRepo as createRepo } from '../helpers/git.mjs';
const makeRepo = (sub = '') => createRepo(sub, workspace({ after }).root);
const tmp = (_prefix = 'devocd-') => workspace({ after }).root;
import { reviewDiff } from '../../scripts/lib/reviewdiff.mjs';

const cli = fileURLToPath(new URL('../../scripts/devocd.mjs', import.meta.url));
const run = (/** @type {string[]} */ ...args) => spawnSync(process.execPath, [cli, 'review-diff', ...args], { encoding: 'utf8' });

/** main with one commit, then a feature branch with a commit, an uncommitted tracked change and an untracked file. */
function featureRepo() {
  const dir = makeRepo();
  git(dir, 'branch', '-M', 'main');
  git(dir, 'checkout', '-q', '-b', 'feature');
  writeFileSync(join(dir, 'a.js'), 'export const a = 1;\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'add a');
  writeFileSync(join(dir, 'README.md'), 'hello\nchanged\n');
  writeFileSync(join(dir, 'new file.txt'), 'untracked\n');
  return dir;
}

test('prints the base, merge-base, status, changed files and the diff including uncommitted tracked changes', () => {
  const dir = featureRepo();
  const out = reviewDiff(dir, 'main');
  assert.match(out, /^base: main$/m);
  assert.ok(out.includes(`merge-base: ${git(dir, 'rev-parse', 'main').trim()}`));
  assert.match(out, /\?\? "new file\.txt"/);
  assert.match(out, /^A\ta\.js$/m);
  assert.match(out, /^M\tREADME\.md$/m);
  assert.match(out, /\+export const a = 1;/);
  assert.match(out, /\+changed/);
});

test('"-" picks main, then master, and refuses when neither exists; the upstream is ignored', () => {
  const dir = featureRepo();
  assert.match(reviewDiff(dir, '-'), /^base: main$/m);
  git(dir, 'branch', '-m', 'main', 'master');
  assert.match(reviewDiff(dir, '-'), /^base: master$/m);
  git(dir, 'branch', 'other', 'master');
  git(dir, 'branch', '-m', 'master', 'trunk');
  assert.throws(() => reviewDiff(dir, '-'), { code: 'NO_BASE', message: /origin\/HEAD, main or master/ });
  git(dir, 'branch', '--set-upstream-to=other');
  assert.throws(() => reviewDiff(dir, '-'), { code: 'NO_BASE' }, 'an upstream is not a default base');
});

test('"-" diffs against origin/HEAD, not the pushed upstream, so a pushed feature branch shows all its work', () => {
  const dir = featureRepo();
  const remote = tmp('devocd-remote-');
  git(remote, 'init', '--bare', '-q');
  git(dir, 'remote', 'add', 'origin', remote);
  git(dir, 'push', '-q', '-u', 'origin', 'main');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'pushed work');
  git(dir, 'push', '-q', '-u', 'origin', 'feature');
  writeFileSync(join(dir, 'unpushed.js'), 'export const unpushed = 1;\n');
  git(dir, 'add', 'unpushed.js');
  git(dir, 'commit', '-q', '-m', 'unpushed work');
  git(dir, 'remote', 'set-head', 'origin', 'main');
  const out = reviewDiff(dir, '-');
  assert.match(out, /^base: origin\/main$/m);
  assert.match(out, /^A\ta\.js$/m);
  assert.match(out, /\+export const a = 1;/, 'the commit already pushed to origin/feature is in the review');
  assert.match(out, /\+export const unpushed = 1;/);
});

test('a base that is not a branch is refused; one that fails the pattern is a usage error', () => {
  const dir = featureRepo();
  assert.throws(() => reviewDiff(dir, 'nope'), { code: 'NO_BASE' });
  for (const bad of ['--output=x', '-x', 'a b', 'main;touch pwned', '', '$(x)', 'a\nb']) {
    assert.throws(() => reviewDiff(dir, bad), { code: 'USAGE' }, JSON.stringify(bad));
  }
});

test('exit codes: 0 ok, 1 refusal, 2 usage with no git call, 3 not a git repository', () => {
  const dir = featureRepo();
  assert.equal(run(dir, 'main').status, 0);
  assert.equal(run(dir, 'nope').status, 1);
  assert.equal(run(dir, 'main', '--path', '../x').status, 1);
  assert.equal(run(dir).status, 2);
  assert.equal(run(dir, 'main', '--path').status, 2);
  const plain = tmp('devocd-notrepo-');
  assert.equal(run(plain, '-').status, 3);
  assert.equal(run(plain, '--output=x').status, 2, 'a bad base is refused before git is called, even outside a repository');
  assert.ok(!existsSync(join(plain, 'x')));
});

test('git is not run through a shell, and --output, --no-index and a shell never appear in the code', () => {
  const src = readFileSync(fileURLToPath(new URL('../../scripts/lib/reviewdiff.mjs', import.meta.url)), 'utf8');
  assert.doesNotMatch(src, /--output|--no-index|\bexecSync\b|shell:\s*true|\bexec\(/);
  assert.match(src, /execFileSync\('git'/);
  assert.match(src, /--no-ext-diff/);
  assert.match(src, /--no-textconv/);
  assert.match(src, /--no-color/);
  assert.match(src, /core\.quotepath=off/);
});

test('a hostile base or path cannot write a file: nothing is created', () => {
  const dir = featureRepo();
  run(dir, '--output=pwned');
  run(dir, 'main', '--path', '--output=pwned');
  run(dir, 'main', '--path', ':(top)README.md');
  assert.ok(!existsSync(join(dir, 'pwned')));
  assert.throws(() => reviewDiff(dir, 'main', { path: '--output=pwned' }), { code: 'BAD_PATH' });
  assert.throws(() => reviewDiff(dir, 'main', { path: ':(glob)**' }), { code: 'BAD_PATH' });
});

test('a diff over the limit prints the summary and a line saying so; --path prints one file', () => {
  const dir = featureRepo();
  writeFileSync(join(dir, 'big.txt'), 'line of text that repeats\n'.repeat(1200));
  git(dir, 'add', 'big.txt');
  git(dir, 'commit', '-q', '-m', 'big');
  const out = reviewDiff(dir, 'main');
  assert.match(out, /diff too large: \d+ characters, over 25000/);
  assert.match(out, /Not printed\. Read one file at a time with: review-diff/);
  assert.match(out, /^A\tbig\.txt$/m);
  assert.ok(!out.includes('line of text that repeats'));
  const one = reviewDiff(dir, 'main', { path: 'a.js' });
  assert.match(one, /\+export const a = 1;/);
  assert.doesNotMatch(one, /big\.txt/);
  mkdirSync(join(dir, 'sub'));
  writeFileSync(join(dir, 'sub', 'b.js'), 'b\n');
  git(dir, 'add', 'sub');
  const sub = reviewDiff(join(dir, 'sub'), 'main', { path: 'sub/b.js' });
  assert.match(sub, /\+b/, 'the path is relative to the repo root, whichever folder is given');
});

test('a path outside the repository or starting with - is refused', () => {
  const dir = featureRepo();
  // A backslash is a legal file-name character on POSIX, so the drive path is a Windows-only case; /etc/passwd covers POSIX.
  for (const p of ['../x', '..', '/etc/passwd', ...(process.platform === 'win32' ? ['C:\\Windows\\win.ini'] : []), '-x', '', 'a/../../x']) {
    assert.throws(() => reviewDiff(dir, 'main', { path: p }), { code: 'BAD_PATH' }, p);
  }
});

test('it changes nothing: status and HEAD are the same afterwards', () => {
  const dir = featureRepo();
  const before = [git(dir, 'status', '--porcelain'), git(dir, 'rev-parse', 'HEAD'), git(dir, 'for-each-ref')];
  reviewDiff(dir, '-');
  reviewDiff(dir, 'main', { path: 'a.js' });
  assert.deepEqual([git(dir, 'status', '--porcelain'), git(dir, 'rev-parse', 'HEAD'), git(dir, 'for-each-ref')], before);
});

test('a configured external diff or text conversion program is not run', () => {
  const dir = featureRepo();
  const marker = join(dir, '..', 'ran-marker');
  const prog = `node -e "require('fs').writeFileSync(${JSON.stringify(marker)},'x')"`;
  git(dir, 'config', 'diff.external', prog);
  writeFileSync(join(dir, '.gitattributes'), '*.js diff=evil\n');
  git(dir, 'config', 'diff.evil.textconv', prog);
  reviewDiff(dir, 'main');
  assert.ok(!existsSync(marker));
});

test('Git errors fail both whole and per-file reviews instead of reporting clean', () => {
  const dir = featureRepo();
  git(dir, 'config', 'diff.algorithm', 'invalid');
  for (const opts of [{}, { path: 'README.md' }]) {
    assert.throws(() => reviewDiff(dir, 'main', opts), { code: 'GIT_FAILED', message: /review is incomplete/ });
  }
  const result = run(dir, 'main');
  assert.equal(result.status, 3);
  assert.doesNotMatch(result.stdout, /\(clean\)|\(no tracked changes\)/);
});

test('successful empty Git output still reports a clean review', () => {
  const dir = makeRepo();
  git(dir, 'branch', '-M', 'main');
  assert.match(reviewDiff(dir, 'main'), /\(clean\)/);
  assert.match(reviewDiff(dir, 'main', { path: 'README.md' }), /no tracked diff/);
});
