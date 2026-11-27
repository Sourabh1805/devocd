import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkTree, maskCode, stateProblem } from '../../scripts/lib/check.mjs';
import { planRefresh, completeRefresh } from '../../scripts/lib/refresh.mjs';
import { makeTree } from '../helpers/tree.mjs';
import { git } from '../helpers/git.mjs';
import { workspace, companyState as defaultCompanyState, projectState as defaultProjectState, gitRepo } from '../helpers/workspace.mjs';

const cli = fileURLToPath(new URL('../../scripts/devocd.mjs', import.meta.url));
const B = '<!-- devocd:begin -->';
const E = '<!-- devocd:end -->';
const tmp = (name = 'devocd-chk-') => {
  if (!/[^\x21-\x7e]/.test(name)) return workspace({ after }).root;
  // Preserve the explicit space/non-ASCII path fixture used by the CLI test.
  const d = mkdtempSync(join(tmpdir(), name));
  after(() => rmSync(d, { recursive: true, force: true }));
  return d;
};
const posix = (/** @type {string} */ p) => p.split('\\').join('/');

const companyState = (extra = {}) => JSON.stringify(defaultCompanyState({ name: 'Acme', description: 'd', keyRules: ['Be kind'], ...extra }));
const projectState = (extra = {}) => JSON.stringify(defaultProjectState(extra));
const block = (/** @type {string} */ inner) => `${B}\n${inner}\n${E}\n`;
const rules = (/** @type {{rule: string}[]} */ issues) => issues.map((i) => i.rule);

function company(files = {}, state = companyState()) {
  return workspace({ after }, { company: { files: { '.devocd/state.json': state,
    'CLAUDE.md': block('# Acme\nSee [project](.devocd/PROJECT.md)'), '.devocd/PROJECT.md': '# P\n', ...files } } }).root;
}

test('a clean tree has no issues; --json parses', () => {
  const d = company();
  const r = checkTree(d, {});
  assert.deepEqual(r.issues.filter((i) => i.rule !== 'launch/over-target'), []);
  assert.ok(r.files.some((f) => f.path === 'CLAUDE.md' && f.kind === 'parent'));
  const out = spawnSync(process.execPath, [cli, 'check', d, '--json'], { encoding: 'utf8' });
  const parsed = JSON.parse(out.stdout);
  assert.ok(Array.isArray(parsed.issues));
  assert.equal(out.status, 0, out.stdout + out.stderr);
});

test('over-limit parent is an error naming the file and limit', () => {
  const lines = Array.from({ length: 70 }, (_, i) => `line ${i}`).join('\n');
  const d = company({ 'CLAUDE.md': block(lines) });
  const issue = checkTree(d, {}).issues.find((i) => i.rule === 'budget/lines');
  assert.ok(issue);
  assert.equal(issue.severity, 'error');
  assert.equal(issue.file, 'CLAUDE.md');
  assert.match(issue.message, /60/);
  const out = spawnSync(process.execPath, [cli, 'check', d], { encoding: 'utf8' });
  assert.equal(out.status, 1);
  assert.match(out.stdout, /CLAUDE\.md/);
});

test('token budget is an error and user text outside the block is not counted', () => {
  const big = 'word '.repeat(600);
  const d = company({ 'CLAUDE.md': block(big) });
  assert.ok(rules(checkTree(d, {}).issues).includes('budget/tokens'));
  const outside = company({ 'CLAUDE.md': 'x\n'.repeat(500) + block('small') });
  assert.deepEqual(rules(checkTree(outside, {}).issues).filter((r) => r.startsWith('budget')), []);
});

test('key rules over 300 estimated tokens are an error', () => {
  const d = company({}, companyState({ keyRules: ['x'.repeat(1300)] }));
  assert.ok(rules(checkTree(d, {}).issues).includes('budget/tokens'));
});

