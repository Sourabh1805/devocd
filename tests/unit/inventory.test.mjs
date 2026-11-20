import { workspace } from '../helpers/workspace.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { makeTree } from '../helpers/tree.mjs';
import { inventoryKnowledge } from '../../scripts/lib/inventory.mjs';

function fixture(t, files) {
  const root = workspace(t).root;
  return makeTree(root, files);
}

test('covers arbitrary nested source folders and hashes evidence without returning code', t => {
  const deep = 'apps/api/src/billing/payments/providers/example/client.js';
  const root = fixture(t, { [deep]: 'export const value = 1;', '.github/workflows/test.yml': 'name: tests', 'tests/unit/a.js': '// test' });
  const first = inventoryKnowledge(root);
  assert.equal(first.complete, true);
  assert.ok(first.directories.includes('apps/api/src/billing/payments/providers/example'));
  assert.equal(first.files.length, 3);
  assert.match(first.files.find(f => f.path === deep).sha256, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(first), /export const/);
  writeFileSync(join(root, deep), 'export const value = 2;');
  assert.notEqual(inventoryKnowledge(root).files.find(f => f.path === deep).sha256, first.files.find(f => f.path === deep).sha256);
});

test('reports exclusions, secrets and incomplete reading without exposing values', t => {
  const secret = 'AKIA' + 'A'.repeat(16);
  const root = fixture(t, { '.env': 'PRIVATE', 'node_modules/a/index.js': 'vendored', 'src/key.js': secret, 'src/big.js': 'a'.repeat(256 * 1024 + 1), 'src/a.js': 'ok', '.devocd/PROJECT.md': 'old' });
  const inventory = inventoryKnowledge(root);
  assert.equal(inventory.complete, false);
  assert.equal(inventory.files.find(f => f.path === 'src/big.js').status, 'not-read');
  assert.ok(inventory.skipped.some(f => f.path === 'src/key.js' && f.reason === 'secret-content'));
  assert.ok(inventory.skipped.some(f => f.path === '.env'));
  assert.doesNotMatch(JSON.stringify(inventory), new RegExp(secret));
});

test('irrelevant bulk never poisons completeness: logs, lockfiles, assets and binaries are classified', t => {
  const root = fixture(t, {
    'integration.log': 'line\n'.repeat(80 * 1024),
    'logs/app.log.1': 'rotated',
    'package-lock.json': JSON.stringify({ name: 'x' }).padEnd(300 * 1024, ' '),
    'assets/logo.png': 'not really a png but the name decides',
    'fonts/a.woff2': 'xx',
    'app.min.js': 'var a=1;',
    'docs/report.pdf': 'xx',
    'src/a.js': 'ok',
  });
  const inv = inventoryKnowledge(root);
  assert.equal(inv.complete, true, JSON.stringify(inv.files.filter(f => f.status !== 'available')));
  for (const p of ['integration.log', 'logs/app.log.1', 'package-lock.json', 'assets/logo.png', 'fonts/a.woff2', 'app.min.js', 'docs/report.pdf']) {
    assert.ok(inv.skipped.some(f => f.path === p && f.reason === 'irrelevant-bulk'), p);
    assert.ok(!inv.files.some(f => f.path === p), p);
  }
  assert.ok(inv.files.some(f => f.path === 'src/a.js' && f.status === 'available'));
});

test('an unreadable source file is still a real gap', t => {
  const root = fixture(t, { 'src/big.py': 'x'.repeat(256 * 1024 + 1), 'src/a.py': 'ok' });
  const inv = inventoryKnowledge(root);
  assert.equal(inv.complete, false);
  assert.equal(inv.files.find(f => f.path === 'src/big.py').status, 'not-read');
});

