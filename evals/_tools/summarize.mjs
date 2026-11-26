#!/usr/bin/env node
// @ts-check
// Read one `claude plugin eval --json` result file and print the T94b report tables as Markdown.
// Deterministic and Node built-ins only. Tool calls and `.devocd/` page reads are not in the
// result file, so they are counted from the per-run trace files when `--traces` names a folder
// holding `<case>__<arm>__<run>.jsonl`; without it those columns print `–`.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @typedef {{ score: number, passed: boolean, turns: number, costUsd: number, judgeCostUsd?: number, error?: string|null, tracePath?: string, graders?: { name: string, passed: boolean, explanation?: string }[] }} Run */
/** @typedef {{ name: string, arms: Record<string, Run[]> }} Case */
/** @typedef {{ schemaVersion?: number, claudeVersion?: string, durationSeconds?: number, costUsd?: number, cases: Case[] }} Result */

export const ARMS = ['plain', 'dump', 'devocd'];

/** @param {string} name @returns {'plain'|'dump'|'devocd'|null} */
export function armOf(name) {
  const m = /-(plain|dump|devocd)$/.exec(name);
  return m ? /** @type {'plain'|'dump'|'devocd'} */ (m[1]) : null;
}

/** @param {string} name @returns {'code'|'team'} */
export function groupOf(name) {
  const base = name.replace(/-(plain|dump|devocd)$/, '');
  return base.startsWith('team-') || base.startsWith('large-team-') ? 'team' : 'code';
}

/**
 * Count tool calls and Read calls on a `.devocd/` path in one trace file.
 * @param {string} text @returns {{ toolCalls: number, devocdPagesRead: number }}
 */
export function traceMetrics(text) {
  let toolCalls = 0;
  let devocdPagesRead = 0;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    /** @type {any} */ let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (event.type !== 'assistant' || !Array.isArray(event.message?.content)) continue;
    for (const block of event.message.content) {
      if (block.type !== 'tool_use') continue;
      toolCalls++;
      const path = typeof block.input?.file_path === 'string' ? block.input.file_path : '';
      if (block.name === 'Read' && /(^|[\\/])\.devocd[\\/]/.test(path)) devocdPagesRead++;
    }
  }
  return { toolCalls, devocdPagesRead };
}

/**
 * Per-run trace metrics, keyed by the file name `<case>__<arm>__<run>.jsonl` in `dir`.
 * A missing file leaves the metrics null, so the tables print `–` instead of a guess.
 * @param {string} dir @returns {(caseName: string, arm: string, run: number) => { toolCalls: number, devocdPagesRead: number } | null}
 */
export function traceReader(dir) {
  return (caseName, arm, run) => {
    const file = join(dir, `${caseName}__${arm}__${run}.jsonl`);
    if (!existsSync(file)) return null;
    return traceMetrics(readFileSync(file, 'utf8'));
  };
}

/** @param {number[]} values @returns {number|null} */
const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
/** @param {number[]} values @returns {[number, number]|null} */
const range = (values) => (values.length ? [Math.min(...values), Math.max(...values)] : null);

/** @param {number|null} n @param {number} digits @returns {string} */
const num = (n, digits) => (n === null || !Number.isFinite(n) ? '–' : n.toFixed(digits));

/**
 * Everything the tables need, as data.
 * @param {Result} result
 * @param {{ tracesDir?: string|null }} [options]
 */
