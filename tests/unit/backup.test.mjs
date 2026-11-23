import { workspace } from '../helpers/workspace.mjs';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { backupDir, restoreDir } from '../../scripts/lib/backup.mjs';
import { makeTree } from '../helpers/tree.mjs';
import { tryLink } from '../helpers/git.mjs';

const tmp = (_prefix = 'devocd-') => workspace({ after }).root;

const cli = fileURLToPath(new URL('../../scripts/devocd.mjs', import.meta.url));
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
  assert.equal(restoreDir(dir).stamp, stamp);
  assert.equal(readFileSync(join(dir, '.devocd', 'PROJECT.md'), 'utf8'), 'one\r\né\n');
  assert.equal(readFileSync(join(dir, 'CLAUDE.local.md'), 'utf8'), 'mine');
  assert.equal(readFileSync(join(dir, 'CLAUDE.md'), 'utf8'), 'company parent');
  assert.deepEqual(readFileSync(join(dir, '.devocd', 'bin.dat')), bin);
});

test('restore preserves newer decisions and history while recovering missing durable files', () => {
  const dir = makeTree(tmp(), {
    '.devocd/state.json': state('project'),
    '.devocd/PROJECT.md': 'original project',
    '.devocd/decisions.md': '# D1\nOriginal decision',
    '.devocd/decision-history/d1.md': 'original history',
    '.devocd/decision-history/recover.md': 'recover missing history',
  });
  const stamp = backupDir(dir);
  const decisions = '# D1\nOriginal decision\n# D2\nSupersedes D1';
  writeFileSync(join(dir, '.devocd/decisions.md'), decisions);
  writeFileSync(join(dir, '.devocd/decision-history/d1.md'), 'current immutable history');
  writeFileSync(join(dir, '.devocd/decision-history/d2.md'), 'new capture');
  rmSync(join(dir, '.devocd/decision-history/recover.md'));
  writeFileSync(join(dir, '.devocd/PROJECT.md'), 'changed project');
  restoreDir(dir, stamp);
  assert.equal(readFileSync(join(dir, '.devocd/decisions.md'), 'utf8'), decisions);
  assert.equal(readFileSync(join(dir, '.devocd/decision-history/d1.md'), 'utf8'), 'current immutable history');
  assert.equal(readFileSync(join(dir, '.devocd/decision-history/d2.md'), 'utf8'), 'new capture');
  assert.equal(readFileSync(join(dir, '.devocd/decision-history/recover.md'), 'utf8'), 'recover missing history');
  assert.equal(readFileSync(join(dir, '.devocd/PROJECT.md'), 'utf8'), 'original project');
  rmSync(join(dir, '.devocd/decisions.md'));
  restoreDir(dir, stamp);
  assert.equal(readFileSync(join(dir, '.devocd/decisions.md'), 'utf8'), '# D1\nOriginal decision');
});

