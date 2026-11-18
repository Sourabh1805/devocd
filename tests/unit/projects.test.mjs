import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { discoverProjects } from '../../scripts/lib/projects.mjs';
import { makeTree } from '../helpers/tree.mjs';

test('discovers direct Git and ordinary project folders, not nested modules or dependencies', t => {
  const root = mkdtempSync(join(tmpdir(), 'devocd-projects-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  makeTree(root, { 'api/.git/HEAD': 'ref: refs/heads/main', 'api/src/a.js': 'code', 'plain/docs/readme.md': 'docs', '.devocd/state.json': '{}', 'node_modules/lib/a.js': 'dep', 'README.md': 'company' });
  mkdirSync(join(root, 'empty'));
  symlinkSync(join(root, 'api'), join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  const result = discoverProjects(root);
  assert.deepEqual(result.projects, [{ path: 'api', gitMarker: true }, { path: 'empty', gitMarker: false }, { path: 'plain', gitMarker: false }]);
  assert.ok(result.skipped.some(p => p.path === 'linked' && p.reason === 'link'));
  assert.ok(result.skipped.some(p => p.path === 'node_modules'));
  assert.throws(() => discoverProjects(join(root, 'linked')), { code: 'BAD_TARGET' });
  const cli = fileURLToPath(new URL('../../scripts/devocd.mjs', import.meta.url));
  const run = spawnSync(process.execPath, [cli, 'discover-projects', root], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), result);
});
