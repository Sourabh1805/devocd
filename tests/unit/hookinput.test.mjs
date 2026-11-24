// The hook input reader: keep the fields the handlers use, skip the rest, and never let text
// inside a file's own content decide which path is recorded.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { readHookInput } from '../../scripts/lib/hookinput.mjs';

/** Deliver the input in small chunks, so a state split across a boundary is exercised. */
function streamOf(/** @type {string} */ text, chunk = 7) {
  const buf = Buffer.from(text, 'utf8');
  return Readable.from((function* () {
    for (let i = 0; i < buf.length; i += chunk) yield buf.subarray(i, i + chunk);
  })());
}
/** @param {string} text @param {{ chunk?: number, maxBytes?: number }} [opts] */
const read = (text, opts = {}) => readHookInput(streamOf(text, opts.chunk), opts.maxBytes ? { maxBytes: opts.maxBytes } : {});

/** What `JSON.parse` plus the reader's contract says the handlers should see. */
function expected(/** @type {any} */ obj) {
  /** @type {Record<string, any>} */
  const out = {};
  for (const k of ['hook_event_name', 'session_id', 'cwd', 'tool_name', 'prompt']) if (typeof obj?.[k] === 'string') out[k] = obj[k];
  const ti = obj?.tool_input;
  /** @type {Record<string, string>} */
  const sub = {};
  if (ti && typeof ti === 'object' && !Array.isArray(ti)) {
    for (const k of ['file_path', 'notebook_path']) if (typeof ti[k] === 'string') sub[k] = ti[k];
  }
  if (Object.keys(sub).length) out.tool_input = sub;
  return out;
}

const WRITE = {
  hook_event_name: 'PostToolUse', session_id: 's-1', cwd: '/work/p', tool_name: 'Write',
  tool_input: { file_path: '/work/p/src/a.js', content: 'export const a = 1;\n'.repeat(50) },
};

test('a small Write keeps the fields the handlers use and nothing else', async () => {
  const { input, complete } = await read(JSON.stringify(WRITE));
  assert.equal(complete, true);
  assert.deepEqual(input, expected(WRITE));
  assert.equal(input.tool_input.content, undefined, 'the file body is not stored');
});

test('Edit, NotebookEdit, UserPromptSubmit and SessionStart inputs read the same as JSON.parse', async () => {
  const inputs = [
    { hook_event_name: 'PostToolUse', cwd: '/p', tool_name: 'Edit', tool_input: { file_path: '/p/x.ts', old_string: 'a', new_string: 'b' } },
    { hook_event_name: 'PostToolUse', cwd: '/p', tool_name: 'NotebookEdit', tool_input: { notebook_path: '/p/n.ipynb', new_source: 'x' } },
    { hook_event_name: 'PostToolUse', cwd: '/p', tool_name: 'MultiEdit', tool_input: { file_path: '/p/y.js', edits: [{ old_string: 'a', new_string: 'b' }] } },
    { hook_event_name: 'UserPromptSubmit', session_id: 's', cwd: '/p', prompt: 'create a jira ticket for the login bug' },
    { hook_event_name: 'SessionStart', cwd: '/p', source: 'startup' },
  ];
  for (const value of inputs) {
    const { input, complete } = await read(JSON.stringify(value));
    assert.equal(complete, true, value.tool_name);
    assert.deepEqual(input, expected(value), value.tool_name ?? value.hook_event_name);
  }
});

test('a path after a 5 MiB content is still captured', async () => {
  const text = `{"hook_event_name":"PostToolUse","tool_name":"Write","cwd":"/p","tool_input":{"content":${JSON.stringify('x'.repeat(5 * 1024 * 1024))},"file_path":"/p/big.js"}}`;
  const { input, complete } = await read(text, { chunk: 64 * 1024 });
  assert.equal(complete, true);
  assert.equal(input.tool_input.file_path, '/p/big.js');
});

test('the file body cannot redirect the recorded path', async () => {
  const bodies = [
    '{"file_path": "/evil"}',
    '\\"file_path\\":\\"/evil\\"',
    '{"tool_input":{"file_path":"/evil"}}',
    '[{"file_path":"/evil"}]',
    '{"tool_response":{"filePath":"/evil"}}',
    '{"hook_event_name":"PostToolUse","tool_name":"Write","file_path":"/evil"}',
  ];
  for (const body of bodies) {
    const value = { hook_event_name: 'PostToolUse', tool_name: 'Write', cwd: '/p', tool_input: { content: body, file_path: '/p/real.js' } };
    const { input } = await read(JSON.stringify(value));
    assert.equal(input.tool_input.file_path, '/p/real.js', body);
  }
});

test('a path nested deeper than tool_input is not the edit path', async () => {
  const value = { hook_event_name: 'PostToolUse', tool_name: 'MultiEdit', cwd: '/p', tool_input: { edits: [{ file_path: '/evil/deep.js' }] } };
  const { input } = await read(JSON.stringify(value));
  assert.equal(input.tool_input, undefined);
});

