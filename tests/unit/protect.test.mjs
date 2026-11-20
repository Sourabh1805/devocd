import { workspace } from '../helpers/workspace.mjs';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { protectRepo } from '../../scripts/lib/protect.mjs';
import { git, makeRepo as createRepo, tryLink } from '../helpers/git.mjs';

const makeRepo = (sub = '') => createRepo(sub, workspace({ after }).root);
const tmp = (_prefix = 'devocd-') => workspace({ after }).root;

const cli = fileURLToPath(new URL('../../scripts/devocd.mjs', import.meta.url));

function createAll(/** @type {string} */ dir) {
  mkdirSync(join(dir, '.devocd'), { recursive: true });
  writeFileSync(join(dir, '.devocd', 'PROJECT.md'), 'x\n');
  writeFileSync(join(dir, 'CLAUDE.local.md'), 'x\n');
  mkdirSync(join(dir, '.claude'), { recursive: true });
  writeFileSync(join(dir, '.claude', 'settings.local.json'), '{}\n');
  mkdirSync(join(dir, '.claude', 'rules', 'devocd'), { recursive: true });
  writeFileSync(join(dir, '.claude', 'rules', 'devocd', 'code--x.md'), 'x\n');
}

test('protect leaves git status --porcelain empty after creating every protected path', () => {
  const dir = makeRepo();
  const r = protectRepo(dir);
  assert.equal(r.status, 'protected');
  assert.equal(r.added.length, 4);
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

/** A repo whose tracked .gitignore is exactly text. */
function repoWithIgnore(/** @type {string} */ text) {
  const dir = makeRepo();
  writeFileSync(join(dir, '.gitignore'), text);
  git(dir, 'add', '.gitignore');
  git(dir, 'commit', '-q', '-m', 'ignore rules');
  return dir;
}
const notIgnored = (/** @type {RegExp[]} */ ...names) => (/** @type {any} */ e) =>
  e.code === 'NOT_IGNORED' && names.every((re) => re.test(e.message)) && /\.gitignore/.test(e.hint) && /git check-ignore -v/.test(e.hint);

test('a tracked .gitignore with !CLAUDE.local.md: protect refuses with NOT_IGNORED, names only that path, and refuses again on a rerun', () => {
  const dir = repoWithIgnore('node_modules/\n!CLAUDE.local.md\n');
  assert.throws(() => protectRepo(dir), notIgnored(/CLAUDE\.local\.md/));
  assert.throws(() => protectRepo(dir), (/** @type {any} */ e) => e.code === 'NOT_IGNORED' && !/\.devocd|settings\.local/.test(e.message), 'only the re-included path is named');
  assert.throws(() => protectRepo(dir), notIgnored(/CLAUDE\.local\.md/), 'a rerun with nothing to add still checks');
  createAll(dir);
  assert.match(git(dir, 'status', '--porcelain'), /CLAUDE\.local\.md/, 'the case the refusal is for: git would show the file');
});

test('an allow-list .gitignore: protect refuses and names each path git would still show', () => {
  const dir = repoWithIgnore('*\n!*.md\n!*/\n!.gitignore\n!src/**\n');
  assert.throws(() => protectRepo(dir), notIgnored(/CLAUDE\.local\.md/, /\.devocd\/PROJECT\.md/));
});

test('CLI protect: a path the tracked .gitignore re-includes exits 1 with the error and a hint, no stack', () => {
  const dir = repoWithIgnore('!CLAUDE.local.md\n');
  const r = spawnSync(process.execPath, [cli, 'protect', dir], { encoding: 'utf8' });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /^error: .*CLAUDE\.local\.md/m);
  assert.match(r.stderr, /^hint: .*\.gitignore/m);
  assert.ok(!r.stderr.includes('    at '));
});

test('a monorepo company whose .gitignore re-includes CLAUDE.local.md: render-parent refuses and writes no parent or state', () => {
  const repo = repoWithIgnore('node_modules/\n!CLAUDE.local.md\n');
  const company = join(repo, 'company');
  mkdirSync(join(company, '.devocd'), { recursive: true });
  const draft = join(company, '.devocd', 'state.draft.json');
  writeFileSync(draft, JSON.stringify({ version: 1, kind: 'company', name: 'Acme', description: 'Acme builds anvils.', parentFile: 'CLAUDE.local.md', keyRules: ['Never deploy on Friday.'], sources: [] }));
  const r = spawnSync(process.execPath, [cli, 'render-parent', company, draft], { encoding: 'utf8' });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /^error: .*CLAUDE\.local\.md/m);
  assert.ok(!existsSync(join(company, 'CLAUDE.local.md')), 'no parent written');
  assert.ok(!existsSync(join(company, '.devocd', 'state.json')), 'no state written');
});

test('a linked .git/info is refused before the exclude file is read or written', (t) => {
  const dir = makeRepo();
  const info = join(dir, '.git', 'info');
  const outside = tmp('devocd-outside-');
  rmSync(info, { recursive: true, force: true });
  if (!tryLink(outside, info)) return t.skip('cannot create links here');
  assert.throws(() => protectRepo(dir), (/** @type {any} */ e) => e.code === 'NO_DIR' && /info/.test(e.message));
  assert.ok(!existsSync(join(outside, 'exclude')), 'nothing written behind the link');
  assert.equal(spawnSync(process.execPath, [cli, 'protect', dir], { encoding: 'utf8' }).status, 1);
});

test('protect works from a folder with a space and non-ASCII characters, normal repo and worktree', () => {
  const dir = makeRepo('café repo');
  const sub = join(dir, 'sub über');
  mkdirSync(sub);
  assert.equal(protectRepo(sub).status, 'protected');
  createAll(sub);
  assert.equal(git(dir, 'status', '--porcelain'), '');
  for (const p of ['.devocd/PROJECT.md', 'CLAUDE.local.md', '.claude/settings.local.json']) {
    assert.equal(spawnSync('git', ['-C', sub, 'check-ignore', '-q', p]).status, 0, p);
  }
  const wt = join(tmp('devocd-wt-'), 'wörk tree');
  git(dir, 'worktree', 'add', '-q', wt, '-b', 'other2');
  assert.equal(protectRepo(wt).status, 'protected');
  createAll(wt);
  assert.equal(git(wt, 'status', '--porcelain'), '');
  assert.equal(spawnSync('git', ['-C', wt, 'check-ignore', '-q', 'CLAUDE.local.md']).status, 0);
});
