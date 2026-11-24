import { workspace } from '../helpers/workspace.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { makeTree } from '../helpers/tree.mjs';
import { planRefresh, baselineRefresh } from '../../scripts/lib/refresh.mjs';

const sha = (/** @type {string} */ s) => createHash('sha256').update(s).digest('hex');
const FILES = {
  'src/a/one.js': 'export const one = 1;', 'src/a/two.js': 'export const two = 2;',
  'src/b/one.js': 'export const bone = 1;', 'flow/run.js': 'export const run = 1;',
};
const page = (/** @type {string} */ title, /** @type {string} */ parent, /** @type {string} */ scope, /** @type {string[]} */ cited) =>
  `# ${title}\n\nParent: [PROJECT](${parent})\nScope: ${scope}\nStandards: none\n\n## Purpose\n\n${title}.\n\n## Evidence\n\n` +
  cited.map(p => `- ${p} sha256:${sha(FILES[p])} 2026-01-01\n`).join('');

function fixture(/** @type {import('node:test').TestContext} */ t, { baseline = true } = {}) {
  const root = workspace(t, { projects: { api: { files: {
    ...FILES,
    '.devocd/PROJECT.md': '# API\n\n- [A](code/src/a/index.md)\n- [B](code/src/b/index.md)\n- [Run](flows/runtime/run/index.md)\n',
    '.devocd/pointer.md': 'Start with PROJECT.md',
    'CLAUDE.local.md': '<!-- devocd:begin -->\nStart with PROJECT.md\n<!-- devocd:end -->\n',
    '.devocd/code/src/index.md': page('Src', '../../PROJECT.md', 'none', []),
    '.devocd/code/src/a/index.md': page('A', '../index.md', 'src/a/**', ['src/a/one.js']),
    '.devocd/code/src/b/index.md': page('B', '../index.md', 'src/b/**', ['src/b/one.js']),
    '.devocd/flows/runtime/run/index.md': page('Run', '../../../PROJECT.md', 'flow/**', ['flow/run.js']),
  } } } }).project('api');
  if (baseline) assert.equal(baselineRefresh(root).current, true);
  return root;
}

test('an edited cited file affects only the page citing it', t => {
  const root = fixture(t);
  writeFileSync(join(root, 'src/a/one.js'), 'export const one = 100;');
  const r = planRefresh(root);
  assert.equal(r.mode, 'incremental');
  assert.deepEqual(r.changed, [{ path: 'src/a/one.js', kind: 'modified' }]);
  assert.deepEqual(r.affected, [{ id: 'code/src/a/index.md', reasons: [{ path: 'src/a/one.js', why: 'cited' }] }]);
  assert.deepEqual(r.unmapped, []);
});

test('a new uncited file under a scope affects that page as in-scope', t => {
  const root = fixture(t);
  writeFileSync(join(root, 'src/a/three.js'), 'new');
  const r = planRefresh(root);
  assert.deepEqual(r.affected, [{ id: 'code/src/a/index.md', reasons: [{ path: 'src/a/three.js', why: 'in-scope' }] }]);
  assert.equal(r.mode, 'incremental');
});

test('a file matching no scope is unmapped and PROJECT.md is listed as a parent', t => {
  const root = fixture(t);
  writeFileSync(join(root, 'tools.js'), 'new');
  const r = planRefresh(root);
  assert.deepEqual(r.unmapped, ['tools.js']);
  assert.deepEqual(r.affected, []);
  assert.ok(r.parents.includes('PROJECT.md'));
});

test('a deleted cited file is reported as deleted and affects its page', t => {
  const root = fixture(t);
  rmSync(join(root, 'src/b/one.js'));
  const r = planRefresh(root);
  assert.deepEqual(r.changed, [{ path: 'src/b/one.js', kind: 'deleted' }]);
  assert.deepEqual(r.affected.map(a => a.id), ['code/src/b/index.md']);
});

test('no baseline means a full rebuild with a reason', t => {
  const root = fixture(t, { baseline: false });
  const r = planRefresh(root);
  assert.equal(r.mode, 'full');
  assert.match(r.reason, /baseline/);
});

test('changes touching most pages fall back to a full rebuild', t => {
  const root = fixture(t);
  for (const p of ['src/a/one.js', 'src/b/one.js', 'flow/run.js']) writeFileSync(join(root, p), 'changed');
  const r = planRefresh(root);
  assert.equal(r.mode, 'full');
  assert.match(r.reason, /pages/);
});

test('parents exclude PROJECT.md when it is not a direct parent and nothing is unmapped, and affected pages', t => {
  const root = fixture(t);
  writeFileSync(join(root, 'src/a/one.js'), 'changed');
  const r = planRefresh(root);
  assert.equal(r.mode, 'incremental');
  assert.deepEqual(r.parents, ['code/src/index.md']);
  assert.ok(!r.parents.includes('code/src/a/index.md'));
});

test('an affected page whose direct parent is PROJECT.md lists PROJECT.md even with nothing unmapped', t => {
  const root = fixture(t);
  writeFileSync(join(root, 'flow/run.js'), 'changed');
  const r = planRefresh(root);
  assert.equal(r.mode, 'incremental');
  assert.deepEqual(r.unmapped, []);
  assert.deepEqual(r.parents, ['PROJECT.md']);
});

test('an unreadable baseline plans a full rebuild instead of failing', t => {
  const root = fixture(t);
  writeFileSync(join(root, '.devocd/refresh.json'), 'not json');
  const r = planRefresh(root);
  assert.equal(r.mode, 'full');
  assert.match(r.reason, /baseline/);
});

test('a changed file named like an Object prototype key is unmapped, not a crash', t => {
  const root = fixture(t);
  writeFileSync(join(root, 'constructor'), 'new');
  const r = planRefresh(root);
  assert.deepEqual(r.unmapped, ['constructor']);
});

test('generated rule folders do not shift the fingerprint', t => {
  const root = fixture(t);
  const before = planRefresh(root).fingerprint;
  makeTree(root, { '.claude/rules/devocd/a.md': 'rule' });
  assert.equal(planRefresh(root).fingerprint, before);
});

test('the impact analysis carries no hashes or file text', t => {
  const root = fixture(t);
  writeFileSync(join(root, 'src/a/one.js'), 'export const SECRETTEXT = 1;');
  writeFileSync(join(root, 'tools.js'), 'MORESECRET');
  const json = JSON.stringify(planRefresh(root));
  assert.ok(!/[a-f0-9]{64}/.test(json.replace(/"fingerprint":"[a-f0-9]{64}"/, '')));
  assert.ok(!json.includes('SECRETTEXT') && !json.includes('MORESECRET'));
});

test('exactly half the pages affected stays incremental; more than half rebuilds', t => {
  const root = fixture(t);
  // The fixture has four module/flow pages: changing two is exactly half, changing three is more.
  writeFileSync(join(root, 'src/a/one.js'), 'export const one = 100;');
  writeFileSync(join(root, 'src/b/one.js'), 'export const bone = 100;');
  const half = planRefresh(root);
  assert.equal(half.affected.length, 2, 'two pages affected');
  assert.equal(half.mode, 'incremental', 'half is not more than half');
  writeFileSync(join(root, 'flow/run.js'), 'export const run = 100;');
  const more = planRefresh(root);
  assert.equal(more.affected.length, 3, 'three pages affected');
  assert.equal(more.mode, 'full', 'more than half rebuilds');
});
