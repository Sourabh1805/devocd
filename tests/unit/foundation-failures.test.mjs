import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { insideWorkTree, assertNotTracked } from '../../plugin/scripts/lib/protect.mjs';
import { walkFiles } from '../../plugin/scripts/lib/fsutil.mjs';

test('broken Git metadata cannot become an untracked or non-Git permission decision', t => {
  const root = mkdtempSync(join(tmpdir(), 'devocd-git-errors-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.equal(spawnSync('git', ['init', '-q', root]).status, 0);
  writeFileSync(join(root, '.git/index'), 'corrupt index');
  assert.throws(() => assertNotTracked(root, ['.devocd']), { code: 'GIT_FAILED' });
  writeFileSync(join(root, '.git/config'), '[invalid');
  assert.throws(() => insideWorkTree(root), { code: 'GIT_FAILED' });
});

test('failed traversal cannot be reported as an empty successful inventory', t => {
  const root = mkdtempSync(join(tmpdir(), 'devocd-walk-errors-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'file'), 'not a directory');
  assert.throws(() => walkFiles(join(root, 'file')));
  assert.deepEqual(walkFiles(join(root, 'missing')), []);
});
