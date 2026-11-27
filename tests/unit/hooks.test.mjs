import { workspace, companyState as defaultCompanyState, projectState, gitRepo } from '../helpers/workspace.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, symlinkSync, existsSync, realpathSync, utimesSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { makeTree } from '../helpers/tree.mjs';
import { toPosix } from '../../scripts/lib/fsutil.mjs';
import { onPrompt, onEdit, onSessionStart } from '../../scripts/devocd-hooks.mjs';
import { findScope, preference } from '../../scripts/lib/scope.mjs';
import { stateProblem } from '../../scripts/lib/check.mjs';
import { writeKnowledge } from '../../scripts/lib/knowledge.mjs';
import { baselineRefresh, clearStale } from '../../scripts/lib/refresh.mjs';

const plugin = fileURLToPath(new URL('../../', import.meta.url));
const script = join(plugin, 'scripts/devocd-hooks.mjs');
const companyState = extra => defaultCompanyState({ projects: [{ id: 'api', path: 'api', description: '' }], ...extra });
const INDEX = '# Company standards\n\n- Create or edit a Jira ticket: [Jira style](jira-style.md).\n- Create or edit a PR title/body: [PR description](pr-description.md).\n- Deploy: [Deploys](deploy.md).\n';

function fixture(t, { company = {}, project = {}, index = INDEX } = {}) {
  const w = workspace(t, { company: {
    files: { '.devocd/state.json': JSON.stringify(companyState(company)) },
    standards: index === null ? {} : { 'index.md': index, 'jira-style.md': '# Jira\n', 'pr-description.md': '# PR\n', 'deploy.md': '# Deploy\n' },
  }, projects: { api: { state: project } } });
  const root = w.root;
  mkdirSync(join(root, '.devocd/standards'), { recursive: true });
  const proj = w.project('api');
  mkdirSync(join(proj, 'src'));
  return { root: resolve(root), proj: resolve(proj) };
}
const ctx = out => out?.hookSpecificOutput?.additionalContext;
const prompt = (cwd, text) => ({ hook_event_name: 'UserPromptSubmit', cwd, prompt: text });
const edit = (cwd, file, tool = 'Edit') => ({ hook_event_name: 'PostToolUse', cwd, tool_name: tool, tool_input: { file_path: file } });
const start = cwd => ({ hook_event_name: 'SessionStart', cwd, source: 'startup' });
const jsonl = p => readFileSync(p, 'utf8').trim().split('\n').map(l => JSON.parse(l));
const linkType = process.platform === 'win32' ? 'junction' : 'dir';

const POLICY_ORIGIN = 'https://example.com/acme/policy';
const POLICY_INDEX = '- Create or edit a PR title/body: [PR description](pr/description.md).\n- Create or edit a Jira ticket: [Jira style](jira/style.md).\n';

/** A project governed by a real policy-repo clone. `local` also writes the standards fallback. */
function repoFixture(t, { index = POLICY_INDEX, local = false } = {}) {
  const base = workspace(t).root;
  const clone = gitRepo(join(base, 'clone'), { origin: POLICY_ORIGIN });
  makeTree(clone, { 'index.md': index, 'jira/style.md': '# Jira\n', 'pr/description.md': '# PR\n' });
  const w = workspace(t, {
    company: {
      files: { '.devocd/state.json': JSON.stringify(companyState({ policyRepo: { path: toPosix(clone), remote: POLICY_ORIGIN, index: 'index.md', builtAt: null } })) },
      standards: local ? { 'index.md': INDEX, 'jira-style.md': '# Jira\n', 'pr-description.md': '# PR\n', 'deploy.md': '# Deploy\n' } : {},
    },
    projects: { api: {} },
  });
  const proj = resolve(w.project('api'));
  mkdirSync(join(proj, 'src'));
  return { clone: toPosix(clone), proj, cwd: join(proj, 'src') };
}

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
  const { root, proj } = fixture(t, { index });
  for (const name of ['j.md', 'p.md', 'n.md', 'e.md']) writeFileSync(join(root, '.devocd', 'standards', name), `# ${name}\n`);
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

