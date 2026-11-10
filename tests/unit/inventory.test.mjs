import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { makeTree } from '../helpers/tree.mjs';
import { inventoryKnowledge } from '../../plugin/scripts/lib/inventory.mjs';

function fixture(t, files) {
  const root = mkdtempSync(join(tmpdir(), 'devocd-inventory-'));
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
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
