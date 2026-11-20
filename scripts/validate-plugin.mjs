// Runs `claude plugin validate . --profile directory --json` and `claude --plugin-dir . plugin details devocd`,
// both local commands with no model call, and applies the repository's pass rule. Exit 0 = pass, or skipped because
// `claude` is not installed; 1 = fail.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { LIMITS } from './lib/tokens.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Findings tolerated until the marketing step, when the owner picks a license
// and supplies an icon: LICENSE_MISSING (no LICENSE file or `license` field)
// and ICON_MISSING. Nothing else is tolerated.
const TOLERATED = new Set(['ICON_MISSING', 'LICENSE_MISSING']);
/** The always-on budget from the spec: name and description of every skill, as `claude plugin details` counts them. */
export const ALWAYS_ON_BUDGET = LIMITS.footprintTokens;

/**
 * How to start claude. No shell, except for the npm shim claude.cmd on Windows, which Node will not spawn without one.
 * When claude is not on PATH, spawning 'claude' fails with ENOENT.
 * @returns {{ file: string, shell: boolean }}
 */
function findClaude() {
  if (process.platform !== 'win32') return { file: 'claude', shell: false };
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (!dir) continue;
    if (existsSync(join(dir, 'claude.exe'))) return { file: join(dir, 'claude.exe'), shell: false };
    if (existsSync(join(dir, 'claude.cmd'))) return { file: join(dir, 'claude.cmd'), shell: true };
  }
  return { file: 'claude', shell: false };
}

/**
 * claude is missing only when it could not be started: ENOENT, or a shell's command-not-found status (127 from sh,
 * 9009 from cmd.exe). Never decided from the output's text, which a real "plugin not found" error would also match.
 * @param {{ error?: any, status: number | null }} run @param {boolean} shell @param {string} [platform]
 */
export function isMissing(run, shell, platform = process.platform) {
  if (run.error?.code === 'ENOENT') return true;
  return shell && run.status === (platform === 'win32' ? 9009 : 127);
}

/**
 * The always-on token figure in `claude plugin details` output, or null when the output has none.
 * @param {string} text
 * @returns {number | null}
 */
export function parseAlwaysOn(text) {
  // "  Always-on:   ~97 tok   added to every session" (2.1.319). "< 20" counts as 20 and "~1.2k" as 1200. The per-component
  // table's lower-case "always-on" header has no colon, so it never matches.
  const m = /^[ \t]*Always-on:[ \t]*(?:~|<)?[ \t]*(\d[\d,]*(?:\.\d+)?)[ \t]*(k)?[ \t]*tok\b/m.exec(text);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, '')) * (m[2] ? 1000 : 1);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/**
 * What is wrong with a `claude plugin validate --json` report, by the repository's rule.
 * @param {any} report
 * @returns {string[]}
 */
export function validateProblems(report) {
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
  return problems;
}

/**
 * What is wrong with `claude plugin details` output: unreadable, or over the always-on budget.
 * @param {string} text
 * @returns {{ tokens: number | null, problem: string | null }}
 */
export function alwaysOnProblem(text) {
  const tokens = parseAlwaysOn(text);
  if (tokens === null) return { tokens, problem: `no always-on figure in the output of claude plugin details: ${text.trim().slice(0, 1500)}` };
  if (tokens > ALWAYS_ON_BUDGET) return { tokens, problem: `always-on is about ${tokens} tokens, over the budget of ${ALWAYS_ON_BUDGET}` };
  return { tokens, problem: null };
}

/** @param {string} msg @returns {never} */
function fail(msg) {
  console.error(`validate-plugin: FAIL: ${msg}`);
  process.exit(1);
}

function main() {
  const claude = findClaude();
  /** @param {string[]} args */
  const run = (args) => (claude.shell
    ? spawnSync(`"${claude.file}" ${args.join(' ')}`, { cwd: root, encoding: 'utf8', shell: true, windowsHide: true })
    : spawnSync(claude.file, args, { cwd: root, encoding: 'utf8', windowsHide: true }));

  // Arguments are fixed strings, so the shell form (Windows npm shim only) quotes nothing but the program path.
  const validate = run(['plugin', 'validate', '.', '--profile', 'directory', '--json']);
  if (isMissing(validate, claude.shell)) {
    console.log('validate-plugin: `claude` is not on PATH; validation skipped.');
    process.exit(0);
  }
  if (validate.error) fail(`claude could not run: ${validate.error.message}`);
  const out = (validate.stdout ?? '').trim();
  const start = out.indexOf('{');
  if (start === -1) fail(`no JSON from claude plugin validate (exit ${validate.status}): ${`${validate.stderr ?? ''}${out}`.slice(0, 500)}`);
  /** @type {any} */
  let report;
  try {
    report = JSON.parse(out.slice(start));
  } catch (e) {
    fail(`output is not valid JSON: ${/** @type {Error} */ (e).message}`);
  }
  const problems = validateProblems(report);

  const details = run(['--plugin-dir', '.', 'plugin', 'details', 'devocd']);
  if (details.error || details.status !== 0) {
    problems.push(`claude plugin details failed (exit ${details.status}): ${`${details.error?.message ?? ''}${details.stderr ?? ''}${details.stdout ?? ''}`.slice(0, 500)}`);
  }
  const always = alwaysOnProblem(`${details.stdout ?? ''}`);
  if (always.problem) problems.push(always.problem);

  if (problems.length) fail(problems.join('\n  '));
  const tolerated = (report.directory?.findings ?? []).filter((/** @type {any} */ f) => TOLERATED.has(f.code)).map((/** @type {any} */ f) => f.code);
  console.log(`validate-plugin: OK; always-on about ${always.tokens} tokens (budget ${ALWAYS_ON_BUDGET})${tolerated.length ? `; tolerated until the marketing step: ${tolerated.join(', ')}` : ''}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
