// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { existsSync, rmSync } from 'node:fs';
import { parseStream, createLedger, liveCap } from '../helpers/claude.mjs';
import { tmp } from '../helpers/git.mjs';

const line = (/** @type {any} */ o) => JSON.stringify(o);
const assistant = (/** @type {any[]} */ content) => line({ type: 'assistant', message: { role: 'assistant', content } });

test('parseStream collects reads, writes, bash commands, text and cost', () => {
  const out = [
    line({ type: 'system', subtype: 'init', plugins: [] }),
    assistant([{ type: 'text', text: 'working' }]),
    assistant([{ type: 'tool_use', id: '1', name: 'Read', input: { file_path: String.raw`C:\x\a.md` } }]),
    assistant([{ type: 'tool_use', id: '2', name: 'Write', input: { file_path: String.raw`C:\x\b.md`, content: 'z' } }]),
    assistant([{ type: 'tool_use', id: '3', name: 'Edit', input: { file_path: '/x/c.md', old_string: 'a', new_string: 'b' } }]),
    assistant([{ type: 'tool_use', id: '4', name: 'Bash', input: { command: 'node s.mjs check .' } }]),
    line({ type: 'result', subtype: 'success', is_error: false, result: 'final answer', total_cost_usd: 0.0123 }),
  ].join('\n');
  const r = parseStream(out);
  assert.equal(r.events.length, 7);
  assert.deepEqual(r.reads, ['C:/x/a.md']);
  assert.deepEqual(r.writes, ['C:/x/b.md', '/x/c.md']);
  assert.deepEqual(r.bashCommands, ['node s.mjs check .']);
  assert.equal(r.text, 'final answer');
  assert.equal(r.costUsd, 0.0123);
});

test('parseStream skips lines that are not JSON and falls back to assistant text', () => {
  const r = parseStream(['not json', assistant([{ type: 'text', text: 'hello' }]), ''].join('\n'));
  assert.equal(r.events.length, 1);
  assert.equal(r.text, 'hello');
  assert.equal(r.costUsd, 0);
  assert.deepEqual(r.reads, []);
});

test('ledger sums across separate instances sharing a file and refuses at the cap', () => {
  const file = join(tmp('devocd-ledger-'), 'ledger.txt');
  const a = createLedger(file, 1);
  const b = createLedger(file, 1); // stands in for another test process
  a.add(0.6);
  assert.equal(b.total(), 0.6);
  b.assertRoom();
  b.add(0.5);
  assert.throws(() => a.assertRoom(), /cost ceiling/i);
  assert.ok(existsSync(file));
  rmSync(file);
  assert.equal(a.total(), 0);
});

test('ledger remaining() shrinks as spend is added', () => {
  const l = createLedger(join(tmp('devocd-ledger-'), 'l.txt'), 2);
  assert.equal(l.remaining(), 2);
  l.add(0.5);
  assert.equal(l.remaining(), 1.5);
});

test('liveCap defaults to 10 and reads DEVOCD_LIVE_CAP_USD', () => {
  assert.equal(liveCap({}), 10);
  assert.equal(liveCap({ DEVOCD_LIVE_CAP_USD: '3.5' }), 3.5);
  assert.equal(liveCap({ DEVOCD_LIVE_CAP_USD: 'junk' }), 10);
});
