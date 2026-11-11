// @ts-check
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, realpathSync, rmSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { walkFiles } from '../../plugin/scripts/lib/fsutil.mjs';
import { makeTree } from '../helpers/tree.mjs';
import { makeRepo as newRepo, tmp as newTmp, tryLink } from '../helpers/git.mjs';

const cli = fileURLToPath(new URL('../../plugin/scripts/devocd.mjs', import.meta.url));

/** Every temp folder made here, removed when this file's tests end. */
const made = /** @type {string[]} */ ([]);
const tmp = (/** @type {string | undefined} */ prefix = undefined) => { const d = newTmp(prefix); made.push(d); return d; };
const makeRepo = () => { const d = newRepo(); made.push(d); return d; };
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });

/** Run preflight with HOME and USERPROFILE set on the child, so the real home folder is never involved. */
function preflight(/** @type {string} */ dir, /** @type {string} */ home = tmp('devocd-home-')) {
  return spawnSync(process.execPath, [cli, 'preflight', dir, '--json'], { encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home } });
}
const parsed = (/** @type {ReturnType<typeof preflight>} */ r) => {
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
};

test('preflight says isHome when the folder is the home directory, and does not walk it', () => {
  const home = tmp('devocd-home-');
  makeTree(home, { 'repo/AGENTS.md': 'x\n' });
  assert.deepEqual(parsed(preflight(home, home)), { isHome: true, parentFile: 'CLAUDE.md', agentsMd: [], company: null, teamFiles: [], state: null });
});

test('state names the kind of DevOCD state in this folder itself: null, company or project', () => {
  const company = tmp();
  assert.equal(parsed(preflight(company)).state, null, 'a fresh folder');
  makeTree(company, { '.devocd/state.json': JSON.stringify({ version: 1, kind: 'company', name: 'Acme', projects: [] }) });
  assert.equal(parsed(preflight(company)).state, 'company', 'an installed company folder, so install is a rerun');
  makeTree(company, { 'api/.devocd/state.json': JSON.stringify({ version: 1, kind: 'project', id: 'api', companyRel: '..' }) });
  assert.equal(parsed(preflight(join(company, 'api'))).state, 'project', 'a project, even though a company sits above it');
  makeTree(company, { 'web/.devocd/state.json': '{ not json', 'docs/readme.md': '# Docs\n' });
  assert.equal(parsed(preflight(join(company, 'web'))).state, null, 'unreadable state is no state');
  assert.equal(parsed(preflight(join(company, 'docs'))).state, null, 'a plain subfolder of a company has no state of its own');
});

test('isHome compares resolved paths, whatever the spelling', () => {
  const home = tmp('devocd-home-');
  assert.equal(parsed(preflight(home + '/', home)).isHome, true, 'trailing slash');
  assert.equal(parsed(preflight(join(home, 'sub', '..'), home)).isHome, true, 'dot-dot');
  const r = spawnSync(process.execPath, [cli, 'preflight', '.', '--json'], { cwd: home, encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home } });
  assert.equal(parsed(r).isHome, true, 'relative');
  if (process.platform === 'win32') assert.equal(parsed(preflight(home.toUpperCase(), home)).isHome, true, 'case');
});

test('a folder below or beside home is not home', () => {
  const home = tmp('devocd-home-');
  makeTree(home, { 'sub/AGENTS.md': 'x\n' });
  const r = parsed(preflight(join(home, 'sub'), home));
  assert.equal(r.isHome, false);
  assert.deepEqual(r.agentsMd, ['AGENTS.md']);
  assert.equal(parsed(preflight(tmp())).isHome, false);
});

test('parentFile is CLAUDE.md outside a git repo and CLAUDE.local.md inside one', () => {
  assert.equal(parsed(preflight(tmp())).parentFile, 'CLAUDE.md');
  const repo = makeRepo();
  assert.equal(parsed(preflight(repo)).parentFile, 'CLAUDE.local.md');
  makeTree(repo, { 'sub/x.txt': 'x\n' });
  assert.equal(parsed(preflight(join(repo, 'sub'))).parentFile, 'CLAUDE.local.md');
});

