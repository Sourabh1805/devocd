// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { existsSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { parseStream, createLedger, liveCap, touches, assertRunOk, chargeRun } from '../helpers/claude.mjs';
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

const tool = (/** @type {string} */ name, /** @type {any} */ input, /** @type {any} */ extra = {}) => line({ type: 'assistant', ...extra, message: { role: 'assistant', content: [{ type: 'tool_use', id: 'x', name, input }] } });
const toolResult = (/** @type {string} */ content, /** @type {boolean} */ isError = false, /** @type {any} */ extra = {}) => line({ type: 'user', ...extra, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x', content, is_error: isError }] } });
const CWD = '/work/proj';

test('Grep and Glob without a path count as reading the cwd; with a path, that path', () => {
  const r = parseStream([tool('Grep', { pattern: 'x' }), tool('Glob', { pattern: '*.md' }), tool('Grep', { pattern: 'x', path: '/other/dir' }), tool('Glob', { pattern: '*', path: '/g' })].join('\n'), CWD);
  assert.deepEqual(r.reads, [CWD, CWD, '/other/dir', '/g']);
});

test('tool calls made inside a subagent are counted', () => {
  const r = parseStream([
    tool('Read', { file_path: '/sub/a.md' }, { parent_tool_use_id: 'agent1' }),
    tool('Bash', { command: 'cat /sub/b.md' }, { parent_tool_use_id: 'agent1' }),
    toolResult('inside', false, { parent_tool_use_id: 'agent1' }),
  ].join('\n'), CWD);
  assert.deepEqual(r.reads, ['/sub/a.md']);
  assert.deepEqual(r.bashCommands, ['cat /sub/b.md']);
  assert.equal(r.toolResults.length, 1);
});

test('parseStream exports tool results and permission denials', () => {
  const r = parseStream([
    toolResult('plain text'),
    line({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'y', is_error: true, content: [{ type: 'text', text: 'denied here' }] }] } }),
    line({ type: 'result', is_error: false, result: 'ok', total_cost_usd: 0.01, permission_denials: [{ tool_name: 'Read' }] }),
  ].join('\n'), CWD);
  assert.deepEqual(r.toolResults, [{ isError: false, text: 'plain text' }, { isError: true, text: 'denied here' }]);
  assert.deepEqual(r.permissionDenials, [{ tool_name: 'Read' }]);
});

test('touches finds a file through reads, Bash commands or tool-result text, ignoring slash style and Windows case', () => {
  const viaRead = parseStream(tool('Read', { file_path: 'C:\\Work\\Notes.TXT' }), CWD);
  const viaBash = parseStream(tool('Bash', { command: 'cat /work/notes.txt' }), CWD);
  const viaGrep = parseStream([tool('Grep', { pattern: 'x' }), toolResult('/work/proj/notes.txt:1:x')].join('\n'), CWD);
  const viaResult = parseStream(toolResult('found /work/notes.txt here'), CWD);
  const none = parseStream(tool('Read', { file_path: '/elsewhere/x.md' }), CWD);
  const sub = 'c:\\work\\notes.txt';
  assert.ok(touches(viaRead, 'C:/Work/Notes.TXT'));
  assert.ok(touches(viaRead, 'c:/work/notes.txt') === (process.platform === 'win32'));
  assert.ok(touches(viaBash, '/work/notes.txt'));
  assert.ok(touches(viaGrep, 'proj/notes.txt'));
  assert.ok(touches(viaResult, '/work/notes.txt'));
  assert.ok(touches(parseStream(tool('Read', { file_path: sub }), CWD), 'c:/work/notes.txt'));
  assert.equal(touches(none, '/work/notes.txt'), false);
});

test('assertRunOk throws on a non-zero exit, an is_error result, no events, or no result event', () => {
  const ok = [line({ type: 'system', subtype: 'init' }), line({ type: 'result', is_error: false, result: 'x', total_cost_usd: 0.01 })].join('\n');
  assertRunOk({ exitCode: 0, ...parseStream(ok, CWD), stderr: '' });
  assert.throws(() => assertRunOk({ exitCode: 1, ...parseStream(ok, CWD), stderr: 'boom' }), /exit code 1.*boom/s);
  const bad = line({ type: 'result', subtype: 'error_during_execution', is_error: true, result: 'it broke', total_cost_usd: 0.01 });
  assert.throws(() => assertRunOk({ exitCode: 0, ...parseStream(bad, CWD), stderr: '' }), /is_error.*it broke/s);
  assert.throws(() => assertRunOk({ exitCode: 0, ...parseStream('', CWD), stderr: 'nothing' }), /no events/);
  assert.throws(() => assertRunOk({ exitCode: 0, ...parseStream(line({ type: 'system', subtype: 'init' }), CWD), stderr: '' }), /no result/);
});

test('chargeRun records the real cost, or the per-run budget on a timeout or missing cost', () => {
  const l = createLedger(join(tmp('devocd-ledger-'), 'c.txt'), 100);
  chargeRun(l, { costUsd: 0.2, timedOut: false, budgetUsd: 1 });
  assert.equal(l.total(), 0.2);
  chargeRun(l, { costUsd: 0.3, timedOut: true, budgetUsd: 1 });
  assert.equal(l.total(), 1.2);
  chargeRun(l, { costUsd: 0, timedOut: false, budgetUsd: 1 });
  assert.equal(l.total(), 2.2);
});

test('an unparsable ledger line counts as the full cap', () => {
  const file = join(tmp('devocd-ledger-'), 'bad.txt');
  const l = createLedger(file, 5);
  l.add(0.1);
  appendFileSync(file, 'garbage\n');
  assert.equal(l.total(), 5.1);
  assert.throws(() => l.assertRoom(), /cost ceiling/i);
  writeFileSync(file, '0.1\n\n0.2\n');
  assert.ok(Math.abs(l.total() - 0.3) < 1e-9);
});
