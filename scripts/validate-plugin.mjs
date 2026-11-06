// @ts-check
// Runs `claude plugin validate plugin --profile directory --json` and applies
// the repository's pass rule. Exit 0 = pass or skipped, 1 = fail.
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Findings tolerated until the marketing step, when the owner picks a license
// and supplies an icon: LICENSE_MISSING (no LICENSE file or `license` field)
// and ICON_MISSING. Nothing else is tolerated.
const TOLERATED = new Set(['ICON_MISSING', 'LICENSE_MISSING']);

/** @param {string} msg */
function fail(msg) {
  console.error(`validate-plugin: FAIL: ${msg}`);
  process.exit(1);
}

// shell: true so Windows resolves claude.cmd; arguments are fixed strings.
const run = spawnSync('claude plugin validate plugin --profile directory --json', {
  cwd: root, encoding: 'utf8', shell: true,
});
const out = (run.stdout ?? '').trim();
const start = out.indexOf('{');

if (start === -1) {
  const text = `${run.stderr ?? ''}${out}`;
  const missing = run.error || /not recognized|not found|ENOENT/i.test(text);
  if (missing) {
    console.log('validate-plugin: `claude` is not on PATH; validation skipped.');
    process.exit(0);
  }
  fail(`no JSON from claude (exit ${run.status}): ${text.slice(0, 500)}`);
}

/** @type {any} */
let report;
try {
  report = JSON.parse(out.slice(start));
} catch (e) {
  fail(`output is not valid JSON: ${/** @type {Error} */ (e).message}`);
}

const problems = [];
// `success` is false whenever a blocking finding exists, tolerated ones
// included, so on its own it can't be the rule. Accept success === false only
// when the manifest has no errors and the loop below finds nothing untolerated.
if (report.success !== true && (report.manifest?.errors ?? []).length > 0) problems.push('manifest has errors');
if (report.success !== true && !(report.directory?.findings ?? []).some((/** @type {any} */ f) => TOLERATED.has(f.code))) problems.push('success is not true and no tolerated finding explains it');
const dir = report.directory ?? {};
if (dir.incomplete !== false) problems.push('directory.incomplete is not false');
if (!Array.isArray(dir.undecided) || dir.undecided.length > 0) problems.push('directory.undecided is not empty');
for (const f of dir.findings ?? []) {
  if (TOLERATED.has(f.code)) continue;
  if (f.blocking || f.hold) problems.push(`${f.code}: ${f.message}`);
}

if (problems.length) fail(problems.join('\n  '));
const tolerated = (dir.findings ?? []).filter((/** @type {any} */ f) => TOLERATED.has(f.code)).map((/** @type {any} */ f) => f.code);
console.log(`validate-plugin: OK${tolerated.length ? ` (tolerated until the marketing step: ${tolerated.join(', ')})` : ''}`);