export function summarize(result, options = {}) {
  /** @type {Map<string, { group: 'code'|'team', arm: string, runs: Run[], toolCalls: number[], pages: number[] }>} */
  const buckets = new Map();
  /** @type {Array<{ case: string, group: string, arm: string, runs: { score: number, passed: boolean, cost: number, toolCalls: number|null, pages: number|null, error?: string|null, graders?: Run['graders'] }[] }>} */
  const cases = [];
  const trace = options.tracesDir ? traceReader(options.tracesDir) : null;
  // `claude plugin eval` keeps each run's trace only with --keep-temp; when it is still there,
  // read it in place so the tool-call columns work without copying anything.
  const metricsFor = (/** @type {Run} */ run, /** @type {string} */ caseName, /** @type {string} */ arm, /** @type {number} */ n) => {
    if (trace) return trace(caseName, arm, n);
    if (typeof run.tracePath === 'string' && existsSync(run.tracePath)) return traceMetrics(readFileSync(run.tracePath, 'utf8'));
    return null;
  };

  for (const c of result.cases) {
    const arm = armOf(c.name);
    if (!arm) continue;
    const group = groupOf(c.name);
    const caseName = c.name.replace(/-(plain|dump|devocd)$/, '');
    // `--ablation none` writes one `with` arm and puts the arm in the case name; a two-arm run
    // would key the arm by its own name instead.
    const runs = c.arms?.with ?? c.arms?.[arm] ?? [];
    const key = `${group}/${arm}`;
    if (!buckets.has(key)) buckets.set(key, { group, arm, runs: [], toolCalls: [], pages: [] });
    const bucket = /** @type {NonNullable<ReturnType<typeof buckets.get>>} */ (buckets.get(key));
    const caseRuns = [];
    runs.forEach((run, i) => {
      bucket.runs.push(run);
      const metrics = metricsFor(run, c.name, arm, i + 1);
      if (metrics) { bucket.toolCalls.push(metrics.toolCalls); bucket.pages.push(metrics.devocdPagesRead); }
      caseRuns.push({
        score: run.score,
        passed: run.passed === true,
        cost: (run.costUsd ?? 0) + (run.judgeCostUsd ?? 0),
        toolCalls: metrics ? metrics.toolCalls : null,
        pages: metrics ? metrics.devocdPagesRead : null,
        error: run.error ?? null,
        graders: run.graders,
      });
    });
    cases.push({ case: caseName, group, arm, runs: caseRuns });
  }

  const groups = [...buckets.values()].map((b) => ({
    group: b.group,
    arm: b.arm,
    meanScore: mean(b.runs.map((r) => r.score)),
    correctRuns: b.runs.filter((r) => r.passed === true).length,
    totalRuns: b.runs.length,
    meanCostUsd: mean(b.runs.map((r) => (r.costUsd ?? 0) + (r.judgeCostUsd ?? 0))),
    meanToolCalls: mean(b.toolCalls),
    meanTurns: mean(b.runs.map((r) => r.turns ?? 0)),
    scoreRange: range(b.runs.map((r) => r.score)),
    costRange: range(b.runs.map((r) => (r.costUsd ?? 0) + (r.judgeCostUsd ?? 0))),
    toolRange: range(b.toolCalls),
  }));

  /** @type {string[]} */
  const failures = [];
  for (const c of cases) {
    c.runs.forEach((run, i) => {
      if (run.passed) return;
      const failed = (run.graders ?? []).filter((g) => g.passed === false);
      const names = failed.map((g) => g.name).join(', ') || 'run';
      const why = run.error ?? failed[0]?.explanation ?? 'no grader explanation';
      failures.push(`${c.case}/${c.arm} run ${i + 1}: ${names} failed — ${String(why).replace(/\s+/g, ' ').trim()}`);
    });
  }

  return { groups, cases, failures, claudeVersion: result.claudeVersion ?? null, durationSeconds: result.durationSeconds ?? null };
}

/** @param {ReturnType<typeof summarize>} s @param {{ repo?: string, commit?: string, model?: string, runs?: number }} [meta] */
export function formatMarkdown(s, meta = {}) {
  const lines = [];
  const b = (v) => (v === null ? '–' : String(v));
  lines.push('### Summary by group and arm', '');
  lines.push('| Group | Arm | Mean score | Runs fully correct | Mean cost/run | Mean tool calls | Mean turns |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const group of ['code', 'team']) {
    for (const arm of ARMS) {
      const g = s.groups.find((x) => x.group === group && x.arm === arm);
      if (!g) continue;
      lines.push(`| ${group} | ${arm} | ${num(g.meanScore, 2)} | ${g.correctRuns}/${g.totalRuns} | $${num(g.meanCostUsd, 3)} | ${num(g.meanToolCalls, 1)} | ${num(g.meanTurns, 1)} |`);
    }
  }
  lines.push('', '**Deltas** (devocd − plain, devocd − dump). Each mean with the min–max range across runs; with n = 3 these are differences, not significance.', '');
  for (const group of ['code', 'team']) {
    const get = (/** @type {string} */ arm) => s.groups.find((x) => x.group === group && x.arm === arm);
    const dev = get('devocd');
    if (!dev) continue;
    for (const other of ['plain', 'dump']) {
      const o = get(other);
      if (!o) continue;
      const delta = (/** @type {number|null} */ a, /** @type {number|null} */ b2) => (a === null || b2 === null ? '–' : (a - b2).toFixed(3));
      const span = (/** @type {[number,number]|null} */ r) => (r === null ? '–' : `${r[0].toFixed(2)}–${r[1].toFixed(2)}`);
      lines.push(`- ${group}: devocd − ${other} score ${delta(dev.meanScore, o.meanScore)} (devocd ${span(dev.scoreRange)}, ${other} ${span(o.scoreRange)}); cost/run $${delta(dev.meanCostUsd, o.meanCostUsd)} (devocd $${num(dev.meanCostUsd, 3)}, ${other} $${num(o.meanCostUsd, 3)}); tool calls ${delta(dev.meanToolCalls, o.meanToolCalls)} (devocd ${num(dev.meanToolCalls, 1)}, ${other} ${num(o.meanToolCalls, 1)}).`);
    }
  }
  lines.push('', '### Per case', '');
  lines.push('| Case | Arm | Score (mean, min–max) | Correct runs | Cost/run | Tool calls | DevOCD pages read |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const c of s.cases) {
    const scores = c.runs.map((r) => r.score);
    const scoreText = scores.length ? `${num(mean(scores), 2)} (${(Math.min(...scores)).toFixed(2)}–${(Math.max(...scores)).toFixed(2)})` : '–';
    const tools = c.runs.map((x) => x.toolCalls).filter((x) => x !== null);
    const pages = c.runs.map((x) => x.pages).filter((x) => x !== null);
    const pagesCell = c.arm === 'devocd' && pages.length ? num(mean(pages), 1) : '–';
    lines.push(`| ${c.case} | ${c.arm} | ${scoreText} | ${c.runs.filter((x) => x.passed).length}/${c.runs.length} | $${num(mean(c.runs.map((x) => x.cost)), 3)} | ${tools.length ? num(mean(tools), 1) : '–'} | ${pagesCell} |`);
  }
  lines.push('', '### Failures', '');
  if (s.failures.length === 0) lines.push('No failed runs.');
  else for (const f of s.failures) lines.push(`- ${f}`);
  return { markdown: lines.join('\n'), summaryJson: toSummaryJson(s, meta) };
}