test('references over 200 lines fail but projects.md is exempt and still reported', () => {
  const long = 'l\n'.repeat(250);
  const d = company({ '.devocd/refs/big.md': long, '.devocd/projects.md': long });
  const r = checkTree(d, {});
  const bud = r.issues.filter((i) => i.rule === 'budget/lines');
  assert.deepEqual(bud.map((i) => i.file), ['.devocd/refs/big.md']);
  assert.ok(r.files.some((f) => f.path === '.devocd/projects.md' && f.lines >= 250));
});

test('flows over 80 lines fail', () => {
  const d = company({ '.devocd/flows/deploy.md': 'l\n'.repeat(90) });
  assert.ok(checkTree(d, {}).issues.some((i) => i.rule === 'budget/lines' && i.file === '.devocd/flows/deploy.md'));
});

test('a broken relative link reports file and line', () => {
  const d = company({ '.devocd/ref.md': 'a\nb\nsee [x](missing.md) and [ok](PROJECT.md)\n' });
  const i = checkTree(d, {}).issues.find((x) => x.rule === 'ref/broken');
  assert.ok(i);
  assert.equal(i.file, '.devocd/ref.md');
  assert.equal(i.line, 3);
});

test('links in code fences and code spans are ignored', () => {
  const d = company({ '.devocd/ref.md': '```\n[x](nope.md) @a/b.md\n```\n`[y](nope2.md)` and [z](https://example.com) [a](#top)\n' });
  assert.deepEqual(rules(checkTree(d, {}).issues).filter((r) => r.startsWith('ref/') || r === 'import/present'), []);
});

test('a link escaping the company folder is reported', () => {
  const d = tmp();
  const co = join(d, 'co');
  makeTree(co, { '.devocd/state.json': companyState(), 'CLAUDE.md': block('[up](../outside.md)') });
  writeFileSync(join(d, 'outside.md'), 'hi');
  const i = checkTree(co, {}).issues.find((x) => x.rule === 'ref/escape');
  assert.ok(i);
  assert.equal(i.file, 'CLAUDE.md');
});

test('a project pointer may link inside its company but not beyond it', () => {
  const d = tmp();
  makeTree(d, {
    'co/.devocd/state.json': companyState(), 'co/CLAUDE.md': block('hi'), 'co/.devocd/company.md': 'c',
    'co/api/.devocd/state.json': projectState(),
    'co/api/CLAUDE.local.md': block('[c](../.devocd/company.md) [bad](../../elsewhere.md)'),
  });
  const r = checkTree(join(d, 'co', 'api'), {});
  assert.deepEqual(r.issues.filter((i) => i.rule.startsWith('ref/')).map((i) => i.rule), ['ref/escape']);
  assert.ok(r.files.some((f) => f.kind === 'pointer'));
});

test('any @import in a generated file is an error', () => {
  const d = company({ 'CLAUDE.md': block('use @docs/guide.md here and @acme/team is fine and a@b.com') });
  const imports = checkTree(d, {}).issues.filter((i) => i.rule === 'import/present');
  assert.equal(imports.length, 1);
  assert.equal(imports[0].severity, 'error');
  assert.equal(imports[0].line, 2);
  const text = company({ 'CLAUDE.md': block('ping @acme/team about it.') });
  assert.deepEqual(rules(checkTree(text, {}).issues).filter((r) => r === 'import/present'), []);
});

test('a secret in .devocd is an error', () => {
  const d = company({ '.devocd/notes.md': 'x\nAKIAIOSFODNN7EXAMPLE\n' });
  const i = checkTree(d, {}).issues.find((x) => x.rule === 'secret/found');
  assert.ok(i);
  assert.equal(i.severity, 'error');
  assert.equal(i.file, '.devocd/notes.md');
  assert.equal(i.line, 2);
});

test('a malformed block is reported', () => {
  const d = company({ 'CLAUDE.md': `${B}\nno end\n` });
  assert.ok(rules(checkTree(d, {}).issues).includes('block/malformed'));
});