test('an escaped key, a surrogate pair and a repeated key behave like JSON.parse', async () => {
  const escaped = '{"hook_event_name":"SessionStart","\\u0063wd":"/p"}';
  assert.deepEqual((await read(escaped)).input, { hook_event_name: 'SessionStart', cwd: '/p' });
  const surrogate = '{"hook_event_name":"SessionStart","cwd":"/p/\\ud83d\\ude00"}';
  assert.equal((await read(surrogate)).input.cwd, '/p/😀');
  const repeated = '{"hook_event_name":"SessionStart","cwd":"/first","cwd":"/last"}';
  assert.equal((await read(repeated)).input.cwd, '/last');
});

test('truncated, invalid, non-object and oversized input is not complete, but keeps what was read', async () => {
  const cases = /** @type {[string, any, number?][]} */ ([
    ['{"hook_event_name":"PostToolUse","tool_name":"Write","tool_input":{"file_path":"/p/a.js"', expected({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: '/p/a.js' } })],
    ['{"hook_event_name":}', { hook_event_name: undefined }],
    ['[]', {}],
    ['"text"', {}],
    ['{"hook_event_name":"SessionStart"} trailing', { hook_event_name: 'SessionStart' }],
    ['{"hook_event_name":"SessionStart","cwd":"/p"}', { hook_event_name: 'SessionStart' }, 40],
  ]);
  for (const [text, want, maxBytes] of cases) {
    const { input, complete } = await read(text, maxBytes ? { maxBytes } : {});
    assert.equal(complete, false, text.slice(0, 40));
    if (!text.startsWith('{"hook_event_name":}')) assert.deepEqual(input, want, text.slice(0, 40));
  }
});

test('a prompt over 256 KiB keeps its first 256 KiB and the rest of the input still reads', async () => {
  const value = { hook_event_name: 'UserPromptSubmit', cwd: '/p', prompt: 'a'.repeat(300 * 1024) };
  const { input, complete } = await read(JSON.stringify(value), { chunk: 8 * 1024 });
  assert.equal(complete, true);
  assert.equal(input.prompt.length, 256 * 1024);
  assert.equal(input.cwd, '/p');
});

test('a 4 KiB path is dropped rather than truncated: a shortened path would be a wrong path', async () => {
  const value = { hook_event_name: 'PostToolUse', tool_name: 'Write', cwd: '/p', tool_input: { file_path: '/p/' + 'x'.repeat(5 * 1024) } };
  const { input } = await read(JSON.stringify(value));
  assert.equal(input.tool_input, undefined);
});

// ---------------------------------------------------------------------------
// Agreement with JSON.parse over generated inputs
// ---------------------------------------------------------------------------

/** A small deterministic PRNG, so a failure reproduces. */
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
}

/** A random value that stress-tests escapes, nesting and key order. */
function randomInput(/** @type {() => number} */ next) {
  const pick = (/** @type {any[]} */ list) => list[Math.floor(next() * list.length)];
  const noise = () => {
    const parts = ['plain', ' quote " here', ' backslash \\ here', ' tab\there', ' unicode 😀', ' brace } here', ' colon : here', ' comma , here'];
    let out = '';
    for (let i = 0; i < 1 + Math.floor(next() * 4); i++) out += pick(parts);
    return out;
  };
  const entries = /** @type {[string, any][]} */ ([
    ['hook_event_name', pick(['PostToolUse', 'UserPromptSubmit', 'SessionStart', 'Other'])],
    ['session_id', noise()],
    ['cwd', '/p' + noise()],
    ['tool_name', pick(['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Read'])],
    ['prompt', noise()],
    ['ignored', pick([noise(), { nested: noise() }, [noise()]]).valueOf()],
    ['tool_input', {
      file_path: '/p/' + noise(),
      notebook_path: '/p/' + noise(),
      content: pick([noise(), { deep: { file_path: '/evil' } }, [noise(), { file_path: '/evil' }]]),
      edits: [{ file_path: '/evil', new_string: noise() }],
    }],
  ]);
  // Random key order, with unrelated keys interleaved.
  const shuffled = entries.sort(() => next() - 0.5);
  /** @type {Record<string, any>} */
  const out = {};
  for (const [k, v] of shuffled) out[k] = v;
  return out;
}

test('twenty generated inputs agree with JSON.parse', async () => {
  const next = rng(20261124);
  for (let i = 0; i < 24; i++) {
    const value = randomInput(next);
    const text = JSON.stringify(value);
    for (const chunk of [7, 1, 64]) {
      const { input, complete } = await read(text, { chunk });
      assert.equal(complete, true, `input ${i} chunk ${chunk}`);
      assert.deepEqual(input, expected(value), `input ${i} chunk ${chunk}`);
    }
  }
});