/** The committed evidence shape from the brief. @param {ReturnType<typeof summarize>} s @param {{ repo?: string, commit?: string, model?: string, runs?: number }} [meta] */
export function toSummaryJson(s, meta = {}) {
  return {
    repo: meta.repo ?? '',
    commit: meta.commit ?? '',
    model: meta.model ?? 'sonnet',
    runs: meta.runs ?? 0,
    spendUsd: 0,
    groups: s.groups.map((g) => ({
      group: g.group,
      arm: g.arm,
      meanScore: g.meanScore ?? 0,
      correctRuns: g.correctRuns,
      totalRuns: g.totalRuns,
      meanCostUsd: g.meanCostUsd ?? 0,
      meanToolCalls: g.meanToolCalls ?? 0,
      meanTurns: g.meanTurns ?? 0,
    })),
    cases: s.cases.map((c) => ({
      case: c.case,
      arm: c.arm,
      scores: c.runs.map((r) => r.score),
      costsUsd: c.runs.map((r) => r.cost),
      toolCalls: c.runs.map((r) => r.toolCalls ?? 0),
      devocdPagesRead: c.runs.map((r) => r.pages ?? 0),
    })),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  /** @param {string} flag @returns {string|null} */
  const arg = (flag) => {
    const i = process.argv.indexOf(flag);
    return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
  };
  const file = arg('--json');
  if (!file) {
    console.error('usage: node evals/_tools/summarize.mjs --json <result.json> [--traces <dir>] [--out-md <file>] [--out-summary <file>] [--repo <owner/name> --commit <sha> --model <model> --runs <n>]');
    process.exit(2);
  }
  const result = /** @type {Result} */ (JSON.parse(readFileSync(file, 'utf8')));
  const s = summarize(result, { tracesDir: arg('--traces') });
  const runs = arg('--runs');
  const { markdown, summaryJson } = formatMarkdown(s, {
    repo: arg('--repo') ?? undefined,
    commit: arg('--commit') ?? undefined,
    model: arg('--model') ?? undefined,
    runs: runs ? Number(runs) : undefined,
  });
  // The brief's committed file carries the real spend; charge every run's own cost.
  summaryJson.spendUsd = Math.round(result.cases.reduce((sum, c) => sum + Object.values(c.arms ?? {}).flat().reduce((n, r) => n + (r.costUsd ?? 0) + (r.judgeCostUsd ?? 0), 0), 0) * 1e6) / 1e6;
  const outMd = arg('--out-md');
  const outSummary = arg('--out-summary');
  if (outMd) writeFileSync(outMd, `${markdown}\n`);
  if (outSummary) writeFileSync(outSummary, `${JSON.stringify(summaryJson, null, 2)}\n`);
  if (!outMd) console.log(markdown);
  if (outSummary) console.error(`summary: ${basename(outSummary)}`);
}
