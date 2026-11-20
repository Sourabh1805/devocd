import { workspace } from '../helpers/workspace.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { insideWorkTree, assertNotTracked } from '../../scripts/lib/protect.mjs';
import { walkFiles } from '../../scripts/lib/fsutil.mjs';

test('broken Git metadata cannot become an untracked or non-Git permission decision', t => {
  const root = workspace(t).root;
  assert.equal(spawnSync('git', ['init', '-q', root]).status, 0);
  writeFileSync(join(root, '.git/index'), 'corrupt index');
  assert.throws(() => assertNotTracked(root, ['.devocd']), { code: 'GIT_FAILED' });
  writeFileSync(join(root, '.git/config'), '[invalid');
  assert.throws(() => insideWorkTree(root), { code: 'GIT_FAILED' });
});

test('failed traversal cannot be reported as an empty successful inventory', t => {
  const root = workspace(t).root;
  writeFileSync(join(root, 'file'), 'not a directory');
  assert.throws(() => walkFiles(join(root, 'file')));
  assert.deepEqual(walkFiles(join(root, 'missing')), []);
});