test('agentsMd lists files down to 4 levels, with forward slashes, skipping .git, node_modules and .devocd', () => {
  const dir = makeRepo();
  makeTree(dir, {
    'AGENTS.md': 'top\n',
    'a/AGENTS.md': '1\n',
    'a/b/c/d/AGENTS.md': '4 levels\n',
    'a/b/c/d/e/AGENTS.md': '5 levels\n',
    '.git/AGENTS.md': 'skip\n',
    'a/node_modules/x/AGENTS.md': 'skip\n',
    '.devocd/AGENTS.md': 'skip\n',
    'a/not-AGENTS.md': 'skip\n',
  });
  assert.deepEqual(parsed(preflight(dir)).agentsMd, ['AGENTS.md', 'a/AGENTS.md', 'a/b/c/d/AGENTS.md']);
});

test('agentsMd follows no links', (t) => {
  const dir = tmp();
  const elsewhere = tmp();
  makeTree(elsewhere, { 'AGENTS.md': 'x\n' });
  if (!tryLink(elsewhere, join(dir, 'link'))) return t.skip('cannot create links here');
  assert.deepEqual(parsed(preflight(dir)).agentsMd, []);
});

test('a folder named AGENTS.md is not reported', () => {
  const dir = tmp();
  makeTree(dir, { 'AGENTS.md/inner.txt': 'x\n' });
  assert.deepEqual(parsed(preflight(dir)).agentsMd, []);
});

test('preflight is read-only', () => {
  const repo = makeRepo();
  makeTree(repo, { 'sub/AGENTS.md': 'x\n', 'CLAUDE.md': 'team\n' });
  const before = walkFiles(repo).map((f) => [relative(repo, f), readFileSync(f).toString('hex')]);
  parsed(preflight(repo));
  assert.deepEqual(walkFiles(repo).map((f) => [relative(repo, f), readFileSync(f).toString('hex')]), before);
});

// add-project (R32): a session started in a repo can't Read the company folder above it, so the helper finds it.

/** A company folder with valid company state, a standards folder and one project folder in it. */
function makeCompanyDir(/** @type {string} */ project = 'api') {
  const company = join(tmp('devocd-co-'), 'acme co ï');
  makeTree(company, {
    '.devocd/state.json': JSON.stringify({ version: 1, kind: 'company', name: 'Acme', description: 'x', parentFile: 'CLAUDE.md', keyRules: [], projects: [], sources: [] }),
    '.devocd/standards/security.md': '# Security\n',
    [`${project}/README.md`]: '# api\n',
  });
  return company;
}
/** preflight run from a given current folder. */
const preflightFrom = (/** @type {string} */ cwd, /** @type {string} */ dir) => parsed(spawnSync(process.execPath, [cli, 'preflight', dir, '--json'], { cwd, encoding: 'utf8' }));
/**
 * standards is absolute, forward-slash and names the company's standards folder. Compared by real path: a child's
 * current folder is the physical path (macOS /private/var for /var), so the spelling can differ from tmpdir's.
 */
function assertStandards(/** @type {string} */ standards, /** @type {string} */ company) {
  assert.ok(isAbsolute(standards), standards);
  assert.ok(!standards.includes(String.fromCharCode(92)), `forward slashes: ${standards}`);
  assert.match(standards, /\/\.devocd\/standards$/);
  assert.equal(realpathSync(standards), realpathSync(join(company, '.devocd', 'standards')));
}

test('company is null when no folder at or above holds company state', () => {
  const dir = tmp();
  makeTree(dir, { 'repo/README.md': 'x\n', '.devocd/state.json': JSON.stringify({ version: 1, kind: 'project', id: 'x' }) });
  assert.equal(parsed(preflight(join(dir, 'repo'))).company, null, 'a project state above is not a company');
  makeTree(dir, { '.devocd/state.json': '{ not json' });
  assert.equal(parsed(preflight(join(dir, 'repo'))).company, null, 'unreadable state is not a company');
});

