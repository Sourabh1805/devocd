import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { onPrompt, onEdit, onSessionStart } from '../../plugin/scripts/devocd-hooks.mjs';
import { findScope, preference } from '../../plugin/scripts/lib/scope.mjs';
import { stateProblem } from '../../plugin/scripts/lib/check.mjs';
import { writeKnowledge } from '../../plugin/scripts/lib/knowledge.mjs';
import { baselineRefresh, clearStale } from '../../plugin/scripts/lib/refresh.mjs';

const plugin = fileURLToPath(new URL('../../plugin/', import.meta.url));
const script = join(plugin, 'scripts/devocd-hooks.mjs');
const companyState = extra => ({ version: 1, kind: 'company', name: 'Test', description: '', parentFile: 'CLAUDE.md', keyRules: [], projects: [{ id: 'api', path: 'api', description: '' }], sources: [], ...extra });
const projectState = extra => ({ version: 1, kind: 'project', id: 'api', companyRel: '..', teamFiles: [], approvedCommands: [], sources: [], ...extra });
const INDEX = '# Company standards\n\n- Create or edit a Jira ticket: [Jira style](jira-style.md).\n- Create or edit a PR title/body: [PR description](pr-description.md).\n- Deploy: [Deploys](deploy.md).\n';

function fixture(t, { company = {}, project = {}, index = INDEX } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'devocd-hooks-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.devocd/standards'), { recursive: true });
  writeFileSync(join(root, '.devocd/state.json'), JSON.stringify(companyState(company)));
  if (index !== null) writeFileSync(join(root, '.devocd/standards/index.md'), index);
  const proj = join(root, 'api');
  mkdirSync(join(proj, '.devocd'), { recursive: true });
  mkdirSync(join(proj, 'src'));
  writeFileSync(join(proj, '.devocd/state.json'), JSON.stringify(projectState(project)));
  return { root: resolve(root), proj: resolve(proj) };
}
const ctx = out => out?.hookSpecificOutput?.additionalContext;
const prompt = (cwd, text) => ({ hook_event_name: 'UserPromptSubmit', cwd, prompt: text });
const edit = (cwd, file, tool = 'Edit') => ({ hook_event_name: 'PostToolUse', cwd, tool_name: tool, tool_input: { file_path: file } });
const start = cwd => ({ hook_event_name: 'SessionStart', cwd, source: 'startup' });
const jsonl = p => readFileSync(p, 'utf8').trim().split('\n').map(l => JSON.parse(l));
const linkType = process.platform === 'win32' ? 'junction' : 'dir';

test('scope: findScope and preference inherit company values, project wins', t => {
  const { proj, root } = fixture(t, { company: { devocdHooks: false } });
  const scope = findScope(join(proj, 'src'));
  assert.equal(scope.root, realpathSync(proj)); // findScope returns the canonical path (macOS: /var -> /private/var)
  assert.equal(scope.company.root, realpathSync(root));
  assert.equal(preference(scope, 'devocdHooks', true), false);
  assert.equal(preference(scope, 'other', true), true);
  writeFileSync(join(proj, '.devocd/state.json'), JSON.stringify(projectState({ devocdHooks: true })));
  assert.equal(preference(findScope(proj), 'devocdHooks', false), true);
  assert.equal(findScope('relative'), null);
});

test('state validation: devocdHooks must be boolean when present', () => {
  assert.equal(stateProblem(companyState({ devocdHooks: false })), null);
  assert.equal(stateProblem(projectState({ devocdHooks: true })), null);
  assert.match(stateProblem(companyState({ devocdHooks: 'no' })), /devocdHooks/);
  assert.match(stateProblem(projectState({ devocdHooks: 1 })), /devocdHooks/);
});

