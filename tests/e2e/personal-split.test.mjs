// @ts-check
// Live checks of the personal split in /devocd:add-project (decision 4). Skipped unless DEVOCD_LIVE=1. Never run in CI.
// Two runs: one with the answers file not opting in, one opting in; every assertion about the split shares the second.
// The 1,500-line team CLAUDE.md is generated here, not kept as a fixture.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { liveEnabled, runClaude } from '../helpers/claude.mjs';
import { makeCompany } from '../helpers/makeCompany.mjs';
import { git, tmp } from '../helpers/git.mjs';
import { makeTree } from '../helpers/tree.mjs';
import { findBlock } from '../../plugin/scripts/lib/block.mjs';
import { countLines, toPosix, walkFiles } from '../../plugin/scripts/lib/fsutil.mjs';
import { estimateTokens, LIMITS } from '../../plugin/scripts/lib/tokens.mjs';

/** @typedef {Awaited<ReturnType<typeof runClaude>>} Run */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pluginDir = join(repoRoot, 'plugin');
const cli = join(pluginDir, 'scripts', 'devocd.mjs');
const SKIP = liveEnabled() ? false : 'set DEVOCD_LIVE=1 to run';
const LONG = 900_000;
const ANSWERS = 'inputs/answers/api.json';
const NEVER_PUSH = 'Never push to main; open a pull request from a branch instead.';
const USE_PNPM = 'For installs and scripts, use pnpm.';
const sha256 = (/** @type {Buffer | string} */ b) => createHash('sha256').update(b).digest('hex');

/** The review's rule lines: what the user is asked to look at. */
const SECTIONS = ['Git workflow', 'Code review', 'Testing', 'Security', 'Logging', 'Error handling', 'API design', 'Database', 'Migrations',
  'Observability', 'Performance', 'Accessibility', 'Documentation', 'Releases', 'Dependencies', 'Tooling', 'Naming', 'Frontend', 'Mobile',
  'Incident response', 'Feature flags', 'Caching', 'Queues', 'Privacy', 'Data retention', 'Code style', 'Branching', 'Contracts', 'Support'];
const MUST = ['must have a test', 'must be reviewed by a second person', 'must be documented in the wiki', 'must log its failures', 'must be reversible'];
const NEVER = ['Never hard-code', 'Never skip', 'Never disable', 'Never merge without', 'Never log'];
const THING = ['the retry limit', 'a timeout value', 'an owner field', 'the audit trail', 'a rollback step', 'a feature flag', 'the alert route'];

/**
 * A realistic team CLAUDE.md of exactly 1,500 lines: 29 sections of 51 lines, most bullets holding "must" or "never", one
 * unique line each. "Never push to main" sits in the middle of the Git workflow section and "use pnpm" in Tooling has no keyword.
 */
function bigTeamFile() {
  const out = ['# Team engineering guide', ''];
  SECTIONS.forEach((name, s) => {
    out.push(`## ${name}`, '');
    for (let i = 0; i < 49; i++) {
      const id = `${name.slice(0, 3).toUpperCase()}-${String(i + 1).padStart(2, '0')}`;
      if (name === 'Git workflow' && i === 24) out.push(`- ${NEVER_PUSH}`);
      else if (name === 'Tooling' && i === 30) out.push(`- ${USE_PNPM}`);
      else if (i % 5 === 4) out.push(`- The ${name.toLowerCase()} guide is on wiki page ${s * 7 + i} (${id}).`);
      else if (i % 2) out.push(`- ${NEVER[(s + i) % 5]} ${THING[(s * 3 + i) % 7]} in ${name.toLowerCase()} work (${id}).`);
      else out.push(`- A ${name.toLowerCase()} change ${MUST[(s + i) % 5]} (${id}).`);
    }
    out.push('');
  });
  out.length = 1500;
  return out.join('\n') + '\n';
}