const run = (/** @type {string} */ input) => spawnSync(process.execPath, [script], { input, encoding: 'utf8' });

test('a 5 MiB Write of a mapped source is tracked from either field order, in under 2 s', t => {
  // Wall-clock under instrumentation says nothing, and the coverage tool instruments every child.
  if (process.env.NODE_V8_COVERAGE) return t.skip('timing is meaningless under coverage');
  const { proj } = fixture(t);
  writeFileSync(join(proj, '.devocd/sources.json'), JSON.stringify({ 'src/big.js': ['code/big.md'] }));
  const file = join(proj, 'src/big.js');
  const content = 'x'.repeat(5 * 1024 * 1024);
  for (const order of ['before', 'after']) {
    rmSync(join(proj, '.devocd/stale.json'), { force: true });
    rmSync(join(proj, '.devocd/journal'), { recursive: true, force: true });
    const tool_input = order === 'before' ? { file_path: file, content } : { content, file_path: file };
    // The shape Claude Code sends: a tool_response with counts, literals and an empty patch list.
    const tool_response = { type: 'create', filePath: file, content, structuredPatch: [], numLines: 1, ok: true, warn: null };
    const input = JSON.stringify({ session_id: 's1', hook_event_name: 'PostToolUse', cwd: proj, tool_name: 'Write', tool_input, tool_response });
    const started = Date.now();
    const r = run(input);
    const elapsed = Date.now() - started;
    assert.equal(r.status, 0, r.stderr);
    assert.ok(elapsed < 2000, `${order}: ${elapsed} ms`);
    assert.deepEqual(JSON.parse(readFileSync(join(proj, '.devocd/stale.json'), 'utf8')).pages, ['code/big.md']);
    assert.deepEqual(jsonl(join(proj, '.devocd/journal/edits.jsonl')).map(e => e.path), ['src/big.js']);
    assert.ok(!existsSync(join(proj, '.devocd/journal/untracked.json')), `${order}: a tracked edit is not also untracked`);
  }
});

test('a cut-off edit input leaves a notice the next session shows', t => {
  const { proj } = fixture(t);
  // The path never arrives: the input stops inside the file body.
  const broken = `{"hook_event_name":"PostToolUse","cwd":${JSON.stringify(proj)},"tool_name":"Write","tool_input":{"content":"${'x'.repeat(2000)}`;
  assert.equal(run(broken).stdout, '');
  const notice = JSON.parse(readFileSync(join(proj, '.devocd/journal/untracked.json'), 'utf8'));
  assert.equal(notice.count, 1);
  assert.match(notice.since, /^\d{4}-\d{2}-\d{2}T/);
  const text = ctx(JSON.parse(run(JSON.stringify(start(proj))).stdout));
  assert.match(text, /1 edit\(s\) could not be tracked; run \/devocd:refresh/);
});

test('a complete edit with no usable path leaves the same notice; a cut-off prompt leaves none', t => {
  const { proj } = fixture(t);
  for (const tool_input of [{ content: 'x' }, { file_path: 'relative.js' }, { file_path: 42 }]) {
    run(JSON.stringify({ hook_event_name: 'PostToolUse', cwd: proj, tool_name: 'Write', tool_input }));
  }
  assert.equal(JSON.parse(readFileSync(join(proj, '.devocd/journal/untracked.json'), 'utf8')).count, 3);
  rmSync(join(proj, '.devocd/journal/untracked.json'));
  const brokenPrompt = `{"hook_event_name":"UserPromptSubmit","cwd":${JSON.stringify(proj)},"prompt":"${'a'.repeat(2000)}`;
  run(brokenPrompt);
  assert.ok(!existsSync(join(proj, '.devocd/journal/untracked.json')), 'a prompt is not an edit');
});


