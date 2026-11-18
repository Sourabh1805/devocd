import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { applyDraft, registerProject } from '../../scripts/lib/parent.mjs';
import { stateProblem } from '../../scripts/lib/check.mjs';
import { captureCheckpoint } from '../../scripts/capture-hook.mjs';

const plugin = fileURLToPath(new URL('../../', import.meta.url));
const read = p => readFileSync(join(plugin, p), 'utf8');
const companyState = extra => ({ version: 1, kind: 'company', name: 'Test', description: '', parentFile: 'CLAUDE.md', keyRules: [], projects: [], sources: [], ...extra });
const projectState = extra => ({ version: 1, kind: 'project', id: 'api', companyRel: '..', teamFiles: [], approvedCommands: [], sources: [], ...extra });
function fixture(t, state = companyState({ decisionCapture: true })) {
  const root = mkdtempSync(join(tmpdir(), 'devocd-capture-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.devocd'));
  writeFileSync(join(root, '.devocd/state.json'), JSON.stringify(state));
  return root;
}
const event = cwd => ({ cwd, hook_event_name: 'Stop', stop_hook_active: false });

test('host cwd aliases resolve without weakening knowledge link checks', t => {
  const root = fixture(t);
  const container = fixture(t);
  const alias = join(container, 'scope-alias');
  try { symlinkSync(root, alias, process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (error.code === 'EPERM') return t.skip('symlink permission unavailable'); throw error; }
  assert.deepEqual(captureCheckpoint(event(alias)), captureCheckpoint(event(root)));
  assert.ok(captureCheckpoint(event(alias)));
  assert.equal(captureCheckpoint(event(join(root, '.devocd/state.json'))), null);
});

test('checkpoint finds nearest company from nested cwd without writes', t => {
  const root = fixture(t);
  mkdirSync(join(root, 'src'));
  const result = captureCheckpoint(event(join(root, 'src')));
  assert.equal(result.hookSpecificOutput.hookEventName, 'Stop');
  assert.match(result.hookSpecificOutput.additionalContext, /devocd:capture/);
  assert.deepEqual(readdirSync(join(root, '.devocd')), ['state.json']);
});

test('checkpoint is quiet for reentry, malformed input, non-Stop events and opt out', t => {
  const root = fixture(t);
  for (const input of [null, {}, event('.'), { ...event(root), stop_hook_active: true },
    { ...event(root), hook_event_name: 'SubagentStop' }, { ...event(root), stop_hook_active: undefined }]) {
    assert.equal(captureCheckpoint(input), null);
  }
  writeFileSync(join(root, '.devocd/state.json'), '{');
  assert.equal(captureCheckpoint(event(root)), null);
  writeFileSync(join(root, '.devocd/state.json'), JSON.stringify({ kind: 'project', decisionCapture: false }));
  assert.equal(captureCheckpoint(event(root)), null);
});

test('uninstalled scopes and oversized state are quiet', t => {
  const root = fixture(t);
  writeFileSync(join(root, '.devocd/state.json'), ' '.repeat(65537));
  assert.equal(captureCheckpoint(event(root)), null);
  rmSync(join(root, '.devocd'), { recursive: true });
  assert.equal(captureCheckpoint(event(root)), null);
});

test('linked knowledge directories are not read', t => {
  const root = fixture(t);
  const outside = fixture(t);
  rmSync(join(root, '.devocd'), { recursive: true });
  try { symlinkSync(join(outside, '.devocd'), join(root, '.devocd'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (error.code === 'EPERM') return t.skip('symlink permission unavailable'); throw error; }
  assert.equal(captureCheckpoint(event(root)), null);
});

test('installed hook executes stdin protocol and never echoes input content', t => {
  const root = fixture(t);
  const config = JSON.parse(read('hooks/hooks.json'));
  assert.deepEqual(Object.keys(config.hooks), ['Stop', 'UserPromptSubmit', 'PostToolUse', 'SessionStart']);
  assert.equal(config.hooks.Stop[0].hooks[0].command, 'node "${CLAUDE_PLUGIN_ROOT}/scripts/capture-hook.mjs"');
  for (const input of ['{', 'x'.repeat(300000), JSON.stringify({ ...event(root), last_assistant_message: 'PRIVATE_SENTINEL' })]) {
    const run = spawnSync(process.execPath, [join(plugin, 'scripts/capture-hook.mjs')], { input, encoding: 'utf8' });
    assert.equal(run.status, 0);
    assert.equal(run.stderr, '');
    assert.doesNotMatch(run.stdout, /PRIVATE_SENTINEL/);
    if (input.startsWith('{"')) assert.equal(JSON.parse(run.stdout).hookSpecificOutput.hookEventName, 'Stop');
    else assert.equal(run.stdout, '');
  }
});

test('capture contracts constrain delegation, approval, durable history and refresh', () => {
  const agent = read('agents/decision-keeper.md');
  assert.match(agent, /tools: Read, Glob, Grep/);
  assert.match(agent, /20 relevant files/);
  const skill = read('skills/capture/SKILL.md');
  assert.doesNotMatch(skill, /^  - (Write|Edit|Bash)/m);
  const workflow = read('skills/capture/references/workflow.md');
  for (const contract of [/Silence, rejection/, /Concurrent changes require/, /history record\n   first/,
    /including removed text/, /Old entries remain intact/, /Never mark a refresh baseline current/,
    /refuse symlinks/, /Never\n   overwrite an existing history record/]) assert.match(workflow, contract);
  assert.match(read('skills/refresh/SKILL.md'), /Preserve decisions.md and decision-history\/ unchanged/);
  assert.match(read('skills/add-project/references/knowledge-contract.md'), /Never replace or delete/);
  assert.match(read('scripts/lib/integrations.mjs'), /## Decision capture/);
  assert.doesNotMatch(read('scripts/lib/parent.mjs'), /devocd:capture/, 'T15: capture is routed by the project pointer and hooks, not the parent');
  assert.match(read('skills/add-project/references/project-template.md'), /devocd:capture/);
});

function installed(t, companyPreference, projectPreference) {
  const root = fixture(t, companyState());
  const draft = join(root, 'install.draft.json');
  const state = companyState();
  if (companyPreference !== undefined) state.decisionCapture = companyPreference;
  writeFileSync(draft, JSON.stringify(state));
  const install = spawnSync(process.execPath, [join(plugin, 'scripts/devocd.mjs'), 'render-parent', root, draft], { encoding: 'utf8' });
  assert.equal(install.status, 0, install.stderr);
  const project = join(root, 'api');
  mkdirSync(join(project, '.devocd'), { recursive: true });
  const ps = projectState();
  if (projectPreference !== undefined) ps.decisionCapture = projectPreference;
  writeFileSync(join(project, '.devocd/state.json'), JSON.stringify(ps));
  registerProject(root, { id: 'api', path: 'api', description: '' });
  return { root, project };
}
function runHook(cwd, script = join(plugin, 'scripts/capture-hook.mjs'), overrides = {}) {
  const run = spawnSync(process.execPath, [script], { input: JSON.stringify({ ...event(cwd), ...overrides }), encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stderr, '');
  return run.stdout;
}
test('installed default workspace: ten ordinary Stop events produce zero continuation output', t => {
  const { project } = installed(t);
  for (let i = 0; i < 10; i++) assert.equal(runHook(project), '');
});
test('registered scope tri-state matrix through CLI', t => {
  for (const company of [undefined, false, true]) {
    for (const projectPref of [undefined, false, true]) {
      const { project } = installed(t, company, projectPref);
      assert.equal(Boolean(runHook(project)), (projectPref ?? company ?? false));
      assert.equal(runHook(project, undefined, { stop_hook_active: true }), '');
    }
  }
});
test('invalid state and broken registration cannot enable or fall through', t => {
  for (const patch of [{ decisionCapture: 'true' }, { decisionCapture: null }, { companyRel: '../missing' }, { companyRel: '.' }, { id: 'unknown' }, { version: 2 }]) {
    const { project } = installed(t, true);
    writeFileSync(join(project, '.devocd/state.json'), JSON.stringify(projectState(patch)));
    assert.equal(runHook(project), '');
  }
  const { root, project } = installed(t, true);
  rmSync(join(project, '.devocd/state.json'));
  assert.equal(runHook(project), '');
  rmSync(join(project, '.devocd'), { recursive: true });
  mkdirSync(join(project, '.git'));
  assert.equal(runHook(project), '');
  writeFileSync(join(root, '.devocd/state.json'), '{');
  assert.equal(runHook(root), '');
  assert.equal(stateProblem(companyState({ decisionCapture: 1 })), null);
});
test('company install reruns preserve explicit true and false', t => {
  for (const preference of [true, false]) {
    const { root } = installed(t, preference);
    const draft = join(root, 'rerun.draft.json');
    writeFileSync(draft, JSON.stringify(companyState()));
    applyDraft(root, draft);
    assert.equal(JSON.parse(readFileSync(join(root, '.devocd/state.json'))).decisionCapture, preference);
  }
});
test('symlinked plugin invocation runs, while linked knowledge stays quiet through CLI', t => {
  const root = fixture(t);
  const alias = join(root, 'plugin-alias');
  try { symlinkSync(plugin, alias, process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (error.code === 'EPERM') return t.skip('symlink permission unavailable'); throw error; }
  const script = join(alias, 'scripts/capture-hook.mjs');
  assert.ok(runHook(root, script));
  const outside = fixture(t);
  rmSync(join(root, '.devocd'), { recursive: true });
  symlinkSync(join(outside, '.devocd'), join(root, '.devocd'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(runHook(root, script), '');
});

test('nested project cwd inherits and malformed or linked company state fails closed', t => {
  const { root, project } = installed(t, true);
  const nested = join(project, 'src');
  mkdirSync(nested);
  assert.ok(runHook(nested));
  writeFileSync(join(root, '.devocd/state.json'), JSON.stringify(companyState({ decisionCapture: 'true' })));
  assert.equal(runHook(nested), '');
  rmSync(join(root, '.devocd'), { recursive: true });
  const outside = fixture(t, companyState({ decisionCapture: true, projects: [{ id: 'api', path: 'api', description: '' }] }));
  symlinkSync(join(outside, '.devocd'), join(root, '.devocd'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(runHook(nested), '');
});

test('explicit project preferences do not depend on company configuration', t => {
  for (const decisionCapture of [true, false]) {
    for (const companyRel of [undefined, null, '../missing', '.']) {
      const root = fixture(t, projectState({ decisionCapture, companyRel }));
      mkdirSync(join(root, 'src'));
      assert.equal(Boolean(runHook(join(root, 'src'))), decisionCapture);
    }
    const { root, project } = installed(t, !decisionCapture, decisionCapture);
    writeFileSync(join(root, '.devocd/state.json'), '{');
    assert.equal(Boolean(runHook(project)), decisionCapture);
  }
});
test('explicit capture is a discoverable skill with its workflow and agent regardless of hook preference', () => {
  const skill = read('skills/capture/SKILL.md');
  assert.match(skill, /^---\r?\nname: capture\r?\n/m);
  assert.match(skill, /argument-hint: "\[scope-path\]"/);
  assert.match(skill, /Agent\(devocd:decision-keeper\)/);
  assert.match(skill, /references\/workflow.md/);
  assert.doesNotMatch(skill, /decisionCapture/);
  assert.match(read('agents/decision-keeper.md'), /name: decision-keeper/);
  assert.match(read('skills/capture/references/workflow.md'), /approval/);
});

test('nested project discovery inherits without the installer fixture', t => {
  const company = fixture(t, companyState({ decisionCapture: true, projects: [{ id: 'api', path: 'api', description: '' }] }));
  const root = join(company, 'api');
  mkdirSync(join(root, '.devocd'), { recursive: true });
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, '.devocd/state.json'), JSON.stringify(projectState()));
  assert.ok(captureCheckpoint(event(join(root, 'src'))));
});
