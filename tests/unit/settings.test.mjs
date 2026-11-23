import { workspace, companyState as defaultCompanyState, projectState as defaultProjectState } from '../helpers/workspace.mjs';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { editSettings } from '../../scripts/lib/settings.mjs';
import { main } from '../../scripts/devocd.mjs';
import { toPosix } from '../../scripts/lib/fsutil.mjs';
import { git, makeRepo as createRepo, tryLink } from '../helpers/git.mjs';
const makeRepo = (sub = '') => createRepo(sub, workspace({ after }).root);
const tmp = (_prefix = 'devocd-') => workspace({ after }).root;
import { makeTree } from '../helpers/tree.mjs';

const cli = fileURLToPath(new URL('../../scripts/devocd.mjs', import.meta.url));
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
  makeTree(company, { '.devocd/state.json': JSON.stringify(defaultCompanyState({ name: 'Acme', description: 'x' })) });
  const api = join(company, 'api');
  makeTree(api, {
    'CLAUDE.md': '# team\n', 'AGENTS.md': '# agents\n',
    '.devocd/state.json': JSON.stringify(defaultProjectState({ teamFiles })),
  });
  return { company, api, standards: toPosix(join(company, '.devocd', 'standards')), team: toPosix(join(api, 'CLAUDE.md')) };
}
const cliSettings = (/** @type {string[]} */ ...args) => spawnSync(process.execPath, [cli, 'settings', ...args], { encoding: 'utf8' });
/**
 * The same command in-process: `main` is what the child process calls, so the refusals and the
 * exit-code mapping are covered without a new process per case. The refusal rules live in the
 * CLI, not in an exported library function, so this is the closest path that is not a spawn.
 * @param {string[]} args
 */
function settingsCode(...args) {
  const log = console.log, error = console.error;
  let stderr = '';
  console.log = () => {};
  console.error = (/** @type {unknown} */ line) => { stderr += `${String(line)}\n`; };
  try { return { code: main(['settings', ...args]), stderr }; } finally { console.log = log; console.error = error; }
}

test('CLI settings: the standards folder preflight gives and a recorded team file are added and removed; a bad op is a usage error', () => {
  const { api, standards, team } = projectInCompany();
  assert.equal(settingsCode(api, 'add-exclude', team).code, 0);
  assert.equal(settingsCode(api, 'add-dir', standards).code, 0);
  const s = JSON.parse(readFileSync(file(api), 'utf8'));
  assert.deepEqual(s.claudeMdExcludes, [team]);
  assert.deepEqual(s.permissions.additionalDirectories, [standards]);
  assert.equal(settingsCode(api, 'remove-exclude', team).code, 0);
  assert.equal(settingsCode(api, 'remove-dir', standards).code, 0);
  assert.ok(!existsSync(file(api)), 'the file the adds created is gone again');
  assert.equal(settingsCode(api, 'nope', 'x').code, 2);
});

test('the command runs as a child process: an allowed setting exits 0 and a bad op is a usage error', () => {
  const { api, standards } = projectInCompany();
  assert.equal(cliSettings(api, 'add-dir', standards).status, 0);
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
    const r = settingsCode(dir, op, value);
    assert.equal(r.code, 1, `${why}: ${r.stderr}`);
    assert.match(r.stderr, /^error: settings /m, why);
    assert.ok(!r.stderr.includes('    at '), why);
  }
  for (const d of [api, company, elsewhere]) assert.ok(!existsSync(file(d)), `nothing written in ${d}`);
  const crafted = projectInCompany([{ path: '../CLAUDE.md', sha256: 'x', excluded: false }]);
  assert.equal(settingsCode(crafted.api, 'add-exclude', toPosix(join(crafted.company, 'CLAUDE.md'))).code, 1, 'state naming a file outside the team files');
  assert.ok(!existsSync(file(crafted.api)));
});
