import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { workspace, makeCompany } from '../helpers/workspace.mjs';
import { git } from '../helpers/git.mjs';
import { stateProblem } from '../../scripts/lib/check.mjs';

test('workspace returns valid company and project states, registration and nested paths', t => {
  const w = workspace(t, { company: { name: 'Acme', projects: ['api'] }, projects: { api: {}, 'tools/worker': {} } });
  const readState = dir => JSON.parse(readFileSync(join(dir, '.devocd/state.json'), 'utf8'));
  assert.equal(w.company, w.root);
  assert.ok(isAbsolute(w.root));
  assert.equal(w.project('api'), join(w.root, 'api'));
  assert.equal(w.project('tools/worker'), join(w.root, 'tools/worker'));
  for (const dir of [w.company, w.project('api'), w.project('tools/worker')]) assert.equal(stateProblem(readState(dir)), null);
  assert.deepEqual(readState(w.company).projects, [{ id: 'api', path: 'api', description: '' }]);
  assert.equal(readState(w.project('tools/worker')).companyRel, '../..');
  assert.equal(w.memoryDir, null);
  assert.throws(() => w.project('absent'), /Unknown fixture project/);
});

test('workspace writes standards, pages, sources, memory and merged state overrides', t => {
  const w = workspace(t, { company: { standards: { 'coding.md': '# Rules' }, files: { 'CLAUDE.md': 'company' } },
    projects: { api: { state: { ruleStubs: false }, pages: { 'PROJECT.md': '# API' }, files: { 'src/a.js': 'source' } } },
    memory: { 'MEMORY.md': 'memory' }, files: { 'root.txt': 'root' } });
  for (const [path, expected] of [['.devocd/standards/coding.md', '# Rules'], ['CLAUDE.md', 'company'],
    ['api/.devocd/PROJECT.md', '# API'], ['api/src/a.js', 'source'], ['root.txt', 'root']]) {
    assert.equal(readFileSync(join(w.root, path), 'utf8'), expected);
  }
  assert.equal(readFileSync(join(w.memoryDir, 'MEMORY.md'), 'utf8'), 'memory');
  const state = JSON.parse(readFileSync(join(w.project('api'), '.devocd/state.json'), 'utf8'));
  assert.equal(state.ruleStubs, false);
  assert.equal(stateProblem(state), null);
});

test('workspace registers cleanup and bare workspaces add no installed state', async t => {
  let root;
  await t.test('owned fixture', child => { root = workspace(child).root; assert.ok(existsSync(root)); assert.ok(!existsSync(join(root, '.devocd'))); });
  assert.equal(existsSync(root), false);
  const empty = workspace(t);
  assert.equal(empty.company, null);
  assert.equal(empty.memoryDir, null);
});

test('git is initialized only for opted-in projects', t => {
  const w = workspace(t, { projects: { api: { git: true }, plain: {} } });
  assert.equal(git(w.project('api'), 'rev-parse', '--is-inside-work-tree').trim(), 'true');
  assert.equal(existsSync(join(w.project('plain'), '.git')), false);
  assert.equal(existsSync(join(w.root, '.git')), false);
});

test('live company adapter preserves an uninstalled workspace and initial commits', t => {
  const { root } = workspace(t);
  const { company, repos } = makeCompany(root, { projects: ['api'], teamAgentsMd: { api: '# Agents' } });
  assert.equal(existsSync(join(company, '.devocd')), false);
  assert.equal(existsSync(join(repos.api, '.devocd')), false);
  assert.equal(readFileSync(join(repos.api, 'AGENTS.md'), 'utf8'), '# Agents');
  assert.equal(git(repos.api, 'rev-list', '--count', 'HEAD').trim(), '1');
});
