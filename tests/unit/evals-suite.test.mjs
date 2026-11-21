// @ts-check
// The eval suite is data for `claude plugin eval`; these checks keep it well-formed and honest
// without running a model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
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
  for (const s of SAFEGUARDS) {
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
