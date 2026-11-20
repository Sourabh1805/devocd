// @ts-check
// The validator's parsing and its "claude is missing" rule, on captured output. The real `claude` runs only in
// `node scripts/validate-plugin.mjs` (CI installs it); these tests need no `claude` on PATH.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALWAYS_ON_BUDGET, alwaysOnProblem, isMissing, parseAlwaysOn, validateProblems } from '../../scripts/validate-plugin.mjs';

/** Captured from `claude --plugin-dir plugin plugin details devocd`, Claude Code 2.1.319, Windows, 2026-11-09. */
const DETAILS = `devocd 0.1.0
  Description: Skills that set up company-wide Claude Code standards and review pull requests against them.
  Source: devocd@inline

Component inventory
  Skills (4)  add-project, check, install, pr-review
  Agents (0)
  Hooks (0)
  MCP servers (0)
  LSP servers (0)

Projected token cost
  Always-on:   ~97 tok   added to every session

Per-component (rounded)
  component    always-on  on-invoke
  add-project       < 20      ~1.3k
  check              ~20       ~920
  install            ~20      ~1.2k
  pr-review          ~30      ~1.3k

  On-invoke cost is paid each time a skill or agent fires.
  Token counts are estimates and may differ from actual usage.
`;
const withAlwaysOn = (/** @type {string} */ figure) => DETAILS.replace('~97 tok', figure);

test('the always-on figure is read from the captured plugin details output', () => {
  assert.equal(parseAlwaysOn(DETAILS), 97);
  assert.deepEqual(alwaysOnProblem(DETAILS), { tokens: 97, problem: null });
});

test('other forms of the figure: thousands, a less-than, no tilde, CRLF', () => {
  assert.equal(parseAlwaysOn(withAlwaysOn('~1.2k tok')), 1200);
  assert.equal(parseAlwaysOn(withAlwaysOn('< 20 tok')), 20);
  assert.equal(parseAlwaysOn(withAlwaysOn('100 tok')), 100);
  assert.equal(parseAlwaysOn(DETAILS.replace(/\n/g, '\r\n')), 97);
});

test('over the budget fails; at the budget passes', () => {
  assert.equal(ALWAYS_ON_BUDGET, 190);
  assert.equal(alwaysOnProblem(withAlwaysOn('~190 tok')).problem, null);
  assert.match(String(alwaysOnProblem(withAlwaysOn('~191 tok')).problem), /191 tokens, over the budget of 190/);
  assert.match(String(alwaysOnProblem(withAlwaysOn('~1.2k tok')).problem), /1200 tokens/);
});

test('output with no always-on line fails rather than passing; the per-component header is not the figure', () => {
  const noLine = DETAILS.split('\n').filter((l) => !l.includes('Always-on:')).join('\n');
  assert.equal(parseAlwaysOn(noLine), null, 'the lower-case table header "always-on" is not read as the figure');
  assert.match(String(alwaysOnProblem(noLine).problem), /no always-on figure/);
  assert.match(String(alwaysOnProblem('').problem), /no always-on figure/);
  assert.equal(parseAlwaysOn('error: Plugin "devocd" not found'), null);
});

test('claude is missing only on ENOENT or the shell command-not-found status, never by message', () => {
  assert.equal(isMissing({ error: Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' }), status: null }, false), true);
  assert.equal(isMissing({ status: 127 }, true, 'linux'), true);
  assert.equal(isMissing({ status: 9009 }, true, 'win32'), true);
  assert.equal(isMissing({ status: 127 }, false, 'linux'), false, 'no shell: 127 is claude exiting, not a missing command');
  assert.equal(isMissing({ status: 1 }, true, 'win32'), false);
  // A real "not found" error from claude (a plugin path change, say) is a failure, not a skip.
  assert.equal(isMissing(/** @type {any} */ ({ status: 1, stderr: 'error: plugin not found', stdout: '' }), false), false);
  assert.equal(isMissing(/** @type {any} */ ({ status: 1, stderr: "'claude' is not recognized as an internal or external command" }), false), false);
});

test('the validate report rule: a clean report passes', () => {
  const clean = { success: true, manifest: { errors: [] }, directory: { incomplete: false, undecided: [], findings: [] } };
  assert.deepEqual(validateProblems(clean), []);
});

test('the validate report rule: nothing is tolerated, so a former allowance now fails', () => {
  const formerlyTolerated = { success: false, manifest: { errors: [] }, directory: { incomplete: false, undecided: [], findings: [{ code: 'LICENSE_MISSING', message: 'no license', blocking: true }, { code: 'ICON_MISSING', message: 'no icon', blocking: true }] } };
  const problems = validateProblems(formerlyTolerated);
  assert.ok(!problems.includes('success is not true'), 'the specific findings explain it');
  assert.ok(problems.includes('LICENSE_MISSING: no license'));
  assert.ok(problems.includes('ICON_MISSING: no icon'));
});

test('the validate report rule: blocking and holding findings fail, and so do missing manifest fields', () => {
  const base = { success: true, manifest: { errors: [] }, directory: { incomplete: false, undecided: [] } };
  assert.deepEqual(validateProblems({ ...base, directory: { ...base.directory, findings: [{ code: 'X', message: 'broken', blocking: true }] } }), ['X: broken']);
  assert.deepEqual(validateProblems({ ...base, directory: { ...base.directory, findings: [{ code: 'H', message: 'held', hold: true }] } }), ['H: held']);
  assert.deepEqual(validateProblems({ success: false, manifest: { errors: [{ code: 'NO_LICENSE' }] }, directory: { incomplete: false, undecided: [] } }), ['manifest has errors']);
  assert.deepEqual(validateProblems({ success: false, manifest: { errors: [] }, directory: { incomplete: false, undecided: [] } }), ['success is not true']);
  assert.ok(validateProblems({ success: true, directory: { incomplete: true, undecided: [] } }).includes('directory.incomplete is not false'));
  assert.ok(validateProblems({ success: true, directory: { incomplete: false, undecided: ['a'] } }).includes('directory.undecided is not empty'));
  assert.ok(validateProblems({ success: true, directory: { incomplete: false } }).includes('directory.undecided is not empty'), 'a missing undecided list is not an empty one');
});
