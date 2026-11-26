// @ts-check
// The T94b summary tool must be deterministic and must not invent numbers. One rule per test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { armOf, formatMarkdown, groupOf, summarize, toSummaryJson, traceMetrics, traceReader } from '../../evals/_tools/summarize.mjs';

/** @typedef {import('../../evals/_tools/summarize.mjs').Result} Result */

/** @param {string} name @param {any[]} runs @returns {any} */
const arm = (name, runs) => ({ name, arms: { with: runs } });
/** @param {Partial<any>} [changes] */
const run = (changes = {}) => ({ score: 1, passed: true, turns: 4, costUsd: 0.1, judgeCostUsd: 0.01, error: null, graders: [], ...changes });

/** @returns {Result} */
const RESULT = /** @type {Result} */ ({
  claudeVersion: '2.1.325',
  durationSeconds: 100,
  cases: [
    arm('large-alpha-plain', [run(), run({ score: 0, passed: false, turns: 6, graders: [{ name: 'answer', passed: false, explanation: 'judge votes: FAIL FAIL FAIL' }] })]),
    arm('large-alpha-dump', [run({ score: 0.5, passed: false, costUsd: 0.2, judgeCostUsd: 0.05 }), run({ score: 0.5, passed: false, costUsd: 0.2, judgeCostUsd: 0.05 })]),
    arm('large-alpha-devocd', [run({ score: 0.5, passed: false, costUsd: 0.3 }), run({ score: 0.5, passed: false, costUsd: 0.3 })]),
    arm('large-team-beta-plain', [run({ score: 0, passed: false }), run({ score: 0, passed: false })]),
    arm('large-team-beta-devocd', [run({ score: 1, passed: true }), run({ score: 1, passed: true })]),
  ],
});

/** @param {string} path @param {string} text */
const write = (path, text) => writeFileSync(path, text);

/** A trace with two tool uses, one of them a Read of a `.devocd/` page. */
const TRACE = [
  JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Grep', input: { pattern: 'x' } }] } }),
  JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: 'C:/ws/.devocd/PROJECT.md' } }] } }),
  JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Grep', input: { path: 'C:/ws/.devocd' } }] } }),
  JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'done' }] } }),
].join('\n');

test('a case name gives its arm and its group', () => {
  for (const [name, armName, group] of [
    ['large-alpha-plain', 'plain', 'code'],
    ['large-alpha-dump', 'dump', 'code'],
    ['large-alpha-devocd', 'devocd', 'code'],
    ['large-team-beta-plain', 'plain', 'team'],
    ['large-team-beta-devocd', 'devocd', 'team'],
    ['team-release-dump', 'dump', 'team'],
    ['stale-mark-plain', 'plain', 'code'],
  ]) {
    assert.equal(armOf(String(name)), armName, String(name));
    assert.equal(groupOf(String(name)), group, String(name));
  }
  assert.equal(armOf('no-arm'), null);
});

test('trace metrics count every tool use but only Read calls on a .devocd path', () => {
  assert.deepEqual(traceMetrics(TRACE), { toolCalls: 3, devocdPagesRead: 1 });
  assert.deepEqual(traceMetrics(''), { toolCalls: 0, devocdPagesRead: 0 });
  assert.deepEqual(traceMetrics('not json\n{"type":"assistant"}'), { toolCalls: 0, devocdPagesRead: 0 });
});