test('restore refuses linked durable targets before restoring other files', (t) => {
  const dir = makeTree(tmp(), {
    '.devocd/state.json': state('project'), '.devocd/PROJECT.md': 'original',
    '.devocd/decisions.md': 'approved decision',
  });
  backupDir(dir);
  writeFileSync(join(dir, '.devocd/PROJECT.md'), 'current');
  rmSync(join(dir, '.devocd/decisions.md'));
  if (!tryLink(tmp(), join(dir, '.devocd/decisions.md'))) return t.skip('cannot create links here');
  assert.throws(() => restoreDir(dir), (e) => ['NOT_REGULAR', 'NO_DIR'].includes(e.code));
  assert.equal(readFileSync(join(dir, '.devocd/PROJECT.md'), 'utf8'), 'current');
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
  assert.equal(restoreDir(dir, s1).stamp, s1);
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

test('a linked .backups refuses both backup and restore', (t) => {
  const dir = makeTree(tmp(), { '.devocd/state.json': state('company'), '.devocd/a.md': 'v1' });
  const elsewhere = tmp();
  if (!tryLink(elsewhere, join(dir, '.devocd', '.backups'))) return t.skip('cannot create links here');
  makeTree(join(elsewhere, '20000101-000000-000'), { '.devocd/a.md': 'evil' });
  assert.throws(() => backupDir(dir), { code: 'NO_DIR' });
  assert.throws(() => restoreDir(dir), { code: 'NO_DIR' });
  assert.equal(readFileSync(join(dir, '.devocd', 'a.md'), 'utf8'), 'v1');
});

test('a linked root file refuses restore without a partial restore', (t) => {
  const dir = makeTree(tmp(), { '.devocd/state.json': state('company'), '.devocd/a.md': 'v1', 'CLAUDE.md': 'parent' });
  backupDir(dir);
  writeFileSync(join(dir, '.devocd', 'a.md'), 'edited');
  rmSync(join(dir, 'CLAUDE.md'));
  if (!tryLink(tmp(), join(dir, 'CLAUDE.md'))) return t.skip('cannot create links here');
  assert.throws(() => restoreDir(dir), (e) => ['NOT_REGULAR', 'NO_DIR'].includes(/** @type {any} */ (e).code));
  assert.equal(readFileSync(join(dir, '.devocd', 'a.md'), 'utf8'), 'edited');
});

// --- T76: a restore makes .devocd/ match the backup exactly --------------------

/** A project with a backup taken at `v1`, then edited and given extra files. */
function drifted() {
  const dir = makeTree(tmp(), {
    '.devocd/state.json': state('project'),
    '.devocd/PROJECT.md': 'v1',
    'CLAUDE.local.md': 'pointer v1',
  });
  const stamp = backupDir(dir);
  writeFileSync(join(dir, '.devocd', 'PROJECT.md'), 'v2');
  writeFileSync(join(dir, '.devocd', 'new-page.md'), '# made after the backup');
  makeTree(dir, {
    '.devocd/draft/PROJECT.md': 'unapproved draft',
    '.devocd/journal/edits.jsonl': '{"t":"x"}',
    '.devocd/runs/run-1.json': '{"unit":"a"}',
    '.devocd/stale.d/1-2-3.json': '{"pages":[]}',
  });
  return { dir, stamp };
}

test('restore removes what the backup did not have, and keeps draft, journal, runs, stale.d and .backups', () => {
  const { dir, stamp } = drifted();
  const r = restoreDir(dir, stamp);
  assert.equal(r.stamp, stamp);
  assert.ok(!existsSync(join(dir, '.devocd', 'new-page.md')), 'a page created after the backup is gone');
  assert.equal(readFileSync(join(dir, '.devocd', 'PROJECT.md'), 'utf8'), 'v1');
  for (const keep of ['.devocd/draft/PROJECT.md', '.devocd/journal/edits.jsonl', '.devocd/runs/run-1.json', '.devocd/stale.d/1-2-3.json']) {
    assert.ok(existsSync(join(dir, keep)), `${keep} survives`);
  }
  assert.ok(existsSync(join(dir, '.devocd', '.backups', stamp)), 'the backup being restored survives');
  assert.ok(r.remove.includes('.devocd/new-page.md'));
});

test('the backup being restored is never pruned by the pre-restore backup', () => {
  const dir = makeTree(tmp(), { '.devocd/state.json': state('project'), '.devocd/a.md': 'v1' });
  const stamps = [];
  for (let i = 0; i < 5; i++) { writeFileSync(join(dir, '.devocd', 'a.md'), `v${i + 1}`); stamps.push(backupDir(dir)); }
  assert.equal(readdirSync(join(dir, '.devocd', '.backups')).length, 5);
  const oldest = stamps[0];
  writeFileSync(join(dir, '.devocd', 'a.md'), 'drifted');
  restoreDir(dir, oldest);
  assert.ok(existsSync(join(dir, '.devocd', '.backups', oldest)), 'the restored backup still exists');
  assert.equal(readFileSync(join(dir, '.devocd', 'a.md'), 'utf8'), 'v1');
});

test('a newer decisions.md and new history entries are kept, and a missing durable file is recovered', () => {
  const dir = makeTree(tmp(), {
    '.devocd/state.json': state('project'),
    '.devocd/decisions.md': 'original',
    '.devocd/decision-history/recover.md': 'recover me',
  });
  const stamp = backupDir(dir);
  writeFileSync(join(dir, '.devocd', 'decisions.md'), 'newer decision');
  makeTree(dir, { '.devocd/decision-history/d2.md': 'captured after the backup' });
  rmSync(join(dir, '.devocd', 'decision-history', 'recover.md'));
  const r = restoreDir(dir, stamp);
  assert.equal(readFileSync(join(dir, '.devocd/decisions.md'), 'utf8'), 'newer decision');
  assert.equal(readFileSync(join(dir, '.devocd/decision-history/d2.md'), 'utf8'), 'captured after the backup');
  assert.equal(readFileSync(join(dir, '.devocd/decision-history/recover.md'), 'utf8'), 'recover me');
  assert.ok(r.keep.includes('.devocd/decision-history/d2.md'), 'the newer history entry is reported as kept');
});

test('a link anywhere under .devocd refuses the whole restore and changes nothing', (t) => {
  const dir = makeTree(tmp(), { '.devocd/state.json': state('project'), '.devocd/a.md': 'v1', '.devocd/sub/b.md': 'b1' });
  const stamp = backupDir(dir);
  writeFileSync(join(dir, '.devocd', 'a.md'), 'edited');
  writeFileSync(join(dir, '.devocd', 'leftover.md'), 'newer');
  const elsewhere = tmp();
  if (!tryLink(elsewhere, join(dir, '.devocd', 'sub', 'link.md'))) return t.skip('cannot create links here');
  assert.throws(() => restoreDir(dir, stamp), (e) => ['NOT_REGULAR', 'NO_DIR'].includes(/** @type {any} */ (e).code));
  assert.equal(readFileSync(join(dir, '.devocd', 'a.md'), 'utf8'), 'edited', 'nothing was restored');
  assert.ok(existsSync(join(dir, '.devocd', 'leftover.md')), 'nothing was removed');
});

test('dry run reports the plan and changes nothing, not even a backup', () => {
  const { dir, stamp } = drifted();
  const before = readdirSync(join(dir, '.devocd', '.backups')).sort();
  const r = restoreDir(dir, stamp, { dryRun: true });
  assert.equal(r.stamp, stamp);
  assert.deepEqual(r.copy.sort(), ['.devocd/PROJECT.md', '.devocd/state.json', 'CLAUDE.local.md']);
  assert.deepEqual(r.remove, ['.devocd/new-page.md']);
  assert.deepEqual(r.keep.sort(), ['.devocd/draft/PROJECT.md', '.devocd/journal/edits.jsonl', '.devocd/runs/run-1.json', '.devocd/stale.d/1-2-3.json'].sort());
  assert.equal(readFileSync(join(dir, '.devocd', 'PROJECT.md'), 'utf8'), 'v2', 'no file was written');
  assert.ok(existsSync(join(dir, '.devocd', 'new-page.md')), 'no file was removed');
  assert.deepEqual(readdirSync(join(dir, '.devocd', '.backups')).sort(), before, 'no backup was taken');
});

test('restoring the pre-restore backup returns the exact earlier state', () => {
  const { dir, stamp } = drifted();
  const r = restoreDir(dir, stamp);
  assert.ok(r.backup, 'the restore reports the stamp it took first');
  assert.ok(!existsSync(join(dir, '.devocd', 'new-page.md')));
  restoreDir(dir, r.backup);
  assert.equal(readFileSync(join(dir, '.devocd', 'PROJECT.md'), 'utf8'), 'v2', 'back to the edited state');
  assert.ok(existsSync(join(dir, '.devocd', 'new-page.md')), 'the newer page is back');
});

test('CLI restore --dry-run prints the plan and writes nothing; a bad argument is a usage error', () => {
  const { dir, stamp } = drifted();
  const dry = spawnSync(process.execPath, [cli, 'restore', dir, stamp, '--dry-run'], { encoding: 'utf8' });
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /would copy 3 files, remove 1 file, keep 4 files/);
  assert.match(dry.stdout, /new-page\.md/);
  assert.equal(readFileSync(join(dir, '.devocd', 'PROJECT.md'), 'utf8'), 'v2');
  const bad = spawnSync(process.execPath, [cli, 'restore', dir, stamp, '--dry-run', 'extra'], { encoding: 'utf8' });
  assert.equal(bad.status, 2, 'a usage error, not a partial restore');
});
