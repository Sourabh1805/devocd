// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { editSettings } from '../../plugin/scripts/lib/settings.mjs';
import { toPosix } from '../../plugin/scripts/lib/fsutil.mjs';
import { git, makeRepo, tmp, tryLink } from '../helpers/git.mjs';
import { makeTree } from '../helpers/tree.mjs';

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

/** A project in a company, as add-project leaves it: company state above, project state recording the team's CLAUDE.md. */
function projectInCompany(/** @type {any[]} */ teamFiles = [{ path: 'CLAUDE.md', sha256: 'x', excluded: false }]) {
  const company = tmp('devocd-co-');
  makeTree(company, { '.devocd/state.json': JSON.stringify({ version: 1, kind: 'company', name: 'Acme', description: 'x', parentFile: 'CLAUDE.md', keyRules: [], projects: [], sources: [] }) });
  const api = join(company, 'api');
  makeTree(api, {
    'CLAUDE.md': '# team\n', 'AGENTS.md': '# agents\n',
    '.devocd/state.json': JSON.stringify({ version: 1, kind: 'project', id: 'api', companyRel: '..', teamFiles, approvedCommands: [], sources: [] }),
  });
  return { company, api, standards: toPosix(join(company, '.devocd', 'standards')), team: toPosix(join(api, 'CLAUDE.md')) };
}
const cliSettings = (/** @type {string[]} */ ...args) => spawnSync(process.execPath, [cli, 'settings', ...args], { encoding: 'utf8' });

test('CLI settings: the standards folder preflight gives and a recorded team file are added and removed; a bad op is a usage error', () => {
  const { api, standards, team } = projectInCompany();
  assert.equal(cliSettings(api, 'add-exclude', team).status, 0);
  assert.equal(cliSettings(api, 'add-dir', standards).status, 0);
  const s = JSON.parse(readFileSync(file(api), 'utf8'));
  assert.deepEqual(s.claudeMdExcludes, [team]);
  assert.deepEqual(s.permissions.additionalDirectories, [standards]);
  assert.equal(cliSettings(api, 'remove-exclude', team).status, 0);
  assert.equal(cliSettings(api, 'remove-dir', standards).status, 0);
  assert.ok(!existsSync(file(api)), 'the file the adds created is gone again');
  assert.equal(cliSettings(api, 'nope', 'x').status, 2);
});

test('CLI settings refuses any other folder, value or state with exit 1 and changes nothing', () => {
  const { company, api, standards, team } = projectInCompany();
  const elsewhere = tmp('devocd-elsewhere-');
  for (const [dir, op, value, why] of [
    [api, 'add-dir', toPosix(elsewhere), 'an arbitrary folder'],
    [api, 'add-dir', toPosix(company), 'the whole company folder'],
    [api, 'add-dir', `${standards}/../..`, 'a path that only starts like the standards folder'],
    [api, 'remove-dir', toPosix(elsewhere), 'removing an arbitrary folder'],
    [api, 'add-exclude', '**/CLAUDE.md', 'a pattern'],
    [api, 'add-exclude', toPosix(join(company, 'CLAUDE.md')), "the company parent, which holds the key rules"],
    [api, 'add-exclude', 'CLAUDE.md', 'a relative path'],
    [api, 'add-exclude', team.split('/').join(String.fromCharCode(92)), 'backslashes'],
    [api, 'add-exclude', toPosix(join(api, 'AGENTS.md')), 'a team file state does not record'],
    [api, 'remove-exclude', 'x', 'removing anything else'],
    [elsewhere, 'add-dir', standards, 'a folder with no project state'],
    [company, 'add-dir', standards, 'company state is not project state'],
  ]) {
    const r = cliSettings(dir, op, value);
    assert.equal(r.status, 1, `${why}: ${r.stderr}`);
    assert.match(r.stderr, /^error: settings /m, why);
    assert.ok(!r.stderr.includes('    at '), why);
  }
  for (const d of [api, company, elsewhere]) assert.ok(!existsSync(file(d)), `nothing written in ${d}`);
  const crafted = projectInCompany([{ path: '../CLAUDE.md', sha256: 'x', excluded: false }]);
  assert.equal(cliSettings(crafted.api, 'add-exclude', toPosix(join(crafted.company, 'CLAUDE.md'))).status, 1, 'state naming a file outside the team files');
  assert.ok(!existsSync(file(crafted.api)));
});
