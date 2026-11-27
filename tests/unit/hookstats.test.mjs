// `devocd hook-stats <dir>`: read-only counters for what the hooks ran and added.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { workspace } from '../helpers/workspace.mjs';
import { main } from '../../scripts/devocd.mjs';

/** The command in-process, capturing what it would print. */
function run(/** @type {string[]} */ ...args) {
  const log = console.log;
  const error = console.error;
  let out = '';
  let err = '';
  console.log = (/** @type {unknown} */ line) => { out += `${String(line)}\n`; };
  console.error = (/** @type {unknown} */ line) => { err += `${String(line)}\n`; };
  try { return { code: main(['hook-stats', ...args]), out, err }; } finally { console.log = log; console.error = error; }
}

const statsPath = (/** @type {string} */ dir) => join(dir, '.devocd', 'journal', 'hook-stats.json');
const STATS = {
  since: '2026-11-24T10:00:00.000Z',
  events: { UserPromptSubmit: { runs: 5, injected: 1, bytes: 260 }, SessionStart: { runs: 1, injected: 0, bytes: 0 } },
};
function fixture(/** @type {any} */ t) {
  const dir = workspace(t, {}).root;
  mkdirSync(join(dir, '.devocd', 'journal'), { recursive: true });
  return dir;
}

test('prints one line per event and the date the counters started', t => {
  const dir = fixture(t);
  writeFileSync(statsPath(dir), JSON.stringify(STATS));
  const r = run(dir);
  assert.equal(r.code, 0);
  assert.match(r.out, /^UserPromptSubmit: 5 runs, 1 injected, 260 bytes \(~65 estimated tokens\)$/m);
  assert.match(r.out, /^SessionStart: 1 runs, 0 injected, 0 bytes \(~0 estimated tokens\)$/m);
  assert.match(r.out, /^since 2026-11-24T10:00:00\.000Z$/m);
});

test('--json prints the counters object itself', t => {
  const dir = fixture(t);
  writeFileSync(statsPath(dir), JSON.stringify(STATS));
  const r = run(dir, '--json');
  assert.equal(r.code, 0);
  assert.deepEqual(JSON.parse(r.out), STATS);
});

test('prints the recorded pointer count and --json keeps the pointers', t => {
  const dir = fixture(t);
  const withPointers = { ...STATS, pointers: { 'jira/style.md': '2026-11-24T10:05:00.000Z', 'pr/description.md': '2026-11-24T10:06:00.000Z' } };
  writeFileSync(statsPath(dir), JSON.stringify(withPointers));
  const r = run(dir);
  assert.equal(r.code, 0);
  assert.match(r.out, /^pointers: 2 recorded$/m);
  assert.deepEqual(JSON.parse(run(dir, '--json').out), withPointers);
});

test('with no counters file it says so and exits 0', t => {
  const dir = fixture(t);
  const r = run(dir);
  assert.equal(r.code, 0);
  assert.match(r.out, /no hook counters recorded yet/);
});

test('a malformed counters file is one error line and exit 1', t => {
  const dir = fixture(t);
  for (const text of ['{ nope', '[]', '{"events": 3}']) {
    writeFileSync(statsPath(dir), text);
    const r = run(dir);
    assert.equal(r.code, 1, text);
    assert.equal(r.err.trim().split('\n').length, 1, text);
    assert.match(r.err, /hook-stats\.json/);
  }
});

test('a missing folder is a usage error: exit 2', () => {
  const r = run();
  assert.equal(r.code, 2);
  assert.match(r.err, /hook-stats needs/);
  assert.equal(run(process.cwd(), 'extra', 'args').code, 2);
});

test('it is read-only: the file and the folder are untouched', t => {
  const dir = fixture(t);
  const text = JSON.stringify(STATS);
  writeFileSync(statsPath(dir), text);
  const before = readdirSync(join(dir, '.devocd', 'journal')).sort();
  for (const args of [[dir], [dir, '--json']]) {
    assert.equal(run(...args).code, 0);
  }
  assert.deepEqual(readdirSync(join(dir, '.devocd', 'journal')).sort(), before);
  assert.equal(readFileSync(statsPath(dir), 'utf8'), text);
});