test('notebooks are inventoried by their cell source, ignoring outputs, past the generic size limit', t => {
  const nb = (/** @type {string} */ src, /** @type {any[]} */ outputs) => JSON.stringify({
    cells: [{ cell_type: 'markdown', source: ['# Title\n'] }, { cell_type: 'code', source: [src], outputs }],
  });
  const bigOutput = [{ data: { 'image/png': 'A'.repeat(400 * 1024) } }];
  const root = fixture(t, { 'analysis.ipynb': nb('import pandas as pd\n', bigOutput), 'src/a.py': 'ok' });
  const first = inventoryKnowledge(root);
  assert.equal(first.complete, true, JSON.stringify(first.files.filter(f => f.status !== 'available')));
  const entry = first.files.find(f => f.path === 'analysis.ipynb');
  assert.equal(entry?.status, 'available');
  assert.match(entry.sha256, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(first), /pandas/);
  // Changed outputs leave the hash alone; changed cell source does not.
  writeFileSync(join(root, 'analysis.ipynb'), nb('import pandas as pd\n', [{ data: { 'image/png': 'B'.repeat(500 * 1024) } }]));
  assert.equal(inventoryKnowledge(root).files.find(f => f.path === 'analysis.ipynb').sha256, entry.sha256);
  writeFileSync(join(root, 'analysis.ipynb'), nb('import numpy\n', bigOutput));
  assert.notEqual(inventoryKnowledge(root).files.find(f => f.path === 'analysis.ipynb').sha256, entry.sha256);
});

test('a malformed notebook is a real gap, and notebook secrets are withheld', t => {
  const secret = 'AKIA' + 'B'.repeat(16);
  const withSecret = JSON.stringify({ cells: [{ cell_type: 'code', source: [`key = "${secret}"\n`], outputs: [] }] });
  const root = fixture(t, { 'broken.ipynb': 'not json at all', 'leaky.ipynb': withSecret, 'src/a.js': 'ok' });
  const inv = inventoryKnowledge(root);
  assert.equal(inv.complete, false);
  assert.equal(inv.files.find(f => f.path === 'broken.ipynb').status, 'not-read');
  assert.ok(inv.skipped.some(f => f.path === 'leaky.ipynb' && f.reason === 'secret-content'));
  assert.doesNotMatch(JSON.stringify(inv), new RegExp(secret));
});

test('a secret stored only in a notebook OUTPUT cell still withholds the notebook', t => {
  const secret = 'AKIA' + 'C'.repeat(16);
  const nb = JSON.stringify({ cells: [{ cell_type: 'code', source: ['print(token)\n'], outputs: [{ text: [`token is ${secret}\n`] }] }] });
  const root = fixture(t, { 'leaky-output.ipynb': nb, 'src/a.js': 'ok' });
  const inv = inventoryKnowledge(root);
  assert.ok(inv.skipped.some(f => f.path === 'leaky-output.ipynb' && f.reason === 'secret-content'), JSON.stringify(inv.files));
  assert.doesNotMatch(JSON.stringify(inv), new RegExp(secret));
});

test('honors git ignores, includes untracked source, and does not enter nested repositories or junctions', t => {
  const root = fixture(t, { '.gitignore': 'ignored/\n', 'ignored/a.js': 'no', 'src/a.js': 'yes', 'nested/.git/HEAD': 'ref: refs/heads/main', 'nested/private.js': 'no' });
  const init = spawnSync('git', ['-c', 'gc.auto=0', '-C', root, 'init', '-q'], { encoding: 'utf8' });
  assert.equal(init.status, 0, init.stderr);
  const external = fixture(t, { 'external.js': 'no' });
  symlinkSync(external, join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  const inventory = inventoryKnowledge(root);
  assert.equal(inventory.git, true);
  assert.ok(inventory.files.some(f => f.path === 'src/a.js'));
  assert.ok(inventory.skipped.some(f => f.path === 'ignored'));
  assert.ok(inventory.skipped.some(f => f.path === 'nested' && f.reason === 'nested-repository'));
  assert.ok(inventory.skipped.some(f => f.path === 'linked' && f.reason === 'link'));
  assert.ok(!inventory.files.some(f => /^(ignored|nested|linked)\//.test(f.path)));
});