test('company startup file and managed block are required, without requiring a project index', () => {
  const d = company();
  rmSync(join(d, '.devocd', 'PROJECT.md'));
  writeFileSync(join(d, 'CLAUDE.md'), block('Company rules'));
  assert.deepEqual(checkTree(d, {}).issues, []);
  for (const text of ['', '# User notes\n', block('  ')]) {
    writeFileSync(join(d, 'CLAUDE.md'), text);
    assert.ok(checkTree(d, {}).issues.some(i => i.rule === 'block/missing' && i.severity === 'error'));
  }
  rmSync(join(d, 'CLAUDE.md'));
  assert.ok(checkTree(d, {}).issues.some(i => i.rule === 'block/missing'));
});

test('a project needs its startup block, index and saved pointer before check succeeds', () => {
  const d = tmp();
  makeTree(d, { '.devocd/state.json': projectState() });
  const result = checkTree(d, {});
  assert.deepEqual(result.issues.map(i => i.rule).sort(), ['block/missing', 'entry/missing', 'entry/missing']);
  assert.equal(spawnSync(process.execPath, [cli, 'check', d, '--json'], { encoding: 'utf8' }).status, 1);
  makeTree(d, { 'CLAUDE.local.md': block('Start with PROJECT.md'), '.devocd/PROJECT.md': '# Project', '.devocd/pointer.md': 'Start with PROJECT.md' });
  assert.deepEqual(checkTree(d, {}).issues, []);
  writeFileSync(join(d, '.devocd', 'PROJECT.md'), '  \n');
  assert.ok(checkTree(d, {}).issues.some(i => i.rule === 'entry/missing' && i.file.endsWith('PROJECT.md')));
});

test('missing or invalid state gives one state/invalid error with a hint', () => {
  const d = tmp();
  const r = checkTree(d, {});
  assert.deepEqual(rules(r.issues), ['state/invalid']);
  assert.match(r.issues[0].hint, /devocd:install|devocd:add-project/);
  const bad = company({}, JSON.stringify({ version: 1, kind: 'company' }));
  assert.deepEqual(rules(checkTree(bad, {}).issues), ['state/invalid']);
  const junk = company({}, '{nope');
  assert.deepEqual(rules(checkTree(junk, {}).issues), ['state/invalid']);
});

test('a changed team file hash warns', () => {
  const d = tmp();
  const sha = createHash('sha256').update('v1').digest('hex');
  makeTree(d, {
    '.devocd/state.json': projectState({ teamFiles: [{ path: 'CLAUDE.md', sha256: sha, excluded: false }] }),
    'CLAUDE.md': 'v1', 'CLAUDE.local.md': block('hi'),
  });
  assert.deepEqual(rules(checkTree(d, {}).issues).filter((r) => r === 'team-file/changed'), []);
  writeFileSync(join(d, 'CLAUDE.md'), 'v2');
  const i = checkTree(d, {}).issues.find((x) => x.rule === 'team-file/changed');
  assert.ok(i);
  assert.equal(i.severity, 'warning');
});

test('unconfirmed markers are counted as information', () => {
  const d = company({ '.devocd/ref.md': 'a (unconfirmed)\nb unconfirmed\n' });
  const i = checkTree(d, {}).issues.find((x) => x.rule === 'source/unconfirmed');
  assert.ok(i);
  assert.equal(i.severity, 'information');
  assert.match(i.message, /2/);
});

test('launch counts parents and honours claudeMdExcludes', () => {
  const d = tmp();
  makeTree(d, {
    'CLAUDE.md': 'a'.repeat(400),
    'mid/CLAUDE.md': 'b'.repeat(400),
    'mid/proj/.devocd/state.json': projectState({ companyRel: '../..' }),
    'mid/proj/CLAUDE.local.md': block('c'.repeat(40)),
    'mid/proj/AGENTS.md': 'ignored because CLAUDE.md exists above',
    'mid/proj/.claude/rules/r.md': 'd'.repeat(40),
    'mid/proj/.claude/rules/scoped.md': '---\npaths: ["src/**"]\n---\nnot always on',
  });
  const prefix = posix(d) + '/';
  /** @param {{launch: {files: {path: string}[]}}} r */
  const mine = (r) => r.launch.files.map((f) => posix(f.path)).filter((p) => p.startsWith(prefix)).map((p) => p.slice(prefix.length)).sort();
  assert.deepEqual(mine(checkTree(join(d, 'mid', 'proj'), {})),
    ['CLAUDE.md', 'mid/CLAUDE.md', 'mid/proj/.claude/rules/r.md', 'mid/proj/CLAUDE.local.md']);
  writeFileSync(join(d, 'mid', 'proj', '.claude', 'settings.local.json'), JSON.stringify({ claudeMdExcludes: [prefix + 'mid/CLAUDE.md'] }));
  const r = checkTree(join(d, 'mid', 'proj'), {});
  const rel = mine(r);
  assert.ok(!rel.includes('mid/CLAUDE.md'));
  assert.ok(rel.includes('CLAUDE.md'));
  assert.ok(r.launch.notes.join(' ').includes('/context'));
  assert.ok(r.launch.tokens > 0);
});