const withSession = (cwd, text, session_id) => ({ ...prompt(cwd, text), session_id });

test('a pointer is given once per session, and a new session gets it again', t => {
  const { proj } = fixture(t);
  const cwd = join(proj, 'src');
  const first = onPrompt(withSession(cwd, 'create a jira ticket for the login bug', 's1'));
  assert.match(ctx(first), /jira-style\.md/);
  assert.equal(onPrompt(withSession(cwd, 'create a jira ticket for the login bug', 's1')), null);
  assert.match(ctx(onPrompt(withSession(cwd, 'create a jira ticket for the login bug', 's2'))), /jira-style\.md/);
});

test('a prompt matching one given and one new topic adds only the new pointer', t => {
  const { proj } = fixture(t);
  const cwd = join(proj, 'src');
  assert.match(ctx(onPrompt(withSession(cwd, 'create a jira ticket for the login bug', 's1'))), /jira-style/);
  const second = onPrompt(withSession(cwd, 'create a jira ticket and a PR title for it', 's1'));
  assert.match(ctx(second), /pr-description/);
  assert.doesNotMatch(ctx(second), /jira-style/);
});

test('an unusable session id remembers nothing and writes no file', t => {
  const { proj } = fixture(t);
  const cwd = join(proj, 'src');
  const journal = join(proj, '.devocd/journal');
  for (const bad of [undefined, '../x', 'a/b', 'x'.repeat(129), '']) {
    assert.match(ctx(onPrompt(withSession(cwd, 'create a jira ticket', bad))), /jira-style/, String(bad));
    assert.match(ctx(onPrompt(withSession(cwd, 'create a jira ticket', bad))), /jira-style/, String(bad));
  }
  const sessions = existsSync(journal) ? readdirSync(journal).filter(n => n.startsWith('session-')) : [];
  assert.deepEqual(sessions, []);
  assert.deepEqual(readdirSync(cwd), [], 'nothing written beside the journal');
});

test('a slash command gets no pointer, and still counts as a run', t => {
  const { proj } = fixture(t);
  const cwd = join(proj, 'src');
  assert.equal(onPrompt(withSession(cwd, '/devocd:refresh jira ticket', 's1')), null);
  assert.equal(onPrompt(withSession(cwd, '   /devocd:refresh jira ticket', 's1')), null);
  const stats = JSON.parse(readFileSync(join(proj, '.devocd/journal/hook-stats.json'), 'utf8'));
  assert.equal(stats.events.UserPromptSubmit.runs, 2);
  assert.equal(stats.events.UserPromptSubmit.injected, 0);
});

test('a linked session file or a linked journal folder is never written through', t => {
  const { proj } = fixture(t);
  const cwd = join(proj, 'src');
  const journal = join(proj, '.devocd/journal');
  mkdirSync(journal, { recursive: true });
  const outside = join(proj, 'outside');
  mkdirSync(outside);
  try { symlinkSync(join(outside, 'session-s1.json'), join(journal, 'session-s1.json'), 'file'); }
  catch (e) { if (e.code === 'EPERM') return t.skip('symlinks unavailable'); throw e; }
  assert.match(ctx(onPrompt(withSession(cwd, 'create a jira ticket', 's1'))), /jira-style/);
  assert.match(ctx(onPrompt(withSession(cwd, 'create a jira ticket', 's1'))), /jira-style/, 'nothing remembered through a link');
  assert.ok(!existsSync(join(outside, 'session-s1.json')));
  rmSync(journal, { recursive: true, force: true });
  symlinkSync(outside, journal, process.platform === 'win32' ? 'junction' : 'dir');
  assert.match(ctx(onPrompt(withSession(cwd, 'create a jira ticket', 's2'))), /jira-style/);
  assert.deepEqual(readdirSync(outside), []);
});

