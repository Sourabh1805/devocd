// @ts-check
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkTree, maskCode } from '../../scripts/lib/check.mjs';
import { makeTree } from '../helpers/tree.mjs';
import { workspace, companyState as defaultCompanyState, projectState as defaultProjectState } from '../helpers/workspace.mjs';

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
    '.devocd/standards/index.md': '- [Security](security.md): access rules\n',
  });
  assert.ok(!rules(checkTree(d, {}).issues).includes('standards/index-missing'));
  const only = company({ '.devocd/standards/index.md': '- nothing yet\n' });
  assert.ok(!rules(checkTree(only, {}).issues).includes('standards/index-missing'));
});