test('AGENTS.md counts when no CLAUDE.md exists at or above', () => {
  const d = tmp('devocd-agents-');
  makeTree(d, { '.devocd/state.json': projectState(), 'AGENTS.md': 'z'.repeat(40) });
  const r = checkTree(d, {});
  assert.ok(r.launch.files.some((f) => posix(f.path) === posix(d) + '/AGENTS.md'));
});

test('AGENTS.md is turned off by CLAUDE.local.md, and back on when the CLAUDE.md above is excluded', () => {
  const d = tmp('devocd-agents-');
  makeTree(d, { '.devocd/state.json': projectState(), 'AGENTS.md': 'z'.repeat(40), 'CLAUDE.local.md': 'y'.repeat(40) });
  const has = () => checkTree(d, {}).launch.files.some((f) => posix(f.path) === posix(d) + '/AGENTS.md');
  assert.equal(has(), false);
  rmSync(join(d, 'CLAUDE.local.md'));
  makeTree(d, { 'CLAUDE.md': 'x'.repeat(40) });
  assert.equal(has(), false);
  makeTree(d, { '.claude/settings.local.json': JSON.stringify({ claudeMdExcludes: [posix(d) + '/CLAUDE.md'] }) });
  assert.equal(has(), true);
});

test('AGENTS.md is also turned off by .claude/CLAUDE.md and by a CLAUDE.local.md in a parent folder', () => {
  const d = tmp('devocd-agents-');
  makeTree(d, { 'proj/.devocd/state.json': projectState({ companyRel: '..' }), 'proj/AGENTS.md': 'z'.repeat(40), 'proj/.claude/CLAUDE.md': 'y'.repeat(40) });
  const has = () => checkTree(join(d, 'proj'), {}).launch.files.some((f) => posix(f.path) === posix(d) + '/proj/AGENTS.md');
  assert.equal(has(), false);
  rmSync(join(d, 'proj', '.claude', 'CLAUDE.md'));
  assert.equal(has(), true);
  makeTree(d, { 'CLAUDE.local.md': 'x'.repeat(40) });
  assert.equal(has(), false);
});

test('works from a path with a space and non-ASCII characters', () => {
  const d = tmp('devocd é ünï ');
  makeTree(d, { '.devocd/state.json': companyState(), 'CLAUDE.md': block('[p](.devocd/PROJECT.md)'), '.devocd/PROJECT.md': 'x' });
  assert.deepEqual(checkTree(d, {}).issues.filter((i) => i.rule !== 'launch/over-target'), []);
  const out = spawnSync(process.execPath, [cli, 'check', d], { encoding: 'utf8' });
  assert.equal(out.status, 0, out.stdout + out.stderr);
  assert.match(out.stdout, /estimated/);
  assert.ok(!out.stdout.includes('\\'));
});

test('an unknown command exits 2 with usage, no stack', () => {
  const out = spawnSync(process.execPath, [cli, 'bogus'], { encoding: 'utf8' });
  assert.equal(out.status, 2);
  assert.match(out.stderr, /^error:/m);
  assert.match(out.stderr, /^hint:/m);
  assert.ok(!/\n\s+at /.test(out.stderr));
});

