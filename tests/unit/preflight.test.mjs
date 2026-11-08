// @ts-check
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { walkFiles } from '../../plugin/scripts/lib/fsutil.mjs';
import { makeTree } from '../helpers/tree.mjs';
import { makeRepo as newRepo, tmp as newTmp, tryLink } from '../helpers/git.mjs';

const cli = fileURLToPath(new URL('../../plugin/scripts/devocd.mjs', import.meta.url));

/** Every temp folder made here, removed when this file's tests end. */
const made = /** @type {string[]} */ ([]);
const tmp = (/** @type {string | undefined} */ prefix = undefined) => { const d = newTmp(prefix); made.push(d); return d; };
const makeRepo = () => { const d = newRepo(); made.push(d); return d; };
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });

/** Run preflight with HOME and USERPROFILE set on the child, so the real home folder is never involved. */
function preflight(/** @type {string} */ dir, /** @type {string} */ home = tmp('devocd-home-')) {
  return spawnSync(process.execPath, [cli, 'preflight', dir, '--json'], { encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home } });
}
const parsed = (/** @type {ReturnType<typeof preflight>} */ r) => {
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
};

test('preflight says isHome when the folder is the home directory, and does not walk it', () => {
  const home = tmp('devocd-home-');
  makeTree(home, { 'repo/AGENTS.md': 'x\n' });
  assert.deepEqual(parsed(preflight(home, home)), { isHome: true, parentFile: 'CLAUDE.md', agentsMd: [] });
});

test('isHome compares resolved paths, whatever the spelling', () => {
  const home = tmp('devocd-home-');
  assert.equal(parsed(preflight(home + '/', home)).isHome, true, 'trailing slash');
  assert.equal(parsed(preflight(join(home, 'sub', '..'), home)).isHome, true, 'dot-dot');
  const r = spawnSync(process.execPath, [cli, 'preflight', '.', '--json'], { cwd: home, encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home } });
  assert.equal(parsed(r).isHome, true, 'relative');
  if (process.platform === 'win32') assert.equal(parsed(preflight(home.toUpperCase(), home)).isHome, true, 'case');
});

test('a folder below or beside home is not home', () => {
  const home = tmp('devocd-home-');
  makeTree(home, { 'sub/AGENTS.md': 'x\n' });
  const r = parsed(preflight(join(home, 'sub'), home));
  assert.equal(r.isHome, false);
  assert.deepEqual(r.agentsMd, ['AGENTS.md']);
  assert.equal(parsed(preflight(tmp())).isHome, false);
});

test('parentFile is CLAUDE.md outside a git repo and CLAUDE.local.md inside one', () => {
  assert.equal(parsed(preflight(tmp())).parentFile, 'CLAUDE.md');
  const repo = makeRepo();
  assert.equal(parsed(preflight(repo)).parentFile, 'CLAUDE.local.md');
  makeTree(repo, { 'sub/x.txt': 'x\n' });
  assert.equal(parsed(preflight(join(repo, 'sub'))).parentFile, 'CLAUDE.local.md');
});

test('agentsMd lists files down to 4 levels, with forward slashes, skipping .git, node_modules and .devocd', () => {
  const dir = tmp();
  makeTree(dir, {
    'AGENTS.md': 'top\n',
    'a/AGENTS.md': '1\n',
    'a/b/c/d/AGENTS.md': '4 levels\n',
    'a/b/c/d/e/AGENTS.md': '5 levels\n',
    '.git/AGENTS.md': 'skip\n',
    'a/node_modules/x/AGENTS.md': 'skip\n',
    '.devocd/AGENTS.md': 'skip\n',
    'a/not-AGENTS.md': 'skip\n',
  });
  assert.deepEqual(parsed(preflight(dir)).agentsMd, ['AGENTS.md', 'a/AGENTS.md', 'a/b/c/d/AGENTS.md']);
});

test('agentsMd follows no links', (t) => {
  const dir = tmp();
  const elsewhere = tmp();
  makeTree(elsewhere, { 'AGENTS.md': 'x\n' });
  if (!tryLink(elsewhere, join(dir, 'link'))) return t.skip('cannot create links here');
  assert.deepEqual(parsed(preflight(dir)).agentsMd, []);
});

test('a folder named AGENTS.md is not reported', () => {
  const dir = tmp();
  makeTree(dir, { 'AGENTS.md/inner.txt': 'x\n' });
  assert.deepEqual(parsed(preflight(dir)).agentsMd, []);
});

test('preflight is read-only', () => {
  const repo = makeRepo();
  makeTree(repo, { 'sub/AGENTS.md': 'x\n' });
  const before = walkFiles(repo).map((f) => [relative(repo, f), readFileSync(f).toString('hex')]);
  parsed(preflight(repo));
  assert.deepEqual(walkFiles(repo).map((f) => [relative(repo, f), readFileSync(f).toString('hex')]), before);
});

test('preflight usage and environment errors', () => {
  const run = (/** @type {string[]} */ ...args) => spawnSync(process.execPath, [cli, 'preflight', ...args], { encoding: 'utf8' });
  assert.equal(run().status, 2, 'no folder');
  assert.equal(run(tmp()).status, 2, 'no --json');
  assert.equal(run(tmp(), tmp(), '--json').status, 2, 'two folders');
  const missing = run(join(tmp(), 'nope'), '--json');
  assert.equal(missing.status, 3);
  assert.match(missing.stderr, /^error: folder not found/m);
});