test('the counters record runs, injected and bytes; bytes match the text returned', t => {
  const { proj } = fixture(t);
  const cwd = join(proj, 'src');
  const out = onPrompt(withSession(cwd, 'create a jira ticket for the login bug', 'c1'));
  onPrompt(withSession(cwd, 'create a jira ticket for the login bug', 'c1'));
  const started = onSessionStart(start(cwd));
  const stats = JSON.parse(readFileSync(join(proj, '.devocd/journal/hook-stats.json'), 'utf8'));
  assert.equal(stats.events.UserPromptSubmit.runs, 2);
  assert.equal(stats.events.UserPromptSubmit.injected, 1);
  assert.equal(stats.events.UserPromptSubmit.bytes, Buffer.byteLength(ctx(out)));
  assert.equal(stats.events.SessionStart.runs, 1);
  assert.equal(stats.events.SessionStart.bytes, started ? Buffer.byteLength(ctx(started)) : 0);
  assert.match(stats.since, /^\d{4}-\d{2}-\d{2}T/);
});

test('session start drops a session file older than a week and keeps a recent one', t => {
  const { proj } = fixture(t);
  const journal = join(proj, '.devocd/journal');
  mkdirSync(journal, { recursive: true });
  const oldFile = join(journal, 'session-old.json');
  const newFile = join(journal, 'session-new.json');
  writeFileSync(oldFile, '{"given":[]}\n');
  writeFileSync(newFile, '{"given":[]}\n');
  const day = 24 * 60 * 60 * 1000;
  utimesSync(oldFile, new Date(Date.now() - 8 * day), new Date(Date.now() - 8 * day));
  utimesSync(newFile, new Date(Date.now() - 6 * day), new Date(Date.now() - 6 * day));
  onSessionStart(start(join(proj, 'src')));
  assert.ok(!existsSync(oldFile), 'eight days old: removed');
  assert.ok(existsSync(newFile), 'six days old: kept');
});