test('a changed team file warns even when it is excluded from launch, and the exclude drops it from the launch figure', () => {
  const d = tmp();
  const sha = createHash('sha256').update('v1').digest('hex');
  makeTree(d, {
    '.devocd/state.json': projectState({ teamFiles: [{ path: 'CLAUDE.md', sha256: sha, excluded: true }] }),
    'CLAUDE.md': 'v1 '.repeat(400), 'CLAUDE.local.md': block('hi'),
    '.claude/settings.local.json': JSON.stringify({ claudeMdExcludes: [join(d, 'CLAUDE.md').split(String.fromCharCode(92)).join('/')] }),
  });
  const before = checkTree(d, {});
  assert.ok(!before.launch.files.some((f) => f.path.endsWith('/CLAUDE.md')), 'excluded: not in the launch figure');
  writeFileSync(join(d, 'CLAUDE.md'), 'v2');
  const i = checkTree(d, {}).issues.find((x) => x.rule === 'team-file/changed');
  assert.ok(i);
  assert.equal(i.severity, 'warning');
});

test('maskCode: a fence line with an info string does not close an open fence', () => {
  const src = '```\ncode\n``` js\n[x](leak.md)\n```\n[y](ok.md)';
  const lines = maskCode(src).split('\n');
  assert.equal(lines.length, 6);
  assert.ok(!lines[3].includes('leak.md'), 'line inside the still-open fence stays masked');
  assert.ok(lines[5].includes('ok.md'), 'line after the real closing fence is visible');
  assert.equal(lines[2].length, '``` js'.length);
});

test('standards files with no index.md is an error: no page can cite them, trace returns no policies', () => {
  const d = company({ '.devocd/standards/security.md': '# Security\n\n- Be careful.\n', '.devocd/standards/testing.md': '# Testing\n\n- Run the tests.\n' });
  const r = checkTree(d, {});
  const issue = r.issues.find((i) => i.rule === 'standards/index-missing');
  assert.ok(issue, 'expected a standards/index-missing issue, got ' + rules(r.issues).join(','));
  assert.equal(issue.severity, 'error');
  assert.equal(issue.file, '.devocd/standards');
  assert.match(issue.message, /2 standards file\(s\) and no index\.md/);
});

test('standards with an index.md raises no standards/index-missing, and a lone index is fine', () => {
  const d = company({
    '.devocd/standards/security.md': '# Security\n\n- Be careful.\n',
    '.devocd/standards/index.md': '- Change a port or host: [Security](security.md).\n',
  });
  assert.ok(!rules(checkTree(d, {}).issues).includes('standards/index-missing'));
  const only = company({ '.devocd/standards/index.md': '- nothing yet\n' });
  assert.ok(!rules(checkTree(only, {}).issues).includes('standards/index-missing'));
});

test('a standards index entry with no trigger words is an error that names the entry and its line', () => {
  const d = company({
    '.devocd/standards/security.md': '# Security\n\n- Be careful.\n',
    '.devocd/standards/index.md': '# Company standards\n\n- [Security](security.md)\n- Change a port: [Security](security.md).\n',
  });
  const issues = checkTree(d, {}).issues.filter((i) => i.rule === 'standards/index-no-trigger');
  assert.equal(issues.length, 1);
  assert.equal(issues[0].severity, 'error');
  assert.equal(issues[0].file, '.devocd/standards/index.md');
  assert.equal(issues[0].line, 3);
  assert.match(issues[0].message, /security\.md/);
});

test('an index entry is flagged only when no trigger words precede its link', () => {
  const CASES = [
    ['- [Security](security.md)', 1],
    ['- [Security](security.md): access rules', 1],
    ['- See [Security](security.md) for ports', 1],
    ['- : [Security](security.md)', 1],
    ['- Security: [Security](security.md)', 0],
    ['* Change a port or host binding: [Security](security.md).', 0],
    ['- Net: ports: [Security](security.md)', 0],
    ['- nothing yet', 0],
    ['# Company standards', 0],
  ];
  for (const [line, want] of CASES) {
    const d = company({ '.devocd/standards/security.md': '# Security\n', '.devocd/standards/index.md': `# Company standards\n\n${line}\n` });
    const n = checkTree(d, {}).issues.filter((i) => i.rule === 'standards/index-no-trigger').length;
    assert.equal(n, want, String(line));
  }
});

