import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { makeTree } from '../helpers/tree.mjs';
import { refreshStatus, planRefresh, completeRefresh, baselineRefresh, sourceFingerprint } from '../../plugin/scripts/lib/refresh.mjs';

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

test('refresh-baseline renders the graph and records the baseline in one step at setup', t => {
  const root = fixture(t);
  assert.equal(refreshStatus(root).reason, 'no-baseline');
  const r = baselineRefresh(root);
  assert.equal(r.current, true);
  assert.equal(refreshStatus(root).needsRefresh, false);
});

/** What onboarding itself creates, after discovery: project state, the pointer block, local settings. */
function onboard(/** @type {string} */ root) {
  makeTree(root, {
    '.devocd/state.json': JSON.stringify({version:1,kind:'project',id:'api',companyRel:'..',teamFiles:[],approvedCommands:[],sources:[]}),
    '.devocd/PROJECT.md': '# API\n', '.devocd/pointer.md': 'Start with PROJECT.md',
    'CLAUDE.local.md': '<!-- devocd:begin -->\nStart with PROJECT.md\n<!-- devocd:end -->\n',
    '.claude/settings.local.json': '{}',
  });
}

test('first-time setup: onboarding\'s own files never change the discovery fingerprint', t => {
  const root = mkdtempSync(join(tmpdir(), 'devocd-fresh-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  // A genuinely fresh project: discovery runs BEFORE .devocd exists.
  makeTree(root, { 'src/a.js': 'export const a = 1;' });
  const atDiscovery = sourceFingerprint(root);
  onboard(root);
  assert.equal(sourceFingerprint(root), atDiscovery, 'creating .devocd, the pointer and local settings is not a source change');
  const r = baselineRefresh(root, atDiscovery);
  assert.equal(r.current, true, JSON.stringify(r));
  assert.equal(refreshStatus(root).needsRefresh, false);
});

test('first-time setup in a git repository records its baseline too', t => {
  const root = mkdtempSync(join(tmpdir(), 'devocd-fresh-git-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  makeTree(root, { 'src/a.js': 'export const a = 1;', '.gitignore': 'node_modules/\n' });
  const init = spawnSync('git', ['-c', 'gc.auto=0', '-C', root, 'init', '-q'], { encoding: 'utf8' });
  assert.equal(init.status, 0, init.stderr);
  const atDiscovery = sourceFingerprint(root);
  onboard(root);
  const r = baselineRefresh(root, atDiscovery);
  assert.equal(r.current, true, JSON.stringify(r));
});

test('refresh-baseline refuses to bless source that changed since discovery', t => {
  const root = fixture(t);
  const atGather = sourceFingerprint(root);
  // The user keeps coding between discovery and approval.
  writeFileSync(join(root, 'src/a.js'), 'export const a = 99;');
  const r = baselineRefresh(root, atGather);
  assert.equal(r.current, false);
  assert.equal(r.baseline, 'source-changed-during-setup');
  assert.equal(refreshStatus(root).reason, 'no-baseline');
  // Unchanged source with the matching fingerprint records the baseline.
  const ok = baselineRefresh(root, sourceFingerprint(root));
  assert.equal(ok.current, true);
  assert.equal(refreshStatus(root).needsRefresh, false);
});

test('refresh-baseline with a real source gap renders the graph but records no baseline', t => {
  const root = fixture(t);
  makeTree(root, { 'src/huge.py': 'x'.repeat(256 * 1024 + 1) });
  const r = baselineRefresh(root);
  assert.equal(r.current, false);
  assert.equal(refreshStatus(root).reason, 'no-baseline');
});

test('bulk files and notebook outputs neither block the baseline nor make it stale', t => {
  const root = fixture(t);
  const nb = (/** @type {string} */ src, /** @type {string} */ img) => JSON.stringify({
    cells: [{ cell_type: 'code', source: [src], outputs: [{ data: { 'image/png': img.repeat(300 * 1024) } }] }],
  });
  makeTree(root, { 'integration.log': 'x'.repeat(300 * 1024), 'package-lock.json': '{}', 'analysis.ipynb': nb('import pandas\n', 'A') });
  // The log alone once flipped the inventory incomplete and this call threw KNOWLEDGE_LIMIT.
  planRefresh(root);
  completeRefresh(root);
  assert.equal(refreshStatus(root).needsRefresh, false);
  // Re-running the notebook (outputs change, source does not) and log growth stay current.
  writeFileSync(join(root, 'analysis.ipynb'), nb('import pandas\n', 'B'));
  writeFileSync(join(root, 'integration.log'), 'y'.repeat(400 * 1024));
  assert.equal(refreshStatus(root).needsRefresh, false);
  // An edited cell is a real change.
  writeFileSync(join(root, 'analysis.ipynb'), nb('import numpy\n', 'B'));
  const status = refreshStatus(root);
  assert.equal(status.needsRefresh, true);
  assert.ok(status.changed.some(f => f.path === 'analysis.ipynb' && f.kind === 'modified'));
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
