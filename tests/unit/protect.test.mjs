// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { protectRepo } from '../../plugin/scripts/lib/protect.mjs';
import { git, makeRepo, tmp } from '../helpers/git.mjs';

const cli = fileURLToPath(new URL('../../plugin/scripts/devocd.mjs', import.meta.url));

function createAll(/** @type {string} */ dir) {
  mkdirSync(join(dir, '.devocd'), { recursive: true });
  writeFileSync(join(dir, '.devocd', 'PROJECT.md'), 'x\n');
  writeFileSync(join(dir, 'CLAUDE.local.md'), 'x\n');
  mkdirSync(join(dir, '.claude'), { recursive: true });
  writeFileSync(join(dir, '.claude', 'settings.local.json'), '{}\n');
}

test('protect leaves git status --porcelain empty after creating all three paths', () => {
  const dir = makeRepo();
  const r = protectRepo(dir);
  assert.equal(r.status, 'protected');
  assert.equal(r.added.length, 3);
  createAll(dir);
  assert.equal(git(dir, 'status', '--porcelain'), '');
});

test('protect does not touch tracked .gitignore, and HEAD is unchanged', () => {
  const dir = makeRepo();
  const head = git(dir, 'rev-parse', 'HEAD');
  const ignore = readFileSync(join(dir, '.gitignore'));
  protectRepo(dir);
  assert.equal(git(dir, 'rev-parse', 'HEAD'), head);
  assert.deepEqual(readFileSync(join(dir, '.gitignore')), ignore);
  assert.equal(git(dir, 'status', '--porcelain'), '');
});

test('a second protect adds nothing, and existing exclude content stays byte-identical', () => {
  const dir = makeRepo();
  const ex = join(dir, '.git', 'info', 'exclude');
  mkdirSync(join(dir, '.git', 'info'), { recursive: true });
  writeFileSync(ex, '# mine\r\nfoo.log');
  protectRepo(dir);
  const once = readFileSync(ex);
  assert.ok(once.toString().startsWith('# mine\r\nfoo.log\n'));
  assert.deepEqual(protectRepo(dir).added, []);
  assert.deepEqual(readFileSync(ex), once);
});

test('creates .git/info when missing', () => {
  const dir = makeRepo();
  const info = join(dir, '.git', 'info');
  rmSync(info, { recursive: true, force: true });
  assert.equal(protectRepo(dir).status, 'protected');
  assert.ok(existsSync(join(info, 'exclude')));
});

test('already-tracked CLAUDE.local.md refuses and names it', () => {
  const dir = makeRepo();
  writeFileSync(join(dir, 'CLAUDE.local.md'), 'x\n');
  git(dir, 'add', 'CLAUDE.local.md');
  git(dir, 'commit', '-q', '-m', 'oops');
  assert.throws(() => protectRepo(dir), (e) => /** @type {any} */ (e).code === 'ALREADY_TRACKED' && /CLAUDE\.local\.md/.test(/** @type {any} */ (e).message));
  assert.ok(!existsSync(join(dir, '.git', 'info', 'exclude')) || !readFileSync(join(dir, '.git', 'info', 'exclude'), 'utf8').includes('CLAUDE.local.md'));
});

test('works in a linked worktree', () => {
  const dir = makeRepo();
  const wt = join(tmp('devocd-wt-'), 'wt');
  git(dir, 'worktree', 'add', '-q', wt, '-b', 'other');
  assert.equal(protectRepo(wt).status, 'protected');
  createAll(wt);
  assert.equal(git(wt, 'status', '--porcelain'), '');
});

test('a non-repo folder returns not-a-repo', () => {
  const dir = tmp('devocd-plain-');
  assert.deepEqual(protectRepo(dir), { status: 'not-a-repo', added: [] });
});

test('protect covers a subfolder of a monorepo', () => {
  const dir = makeRepo();
  const sub = join(dir, 'packages', 'app');
  mkdirSync(sub, { recursive: true });
  writeFileSync(join(sub, 'a.txt'), 'a\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'sub');
  assert.equal(protectRepo(sub).status, 'protected');
  createAll(sub);
  assert.equal(git(dir, 'status', '--porcelain'), '');
});

test('CLI protect: not a repo exits 0; tracked exits 1 with error and hint', () => {
  const plain = spawnSync(process.execPath, [cli, 'protect', tmp('devocd-plain-')], { encoding: 'utf8' });
  assert.equal(plain.status, 0);
  const dir = makeRepo();
  writeFileSync(join(dir, 'CLAUDE.local.md'), 'x\n');
  git(dir, 'add', 'CLAUDE.local.md');
  git(dir, 'commit', '-q', '-m', 'oops');
  const r = spawnSync(process.execPath, [cli, 'protect', dir], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^error: .*CLAUDE\.local\.md/m);
  assert.match(r.stderr, /^hint: /m);
  assert.ok(!r.stderr.includes('    at '));
});

test('CLI protect with git missing exits 3 with a hint', () => {
  const dir = makeRepo();
  const r = spawnSync(process.execPath, [cli, 'protect', dir], { encoding: 'utf8', env: { ...process.env, PATH: '', Path: '' } });
  assert.equal(r.status, 3);
  assert.match(r.stderr, /^error: .*git/im);
  assert.match(r.stderr, /^hint: /m);
});
