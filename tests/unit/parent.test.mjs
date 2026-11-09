// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { renderParent, registerProject, writeParent, sanitizeLine } from '../../plugin/scripts/lib/parent.mjs';
import { estimateTokens, LIMITS } from '../../plugin/scripts/lib/tokens.mjs';
import { findBlock } from '../../plugin/scripts/lib/block.mjs';
import { checkTree } from '../../plugin/scripts/lib/check.mjs';
import { makeTree } from '../helpers/tree.mjs';
import { git, makeRepo, tmp, tryLink } from '../helpers/git.mjs';

const cli = fileURLToPath(new URL('../../plugin/scripts/devocd.mjs', import.meta.url));

/** @param {string} dir @param {Partial<any>} over */
function writeState(dir, over = {}) {
  const state = {
    version: 1, kind: 'company', name: 'Acme', description: 'Acme builds anvils.', parentFile: 'CLAUDE.md',
    keyRules: ['Never deploy on Friday.', 'Ask before touching billing.'], projects: [], sources: [], ...over,
  };
  makeTree(dir, { '.devocd/state.json': JSON.stringify(state, null, 2) + '\n' });
  return state;
}
const projects = (/** @type {number} */ n) => Array.from({ length: n }, (_, i) => ({ id: `proj-${i}`, path: `repos/proj-${i}`, description: `Service number ${i} does thing ${i}` }));
const readState = (/** @type {string} */ dir) => JSON.parse(readFileSync(join(dir, '.devocd', 'state.json'), 'utf8'));
const lines = (/** @type {string} */ s) => s.replace(/\n$/, '').split('\n').length;

test('12 projects fit in full; parent within 60 lines and 500 tokens, all key rules kept', () => {
  const dir = tmp();
  writeState(dir, { projects: projects(12) });
  const r = renderParent(dir);
  assert.equal(r.overflow, false);
  assert.equal(r.projectsList, null);
  assert.ok(lines(r.block) <= LIMITS.parent.lines, `lines ${lines(r.block)}`);
  assert.ok(estimateTokens(r.block) <= LIMITS.parent.tokens);
  assert.ok(r.block.includes('Never deploy on Friday.') && r.block.includes('Ask before touching billing.'));
  assert.ok(r.block.includes('- proj-3: Service number 3 does thing 3 — repos/proj-3/.devocd/PROJECT.md'));
  const heads = r.block.split('\n').filter((l) => l.startsWith('#'));
  assert.deepEqual(heads, ['# Acme', '## Key rules', '## Projects', '## Guidance']);
  assert.ok(!r.block.includes('@'));
});

test('20 projects: parent within 60 lines and 500 tokens, all key rules kept, every project findable', () => {
  const dir = tmp();
  writeState(dir, { projects: projects(20) });
  const r = renderParent(dir);
  assert.equal(r.overflow, false);
  assert.equal(r.projectsList, null);
  assert.ok(lines(r.block) <= LIMITS.parent.lines);
  assert.ok(estimateTokens(r.block) <= LIMITS.parent.tokens);
  assert.ok(r.block.includes('Never deploy on Friday.') && r.block.includes('Ask before touching billing.'));
  for (let i = 0; i < 20; i++) assert.ok(r.block.includes('- proj-' + i + ': '));
});

test('200 projects: list moves to projects.md and every project is findable', () => {
  const dir = tmp();
  writeState(dir, { projects: projects(200) });
  const r = renderParent(dir);
  assert.equal(r.overflow, true);
  assert.ok(lines(r.block) <= LIMITS.parent.lines && estimateTokens(r.block) <= LIMITS.parent.tokens);
  assert.ok(r.block.includes('200 projects') && r.block.includes('.devocd/projects.md'));
  assert.ok(r.block.includes('Never deploy on Friday.'));
  assert.ok(r.projectsList);
  for (let i = 0; i < 200; i++) assert.ok(r.projectsList.includes(`- proj-${i}: `));
  assert.ok(!r.block.includes('proj-5:'));
});

