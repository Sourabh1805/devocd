// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { backupDir, restoreDir } from '../../plugin/scripts/lib/backup.mjs';
import { makeTree } from '../helpers/tree.mjs';
import { tmp } from '../helpers/git.mjs';

const cli = fileURLToPath(new URL('../../plugin/scripts/devocd.mjs', import.meta.url));
const state = (/** @type {string} */ kind) => JSON.stringify({ version: 1, kind });

test('restore brings back an edited file byte for byte', () => {
  const dir = makeTree(tmp(), {
    '.devocd/state.json': state('company'),
    '.devocd/PROJECT.md': 'one\r\né\n',
    'CLAUDE.local.md': 'mine',
    'CLAUDE.md': 'company parent',
  });
  const bin = Buffer.from([0, 255, 1, 2]);
  writeFileSync(join(dir, '.devocd', 'bin.dat'), bin);
  const stamp = backupDir(dir);
  writeFileSync(join(dir, '.devocd', 'PROJECT.md'), 'changed');
  writeFileSync(join(dir, 'CLAUDE.local.md'), 'changed');
  writeFileSync(join(dir, 'CLAUDE.md'), 'changed');
  rmSync(join(dir, '.devocd', 'bin.dat'));
  assert.equal(restoreDir(dir), stamp);
  assert.equal(readFileSync(join(dir, '.devocd', 'PROJECT.md'), 'utf8'), 'one\r\né\n');
  assert.equal(readFileSync(join(dir, 'CLAUDE.local.md'), 'utf8'), 'mine');
  assert.equal(readFileSync(join(dir, 'CLAUDE.md'), 'utf8'), 'company parent');
  assert.deepEqual(readFileSync(join(dir, '.devocd', 'bin.dat')), bin);
});

test('a project folder never has its team CLAUDE.md backed up; .backups is not nested', () => {
  const dir = makeTree(tmp(), { '.devocd/state.json': state('project'), 'CLAUDE.md': 'team', 'CLAUDE.local.md': 'ptr' });
  const s1 = backupDir(dir);
  const s2 = backupDir(dir);
  assert.ok(!existsSync(join(dir, '.devocd', '.backups', s1, 'CLAUDE.md')));
  assert.ok(existsSync(join(dir, '.devocd', '.backups', s1, 'CLAUDE.local.md')));
  assert.ok(!existsSync(join(dir, '.devocd', '.backups', s2, '.devocd', '.backups')));
});

test('only the newest 5 backups are kept; stamps are unique and sorted', () => {
  const dir = makeTree(tmp(), { '.devocd/state.json': state('company') });
  const stamps = [];
  for (let i = 0; i < 8; i++) stamps.push(backupDir(dir));
  assert.equal(new Set(stamps).size, 8);
  assert.deepEqual([...stamps].sort(), stamps);
  const left = readdirSync(join(dir, '.devocd', '.backups')).sort();
  assert.deepEqual(left, stamps.slice(3));
});

test('restore of a named stamp works; no backup or unknown stamp throws', () => {
  const dir = makeTree(tmp(), { '.devocd/state.json': state('company'), '.devocd/a.md': 'v1' });
  assert.throws(() => restoreDir(dir), { code: 'NO_BACKUP' });
  const s1 = backupDir(dir);
  writeFileSync(join(dir, '.devocd', 'a.md'), 'v2');
  backupDir(dir);
  assert.equal(restoreDir(dir, s1), s1);
  assert.equal(readFileSync(join(dir, '.devocd', 'a.md'), 'utf8'), 'v1');
  assert.throws(() => restoreDir(dir, '../x'), { code: 'NO_BACKUP' });
  assert.throws(() => restoreDir(dir, '20000101-000000-000'), { code: 'NO_BACKUP' });
});

test('CLI backup and restore', () => {
  const dir = makeTree(tmp(), { '.devocd/state.json': state('company'), '.devocd/a.md': 'v1' });
  const b = spawnSync(process.execPath, [cli, 'backup', dir], { encoding: 'utf8' });
  assert.equal(b.status, 0);
  assert.ok(!b.stdout.includes('\\'));
  writeFileSync(join(dir, '.devocd', 'a.md'), 'v2');
  assert.equal(spawnSync(process.execPath, [cli, 'restore', dir], { encoding: 'utf8' }).status, 0);
  assert.equal(readFileSync(join(dir, '.devocd', 'a.md'), 'utf8'), 'v1');
});