test('performance: each handler averages under 50 ms', t => {
  // A wall-clock budget says nothing when every process is instrumented, and the coverage tool
  // sets this for the whole run. The test decides for itself instead of being skipped by name.
  if (process.env.NODE_V8_COVERAGE) return t.skip('timing is meaningless under coverage');
  const { proj } = fixture(t);
  writeFileSync(join(proj, '.devocd/sources.json'), JSON.stringify({ 'src/a.js': ['code/b.md'] }));
  writeFileSync(join(proj, '.devocd/stale.json'), JSON.stringify({ pages: ['code/b.md'], since: 'x' }));
  const cases = { prompt: () => onPrompt(prompt(proj, 'create a jira ticket')), edit: () => onEdit(edit(proj, join(proj, 'src/a.js'))), start: () => onSessionStart(start(proj)) };
  const repo = repoFixture(t);
  cases['prompt-repo'] = () => onPrompt(prompt(join(repo.proj, 'src'), 'create a jira ticket'));
  for (const [name, fn] of Object.entries(cases)) {
    fn();
    // The median of 21 runs: one collection pause or scheduler stall moves the mean, not the middle.
    const times = [];
    for (let i = 0; i < 21; i++) {
      const t0 = process.hrtime.bigint();
      fn();
      times.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
    times.sort((a, b) => a - b);
    const median = times[times.length >> 1];
    const slowest = times[times.length - 1];
    console.log(`# ${name} median ${median.toFixed(2)} ms, slowest ${slowest.toFixed(2)} ms`);
    assert.ok(median < 50, `${name} median ${median.toFixed(2)} ms, slowest ${slowest.toFixed(2)} ms`);
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
  const outside = workspace(t).root;
  writeFileSync(join(outside, 's.json'), '{}');
  try { symlinkSync(join(outside, 's.json'), join(proj, '.devocd/stale.json'), 'file'); }
  catch (e) { if (e.code === 'EPERM') return t.skip('symlink permission unavailable'); throw e; }
  // NOT_REGULAR is the repo-wide refusal code for a link or non-regular target (assertSafeTarget).
  assert.throws(() => baselineRefresh(proj), { code: 'NOT_REGULAR' });
  assert.equal(existsSync(join(proj, '.devocd/refresh.json')), false);
  assert.equal(readFileSync(join(outside, 's.json'), 'utf8'), '{}');
});

// --- T110: the prompt hook reads the policy repo's index ---

const REPO_CASES = /** @type {const} */ ([
  { name: 'repo mode gives a pointer into the clone', index: POLICY_INDEX, prompt: 'create a jira ticket', want: 'pointer' },
  { name: 'a target outside the clone gives no pointer', index: '- Bad: [Out](../outside.md).\n', prompt: 'bad', want: 'none' },
  { name: 'a missing target gives no pointer', index: '- Missing: [Gone](gone.md).\n', prompt: 'missing', want: 'none' },
]);

for (const c of REPO_CASES) {
  test(`prompt policy repo: ${c.name}`, t => {
    const { proj, cwd, clone } = repoFixture(t, { index: c.index });
    const out = onPrompt(prompt(cwd, c.prompt));
    if (c.want === 'none') {
      assert.equal(out, null);
      return;
    }
    assert.match(ctx(out), /^DevOCD policy for this request: /);
    assert.ok(ctx(out).includes(`read ${toPosix(relative(cwd, join(clone, 'jira/style.md')))}`), ctx(out));
  });
}

test('prompt policy repo: a repo whose path is gone falls back to local standards', t => {
  const { cwd, clone } = repoFixture(t, { local: true });
  rmSync(clone, { recursive: true, force: true });
  const text = ctx(onPrompt(prompt(cwd, 'create a jira ticket')));
  assert.ok(text.includes('read ../../.devocd/standards/jira-style.md'), text);
});

test('prompt policy repo: a pointer is given once per session in repo mode too', t => {
  const { cwd } = repoFixture(t);
  assert.match(ctx(onPrompt(withSession(cwd, 'create a jira ticket', 'r1'))), /jira\/style\.md/);
  assert.equal(onPrompt(withSession(cwd, 'create a jira ticket', 'r1')), null);
  assert.match(ctx(onPrompt(withSession(cwd, 'create a jira ticket', 'r2'))), /jira\/style\.md/);
});

test('session start: a missing clone is said once; an existing clone says nothing', t => {
  const { proj, clone } = repoFixture(t);
  assert.equal(onSessionStart(start(proj)), null);
  rmSync(clone, { recursive: true, force: true });
  const text = ctx(onSessionStart(start(proj)));
  assert.match(text, /company policy repo not found at .+; run \/devocd:setup\./);
});

test('hook-stats records the pointers it gave and keeps the newest 500', t => {
  const { proj, cwd } = repoFixture(t);
  assert.ok(onPrompt(withSession(cwd, 'create a jira ticket', 's1')));
  const statsPath = join(proj, '.devocd', 'journal', 'hook-stats.json');
  const stats = JSON.parse(readFileSync(statsPath, 'utf8'));
  assert.match(stats.pointers['jira/style.md'], /^\d{4}-\d{2}-\d{2}T/);

  /** @type {Record<string, string>} */
  const seeded = {};
  for (let i = 0; i < 500; i++) seeded[`old/${i}.md`] = `2026-01-01T00:00:${String(i % 60).padStart(2, '0')}.000Z`;
  writeFileSync(statsPath, JSON.stringify({ ...stats, pointers: seeded }));
  assert.ok(onPrompt(withSession(cwd, 'create or edit a pr title', 's2')));
  const after = JSON.parse(readFileSync(statsPath, 'utf8'));
  assert.equal(Object.keys(after.pointers).length, 500, 'capped');
  assert.ok(!Object.hasOwn(after.pointers, 'old/0.md'), 'the oldest is dropped');
  assert.ok(Object.hasOwn(after.pointers, 'pr/description.md'), 'the new pointer is kept');
});