test('a missing trace file is null, never zero', () => {
  const dir = mkdtempSync(join(tmpdir(), 'devocd-summarize-'));
  try {
    write(join(dir, 'large-alpha-plain__plain__1.jsonl'), TRACE);
    const read = traceReader(dir);
    assert.deepEqual(read('large-alpha-plain', 'plain', 1), { toolCalls: 3, devocdPagesRead: 1 });
    assert.equal(read('large-alpha-plain', 'plain', 2), null);
    assert.equal(read('large-alpha-plain', 'devocd', 1), null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('group means, fully-correct runs, cost per run and turns come from the runs', () => {
  const s = summarize(RESULT);
  const code = s.groups.filter((g) => g.group === 'code');
  assert.deepEqual(code.map((g) => g.arm).sort(), ['devocd', 'dump', 'plain']);
  const plain = code.find((g) => g.arm === 'plain');
  assert.equal(plain?.meanScore, 0.5);
  assert.equal(plain?.correctRuns, 1);
  assert.equal(plain?.totalRuns, 2);
  assert.equal(plain?.meanCostUsd, 0.11); // (0.1 + 0.01) each
  assert.equal(plain?.meanTurns, 5);
  const dump = code.find((g) => g.arm === 'dump');
  assert.equal(dump?.meanCostUsd, 0.25); // judge cost included
  const team = s.groups.filter((g) => g.group === 'team');
  assert.equal(team.find((g) => g.arm === 'devocd')?.correctRuns, 2);
});

test('per-case rows carry the score mean, its min–max and the correct-run count', () => {
  const s = summarize(RESULT);
  const md = formatMarkdown(s).markdown;
  assert.match(md, /\| large-alpha \| plain \| 0\.50 \(0\.00–1\.00\) \| 1\/2 \|/);
  assert.match(md, /\| large-alpha \| dump \| 0\.50 \(0\.50–0\.50\) \| 0\/2 \|/);
});

test('tool calls and page reads appear when traces exist and print – when they do not', () => {
  const dir = mkdtempSync(join(tmpdir(), 'devocd-summarize-'));
  try {
    write(join(dir, 'large-alpha-plain__plain__1.jsonl'), TRACE);
    write(join(dir, 'large-alpha-plain__plain__2.jsonl'), TRACE);
    write(join(dir, 'large-alpha-devocd__devocd__1.jsonl'), TRACE);
    write(join(dir, 'large-alpha-devocd__devocd__2.jsonl'), TRACE);
    const withTraces = formatMarkdown(summarize(RESULT, { tracesDir: dir })).markdown;
    // Tool calls are shown for every arm; page reads only for the devocd arm.
    assert.match(withTraces, /\| large-alpha \| plain \| 0\.50 \(0\.00–1\.00\) \| 1\/2 \| \$0\.110 \| 3\.0 \| – \|/);
    assert.match(withTraces, /\| large-alpha \| devocd \| 0\.50 \(0\.50–0\.50\) \| 0\/2 \| \$0\.310 \| 3\.0 \| 1\.0 \|/);
    const noTraces = formatMarkdown(summarize(RESULT)).markdown;
    assert.match(noTraces, /\| large-alpha \| plain \| 0\.50 \(0\.00–1\.00\) \| 1\/2 \| \$0\.110 \| – \| – \|/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a failed run is one line naming the case, the arm, the grader and the reason', () => {
  const s = summarize(RESULT);
  assert.equal(s.failures.length, 7);
  assert.equal(s.failures[0], 'large-alpha/plain run 2: answer failed — judge votes: FAIL FAIL FAIL');
  assert.match(formatMarkdown(s).markdown, /### Failures\n\n- large-alpha\/plain run 2: answer failed/);
});

test('the committed summary JSON has the shape the brief fixes', () => {
  const json = toSummaryJson(summarize(RESULT), { repo: 'owner/name', commit: 'abc', model: 'sonnet', runs: 3 });
  assert.deepEqual(Object.keys(json), ['repo', 'commit', 'model', 'runs', 'spendUsd', 'groups', 'cases']);
  assert.equal(json.repo, 'owner/name');
  assert.deepEqual(Object.keys(json.groups[0]), ['group', 'arm', 'meanScore', 'correctRuns', 'totalRuns', 'meanCostUsd', 'meanToolCalls', 'meanTurns']);
  assert.deepEqual(Object.keys(json.cases[0]), ['case', 'arm', 'scores', 'costsUsd', 'toolCalls', 'devocdPagesRead']);
  assert.deepEqual(json.cases[0].scores, [1, 0]);
});

test('the same input always prints the same tables', () => {
  assert.equal(formatMarkdown(summarize(RESULT)).markdown, formatMarkdown(summarize(RESULT)).markdown);
});