// --- T112: check reports the policy repo's state, read-only ---

const POLICY_ORIGIN = 'https://example.com/acme/policy';
const POLICY_INDEX = '- Create or edit a PR title/body: [PR description](pr/description.md).\n- Create or edit a Jira ticket: [Jira style](jira/style.md).\n';
const POLICY_PAGE = '# Billing\nParent: [PROJECT](../../PROJECT.md)\nScope: src/**\n\nBilling.\n\nStandards: description\n';
const REPEAT = 'Never merge a red build without a second review from the owning team.';

/** A company whose state records a real clone, plus an `api` project page governed by `description`. */
function policyWorkspace(t, { index = POLICY_INDEX, extra = {} } = {}) {
  const base = workspace({ after }).root;
  const clone = gitRepo(join(base, 'clone'), { origin: POLICY_ORIGIN });
  makeTree(clone, { 'index.md': index, 'pr/description.md': `# PR\n\n${REPEAT}\n`, 'jira/style.md': '# Jira\n\nTicket rules.\n', ...extra });
  git(clone, 'add', '-A');
  git(clone, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'policy');
  const ws = workspace({ after }, {
    company: {
      files: { '.devocd/state.json': companyState({
        projects: [{ id: 'api', path: 'api', description: '' }],
        policyRepo: { path: posix(clone), remote: POLICY_ORIGIN, index: 'index.md', builtAt: null },
      }) },
    },
    projects: { api: { pages: {
      'PROJECT.md': '# API\n', 'pointer.md': 'p', 'code/billing/index.md': POLICY_PAGE,
    }, files: { 'CLAUDE.local.md': block('Start at PROJECT.md'), 'src/a.js': 'x\n' } } },
  });
  return { ws, clone, proj: ws.project('api') };
}

test('policy repo: a missing clone is an error on the company, and none of these rules run without one', t => {
  const withRepo = policyWorkspace(t);
  rmSync(withRepo.clone, { recursive: true, force: true });
  const issues = checkTree(withRepo.ws.root).issues.filter((i) => i.rule.startsWith('policy'));
  assert.deepEqual(issues.map((i) => [i.rule, i.severity, i.file]), [['policy-repo/missing', 'error', '.devocd/state.json']]);

  const plain = workspace({ after }, { company: {}, projects: { api: {} } });
  assert.deepEqual(checkTree(plain.root).issues.filter((i) => i.rule.startsWith('policy')), []);
});

test('policy repo: a clone whose origin changed is a wrong-remote error', t => {
  const { ws, clone } = policyWorkspace(t);
  git(clone, 'remote', 'set-url', 'origin', 'https://example.com/other/policy');
  const issues = checkTree(ws.root).issues.filter((i) => i.rule === 'policy-repo/wrong-remote');
  assert.equal(issues.length, 1);
  assert.equal(issues[0].severity, 'error');
  assert.equal(issues[0].file, '.devocd/state.json');
});

const INDEX_CASES = [
  { name: 'a missing target is an error with its line', index: '- Gone: [Gone](gone.md).\n', extra: {}, rule: 'policy/missing-target', severity: 'error', line: 1 },
  { name: 'a refused link is a warning', index: '- Web: [Web](https://x.io/a.md).\n', extra: {}, rule: 'policy/bad-link', severity: 'warning', line: 1 },
  { name: 'a shared file name is an ambiguous topic', index: '- A: [A](a/security.md).\n- B: [B](b/security.md).\n', extra: { 'a/security.md': '# A\n', 'b/security.md': '# B\n' }, rule: 'policy/ambiguous-topic', severity: 'warning', line: 2 },
];

for (const c of INDEX_CASES) {
  test(`policy index: ${c.name}`, t => {
    const { ws } = policyWorkspace(t, { index: c.index, extra: c.extra });
    const issue = checkTree(ws.root).issues.find((i) => i.rule === c.rule);
    assert.ok(issue, c.rule);
    assert.equal(issue.severity, c.severity);
    assert.equal(issue.file, 'index.md');
    assert.equal(issue.line, c.line);
  });
}