function helper(/** @type {string[]} */ ...args) {
  const r = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
  assert.equal(r.status, 0, `devocd ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
}

/** A company as /devocd:install leaves it, with the api repo holding the big team file. Returns the folders. */
function setUp(/** @type {string} */ root, /** @type {Record<string, any>} */ answers) {
  const team = bigTeamFile();
  const { company, repos } = makeCompany(root, { projects: ['api'], teamClaudeMd: { api: team } });
  makeTree(repos.api, {
    'package.json': JSON.stringify({ name: 'payments-api', private: true, scripts: { test: 'node --test' } }, null, 2) + '\n',
    'src/server.ts': "import express from 'express';\nexport const app = express();\n",
    'src/billing/invoice.ts': 'export const total = (cents: number[]) => cents.reduce((a, b) => a + b, 0);\n',
  });
  git(repos.api, 'add', '-A');
  git(repos.api, 'commit', '-q', '-m', 'service');
  makeTree(company, {
    '.devocd/standards/security.md': '# Security\n\n- Dependencies with a known critical vulnerability must be upgraded within 7 days.\n',
    '.devocd/state.draft.json': JSON.stringify({
      version: 1, kind: 'company', name: 'Acme Example Co', description: 'A made-up company used to test DevOCD.', parentFile: 'CLAUDE.md',
      keyRules: ['Never commit secrets, tokens or private keys to any repository.'], sources: [],
    }),
    [ANSWERS]: JSON.stringify({ projectId: 'api', description: 'Payments API: invoices.', sources: [], approvedCommands: ['npm test'], additionalDirectories: false, approval: 'approved', ...answers }, null, 2) + '\n',
  });
  helper('render-parent', company, join(company, '.devocd', 'state.draft.json'));
  return { company, api: repos.api, team };
}

const addProject = (/** @type {string} */ cwd, /** @type {number} */ budgetUsd) => runClaude({
  prompt: `/devocd:add-project api ${ANSWERS}`, cwd, pluginDir, model: 'sonnet', maxTurns: 80, timeoutMs: 800_000, budgetUsd,
  extraArgs: ['--allowedTools', 'Write,Edit,Bash'],
});

/** Everything the agent said, not only its last message. */
const said = (/** @type {Run} */ r) => r.events.filter((e) => e.type === 'assistant')
  .flatMap((e) => (e.message?.content ?? []).filter((/** @type {any} */ b) => b.type === 'text').map((/** @type {any} */ b) => b.text))
  .concat(r.text).join('\n');
const runCheck = (/** @type {string} */ dir) => {
  const c = spawnSync(process.execPath, [cli, 'check', dir, '--json'], { encoding: 'utf8' });
  return { status: c.status, report: c.stdout ? JSON.parse(c.stdout) : null };
};
const state = (/** @type {string} */ dir) => JSON.parse(readFileSync(join(dir, '.devocd', 'state.json'), 'utf8'));
const settingsOf = (/** @type {string} */ dir) => JSON.parse(readFileSync(join(dir, '.claude', 'settings.local.json'), 'utf8'));
const HELPER_CALL = /^node "[^"]+\/scripts\/devocd\.mjs" (preflight|protect|backup|write-block|register|settings|check) [^\n;&|`$<>]+$/;
const launchHas = (/** @type {any} */ report, /** @type {string} */ end) => report.launch.files.some((/** @type {any} */ f) => f.path.endsWith(end));

describe('without opting in', { skip: SKIP }, () => {
  /** @type {string} */ let root; /** @type {string} */ let company; /** @type {string} */ let api; /** @type {string} */ let team;
  /** @type {Run} */ let run;
  before(async () => {
    root = tmp('devocd-split-no-');
    ({ company, api, team } = setUp(root, {}));
    run = await addProject(company, 1);
  }, { timeout: LONG });
  after(() => { if (root) rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); });

  test('without opting in, the team file still loads and its cost is reported', () => {
    assert.equal(sha256(readFileSync(join(api, 'CLAUDE.md'))), sha256(team), 'the team file is byte-identical');
    assert.equal(git(api, 'status', '--porcelain'), '');
    assert.deepEqual(state(api).teamFiles, [{ path: 'CLAUDE.md', sha256: sha256(team), excluded: false }]);
    assert.ok(!existsSync(join(api, '.claude', 'settings.local.json')), 'no setting written');
    assert.ok(!run.bashCommands.some((c) => /devocd\.mjs" settings\b/.test(c)), 'no settings command');
    const { report } = runCheck(api);
    assert.ok(launchHas(report, '/api/CLAUDE.md'), 'the team file still loads at launch');
    const mine = report.launch.files.find((/** @type {any} */ f) => f.path.endsWith('/api/CLAUDE.md'));
    assert.ok(mine.tokens > 5000, `about ${mine.tokens} estimated tokens`);
    assert.match(run.text, /CLAUDE\.md/);
    assert.match(run.text, /estimated/i);
    assert.deepEqual(run.permissionDenials, []);
  });
});

describe('opting in to the personal split', { skip: SKIP }, () => {
  /** @type {string} */ let root; /** @type {string} */ let company; /** @type {string} */ let api; /** @type {string} */ let team;
  /** @type {string} */ let abs;
  /** @type {number} */ let launchBefore; /** @type {number} */ let launchAfter;
  /** @type {Run} */ let run;
  const moved = () => walkFiles(join(api, '.devocd', 'team')).filter((f) => f.endsWith('.md'));
  const pointer = () => { const b = findBlock(readFileSync(join(api, 'CLAUDE.local.md'), 'utf8')); assert.ok(b, 'CLAUDE.local.md has a block'); return b; };

  before(async () => {
    root = tmp('devocd-split-yes-');
    ({ company, api, team } = setUp(root, { personalSplit: true }));
    abs = toPosix(join(api, 'CLAUDE.md'));
    launchBefore = runCheck(api).report.launch.tokens; // no state yet: check still reports what loads
    run = await addProject(company, 2.5);
    launchAfter = runCheck(api).report.launch.tokens;
    console.log(`personal split: launch tokens before ${launchBefore}, after ${launchAfter} (estimated); run cost $${run.costUsd}`);
    console.log(`personal split: block of ${countLines(pointer().inner)} lines, about ${estimateTokens(pointer().inner)} estimated tokens:\n${pointer().inner}`);
    console.log(`personal split: moved files: ${moved().map((f) => `${toPosix(relative(api, f))} (${countLines(readFileSync(f, 'utf8'))})`).join(', ')}`);
  }, { timeout: LONG });
  after(() => { if (root) rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); });

  test('opting in: launch tokens drop, measured by check', () => {
    assert.ok(launchBefore > 5000, `before: ${launchBefore}`);
    assert.ok(launchAfter < launchBefore, `after ${launchAfter} < before ${launchBefore}`);
    assert.ok(launchAfter <= LIMITS.launchTokens, `after: ${launchAfter}`);
    assert.ok(!launchHas(runCheck(api).report, '/api/CLAUDE.md'), 'the team file no longer loads');
    assert.deepEqual(settingsOf(api).claudeMdExcludes.length, 1);
    const [entry] = settingsOf(api).claudeMdExcludes;
    assert.ok(/^([A-Za-z]:)?\//.test(entry) && entry.endsWith('/api/CLAUDE.md') && !entry.includes(String.fromCharCode(92)), entry);
    assert.deepEqual(state(api).teamFiles, [{ path: 'CLAUDE.md', sha256: sha256(team), excluded: true }]);
    assert.ok(run.bashCommands.some((c) => /devocd\.mjs" settings "[^"]+" add-exclude \S/.test(c)), 'the exclude went through the helper');
  });

  test('rule lines, not whole sections, stay inline, including "never push to main"', () => {
    const b = pointer().inner;
    assert.match(b, /never push to main/i);
    assert.doesNotMatch(b, /^#+ *(Git workflow|Code review|Testing|Security)\b/im, 'no whole section is copied');
  });

  test('CLAUDE.local.md stays within 40 lines and 400 tokens', () => {
    const b = pointer().inner;
    assert.ok(countLines(b) <= LIMITS.pointer.lines, `${countLines(b)} lines`);
    assert.ok(estimateTokens(b) <= LIMITS.pointer.tokens, `about ${estimateTokens(b)} estimated tokens`);
    assert.match(b, /\.devocd\/PROJECT\.md/, 'the pointer lines are still there');
  });

  test('the review lists what stays, what moves, and what did not fit, naming "use pnpm"', () => {
    const text = said(run);
    assert.match(text, /use pnpm/i, 'use pnpm is named');
    assert.match(text, /stays?\b|inline/i);
    assert.match(text, /\bmoves?\b|\bmoved\b/i);
    assert.match(text, /did(n't| not) fit|not fit/i);
  });

  test('moved content sits under .devocd/team/, each file within 200 lines, linked from PROJECT.md', () => {
    const files = moved();
    assert.ok(files.length >= 8, `${files.length} reference files for 1,500 lines`);
    const index = readFileSync(join(api, '.devocd', 'PROJECT.md'), 'utf8');
    assert.ok(countLines(index) <= LIMITS.project.lines && estimateTokens(index) <= LIMITS.project.tokens);
    for (const f of files) {
      assert.ok(countLines(readFileSync(f, 'utf8')) <= LIMITS.reference.lines, `${f}`);
      assert.ok(index.includes(toPosix(relative(join(api, '.devocd'), f))), `PROJECT.md links ${f}`);
    }
    // Nothing is lost: most of the team file's lines appear verbatim in the references or in the block.
    const kept = files.map((f) => readFileSync(f, 'utf8')).join('\n') + '\n' + pointer().inner;
    const lines = team.split('\n').filter((l) => l.trim());
    const found = lines.filter((l) => kept.includes(l.trim())).length;
    assert.ok(found / lines.length >= 0.8, `${found} of ${lines.length} lines kept`);
    for (const must of [NEVER_PUSH, USE_PNPM]) assert.ok(kept.includes(must) || /never push to main|use pnpm/i.test(kept), must);
    assert.ok(!existsSync(join(api, '.devocd', 'import')) && !/@\.devocd|^@\S/m.test(kept), 'no @import');
  });

  test('the team file is byte-identical and git status is empty', () => {
    assert.equal(sha256(readFileSync(join(api, 'CLAUDE.md'))), sha256(team));
    assert.equal(git(api, 'status', '--porcelain'), '');
    assert.deepEqual(run.permissionDenials, []);
    const bad = run.bashCommands.filter((c) => !HELPER_CALL.test(c.trim()));
    assert.deepEqual(bad, [], 'every shell command is one plain helper call');
    const status = runCheck(api);
    assert.equal(status.status, 0, JSON.stringify(status.report?.issues));
  });

  test('check warns after the team file changes, though it is excluded', () => {
    appendFileSync(join(api, 'CLAUDE.md'), '- A line added later.\n');
    const { report } = runCheck(api);
    assert.ok(report.issues.some((/** @type {any} */ i) => i.rule === 'team-file/changed' && i.severity === 'warning'), JSON.stringify(report.issues));
    writeFileSync(join(api, 'CLAUDE.md'), team);
    assert.ok(!runCheck(api).report.issues.some((/** @type {any} */ i) => i.rule === 'team-file/changed'));
  });

  test('undo removes the exclude and the team file loads again', () => {
    helper('settings', api, 'remove-exclude', abs);
    const c = runCheck(api).report;
    assert.ok(launchHas(c, '/api/CLAUDE.md'), 'the team file loads again');
    console.log(`personal split: launch tokens after undo ${c.launch.tokens} (estimated)`);
    assert.ok(c.launch.tokens > launchAfter, `${c.launch.tokens} > ${launchAfter}`);
    assert.ok(!existsSync(join(api, '.claude', 'settings.local.json')) || !settingsOf(api).claudeMdExcludes);
  });
});
