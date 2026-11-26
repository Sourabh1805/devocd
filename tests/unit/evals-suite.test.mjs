// @ts-check
// The eval suite is data for `claude plugin eval`; these checks keep it well-formed and honest
// without running a model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { workspace } from '../helpers/workspace.mjs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drift, largeDump } from '../../evals/_tools/generate.mjs';
import { LARGE, LARGE_TEAM, PAIRED, SAFEGUARDS } from '../../evals/_tools/cases.mjs';

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

test('every large case runs in three arms, and only the knowledge arms carry a system prompt', () => {
  const names = [...LARGE.map((c) => `large-${c.name}`), ...LARGE_TEAM.map((t) => `large-team-${t.name}`)];
  assert.equal(names.length, 13);
  for (const name of names) {
    const plain = readFileSync(`${root}evals/${name}-plain/prompt.md`, 'utf8');
    assert.doesNotMatch(plain, /append_system_prompt/, `${name}: plain has no prompt`);
    assert.match(readFileSync(`${root}evals/${name}-plain/scaffold.sh`, 'utf8'), /\blarge-plain\b/, `${name}: bare fixture`);
    for (const arm of ['dump', 'devocd']) {
      assert.match(readFileSync(`${root}evals/${name}-${arm}/prompt.md`, 'utf8'), /^append_system_prompt: /m, `${name}-${arm}`);
    }
    assert.match(readFileSync(`${root}evals/${name}-devocd/scaffold.sh`, 'utf8'), /\blarge-devocd\b/, `${name}: devocd fixture`);
  }
});

test('the large dump fits the Windows command line and never trims the decisions', () => {
  const dump = largeDump();
  assert.ok(dump, 'large knowledge snapshot exists');
  assert.ok(dump.chars <= 24_000, `${dump.chars} characters`);
  assert.ok(dump.pages.includes('PROJECT.md'), 'overview first');
  assert.ok(dump.pages.includes('decisions.md'), 'decisions are never trimmed');
  assert.match(dump.text, /D-0001/, 'the team decisions are in the dump');
  for (const id of ['D-0001', 'D-0002', 'D-0003', 'D-0004', 'D-0005']) {
    assert.ok(readFileSync(`${root}evals/_fixture/large/knowledge/decisions.md`, 'utf8').includes(id), `${id} exists`);
  }
});

/**
 * fixture.sh builds every workspace, and nothing else tested it: if it breaks, `npm test` stays
 * green while every paid eval run fails at scaffold time. These cover the modes the cases use.
 * Skipped where bash, git and tar are not usable together.
 */
const bashUsable = spawnSync('bash', ['-c', 'command -v git >/dev/null && command -v tar >/dev/null'], { encoding: 'utf8' }).status === 0;
const SKIP_BASH = bashUsable ? false : 'needs a usable bash with git and tar';

/** @param {import('node:test').TestContext} t @param {string} mode @param {string} [patch] @param {NodeJS.ProcessEnv} [env] @returns {string} the built workspace */
function buildFixture(t, mode, patch, env = process.env) {
  const dir = workspace(t).root;
  const script = `${root}evals/_fixture/fixture.sh`.split('\\').join('/');
  const r = spawnSync('bash', [script, mode, ...(patch ? [patch] : [])], { cwd: dir, env, encoding: 'utf8' });
  assert.equal(r.status, 0, `fixture.sh ${mode}${patch ? ` ${patch}` : ''}: ${r.stderr}`);
  return dir;
}
const gitOut = (/** @type {string} */ dir, ...args) => spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
const shown = (/** @type {string} */ dir, /** @type {string} */ p) => existsSync(join(dir, p));

