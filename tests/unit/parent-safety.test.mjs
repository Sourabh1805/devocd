// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { renderParent, registerProject, writeParent, sanitizeLine } from '../../scripts/lib/parent.mjs';
import { checkTree } from '../../scripts/lib/check.mjs';
import { makeTree } from '../helpers/tree.mjs';
import { git, makeRepo, tmp, tryLink } from '../helpers/git.mjs';

const cli = fileURLToPath(new URL('../../scripts/devocd.mjs', import.meta.url));

/** @param {string} dir @param {Partial<any>} over */
function writeState(dir, over = {}) {
  const state = {
    version: 1, kind: 'company', name: 'Acme', description: 'Acme builds anvils.', parentFile: 'CLAUDE.md',
    keyRules: ['Never deploy on Friday.'], projects: [], sources: [], ...over,
  };
  makeTree(dir, { '.devocd/state.json': JSON.stringify(state, null, 2) + '\n' });
}
const projects = (/** @type {number} */ n) => Array.from({ length: n }, (_, i) => ({ id: `proj-${i}`, path: `repos/proj-${i}`, description: `Service ${i}` }));

/** Every write path fails with the given code and leaves state.json and projects.md as they were. */
function assertNothingWritten(/** @type {string} */ dir, /** @type {string} */ code) {
  const stateFile = join(dir, '.devocd', 'state.json');
  const list = join(dir, '.devocd', 'projects.md');
  const before = readFileSync(stateFile);
  const listBefore = existsSync(list) ? readFileSync(list) : null;
  assert.throws(() => registerProject(dir, { id: 'new', path: 'new', description: 'd' }), { code });
  assert.throws(() => writeParent(dir), { code });
  for (const args of [['render-parent', dir], ['register', dir, 'new', 'new', 'd']]) {
    assert.equal(spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' }).status, 1);
  }
  assert.deepEqual(readFileSync(stateFile), before);
  assert.deepEqual(existsSync(list) ? readFileSync(list) : null, listBefore);
}

test('a malformed parent (begin marker, no end) fails with state and projects.md untouched', () => {
  const dir = tmp();
  writeState(dir, { projects: projects(200) });
  writeFileSync(join(dir, 'CLAUDE.md'), 'notes\n<!-- devocd:begin -->\nhalf\n');
  assertNothingWritten(dir, 'BLOCK_MALFORMED');
  assert.ok(!existsSync(join(dir, '.devocd', 'projects.md')));
  writeFileSync(join(dir, '.devocd', 'projects.md'), 'old list\n');
  assertNothingWritten(dir, 'BLOCK_MALFORMED');
});

test('a non-UTF-8 parent fails with state and projects.md untouched', () => {
  const dir = tmp();
  writeState(dir, { projects: projects(200) });
  writeFileSync(join(dir, 'CLAUDE.md'), Buffer.from([0x41, 0xff, 0xfe, 0x0a]));
  assertNothingWritten(dir, 'NOT_UTF8');
  assert.ok(!existsSync(join(dir, '.devocd', 'projects.md')));
});

test('a linked parent fails with state and projects.md untouched', (t) => {
  const dir = tmp();
  writeState(dir, { projects: projects(200) });
  if (!tryLink(tmp(), join(dir, 'CLAUDE.md'))) return t.skip('cannot create links here');
  assertNothingWritten(dir, 'NOT_REGULAR');
  assert.ok(!existsSync(join(dir, '.devocd', 'projects.md')));
});

test('token-start @ is stripped from name, description and key rules; mid-token @ stays', () => {
  assert.equal(sanitizeLine('@~/.ssh/config', 80), '~/.ssh/config');
  assert.equal(sanitizeLine('see @@/etc/passwd and a@b.com in packages/@scope/app', 80), 'see /etc/passwd and a@b.com in packages/@scope/app');
  assert.equal(sanitizeLine('x\n@file', 80), 'x file');
  const dir = tmp();
  mkdirSync(join(dir, '@scope', 'app', '.devocd'), { recursive: true });
  writeFileSync(join(dir, '@scope', 'app', '.devocd', 'PROJECT.md'), '# app\n');
  writeState(dir, {
    name: '@evil', description: '@~/.ssh/config now', keyRules: ['@~/.aws/credentials is secret', 'mail a@b.com'],
    projects: [{ id: 'app', path: '@scope/app', description: '@~/.ssh/config' }],
  });
  const r = renderParent(dir);
  assert.ok(!/(^|\s)@/m.test(r.block), r.block);
  assert.ok(r.block.includes('- app: ~/.ssh/config — ./@scope/app/.devocd/PROJECT.md'));
  assert.ok(r.block.includes('a@b.com'));
  writeParent(dir);
  assert.equal(JSON.parse(readFileSync(join(dir, '.devocd', 'state.json'), 'utf8')).projects[0].path, '@scope/app');
  const issues = checkTree(dir, {}).issues.filter((i) => i.rule === 'import/present' || i.rule === 'ref/broken');
  assert.deepEqual(issues, []);
  const big = tmp();
  writeState(big, { projects: [...projects(199), { id: 'app', path: '@scope/app', description: '@x' }] });
  const o = renderParent(big);
  assert.equal(o.overflow, true);
  assert.ok(o.projectsList && !/(^|\s)@/m.test(o.projectsList));
  assert.ok(o.projectsList.includes('./@scope/app/.devocd/PROJECT.md'));
});

test('registerProject and renderParent work from a folder with a space and non-ASCII characters', () => {
  const repo = makeRepo('café co');
  const dir = join(repo, 'my company über');
  mkdirSync(dir);
  writeState(dir);
  registerProject(dir, { id: 'api', path: 'repos/api', description: 'The API' });
  assert.equal(renderParent(dir).file, 'CLAUDE.local.md');
  assert.equal(JSON.parse(readFileSync(join(dir, '.devocd', 'state.json'), 'utf8')).parentFile, 'CLAUDE.local.md');
  assert.ok(readFileSync(join(dir, 'CLAUDE.local.md'), 'utf8').includes('- api: The API'));
  assert.equal(git(repo, 'status', '--porcelain'), '');
  assert.equal(spawnSync('git', ['-C', dir, 'check-ignore', '-q', 'CLAUDE.local.md']).status, 0);
});
