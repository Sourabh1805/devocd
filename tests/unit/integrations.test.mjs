// @ts-check
import { workspace, projectState as defaultProjectState } from '../helpers/workspace.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { makeTree } from '../helpers/tree.mjs';
import { integrateProject } from '../../scripts/lib/integrations.mjs';
import { checkTree } from '../../scripts/lib/check.mjs';

function fixture(t, files = {}) {
  const root = workspace(t).root;
  return makeTree(root, {
    '.devocd/state.json': JSON.stringify(defaultProjectState()),
    '.devocd/PROJECT.md': '# API', '.devocd/pointer.md': 'Read PROJECT.md',
    'CLAUDE.local.md': '<!-- devocd:begin -->\nRead PROJECT.md\n<!-- devocd:end -->',
    'src/a.js': 'source', ...files
  });
}

test('preview is read-only; all installs a shared block and a functioning local runtime', t => {
  const root = fixture(t, { 'AGENTS.md': '# Team rules\r\nKeep this exactly.\r\n' });
  const before = readFileSync(join(root, 'AGENTS.md'), 'utf8');
  const preview = integrateProject(root, 'all');
  assert.equal(preview.applied, false);
  assert.deepEqual(preview.startupFiles, ['AGENTS.md']);
  assert.equal(readFileSync(join(root, 'AGENTS.md'), 'utf8'), before);
  assert.equal(existsSync(join(root, '.devocd/runtime')), false);
  const applied = integrateProject(root, 'all', true);
  assert.match(readFileSync(join(root, '.devocd/TOOLS.md'), 'utf8'), /\[Decision capture\]\(CAPTURE.md\)/);
  assert.match(readFileSync(join(root, '.devocd/CAPTURE.md'), 'utf8'), /architecture approval alone does not authorize edits/);
  const first = readFileSync(join(root, 'AGENTS.md'), 'utf8');
  assert.ok(first.endsWith(before));
  assert.equal(readFileSync(join(root, applied.backup, 'AGENTS.md'), 'utf8'), before);
  integrateProject(root, 'all', true);
  assert.equal(readFileSync(join(root, 'AGENTS.md'), 'utf8'), first);
  assert.equal(existsSync(join(root, 'GEMINI.md')), false);
  const cli = join(root, '.devocd/runtime/devocd.mjs');
  const run = spawnSync(process.execPath, [cli, 'refresh-status', root], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(JSON.parse(run.stdout).reason, 'no-baseline');
  const aliasParent = fixture(t);
  const alias = join(aliasParent, 'linked-project');
  symlinkSync(root, alias, process.platform === 'win32' ? 'junction' : 'dir');
  const linkedRun = spawnSync(process.execPath, [join(alias, '.devocd/runtime/devocd.mjs'), 'refresh-status', root], { encoding: 'utf8' });
  assert.equal(linkedRun.status, 0, linkedRun.stderr);
  assert.equal(JSON.parse(linkedRun.stdout).reason, 'no-baseline');
  assert.deepEqual(checkTree(root).issues.filter(i => i.severity === 'error'), []);
  assert.deepEqual(checkTree(root).issues.filter(i => i.rule === 'context/over-target'), []);
});

test('Codex overrides are preserved and Antigravity receives its own native entry', t => {
  const root = fixture(t, { 'AGENTS.override.md': 'Override notes\n', 'AGENTS.md': 'Team notes\n', 'GEMINI.md': 'Antigravity notes\n' });
  const result = integrateProject(root, 'all', true);
  assert.deepEqual(result.startupFiles, ['AGENTS.override.md', 'GEMINI.md']);
  assert.equal(readFileSync(join(root, 'AGENTS.md'), 'utf8'), 'Team notes\n');
  assert.match(readFileSync(join(root, 'AGENTS.override.md'), 'utf8'), /Override notes/);
  assert.match(readFileSync(join(root, 'GEMINI.md'), 'utf8'), /Antigravity notes/);
});

test('linked destinations and malformed blocks fail before writing other targets', t => {
  const root = fixture(t), outside = fixture(t);
  symlinkSync(outside, join(root, '.devocd/runtime'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => integrateProject(root, 'all', true));
  assert.equal(existsSync(join(root, 'AGENTS.md')), false);
  const malformed = fixture(t, { 'GEMINI.md': '<!-- devocd:begin -->\nno end' });
  assert.throws(() => integrateProject(malformed, 'antigravity', true), { code: 'BLOCK_MALFORMED' });
  assert.equal(existsSync(join(malformed, '.devocd/runtime')), false);
});

test('tracked instruction changes require apply and new entry files stay locally ignored', t => {
  const root = fixture(t, { 'AGENTS.md': 'Tracked team rules\n' });
  const git = (...args) => { const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout; };
  git('init', '-q'); git('add', 'AGENTS.md');
  assert.deepEqual(integrateProject(root, 'codex').trackedInstructionFiles, ['AGENTS.md']);
  assert.equal(readFileSync(join(root, 'AGENTS.md'), 'utf8'), 'Tracked team rules\n');
  integrateProject(root, 'codex', true);
  assert.match(git('diff', '--', 'AGENTS.md'), /DevOCD/);
  integrateProject(root, 'antigravity', true);
  assert.match(git('check-ignore', 'GEMINI.md'), /GEMINI.md/);
});

test('portable capture is request-only and legacy preferences do not break integration', t => {
  for (const preference of [undefined, false, true, 'false', null]) {
    const state = defaultProjectState();
    if (preference !== undefined) state.decisionCapture = preference;
    const root = fixture(t, { '.devocd/state.json': JSON.stringify(state) });
    integrateProject(root, 'antigravity', true);
    const startup = readFileSync(join(root, 'GEMINI.md'), 'utf8');
    const capture = readFileSync(join(root, '.devocd/CAPTURE.md'), 'utf8');
    const tools = readFileSync(join(root, '.devocd/TOOLS.md'), 'utf8');
    assert.match(startup, /On explicit capture requests/);
    assert.match(tools, /For an explicit capture request/);
    assert.match(capture, /Only on an explicit user request to capture/);
    assert.doesNotMatch(startup + tools + capture, /At task completion|After durable task findings/);
  }
});
