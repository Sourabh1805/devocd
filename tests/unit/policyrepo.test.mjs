import { workspace, companyState, gitRepo } from '../helpers/workspace.mjs';
import { git, tryLink } from '../helpers/git.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { toPosix } from '../../scripts/lib/fsutil.mjs';
import { stateProblem } from '../../scripts/lib/check.mjs';
import { normalizeRemote, policyRepoStatus } from '../../scripts/lib/policyrepo.mjs';
import { preflight } from '../../scripts/lib/preflight.mjs';

const cli = fileURLToPath(new URL('../../scripts/devocd.mjs', import.meta.url));
const ABSENT = toPosix(join(tmpdir(), 'policy-clone-not-here'));
/** A policyRepo field; overrides let each row break one rule. */
const field = (over = {}) => ({ path: ABSENT, remote: 'https://github.com/acme/policy', index: 'index.md', builtAt: null, ...over });
/** A valid company state carrying a policyRepo field. */
const companyWith = (policyRepo) => companyState({ name: 'Acme', projects: [{ id: 'api', path: 'api', description: '' }], policyRepo });
const stateWith = (policyRepo) => stateProblem(companyWith(policyRepo));

const STATE_CASES = [
  { name: 'a valid field is accepted', policyRepo: field(), want: null },
  { name: 'a git@ remote and a 40-hex builtAt are accepted', policyRepo: field({ remote: 'git@github.com:acme/policy.git', builtAt: 'a'.repeat(40) }), want: null },
  { name: 'a 64-hex builtAt is accepted', policyRepo: field({ builtAt: 'b'.repeat(64) }), want: null },
  { name: 'a non-object is refused', policyRepo: 'x', want: /must be an object/ },
  { name: 'an array is refused', policyRepo: [], want: /must be an object/ },
  { name: 'a missing key is refused', policyRepo: { path: ABSENT, remote: 'https://github.com/acme/policy', index: 'index.md' }, want: /exactly path, remote, index and builtAt/ },
  { name: 'an extra key is refused', policyRepo: { ...field(), extra: true }, want: /exactly path, remote, index and builtAt/ },
  { name: 'a relative path is refused', policyRepo: field({ path: 'policy/clone' }), want: /policyRepo\.path must/ },
  { name: 'a backslash path is refused', policyRepo: field({ path: 'C:\\policy' }), want: /policyRepo\.path must/ },
  { name: 'a path over 1024 characters is refused', policyRepo: field({ path: '/' + 'a'.repeat(1024) }), want: /at most 1024/ },
  { name: 'an empty remote is refused', policyRepo: field({ remote: '' }), want: /non-empty string of at most 512/ },
  { name: 'a remote over 512 characters is refused', policyRepo: field({ remote: 'https://github.com/' + 'a'.repeat(512) }), want: /at most 512/ },
  { name: 'a remote with a password is refused', policyRepo: field({ remote: 'https://user:secret@github.com/acme/policy' }), want: /must not contain a username or password/ },
  { name: 'a non-https remote is refused', policyRepo: field({ remote: 'http://github.com/acme/policy' }), want: /https:\/\/ or git@ URL/ },
  { name: 'a remote with no repository path is refused', policyRepo: field({ remote: 'https://github.com' }), want: /must name a repository/ },
  { name: 'an index without .md is refused', policyRepo: field({ index: 'index.txt' }), want: /relative \.md path/ },
  { name: 'an absolute index is refused', policyRepo: field({ index: '/index.md' }), want: /relative path with no/ },
  { name: 'an index with .. is refused', policyRepo: field({ index: '../index.md' }), want: /relative path with no/ },
  { name: 'an index with . is refused', policyRepo: field({ index: './index.md' }), want: /relative path with no/ },
  { name: 'an index with an empty segment is refused', policyRepo: field({ index: 'a//b.md' }), want: /relative path with no/ },
  { name: 'a backslash index is refused', policyRepo: field({ index: 'a\\b.md' }), want: /relative path with no/ },
  { name: 'an index over 256 characters is refused', policyRepo: field({ index: 'a/'.repeat(129) + 'x.md' }), want: /at most 256/ },
  { name: 'a non-hex builtAt is refused', policyRepo: field({ builtAt: 'abc' }), want: /builtAt must be null or a 40- or 64-character lowercase hex/ },
  { name: 'an uppercase builtAt is refused', policyRepo: field({ builtAt: 'A'.repeat(40) }), want: /lowercase hex/ },
];

for (const c of STATE_CASES) {
  test(`stateProblem policyRepo: ${c.name}`, () => {
    const problem = stateWith(c.policyRepo);
    if (c.want === null) assert.equal(problem, null);
    else assert.match(problem, c.want);
  });
}

test('stateProblem never repeats a credential in its message', () => {
  const problem = stateWith(field({ remote: 'https://user:secret@github.com/acme/policy' }));
  assert.match(problem, /must not contain a username or password/);
  assert.ok(!problem.includes('secret'));
  assert.ok(!problem.includes('user:'));
});