test('renderParent is pure: it writes nothing', () => {
  const dir = tmp();
  writeState(dir, { projects: projects(200) });
  const before = readFileSync(join(dir, '.devocd', 'state.json'), 'utf8');
  renderParent(dir);
  assert.equal(readFileSync(join(dir, '.devocd', 'state.json'), 'utf8'), before);
  assert.ok(!existsSync(join(dir, '.devocd', 'projects.md')));
  assert.ok(!existsSync(join(dir, 'CLAUDE.md')));
});

test('key rules over 300 tokens throw KEY_RULES_TOO_LONG, writing nothing', () => {
  const dir = tmp();
  writeState(dir, { keyRules: ['x'.repeat(1300)] });
  assert.throws(() => renderParent(dir), { code: 'KEY_RULES_TOO_LONG' });
  const r = spawnSync(process.execPath, [cli, 'render-parent', dir], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^error: .*estimated/m);
  assert.match(r.stderr, /^hint: /m);
  assert.ok(!existsSync(join(dir, 'CLAUDE.md')));
  assert.ok(!existsSync(join(dir, '.devocd', 'projects.md')));
  assert.equal(readState(dir).parentFile, 'CLAUDE.md');
});

test('a parent that cannot fit even in overflow form throws and writes nothing', () => {
  const dir = tmp();
  writeState(dir, { keyRules: Array.from({ length: 70 }, (_, i) => `r${i}`) });
  assert.throws(() => renderParent(dir), { code: 'PARENT_TOO_LONG' });
});

