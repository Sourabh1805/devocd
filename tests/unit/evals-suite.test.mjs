// @ts-check
// The eval suite is data for `claude plugin eval`; these checks keep it well-formed and honest
// without running a model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drift } from '../../evals/_tools/generate.mjs';
import { PAIRED, SAFEGUARDS } from '../../evals/_tools/cases.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const pin = readFileSync(`${root}evals/_fixture/PIN`, 'utf8').trim();

test('the committed case folders match cases.mjs', () => {
  assert.deepEqual(drift(), []);
});

test('the pinned commit exists and predates evals/, so answers cannot leak into a workspace', () => {
  const exists = spawnSync('git', ['-C', root, 'cat-file', '-e', `${pin}^{commit}`]);
  assert.equal(exists.status, 0, `pinned commit ${pin} must be reachable`);
  const tree = spawnSync('git', ['-C', root, 'ls-tree', '--name-only', pin], { encoding: 'utf8' });
  assert.doesNotMatch(tree.stdout, /^evals$/m);
});

test('every patch a case names exists, and every case has at least one scored grader', () => {
  for (const p of [...PAIRED, ...SAFEGUARDS]) {
    if (p.patch) assert.ok(existsSync(`${root}evals/_fixture/patches/${p.patch}.sh`), p.patch);
    assert.ok(p.graders.some((g) => !('arm' in g) || g.arm !== 'with-only'), `${p.name} needs a scored grader`);
  }
});

test('safeguards check the skill ran, and assert the forbidden outcome in both arms', () => {
  // A positive control must exist: it fails unless the operator granted the write tools,
  // so the no-write safeguards cannot pass on denied permissions.
  const control = SAFEGUARDS.find((s) => s.name === 'safeguard-control-write-granted');
  assert.ok(control?.graders.some((g) => g.type === 'file_exists' && g.exists === true), 'write-granted control');
  for (const s of SAFEGUARDS.filter((x) => x !== control)) {
    assert.ok(s.graders.some((g) => g.type === 'tool_used' && g.tool === 'Skill' && g.arm === 'with-only'), `${s.name}: skill-ran indicator`);
    assert.ok(s.graders.filter((g) => g.name !== 'skill-ran').every((g) => 'arm' in g && g.arm === 'both'), `${s.name}: outcome graders score in both arms`);
  }
});

test('the devocd arm carries the startup pointer from the knowledge snapshot', () => {
  const pointer = `${root}evals/_fixture/knowledge/pointer.md`;
  assert.ok(existsSync(pointer), 'knowledge snapshot has pointer.md');
  const prompt = readFileSync(`${root}evals/${PAIRED[0].name}-devocd/prompt.md`, 'utf8');
  assert.match(prompt, /^append_system_prompt: /m);
  assert.doesNotMatch(readFileSync(`${root}evals/${PAIRED[0].name}-plain/prompt.md`, 'utf8'), /append_system_prompt/);
});

/**
 * fixture.sh builds every workspace, and nothing else tested it: if it breaks, `npm test` stays
 * green while every paid eval run fails at scaffold time. These cover the modes the cases use.
 * Skipped where bash, git and tar are not usable together.
 */
const bashUsable = spawnSync('bash', ['-c', 'command -v git >/dev/null && command -v tar >/dev/null'], { encoding: 'utf8' }).status === 0;
const SKIP_BASH = bashUsable ? false : 'needs a usable bash with git and tar';

/** @param {string} mode @param {string} [patch] @returns {string} the built workspace */
function buildFixture(mode, patch) {
  const dir = mkdtempSync(join(tmpdir(), `devocd-eval-${mode}-`));
  const script = `${root}evals/_fixture/fixture.sh`.split('\\').join('/');
  const r = spawnSync('bash', [script, mode, ...(patch ? [patch] : [])], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0, `fixture.sh ${mode}${patch ? ` ${patch}` : ''}: ${r.stderr}`);
  return dir;
}
const gitOut = (/** @type {string} */ dir, ...args) => spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
const shown = (/** @type {string} */ dir, /** @type {string} */ p) => existsSync(join(dir, p));

test('fixture plain: the repository at the pin, one commit, no knowledge', { skip: SKIP_BASH }, () => {
  const dir = buildFixture('plain');
  try {
    assert.ok(shown(dir, 'package.json') && shown(dir, 'scripts/devocd.mjs'), 'repository files');
    assert.ok(!shown(dir, '.devocd'), 'the plain arm carries no knowledge');
    assert.equal(gitOut(dir, 'rev-list', '--count', 'HEAD').stdout.trim(), '1');
    assert.equal(gitOut(dir, 'status', '--porcelain').stdout.trim(), '', 'the scaffold leaves a clean tree');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('fixture devocd: the same repository plus snapshot, pointer and git exclusion', { skip: SKIP_BASH }, () => {
  const dir = buildFixture('devocd');
  try {
    assert.ok(shown(dir, '.devocd/state.json'), 'project state');
    assert.ok(readFileSync(join(dir, '.devocd/pointer.md'), 'utf8').trim(), 'the pointer has text');
    assert.ok(readFileSync(join(dir, 'CLAUDE.local.md'), 'utf8').includes('devocd:begin'), 'startup block written');
    assert.equal(gitOut(dir, 'status', '--porcelain').stdout.trim(), '', 'knowledge stays out of git');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('fixture company: an installed company holding the repository as an un-onboarded project', { skip: SKIP_BASH }, () => {
  const dir = buildFixture('company');
  try {
    assert.equal(JSON.parse(readFileSync(join(dir, '.devocd/state.json'), 'utf8')).kind, 'company');
    assert.ok(shown(dir, 'CLAUDE.md'), 'the parent file was rendered');
    assert.ok(shown(dir, 'devocd/package.json'), 'the project is present');
    assert.ok(!shown(dir, 'devocd/.devocd'), 'the project is not onboarded');
    assert.ok(shown(dir, 'answers.json'), 'the unapproved answers file the case names');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('fixture patch: a feature branch carrying exactly the named defect', { skip: SKIP_BASH }, () => {
  const dir = buildFixture('devocd', 'secret-echo');
  try {
    assert.equal(gitOut(dir, 'branch', '--show-current').stdout.trim(), 'feature');
    const files = gitOut(dir, 'diff', '--name-only', 'HEAD~1', 'HEAD').stdout.trim().split('\n');
    assert.deepEqual(files, ['scripts/lib/check.mjs']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