test('prompt: matching task yields one pointer with a path relative to the session cwd', t => {
  const { proj } = fixture(t);
  const out = onPrompt(prompt(join(proj, 'src'), 'Please create a jira ticket for the login bug'));
  assert.equal(out.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  const text = ctx(out);
  assert.match(text, /^DevOCD policy for this request: /);
  assert.ok(text.includes('read ../../.devocd/standards/jira-style.md'), text);
  assert.ok(!text.includes('pr-description'));
  assert.equal(text.split('\n').length, 1);
});

test('prompt: stems, single-token triggers, and at most three matches', t => {
  const index = '- Deploy: [D](deploy.md).\n- Create Jira tickets: [J](j.md).\n- Write PR titles: [P](p.md).\n- Network ranges: [N](n.md).\n- Edit Jira ticket: [E](e.md).\n';
  const { root } = fixture(t, { index });
  const text = ctx(onPrompt(prompt(root, 'deploying: create jira ticket and write pr title, edit things, network ranges')));
  assert.equal((text.match(/→/g) ?? []).length, 3);
  assert.ok(text.includes('read .devocd/standards/deploy.md'));
});

test('prompt: unrelated, one-token overlap on a multi-token trigger, and missing index print nothing', t => {
  const { proj } = fixture(t);
  assert.equal(onPrompt(prompt(proj, 'refactor the cache layer')), null);
  assert.equal(onPrompt(prompt(proj, 'tell me about prices')), null);
  const none = fixture(t, { index: null });
  assert.equal(onPrompt(prompt(none.proj, 'create a jira ticket')), null);
});

test('prompt: index hardening rejects oversize, symlinks and escaping targets', t => {
  const bad = '- Create jira ticket: [A](/etc/passwd).\n- Create jira ticket: [B](https://x.io/a.md).\n- Create jira ticket: [C](../secret.md).\n- Create jira ticket: [D](sub/../../x.md).\n';
  const { proj } = fixture(t, { index: bad });
  assert.equal(onPrompt(prompt(proj, 'create jira ticket')), null);
  const big = fixture(t, { index: INDEX + '#'.repeat(70 * 1024) });
  assert.equal(onPrompt(prompt(big.proj, 'create a jira ticket')), null);
  const link = fixture(t, { index: null });
  writeFileSync(join(link.root, 'real.md'), INDEX);
  try { symlinkSync(join(link.root, 'real.md'), join(link.root, '.devocd/standards/index.md'), 'file'); }
  catch (e) { if (e.code === 'EPERM') return t.skip('symlink permission unavailable'); throw e; }
  assert.equal(onPrompt(prompt(link.proj, 'create a jira ticket')), null);
});

test('prompt: company opt-out silences, project override re-enables', t => {
  const { proj } = fixture(t, { company: { devocdHooks: false } });
  assert.equal(onPrompt(prompt(proj, 'create a jira ticket')), null);
  writeFileSync(join(proj, '.devocd/state.json'), JSON.stringify(projectState({ devocdHooks: true })));
  assert.ok(onPrompt(prompt(proj, 'create a jira ticket')));
  writeFileSync(join(proj, '.devocd/state.json'), JSON.stringify(projectState({ devocdHooks: false })));
  assert.equal(onPrompt(prompt(proj, 'create a jira ticket')), null);
});

test('edit: cited file is journaled and marks citing pages stale', t => {
  const { proj } = fixture(t);
  writeFileSync(join(proj, '.devocd/sources.json'), JSON.stringify({ 'src/a.js': ['code/z.md', 'code/b.md'] }));
  assert.equal(onEdit(edit(proj, join(proj, 'src', 'a.js'))), null);
  assert.deepEqual(jsonl(join(proj, '.devocd/journal/edits.jsonl')).map(e => e.path), ['src/a.js']);
  const stale = JSON.parse(readFileSync(join(proj, '.devocd/stale.json'), 'utf8'));
  assert.deepEqual(stale.pages, ['code/b.md', 'code/z.md']);
  assert.ok(!Number.isNaN(Date.parse(stale.since)));
  writeFileSync(join(proj, '.devocd/sources.json'), JSON.stringify({ 'src/a.js': ['code/z.md'], 'src/c.js': ['code/c.md'] }));
  onEdit(edit(proj, join(proj, 'src', 'c.js'), 'Write'));
  const again = JSON.parse(readFileSync(join(proj, '.devocd/stale.json'), 'utf8'));
  assert.deepEqual(again.pages, ['code/b.md', 'code/c.md', 'code/z.md']);
  assert.equal(again.since, stale.since);
});

test('edit: the edited file\'s own scope is used, not the session cwd', t => {
  const { proj, root } = fixture(t);
  writeFileSync(join(proj, '.devocd/sources.json'), JSON.stringify({ 'src/a.js': ['code/b.md'] }));
  onEdit(edit(root, join(proj, 'src', 'a.js')));
  assert.deepEqual(jsonl(join(proj, '.devocd/journal/edits.jsonl')).map(e => e.path), ['src/a.js']);
  assert.deepEqual(JSON.parse(readFileSync(join(proj, '.devocd/stale.json'), 'utf8')).pages, ['code/b.md']);
  assert.equal(existsSync(join(root, '.devocd/journal')), false);
});

test('edit: uncited file only appends the journal; notebook_path is accepted', t => {
  const { proj } = fixture(t);
  writeFileSync(join(proj, '.devocd/sources.json'), JSON.stringify({ 'src/a.js': ['code/b.md'] }));
  onEdit(edit(proj, join(proj, 'src', 'other.js')));
  onEdit({ hook_event_name: 'PostToolUse', cwd: proj, tool_name: 'NotebookEdit', tool_input: { notebook_path: join(proj, 'n.ipynb') } });
  assert.deepEqual(jsonl(join(proj, '.devocd/journal/edits.jsonl')).map(e => e.path), ['src/other.js', 'n.ipynb']);
  assert.equal(existsSync(join(proj, '.devocd/stale.json')), false);
});

test('edit: outside root, .devocd, .claude, .git, other tools and opt-out are ignored', t => {
  const { proj, root } = fixture(t);
  for (const f of [join(root, 'elsewhere.js'), join(proj, '.devocd/PROJECT.md'), join(proj, '.claude/settings.json'), join(proj, '.git/config')]) onEdit(edit(proj, f));
  onEdit({ ...edit(proj, join(proj, 'src/a.js')), tool_name: 'Bash' });
  assert.equal(existsSync(join(proj, '.devocd/journal')), false);
  writeFileSync(join(proj, '.devocd/state.json'), JSON.stringify(projectState({ devocdHooks: false })));
  onEdit(edit(proj, join(proj, 'src/a.js')));
  assert.equal(existsSync(join(proj, '.devocd/journal')), false);
});

test('edit: journal keeps the last 500 lines once past 1000', t => {
  const { proj } = fixture(t);
  mkdirSync(join(proj, '.devocd/journal'));
  const file = join(proj, '.devocd/journal/edits.jsonl');
  writeFileSync(file, Array.from({ length: 1000 }, (_, i) => JSON.stringify({ t: '2026-01-01T00:00:00.000Z', path: `f${i}` })).join('\n') + '\n');
  onEdit(edit(proj, join(proj, 'src/new1.js')));
  let lines = jsonl(file);
  assert.equal(lines.length, 500, 'the append that passes 1000 lines trims to the last 500');
  assert.equal(lines.at(-1).path, 'src/new1.js');
  assert.equal(lines[0].path, 'f501');
  onEdit(edit(proj, join(proj, 'src/new2.js')));
  lines = jsonl(file);
  assert.equal(lines.length, 501);
  assert.equal(lines.at(-1).path, 'src/new2.js');
});

test('edit: symlinked .devocd or journal is refused', t => {
  const { proj, root } = fixture(t);
  const outside = join(root, 'outside');
  mkdirSync(outside);
  try { symlinkSync(outside, join(proj, '.devocd/journal'), linkType); }
  catch (e) { if (e.code === 'EPERM') return t.skip('symlink permission unavailable'); throw e; }
  onEdit(edit(proj, join(proj, 'src/a.js')));
  assert.equal(existsSync(join(outside, 'edits.jsonl')), false);
  const second = fixture(t);
  const real = join(second.root, 'real-devocd');
  mkdirSync(real);
  writeFileSync(join(real, 'state.json'), JSON.stringify(projectState()));
  rmSync(join(second.proj, '.devocd'), { recursive: true });
  symlinkSync(real, join(second.proj, '.devocd'), linkType);
  onEdit(edit(second.proj, join(second.proj, 'src/a.js')));
  assert.equal(existsSync(join(real, 'journal')), false);
});

test('session start: one line when stale pages exist, nothing otherwise', t => {
  const { proj } = fixture(t);
  assert.equal(onSessionStart(start(proj)), null);
  writeFileSync(join(proj, '.devocd/stale.json'), JSON.stringify({ pages: [], since: 'x' }));
  assert.equal(onSessionStart(start(proj)), null);
  writeFileSync(join(proj, '.devocd/stale.json'), JSON.stringify({ pages: ['code/a.md', 'code/b.md'], since: 'x' }));
  const out = onSessionStart(start(proj));
  assert.equal(out.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.equal(ctx(out), 'DevOCD: 2 knowledge page(s) may be stale after source edits (e.g. code/a.md). Verify against source; /devocd:refresh updates them.');
  writeFileSync(join(proj, '.devocd/stale.json'), '{');
  assert.equal(onSessionStart(start(proj)), null);
});

function knowledgeProject(t) {
  const { proj } = fixture(t);
  const hash = 'a'.repeat(64);
  mkdirSync(join(proj, '.devocd/code'), { recursive: true });
  writeFileSync(join(proj, '.devocd/PROJECT.md'), '# API\n');
  writeFileSync(join(proj, '.devocd/pointer.md'), 'Start with PROJECT.md');
  writeFileSync(join(proj, '.devocd/code/a.md'), `# A\n## Evidence\n- src/a.js#L1 sha256:${hash} 2026-01-01\n`);
  writeFileSync(join(proj, 'CLAUDE.local.md'), '<!-- devocd:begin -->\nStart with PROJECT.md\n<!-- devocd:end -->\n');
  writeFileSync(join(proj, 'src/a.js'), 'export const a = 1;\n');
  return proj;
}

test('writeKnowledge writes sources.json for projects; refresh baseline clears stale.json', t => {
  const proj = knowledgeProject(t);
  writeKnowledge(proj);
  assert.deepEqual(JSON.parse(readFileSync(join(proj, '.devocd/sources.json'), 'utf8')), { 'src/a.js': ['code/a.md'] });
  writeFileSync(join(proj, '.devocd/stale.json'), JSON.stringify({ pages: ['code/a.md'], since: 'x' }));
  const r = baselineRefresh(proj);
  assert.equal(r.current, true, JSON.stringify(r));
  assert.equal(existsSync(join(proj, '.devocd/stale.json')), false);
});

test('company knowledge build writes no sources.json', t => {
  const { root } = fixture(t);
  writeFileSync(join(root, '.devocd/COMPANY.md'), '# Co\n');
  writeKnowledge(root);
  assert.equal(existsSync(join(root, '.devocd/sources.json')), false);
});

test('hooks.json registers all four hooks', () => {
  const config = JSON.parse(readFileSync(join(plugin, 'hooks/hooks.json'), 'utf8'));
  assert.deepEqual(Object.keys(config.hooks), ['Stop', 'UserPromptSubmit', 'PostToolUse', 'SessionStart']);
  for (const ev of ['UserPromptSubmit', 'PostToolUse', 'SessionStart']) {
    const h = config.hooks[ev][0].hooks[0];
    assert.equal(h.command, 'node "${CLAUDE_PLUGIN_ROOT}/scripts/devocd-hooks.mjs"');
    assert.equal(h.timeout, 5);
  }
  assert.equal(config.hooks.PostToolUse[0].matcher, 'Write|Edit|MultiEdit|NotebookEdit');
});

test('stdin protocol for each event never echoes the prompt; malformed input is silent', t => {
  const { proj } = fixture(t);
  writeFileSync(join(proj, '.devocd/stale.json'), JSON.stringify({ pages: ['code/a.md'], since: 'x' }));
  const run = input => spawnSync(process.execPath, [script], { input, encoding: 'utf8' });
  const p = run(JSON.stringify(prompt(proj, 'create a jira ticket PRIVATE_SENTINEL')));
  assert.equal(p.status, 0);
  assert.match(JSON.parse(p.stdout).hookSpecificOutput.additionalContext, /jira-style\.md/);
  assert.ok(!p.stdout.includes('PRIVATE_SENTINEL'));
  const s = run(JSON.stringify(start(proj)));
  assert.equal(JSON.parse(s.stdout).hookSpecificOutput.hookEventName, 'SessionStart');
  const e = run(JSON.stringify(edit(proj, join(proj, 'src/a.js'))));
  assert.equal(e.status, 0);
  assert.equal(e.stdout, '');
  assert.ok(existsSync(join(proj, '.devocd/journal/edits.jsonl')));
  for (const bad of ['{', 'x'.repeat(300000), 'null', JSON.stringify({ hook_event_name: 'Other', cwd: proj }), JSON.stringify(prompt('rel', 'create a jira ticket'))]) {
    const r = run(bad);
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  }
});

test('performance: each handler averages under 50 ms', t => {
  const { proj } = fixture(t);
  writeFileSync(join(proj, '.devocd/sources.json'), JSON.stringify({ 'src/a.js': ['code/b.md'] }));
  writeFileSync(join(proj, '.devocd/stale.json'), JSON.stringify({ pages: ['code/b.md'], since: 'x' }));
  const cases = { prompt: () => onPrompt(prompt(proj, 'create a jira ticket')), edit: () => onEdit(edit(proj, join(proj, 'src/a.js'))), start: () => onSessionStart(start(proj)) };
  for (const [name, fn] of Object.entries(cases)) {
    fn();
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < 20; i++) fn();
    const avg = Number(process.hrtime.bigint() - t0) / 20 / 1e6;
    console.log(`# ${name} average ${avg.toFixed(2)} ms`);
    assert.ok(avg < 50, `${name} averaged ${avg} ms`);
  }
});

test('prompt: generic verbs never match alone; specific tokens decide', t => {
  const { proj } = fixture(t);
  const jira = 'jira-style.md', pr = 'pr-description.md';
  const a = ctx(onPrompt(prompt(proj, 'create a jira ticket for the login bug')));
  assert.ok(a.includes(jira) && !a.includes(pr), a);
  assert.equal(onPrompt(prompt(proj, 'edit the create-user handler')), null);
  const b = ctx(onPrompt(prompt(proj, 'update the PR title')));
  assert.ok(b.includes(pr) && !b.includes(jira), b);
  const c = ctx(onPrompt(prompt(proj, 'file a jira for the outage')));
  assert.ok(c.includes(jira), c);
});

test('clearStale keeps marks for edits journaled after t0 and clears earlier ones', t => {
  const proj = knowledgeProject(t);
  writeFileSync(join(proj, '.devocd/sources.json'), JSON.stringify({ 'src/a.js': ['code/a.md'], 'src/b.js': ['code/b.md'] }));
  mkdirSync(join(proj, '.devocd/journal'), { recursive: true });
  writeFileSync(join(proj, '.devocd/journal/edits.jsonl'),
    [{ t: '2020-01-01T00:00:00.000Z', path: 'src/a.js' }, { t: '2020-01-01T00:00:02.000Z', path: 'src/b.js' }].map(e => JSON.stringify(e)).join('\n') + '\n');
  writeFileSync(join(proj, '.devocd/stale.json'), JSON.stringify({ pages: ['code/a.md', 'code/b.md'], since: '2020-01-01T00:00:00.000Z' }));
  clearStale(proj, '2020-01-01T00:00:01.000Z');
  assert.deepEqual(JSON.parse(readFileSync(join(proj, '.devocd/stale.json'), 'utf8')).pages, ['code/b.md']);
  clearStale(proj, '2021-01-01T00:00:00.000Z');
  assert.equal(existsSync(join(proj, '.devocd/stale.json')), false);
});

test('refresh refuses a symlinked stale.json before writing refresh.json', t => {
  const proj = knowledgeProject(t);
  writeKnowledge(proj);
  const outside = mkdtempSync(join(tmpdir(), 'devocd-out-'));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  writeFileSync(join(outside, 's.json'), '{}');
  try { symlinkSync(join(outside, 's.json'), join(proj, '.devocd/stale.json'), 'file'); }
  catch (e) { if (e.code === 'EPERM') return t.skip('symlink permission unavailable'); throw e; }
  // NOT_REGULAR is the repo-wide refusal code for a link or non-regular target (assertSafeTarget).
  assert.throws(() => baselineRefresh(proj), { code: 'NOT_REGULAR' });
  assert.equal(existsSync(join(proj, '.devocd/refresh.json')), false);
  assert.equal(readFileSync(join(outside, 's.json'), 'utf8'), '{}');
});
