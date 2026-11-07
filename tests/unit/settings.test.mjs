// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { editSettings } from '../../plugin/scripts/lib/settings.mjs';
import { git, makeRepo, tmp, tryLink } from '../helpers/git.mjs';

const cli = fileURLToPath(new URL('../../plugin/scripts/devocd.mjs', import.meta.url));
const file = (/** @type {string} */ d) => join(d, '.claude', 'settings.local.json');

test('settings keeps unrelated keys and is idempotent', () => {
  const dir = tmp();
  mkdirSync(join(dir, '.claude'));
  writeFileSync(file(dir), JSON.stringify({ model: 'x', permissions: { allow: ['Read'] } }, null, 2) + '\n');
  editSettings(dir, 'add-exclude', '**/CLAUDE.md');
  editSettings(dir, 'add-dir', '/work/company');
  const once = readFileSync(file(dir), 'utf8');
  editSettings(dir, 'add-exclude', '**/CLAUDE.md');
  editSettings(dir, 'add-dir', '/work/company');
  assert.equal(readFileSync(file(dir), 'utf8'), once);
  const o = JSON.parse(once);
  assert.equal(o.model, 'x');
  assert.deepEqual(o.permissions.allow, ['Read']);
  assert.deepEqual(o.claudeMdExcludes, ['**/CLAUDE.md']);
  assert.deepEqual(o.permissions.additionalDirectories, ['/work/company']);
  assert.ok(once.includes('\n  "model"'));
});

test('malformed settings.local.json refuses and changes nothing', () => {
  const dir = tmp();
  mkdirSync(join(dir, '.claude'));
  writeFileSync(file(dir), '{ "a": ');
  for (const op of ['add-exclude', 'remove-exclude', 'add-dir', 'remove-dir']) {
    assert.throws(() => editSettings(dir, op, 'x'), { code: 'SETTINGS_MALFORMED' });
  }
  assert.equal(readFileSync(file(dir), 'utf8'), '{ "a": ');
  writeFileSync(file(dir), '[1]');
  assert.throws(() => editSettings(dir, 'add-dir', 'x'), { code: 'SETTINGS_MALFORMED' });
});

test('add then remove returns the file to its earlier content', () => {
  const dir = tmp();
  mkdirSync(join(dir, '.claude'));
  const before = JSON.stringify({ model: 'x' }, null, 2) + '\n';
  writeFileSync(file(dir), before);
  editSettings(dir, 'add-exclude', 'a');
  editSettings(dir, 'add-dir', 'b');
  editSettings(dir, 'remove-dir', 'b');
  editSettings(dir, 'remove-exclude', 'a');
  assert.equal(readFileSync(file(dir), 'utf8'), before);
});

test('when the add created the file, the remove deletes it', () => {
  const dir = tmp();
  editSettings(dir, 'add-dir', 'b');
  assert.ok(existsSync(file(dir)));
  editSettings(dir, 'remove-dir', 'b');
  assert.ok(!existsSync(file(dir)));
  editSettings(dir, 'remove-dir', 'b');
  assert.throws(() => editSettings(dir, 'bogus', 'b'), { code: 'USAGE' });
});

test('refuses to write through a symlink or junction', (t) => {
  const dir = tmp();
  const elsewhere = tmp();
  if (!tryLink(elsewhere, join(dir, '.claude'))) return t.skip('cannot create links here');
  assert.throws(() => editSettings(dir, 'add-dir', 'b'), { code: 'NO_DIR' });
  assert.ok(!existsSync(join(elsewhere, 'settings.local.json')));
});

test('CLI settings', () => {
  const dir = tmp();
  assert.equal(spawnSync(process.execPath, [cli, 'settings', dir, 'add-exclude', 'x'], { encoding: 'utf8' }).status, 0);
  assert.deepEqual(JSON.parse(readFileSync(file(dir), 'utf8')).claudeMdExcludes, ['x']);
  const bad = spawnSync(process.execPath, [cli, 'settings', dir, 'nope', 'x'], { encoding: 'utf8' });
  assert.equal(bad.status, 2);
});
