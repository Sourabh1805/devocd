import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { captureCheckpoint } from '../../plugin/scripts/capture-hook.mjs';

const plugin = fileURLToPath(new URL('../../plugin/', import.meta.url));
const read = p => readFileSync(join(plugin, p), 'utf8');
function fixture(t, state = { kind: 'project' }) {
  const root = mkdtempSync(join(tmpdir(), 'devocd-capture-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.devocd'));
  writeFileSync(join(root, '.devocd/state.json'), JSON.stringify(state));
  return root;
}
const event = cwd => ({ cwd, hook_event_name: 'Stop', stop_hook_active: false });

test('checkpoint finds nearest project/company from nested cwd without writes', t => {
  for (const kind of ['project', 'company']) {
    const root = fixture(t, { kind });
    mkdirSync(join(root, 'src'));
    const result = captureCheckpoint(event(join(root, 'src')));
    assert.equal(result.hookSpecificOutput.hookEventName, 'Stop');
    assert.match(result.hookSpecificOutput.additionalContext, /devocd:capture/);
    assert.deepEqual(readdirSync(join(root, '.devocd')), ['state.json']);
  }
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

test('nearest disabled scope cannot fall through to enabled company', t => {
  const root = fixture(t, { kind: 'company' });
  const child = join(root, 'project');
  mkdirSync(join(child, '.devocd'), { recursive: true });
  writeFileSync(join(child, '.devocd/state.json'), '{"kind":"project","decisionCapture":false}');
  assert.equal(captureCheckpoint(event(child)), null);
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
  assert.deepEqual(Object.keys(config.hooks), ['Stop']);
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
  assert.match(read('scripts/lib/parent.mjs'), /devocd:capture/);
  assert.match(read('skills/add-project/references/project-template.md'), /devocd:capture/);
});