test('descriptions are made inert: comments, markers, links, backticks, newlines', () => {
  const nasty = 'Billing <!-- devocd:end -->\n## Evil [click](http://x.test/a) `rm -rf` <script>\u0007 ok';
  const one = sanitizeLine(nasty, 80);
  assert.ok(!/[\n\r<>`\u0007]/.test(one));
  assert.ok(!/devocd:/i.test(one) && !one.includes('(http'));
  assert.ok(one.includes('click') && one.includes('Billing'));
  assert.equal(sanitizeLine('a<!<!-- x -->-- devocd:end -->b', 80).includes('devocd'), false);
  const capped = sanitizeLine('y'.repeat(200), 80);
  assert.equal(Array.from(capped).length, 80);
  assert.ok(capped.endsWith('…'));

  const dir = tmp();
  writeState(dir, { projects: [{ id: 'bill', path: 'bill', description: nasty }] });
  const r = renderParent(dir);
  const found = findBlock('<!-- devocd:begin -->\n' + r.block + '\n<!-- devocd:end -->\n');
  assert.ok(found);
  assert.equal(r.block.split('\n').filter((l) => l.startsWith('- bill:')).length, 1);
  assert.ok(!r.block.includes('devocd:end'));
});

test('register rejects bad ids and a path outside the company folder', () => {
  const dir = tmp();
  writeState(dir);
  const before = readFileSync(join(dir, '.devocd', 'state.json'), 'utf8');
  for (const p of ['../other', '..', 'a/../../b', tmp(), '.']) {
    assert.throws(() => registerProject(dir, { id: 'x', path: p, description: 'd' }), { code: 'PROJECT_OUTSIDE_COMPANY' }, p);
  }
  for (const id of ['', 'Bad', 'a_b', '-a', 'a--b', 'a'.repeat(65), '../x']) {
    assert.throws(() => registerProject(dir, { id, path: 'ok', description: 'd' }), { code: 'INVALID_ID' }, id);
  }
  assert.equal(readFileSync(join(dir, '.devocd', 'state.json'), 'utf8'), before);
  assert.ok(!existsSync(join(dir, 'CLAUDE.md')));
});

test('register is idempotent on id', () => {
  const dir = tmp();
  writeState(dir);
  registerProject(dir, { id: 'api', path: 'repos/api', description: 'first' });
  registerProject(dir, { id: 'web', path: 'repos/web', description: 'site' });
  registerProject(dir, { id: 'api', path: 'repos/api2', description: 'second' });
  const s = readState(dir);
  assert.equal(s.projects.length, 2);
  assert.deepEqual(s.projects.find((/** @type {any} */ p) => p.id === 'api'), { id: 'api', path: 'repos/api2', description: 'second' });
  const text = readFileSync(join(dir, 'CLAUDE.md'), 'utf8');
  assert.equal(text.split('\n').filter((l) => l.startsWith('- api:')).length, 1);
  const again = readFileSync(join(dir, 'CLAUDE.md'), 'utf8');
  registerProject(dir, { id: 'api', path: 'repos/api2', description: 'second' });
  assert.equal(readFileSync(join(dir, 'CLAUDE.md'), 'utf8'), again);
});

test('text outside the block is kept and projects.md is written and removed as needed', () => {
  const dir = tmp();
  writeState(dir, { projects: projects(200) });
  writeFileSync(join(dir, 'CLAUDE.md'), 'my own notes\n');
  assert.equal(spawnSync(process.execPath, [cli, 'render-parent', dir], { encoding: 'utf8' }).status, 0);
  assert.ok(readFileSync(join(dir, 'CLAUDE.md'), 'utf8').endsWith('my own notes\n'));
  assert.ok(readFileSync(join(dir, '.devocd', 'projects.md'), 'utf8').includes('proj-199'));
  writeState(dir, { projects: projects(2) });
  assert.equal(spawnSync(process.execPath, [cli, 'render-parent', dir], { encoding: 'utf8' }).status, 0);
  assert.ok(!existsSync(join(dir, '.devocd', 'projects.md')));
});

test('company folder inside a git repo uses CLAUDE.local.md and stays ignored', () => {
  const repo = makeRepo();
  const dir = join(repo, 'company');
  mkdirSync(dir);
  writeState(dir);
  assert.equal(renderParent(dir).file, 'CLAUDE.local.md');
  const r = spawnSync(process.execPath, [cli, 'render-parent', dir], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(dir, 'CLAUDE.local.md')));
  assert.ok(!existsSync(join(dir, 'CLAUDE.md')));
  assert.equal(readState(dir).parentFile, 'CLAUDE.local.md');
  assert.equal(git(repo, 'status', '--porcelain'), '');
});

test('a damaged company state.json is refused with a hint to restore a backup; a missing one says to set the folder up', () => {
  const dir = tmp();
  makeTree(dir, { '.devocd/state.json': '{ "version": 1, "kind": "comp' });
  const r = spawnSync(process.execPath, [cli, 'render-parent', dir], { encoding: 'utf8' });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /^error: .*state\.json is not valid JSON/m);
  assert.match(r.stderr, /^hint: .*devocd\.mjs restore/m);
  const none = spawnSync(process.execPath, [cli, 'render-parent', tmp()], { encoding: 'utf8' });
  assert.equal(none.status, 1);
  assert.match(none.stderr, /^hint: Run this in a company folder devocd has set up/m);
  assert.doesNotMatch(none.stderr, /restore/);
});

test('company folder outside git uses CLAUDE.md', () => {
  const dir = tmp();
  writeState(dir);
  assert.equal(renderParent(dir).file, 'CLAUDE.md');
});

test('CLI register writes state and parent; wrong arg count is a usage error', () => {
  const dir = tmp();
  writeState(dir);
  const ok = spawnSync(process.execPath, [cli, 'register', dir, 'api', 'repos/api', 'The API'], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.ok(!ok.stdout.includes('\\'));
  assert.ok(readFileSync(join(dir, 'CLAUDE.md'), 'utf8').includes('- api: The API — repos/api/.devocd/PROJECT.md'));
  assert.equal(spawnSync(process.execPath, [cli, 'register', dir, 'api'], { encoding: 'utf8' }).status, 2);
  const out = spawnSync(process.execPath, [cli, 'register', dir, 'x', '../up', 'd'], { encoding: 'utf8' });
  assert.equal(out.status, 1);
  assert.match(out.stderr, /^error: /m);
});