const REMOTE_PAIRS = [
  ['https and scp forms of one repo', 'https://github.com/acme/policy', 'git@github.com:acme/policy.git', true],
  ['a trailing slash and a trailing .git', 'https://github.com/acme/policy/', 'https://github.com/acme/policy.git', true],
  ['host case', 'https://GitHub.COM/acme/policy', 'https://github.com/acme/policy', true],
  ['two different repos', 'https://github.com/acme/one', 'https://github.com/acme/two', false],
  ['two different hosts', 'https://github.com/acme/policy', 'https://gitlab.com/acme/policy', false],
  ['path case still differs', 'https://github.com/Acme/policy', 'https://github.com/acme/policy', false],
];
for (const [name, a, b, equal] of REMOTE_PAIRS) {
  test(`normalizeRemote: ${name}`, () => assert.equal(normalizeRemote(a) === normalizeRemote(b), equal));
}

for (const value of ['', '   ', 'github.com/acme/policy', 'ftp://github.com/acme/policy', 'https://', 'https://github.com', 'git@github.com', null, 42]) {
  test(`normalizeRemote: ${JSON.stringify(value)} cannot be parsed`, () => assert.equal(normalizeRemote(value), null));
}

/** One row per status. A row whose fixture cannot be built is skipped with the reason. */
const STATUS_ROWS = [
  {
    name: 'ok when the clone and its origin match',
    build(root) {
      const repo = gitRepo(join(root, 'policy'), { origin: 'https://github.com/acme/policy' });
      return { repo, field: field({ path: toPosix(repo), remote: 'https://github.com/acme/policy.git' }) };
    },
    status: 'ok',
    verify(st, { repo }) {
      assert.equal(st.head, git(repo, 'rev-parse', 'HEAD').trim());
      assert.equal(st.index, 'index.md');
      assert.equal(st.builtAt, null);
    },
  },
  {
    name: 'ok when builtAt is the current HEAD',
    build(root) {
      const repo = gitRepo(join(root, 'policy'), { origin: 'git@github.com:acme/policy' });
      const head = git(repo, 'rev-parse', 'HEAD').trim();
      return { repo, field: field({ path: toPosix(repo), remote: 'https://github.com/acme/policy', builtAt: head }) };
    },
    status: 'ok',
    verify(st) { assert.match(st.head, /^[0-9a-f]{40}$/); },
  },
  {
    name: 'moved when HEAD is not builtAt',
    build(root) {
      const repo = gitRepo(join(root, 'policy'), { origin: 'https://github.com/acme/policy' });
      const first = git(repo, 'rev-parse', 'HEAD').trim();
      git(repo, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', 'commit', '-q', '--allow-empty', '-m', 'second');
      return { repo, first, field: field({ path: toPosix(repo), builtAt: first }) };
    },
    status: 'moved',
    verify(st) { assert.notEqual(st.head, st.builtAt); },
  },
  {
    name: 'missing when the path does not exist',
    build(root) { return { field: field({ path: toPosix(join(root, 'gone')) }) }; },
    status: 'missing',
    verify(st) { assert.equal(st.head, null); },
  },
  {
    name: 'missing when the path is not recorded',
    build() { return { field: field({ path: null }) }; },
    status: 'missing',
  },
  {
    name: 'missing when the path is a file',
    build(root) {
      const file = join(root, 'a-file');
      writeFileSync(file, 'x');
      return { field: field({ path: toPosix(file) }) };
    },
    status: 'missing',
  },
  {
    name: 'missing when the path cannot be read',
    build(root) {
      const file = join(root, 'a-file');
      writeFileSync(file, 'x');
      return { field: field({ path: toPosix(join(file, 'below')) }) };
    },
    status: 'missing',
  },
  {
    name: 'missing when the path is a link',
    build(root) {
      const target = join(root, 'real');
      mkdirSync(target);
      if (!tryLink(target, join(root, 'link'))) return null;
      return { field: field({ path: toPosix(join(root, 'link')) }) };
    },
    status: 'missing',
  },
  {
    name: 'not-a-clone for a plain folder',
    build(root) {
      const dir = join(root, 'plain');
      mkdirSync(dir);
      return { field: field({ path: toPosix(dir) }) };
    },
    status: 'not-a-clone',
  },
  {
    name: 'not-a-clone for a subfolder of a repository',
    build(root) {
      const repo = gitRepo(join(root, 'repo'), { origin: 'https://github.com/acme/policy' });
      mkdirSync(join(repo, 'sub'));
      return { field: field({ path: toPosix(join(repo, 'sub')) }) };
    },
    status: 'not-a-clone',
  },
  {
    name: 'wrong-remote when origin is another repository',
    build(root) {
      const repo = gitRepo(join(root, 'policy'), { origin: 'https://github.com/acme/other' });
      return { field: field({ path: toPosix(repo) }) };
    },
    status: 'wrong-remote',
  },
  {
    name: 'wrong-remote when origin is missing',
    build(root) { return { field: field({ path: toPosix(gitRepo(join(root, 'policy'))) }) }; },
    status: 'wrong-remote',
  },
  {
    name: 'no-git when git cannot be run',
    build(root) {
      const repo = gitRepo(join(root, 'policy'), { origin: 'https://github.com/acme/policy' });
      return { repo, field: field({ path: toPosix(repo) }), withoutGit: true };
    },
    status: 'no-git',
  },
];

for (const row of STATUS_ROWS) {
  test(`policyRepoStatus: ${row.name}`, (t) => {
    const root = workspace(t).root;
    const built = row.build(root);
    if (!built) return t.skip('cannot create a link here');
    const hadPath = Object.hasOwn(process.env, 'PATH');
    const savedPath = process.env.PATH;
    let status;
    try {
      if (built.withoutGit) process.env.PATH = '';
      status = policyRepoStatus(built.field);
    } finally {
      if (built.withoutGit) {
        if (hadPath) process.env.PATH = savedPath;
        else delete process.env.PATH;
      }
    }
    if (built.withoutGit && status.status !== 'no-git') return t.skip('git stayed reachable without PATH');
    assert.equal(status.status, row.status);
    if (row.verify) row.verify(status, built);
  });
}

test('preflight reports the configured policy repo status and keeps its other fields', (t) => {
  const w = workspace(t, { company: { name: 'Acme', projects: ['api'] }, projects: { api: {} } });
  const repo = gitRepo(join(w.root, 'policy'), { origin: 'https://github.com/acme/policy' });
  writeFileSync(join(w.root, '.devocd/state.json'), JSON.stringify(companyWith(field({ path: toPosix(repo) }))));
  const company = preflight(w.project('api')).company;
  assert.equal(company.policyRepo.status, 'ok');
  assert.equal(company.policyRepo.path, toPosix(repo));
  assert.equal(company.policyRepo.head, git(repo, 'rev-parse', 'HEAD').trim());
  assert.equal(company.standards, toPosix(join(w.root, '.devocd', 'standards')));
});

test('preflight policy repo is null when absent or invalid, and an unreadable state never throws', (t) => {
  const w = workspace(t, { company: { name: 'Acme', projects: ['api'] }, projects: { api: {} } });
  const api = w.project('api');
  assert.equal(preflight(api).company.policyRepo, null, 'no field');
  writeFileSync(join(w.root, '.devocd/state.json'), JSON.stringify(companyWith(field({ index: 'rules.txt' }))));
  assert.equal(preflight(api).company.policyRepo, null, 'invalid field');
  writeFileSync(join(w.root, '.devocd/state.json'), JSON.stringify({ version: 1, kind: 'company', policyRepo: field({ remote: 'https://user:secret@github.com/acme/policy' }) }));
  assert.equal(preflight(api).company.policyRepo, null, 'invalid credential field');
  writeFileSync(join(w.root, '.devocd/state.json'), '{ not json');
  assert.equal(preflight(api).company, null, 'unreadable state is no company');
});

test('settings add-dir grants the clone root while it is healthy, refuses it when missing, and remove-dir still takes it', (t) => {
  const w = workspace(t, { company: { name: 'Acme', projects: ['api'] }, projects: { api: {} } });
  const repo = gitRepo(join(w.root, 'policy'), { origin: 'https://github.com/acme/policy' });
  writeFileSync(join(w.root, '.devocd/state.json'), JSON.stringify(companyWith(field({ path: toPosix(repo) }))));
  const api = w.project('api');
  const clone = toPosix(repo);
  const standards = toPosix(join(w.root, '.devocd', 'standards'));
  const settingsFile = join(api, '.claude', 'settings.local.json');
  const run = (/** @type {string} */ ...args) => spawnSync(process.execPath, [cli, 'settings', api, ...args], { encoding: 'utf8' });

  const added = run('add-dir', clone);
  assert.equal(added.status, 0, added.stderr);
  assert.deepEqual(JSON.parse(readFileSync(settingsFile, 'utf8')).permissions.additionalDirectories, [clone]);

  const other = run('add-dir', toPosix(join(w.root, 'elsewhere')));
  assert.equal(other.status, 1, 'a folder neither allowed nor the clone');
  assert.ok(other.stderr.includes(standards) && other.stderr.includes(clone), other.stderr);

  rmSync(repo, { recursive: true, force: true });
  const refused = run('add-dir', clone);
  assert.equal(refused.status, 1, 'the clone is gone, so add-dir refuses');
  assert.ok(refused.stderr.includes(standards) && refused.stderr.includes(clone), refused.stderr);
  assert.deepEqual(JSON.parse(readFileSync(settingsFile, 'utf8')).permissions.additionalDirectories, [clone], 'nothing changed');

  const removed = run('remove-dir', clone);
  assert.equal(removed.status, 0, removed.stderr);
  assert.ok(!existsSync(settingsFile), 'the stale permission is gone');
});