test('policy index: a rule repeated across linked files is one duplicate warning', t => {
  const { ws } = policyWorkspace(t, { extra: { 'jira/style.md': `# Jira\n\n${REPEAT}\n` } });
  const issues = checkTree(ws.root).issues.filter((i) => i.rule === 'policy/duplicate');
  assert.equal(issues.length, 1);
  assert.equal(issues[0].severity, 'warning');
  assert.match(issues[0].file, /^(pr\/description|jira\/style)\.md$/);
});

test('policy repo: a moved clone is a version warning, a changed file a warning, and check writes nothing', t => {
  const { ws, clone, proj } = policyWorkspace(t);
  planRefresh(proj);
  completeRefresh(proj);
  const refreshFile = join(proj, '.devocd', 'refresh.json');
  const stateFile = join(ws.root, '.devocd', 'state.json');
  const beforeRefresh = readFileSync(refreshFile, 'utf8');
  const beforeState = readFileSync(stateFile, 'utf8');

  writeFileSync(join(clone, 'pr/description.md'), `# PR\n\n${REPEAT}\n\nChanged.\n`);
  let changed = checkTree(proj).issues.filter((i) => i.rule === 'policy-repo/changed');
  assert.equal(changed.length, 1);
  assert.equal(changed[0].severity, 'warning');
  assert.match(changed[0].message, /pr\/description\.md changed/);
  assert.match(changed[0].message, /cited by code\/billing\/index\.md/);

  git(clone, 'add', '-A');
  git(clone, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'policy edit');
  const version = checkTree(proj).issues.filter((i) => i.rule === 'policy-repo/version');
  assert.equal(version.length, 1);
  assert.equal(version[0].severity, 'warning');
  assert.match(version[0].message, /clone is at [0-9a-f]{7} but this project's knowledge was built at [0-9a-f]{7}/);

  assert.equal(readFileSync(refreshFile, 'utf8'), beforeRefresh, 'refresh.json untouched');
  assert.equal(readFileSync(stateFile, 'utf8'), beforeState, 'state untouched');
  assert.equal(git(clone, 'status', '--porcelain'), '', 'clone untouched');
});

// --- T112b: check names policies nobody uses ---

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDaysAgo = (/** @type {number} */ days) => new Date(Date.now() - days * DAY_MS).toISOString();
const UNUSED_INDEX = [
  '- Create or edit a PR title/body: [PR description](pr/description.md).',
  '- Edit a Jira ticket: [Jira style](jira/style.md).',
  '- Deploy: [Deploy](ops/deploy.md).',
  '',
].join('\n');
const UNUSED_PAGE = '# Billing\nParent: [PROJECT](../../PROJECT.md)\nScope: src/**\n\nBilling.\n\nStandards: description\n';

/** A company with two projects; `description` is cited by api, the other two entries are not. */
function unusedWorkspace(t, { since, pointers, web, days, local = false } = {}) {
  const base = workspace({ after }).root;
  const files = { 'pr/description.md': '# PR\n', 'jira/style.md': '# Jira\n', 'ops/deploy.md': '# Deploy\n' };
  let clone = null;
  if (!local) {
    clone = gitRepo(join(base, 'clone'), { origin: POLICY_ORIGIN });
    makeTree(clone, { 'index.md': UNUSED_INDEX, ...files });
    git(clone, 'add', '-A');
    git(clone, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'policy');
  }
  const state = companyState({
    projects: [{ id: 'api', path: 'api', description: '' }, { id: 'web', path: 'web', description: '' }],
    ...(local ? {} : { policyRepo: { path: posix(/** @type {string} */ (clone)), remote: POLICY_ORIGIN, index: 'index.md', builtAt: null } }),
    ...(days === undefined ? {} : { policyUnusedDays: days }),
  });
  const ws = workspace({ after }, {
    company: {
      files: { '.devocd/state.json': state },
      standards: local ? { 'index.md': UNUSED_INDEX, ...files } : {},
    },
    projects: {
      api: { pages: { 'PROJECT.md': '# API\n', 'pointer.md': 'p', 'code/billing/index.md': UNUSED_PAGE }, files: { 'CLAUDE.local.md': block('Start at PROJECT.md') } },
      web: { files: { 'CLAUDE.local.md': block('Start at PROJECT.md') } },
    },
  });
  /** @param {string} root @param {string} at @param {Record<string, string>} pts */
  const writeStats = (root, at, pts) => {
    mkdirSync(join(root, '.devocd', 'journal'), { recursive: true });
    writeFileSync(join(root, '.devocd', 'journal', 'hook-stats.json'), `${JSON.stringify({ since: at, events: {}, pointers: pts })}\n`);
  };
  if (since !== undefined) writeStats(ws.root, since, pointers ?? {});
  if (web) writeStats(ws.project('web'), web.since, web.pointers ?? {});
  return ws;
}

/** The index line of each `policy/unused` issue (1 description, 2 style, 3 deploy). */
const unusedLines = (/** @type {any[]} */ issues) => issues.filter((i) => i.rule === 'policy/unused').map((i) => i.line);

const UNUSED_CASES = [
  { name: 'a policy a project page cites is used', since: isoDaysAgo(100), want: [2, 3] },
  { name: 'a pointer recorded only in a project counts', web: { since: isoDaysAgo(100), pointers: { 'jira/style.md': isoDaysAgo(3) } }, want: [3] },
  { name: 'a pointer older than the window is unused', since: isoDaysAgo(100), pointers: { 'jira/style.md': isoDaysAgo(120) }, want: [2, 3] },
  { name: 'a history shorter than the window reports nothing', since: isoDaysAgo(10), want: [] },
  { name: 'no record anywhere reports nothing', want: [] },
  { name: 'policyUnusedDays changes the window', since: isoDaysAgo(100), days: 7, pointers: { 'jira/style.md': isoDaysAgo(10) }, want: [2, 3] },
];

for (const c of UNUSED_CASES) {
  test(`policy unused: ${c.name}`, t => {
    const ws = unusedWorkspace(t, c);
    const issues = checkTree(ws.root).issues;
    assert.deepEqual(unusedLines(issues), c.want);
    for (const i of issues.filter((x) => x.rule === 'policy/unused')) {
      assert.equal(i.severity, 'information');
      assert.equal(i.file, 'index.md');
      assert.match(i.message, /^no page cites and no prompt has used .+\.md in \d+ days$/);
    }
  });
}

test('policy unused: local standards mode gets the same rule', t => {
  const ws = unusedWorkspace(t, { local: true, since: isoDaysAgo(100), pointers: { 'jira/style.md': isoDaysAgo(1) } });
  const issues = checkTree(ws.root).issues.filter((i) => i.rule === 'policy/unused');
  assert.deepEqual(issues.map((i) => i.line), [3]);
  assert.ok(issues.every((i) => i.file === '.devocd/standards/index.md'));
});

test('policy unused: check leaves the hook records byte-identical', t => {
  const ws = unusedWorkspace(t, { since: isoDaysAgo(100), pointers: { 'jira/style.md': isoDaysAgo(120) } });
  const file = join(ws.root, '.devocd', 'journal', 'hook-stats.json');
  const before = readFileSync(file, 'utf8');
  checkTree(ws.root);
  assert.equal(readFileSync(file, 'utf8'), before);
});

test('policyUnusedDays is an optional company integer from 1 to 3650', () => {
  const state = (extra) => JSON.parse(companyState(extra));
  for (const bad of [0, 3651, 1.5, '90']) {
    assert.match(stateProblem(state({ policyUnusedDays: bad })), /policyUnusedDays must be an integer from 1 to 3650/, String(bad));
  }
  assert.equal(stateProblem(state({})), null);
  assert.equal(stateProblem(state({ policyUnusedDays: 30 })), null);
  assert.match(stateProblem(defaultProjectState({ policyUnusedDays: 30 })), /policyUnusedDays belongs in company state only/);
});