test('company from the company folder with a project path: paths for commands, state and register', () => {
  const company = makeCompanyDir();
  const c = preflightFrom(company, 'api').company;
  assert.deepEqual({ path: c.path, rel: c.rel, project: c.project }, { path: '.', rel: '..', project: 'api' });
  assertStandards(c.standards, company);
});

test('company from inside the project: path is from the current folder', () => {
  const company = makeCompanyDir();
  const c = preflightFrom(join(company, 'api'), '.').company;
  assert.equal(c.path, '..');
  assert.equal(c.rel, '..');
  assert.equal(c.project, 'api');
  assertStandards(c.standards, company);
});

test('company two levels up, as in a monorepo subfolder, skipping the project state on the way', () => {
  const company = makeCompanyDir('services/api');
  makeTree(company, { 'services/api/.devocd/state.json': JSON.stringify({ version: 1, kind: 'project', id: 'api' }) });
  const c = preflightFrom(company, 'services/api').company;
  assert.deepEqual({ path: c.path, rel: c.rel, project: c.project }, { path: '.', rel: '../..', project: 'services/api' });
});

test('the company folder itself: project is .', () => {
  const company = makeCompanyDir();
  const c = preflightFrom(company, '.').company;
  assert.deepEqual({ path: c.path, rel: c.rel, project: c.project }, { path: '.', rel: '.', project: '.' });
});

test('teamFiles hashes the team memory files in the folder, and check agrees with the hashes', () => {
  const company = makeCompanyDir();
  const api = join(company, 'api');
  makeTree(api, { 'CLAUDE.md': '# Team\r\ncafé\r\n', '.claude/CLAUDE.md': 'more\n', 'AGENTS.md': 'agents\n', 'sub/CLAUDE.md': 'not at the top\n' });
  const { teamFiles } = preflightFrom(company, 'api');
  assert.deepEqual(teamFiles.map((/** @type {any} */ t) => t.path), ['CLAUDE.md', '.claude/CLAUDE.md', 'AGENTS.md']);
  for (const t of teamFiles) assert.match(t.sha256, /^[0-9a-f]{64}$/);
  makeTree(api, { '.devocd/state.json': JSON.stringify({ version: 1, kind: 'project', id: 'api', companyRel: '..', teamFiles: teamFiles.map((/** @type {any} */ t) => ({ ...t, excluded: false })), approvedCommands: [], sources: [] }) });
  const check = spawnSync(process.execPath, [cli, 'check', api, '--json'], { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(check.stdout).issues.filter((/** @type {any} */ i) => i.rule === 'team-file/changed'), []);
});

test('teamFiles skips a folder named CLAUDE.md and is empty with no team files', () => {
  const dir = tmp();
  makeTree(dir, { 'CLAUDE.md/inner.txt': 'x\n' });
  assert.deepEqual(parsed(preflight(dir)).teamFiles, []);
});

test('preflight usage and environment errors', () => {
  const run = (/** @type {string[]} */ ...args) => spawnSync(process.execPath, [cli, 'preflight', ...args], { encoding: 'utf8' });
  assert.equal(run().status, 2, 'no folder');
  assert.equal(run(tmp()).status, 2, 'no --json');
  assert.equal(run(tmp(), tmp(), '--json').status, 2, 'two folders');
  const missing = run(join(tmp(), 'nope'), '--json');
  assert.equal(missing.status, 3);
  assert.match(missing.stderr, /^error: folder not found/m);
});

test('teamFiles gives each file its line count and absolute forward-slash path, for the personal split', () => {
  const company = makeCompanyDir();
  const api = join(company, 'api');
  makeTree(api, { 'CLAUDE.md': Array.from({ length: 250 }, (_, i) => `- rule ${i}`).join('\n') + '\n' });
  const [t] = preflightFrom(company, 'api').teamFiles;
  assert.equal(t.lines, 250);
  assert.ok(!t.absolute.includes(String.fromCharCode(92)), t.absolute);
  assert.ok(isAbsolute(t.absolute) && t.absolute.endsWith('/api/CLAUDE.md'), t.absolute);
});
