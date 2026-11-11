import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeTree } from '../helpers/tree.mjs';
import { refreshStatus, planRefresh, completeRefresh } from '../../plugin/scripts/lib/refresh.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'devocd-refresh-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return makeTree(root, {
    '.devocd/state.json': JSON.stringify({version:1,kind:'project',id:'api',companyRel:'..',teamFiles:[],approvedCommands:[],sources:[]}),
    '.devocd/PROJECT.md': '# API\n', '.devocd/pointer.md': 'Start with PROJECT.md',
    'CLAUDE.local.md': '<!-- devocd:begin -->\nStart with PROJECT.md\n<!-- devocd:end -->\n',
    'src/a.js': 'export const a = 1;'
  });
}

test('manual refresh records evidence; additions, edits and deletions become stale', t => {
  const root = fixture(t);
  assert.equal(refreshStatus(root).reason, 'no-baseline');
  planRefresh(root);
  writeFileSync(join(root, 'CLAUDE.local.md'), '<!-- devocd:begin -->\nNew generated pointer\n<!-- devocd:end -->\n');
  completeRefresh(root);
  assert.equal(refreshStatus(root).needsRefresh, false);
  writeFileSync(join(root, 'src/a.js'), 'export const a = 2;');
  writeFileSync(join(root, 'src/b.js'), 'new');
  let status = refreshStatus(root);
  assert.equal(status.needsRefresh, true);
  assert.ok(status.changed.some(f => f.path === 'src/a.js' && f.kind === 'modified'));
  assert.ok(status.changed.some(f => f.path === 'src/b.js' && f.kind === 'added'));
  rmSync(join(root, 'src/a.js'));
  assert.ok(refreshStatus(root).changed.some(f => f.kind === 'deleted'));
});

test('concurrent edits and failed project checks cannot replace the last good baseline', t => {
  const root = fixture(t);
  planRefresh(root); completeRefresh(root);
  const baseline = readFileSync(join(root, '.devocd/refresh.json'), 'utf8');
  planRefresh(root);
  writeFileSync(join(root, 'src/a.js'), 'changed during discovery');
  assert.throws(() => completeRefresh(root), /Source changed during refresh/);
  assert.equal(readFileSync(join(root, '.devocd/refresh.json'), 'utf8'), baseline);
  planRefresh(root);
  rmSync(join(root, '.devocd/PROJECT.md'));
  assert.throws(() => completeRefresh(root), /checks failed/);
  assert.equal(readFileSync(join(root, '.devocd/refresh.json'), 'utf8'), baseline);
});

test('partial inventories and invalid saved evidence never report fresh', t => {
  const root = fixture(t);
  writeFileSync(join(root, 'src/huge.js'), 'x'.repeat(256 * 1024 + 1));
  assert.throws(() => planRefresh(root), /partial/);
  assert.equal(refreshStatus(root).needsRefresh, true);
  writeFileSync(join(root, '.devocd/refresh.json'), '{}');
  assert.throws(() => refreshStatus(root), /snapshot is invalid/);
});
