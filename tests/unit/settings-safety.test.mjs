import { workspace } from '../helpers/workspace.mjs';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { editSettings } from '../../scripts/lib/settings.mjs';
import { git, makeRepo as createRepo } from '../helpers/git.mjs';
const makeRepo = (sub = '') => createRepo(sub, workspace({ after }).root);
const tmp = (_prefix = 'devocd-') => workspace({ after }).root;

const file = (/** @type {string} */ d) => join(d, '.claude', 'settings.local.json');

test('a tracked settings.local.json refuses add and remove, bytes unchanged', () => {
  const repo = makeRepo();
  mkdirSync(join(repo, '.claude'));
  const text = '{"claudeMdExcludes":["x"]}\n';
  writeFileSync(file(repo), text);
  git(repo, 'add', '-f', '.claude/settings.local.json');
  git(repo, 'commit', '-q', '-m', 'tracked');
  for (const op of ['add-exclude', 'remove-exclude', 'add-dir', 'remove-dir']) {
    assert.throws(() => editSettings(repo, op, 'x'),
      (e) => /** @type {any} */ (e).code === 'ALREADY_TRACKED' && /settings\.local\.json/.test(/** @type {any} */ (e).message), op);
  }
  assert.equal(readFileSync(file(repo), 'utf8'), text);
  assert.equal(git(repo, 'status', '--porcelain'), '');
});

test('a value already present is not rewritten, so unusual formatting survives', () => {
  const dir = tmp();
  mkdirSync(join(dir, '.claude'));
  const text = '{\n    "claudeMdExcludes": ["a"],\n\t"permissions": {"additionalDirectories": ["b"]}\n}';
  writeFileSync(file(dir), text);
  editSettings(dir, 'add-exclude', 'a');
  editSettings(dir, 'add-dir', 'b');
  editSettings(dir, 'remove-exclude', 'nope');
  assert.equal(readFileSync(file(dir), 'utf8'), text);
});