test('fixture plain: the repository at the pin, one commit, no knowledge', { skip: SKIP_BASH }, t => {
  const dir = buildFixture(t, 'plain');
  try {
    assert.ok(shown(dir, 'package.json') && shown(dir, 'scripts/devocd.mjs'), 'repository files');
    assert.ok(!shown(dir, '.devocd'), 'the plain arm carries no knowledge');
    assert.equal(gitOut(dir, 'rev-list', '--count', 'HEAD').stdout.trim(), '1');
    assert.equal(gitOut(dir, 'status', '--porcelain').stdout.trim(), '', 'the scaffold leaves a clean tree');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('fixture devocd: the same repository plus snapshot, pointer and git exclusion', { skip: SKIP_BASH }, t => {
  const dir = buildFixture(t, 'devocd');
  try {
    assert.ok(shown(dir, '.devocd/state.json'), 'project state');
    assert.ok(readFileSync(join(dir, '.devocd/pointer.md'), 'utf8').trim(), 'the pointer has text');
    assert.ok(readFileSync(join(dir, 'CLAUDE.local.md'), 'utf8').includes('devocd:begin'), 'startup block written');
    assert.equal(gitOut(dir, 'status', '--porcelain').stdout.trim(), '', 'knowledge stays out of git');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('fixture company: an installed company holding the repository as an un-onboarded project', { skip: SKIP_BASH }, t => {
  const dir = buildFixture(t, 'company');
  try {
    assert.equal(JSON.parse(readFileSync(join(dir, '.devocd/state.json'), 'utf8')).kind, 'company');
    assert.ok(shown(dir, 'CLAUDE.md'), 'the parent file was rendered');
    assert.ok(shown(dir, 'devocd/package.json'), 'the project is present');
    assert.ok(!shown(dir, 'devocd/.devocd'), 'the project is not onboarded');
    assert.ok(shown(dir, 'answers.json'), 'the unapproved answers file the case names');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('fixture patch: a feature branch carrying exactly the named defect', { skip: SKIP_BASH }, t => {
  const dir = buildFixture(t, 'devocd', 'secret-echo');
  try {
    assert.equal(gitOut(dir, 'branch', '--show-current').stdout.trim(), 'feature');
    const files = gitOut(dir, 'diff', '--name-only', 'HEAD~1', 'HEAD').stdout.trim().split('\n');
    assert.deepEqual(files, ['scripts/lib/check.mjs']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// The large-repository fixture is never cloned here: a run extracts 3,000+ files from the
// operator's cache. These cover the two ways it refuses to run, which must be loud and early;
// the extraction itself is exercised by the paid eval's own scaffold.
test('fixture large-plain refuses to run without DEVOCD_EVAL_LARGE_CACHE', { skip: SKIP_BASH }, t => {
  const dir = workspace(t).root;
  const script = `${root}evals/_fixture/fixture.sh`.split('\\').join('/');
  const r = spawnSync('bash', [script, 'large-plain'], { cwd: dir, encoding: 'utf8', env: { ...process.env, DEVOCD_EVAL_LARGE_CACHE: '' } });
  assert.equal(r.status, 3);
  assert.match(r.stderr, /DEVOCD_EVAL_LARGE_CACHE/);
  assert.equal(shown(dir, 'packages'), false, 'nothing was scaffolded');
});

test('fixture large-plain refuses a cache that lacks the pinned commit', { skip: SKIP_BASH }, t => {
  const dir = workspace(t).root;
  const cache = join(dir, 'cache');
  spawnSync('git', ['-C', dir, 'init', '-q', cache], { encoding: 'utf8' });
  const script = `${root}evals/_fixture/fixture.sh`.split('\\').join('/');
  const r = spawnSync('bash', [script, 'large-plain'], {
    cwd: dir, encoding: 'utf8', env: { ...process.env, DEVOCD_EVAL_LARGE_CACHE: cache.replace(/\\/g, '/') },
  });
  assert.equal(r.status, 3);
  assert.match(r.stderr, /does not contain commit/);
});


test('declined capture rejects paraphrases, deletions and unrelated decision changes', () => {
  const c = SAFEGUARDS.find(s => s.name === 'safeguard-declined-capture');
  const g = c.graders.find(g => g.name === 'decisions-unchanged');
  assert.equal(g.type, 'regex');
  const original = readFileSync(join(root, 'evals/_fixture/knowledge/decisions.md'), 'utf8');
  const matches = text => {
    const found = new RegExp(g.pattern, g.flags).test(text);
    return g.match === 'not_contains' ? !found : found;
  };
  assert.equal(matches(original), true);
  for (const changed of ['', original + '\nUse whole-number minor currency units.\n', original.replace('never', 'sometimes')]) {
    assert.equal(matches(changed), false, 'any changed decision content must fail');
  }
});

test('safeguards require the intended skill, not an unrelated skill', () => {
  for (const [name, skill] of [['unapproved-add-project', 'add-project'], ['review-read-only', 'pr-review'], ['declined-capture', 'capture']]) {
    const g = SAFEGUARDS.find(s => s.name === `safeguard-${name}`).graders.find(g => g.name === 'skill-ran');
    assert.equal(g.type, 'tool_used');
    const pattern = new RegExp(g.input_match);
    assert.equal(pattern.test(JSON.stringify({ skill: `devocd:${skill}` })), true);
    assert.equal(pattern.test(JSON.stringify({ skill: 'devocd:check' })), false);
  }
});

test('grant control exercises Write, Edit and shell with successful outputs', () => {
  const c = SAFEGUARDS.find(s => s.name === 'safeguard-control-write-granted');
  for (const tool of ['Write', 'Edit', 'Bash']) {
    assert.ok(c.graders.some(g => g.type === 'tool_used' && g.tool === tool && (g.min ?? 1) >= 1), tool);
  }
  for (const path of ['canary.txt', 'shell-canary.txt']) {
    assert.ok(c.graders.some(g => g.type === 'regex' && g.target?.source === 'file' && g.target.path === path), path);
  }
});

test('fixture commits ignore inherited signing requirements', { skip: SKIP_BASH }, t => {
  const config = workspace(t, { files: { gitconfig: '[commit]\n  gpgsign = true\n[gpg]\n  program = devocd-no-such-signer\n' } }).root;
  const dir = buildFixture(t, 'plain', 'secret-echo', { ...process.env,
    GIT_CONFIG_GLOBAL: join(config, 'gitconfig'), GIT_CONFIG_NOSYSTEM: '1' });
  assert.equal(gitOut(dir, 'rev-list', '--count', 'HEAD').stdout.trim(), '2');
});


test('read-only review rejects Git mutations with quoted working directories', () => {
  const g = SAFEGUARDS.find(s => s.name === 'safeguard-review-read-only').graders.find(g => g.name === 'no-commit');
  const pattern = new RegExp(g.input_match);
  for (const command of ['git commit -m change', 'git -C "/tmp/my repo" add file', "git -C '/tmp/my repo' reset --hard", 'git -c user.name="Eval User" commit -m change']) {
    assert.equal(pattern.test(JSON.stringify({ command })), true, command);
  }
  for (const command of ['git diff main', 'git -C "/tmp/my repo" status --porcelain']) {
    assert.equal(pattern.test(JSON.stringify({ command })), false, command);
  }
});
