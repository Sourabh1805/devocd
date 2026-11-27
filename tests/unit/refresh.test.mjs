import { workspace, companyState, projectState as defaultProjectState, gitRepo } from '../helpers/workspace.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkTree } from '../../scripts/lib/check.mjs';
import { spawnSync } from 'node:child_process';
import { makeTree } from '../helpers/tree.mjs';
import { git } from '../helpers/git.mjs';
import { toPosix } from '../../scripts/lib/fsutil.mjs';
import { refreshStatus, planRefresh, completeRefresh, baselineRefresh, sourceFingerprint, clearStale } from '../../scripts/lib/refresh.mjs';

function fixture(t) {
  return workspace(t, { projects: { api: {
    pages: { 'PROJECT.md': '# API\n', 'pointer.md': 'Start with PROJECT.md' },
    files: {
      'CLAUDE.local.md': '<!-- devocd:begin -->\nStart with PROJECT.md\n<!-- devocd:end -->\n',
      'src/a.js': 'export const a = 1;',
    },
  } } }).project('api');
}

test('manual refresh records evidence; additions, edits and deletions become stale', t => {
  const root = fixture(t);
  assert.equal(refreshStatus(root).reason, 'no-baseline');
  planRefresh(root);
  writeFileSync(join(root, 'CLAUDE.local.md'), '<!-- devocd:begin -->\nNew generated pointer\n<!-- devocd:end -->\n');
  completeRefresh(root);
  assert.equal(refreshStatus(root).needsRefresh, false);
  writeFileSync(join(root, 'src/a.js'), 'export const a = 2;');
  writeFileSync(join(root, 'src/b.js'), 'new');
  let status = refreshStatus(root);
  assert.equal(status.needsRefresh, true);
  assert.ok(status.changed.some(f => f.path === 'src/a.js' && f.kind === 'modified'));
  assert.ok(status.changed.some(f => f.path === 'src/b.js' && f.kind === 'added'));
  rmSync(join(root, 'src/a.js'));
  assert.ok(refreshStatus(root).changed.some(f => f.kind === 'deleted'));
});

test('refresh-baseline renders the graph and records the baseline in one step at setup', t => {
  const root = fixture(t);
  assert.equal(refreshStatus(root).reason, 'no-baseline');
  const r = baselineRefresh(root);
  assert.equal(r.current, true);
  assert.equal(refreshStatus(root).needsRefresh, false);
});

test('editing a company standards page marks the pages governed by it stale', t => {
  const block = '<!-- devocd:begin -->\nStart with PROJECT.md\n<!-- devocd:end -->\n';
  const root = workspace(t, {
    company: { standards: { 'index.md': '# Standards\n\n- Old: [Security](security.md).\n', 'security.md': '# Security\n\n- Old rule.\n' } },
    projects: { api: {
      pages: {
        'PROJECT.md': '# API\n',
        'pointer.md': 'Start with PROJECT.md',
        'code/billing/index.md': '# Billing\nParent: [PROJECT](../../PROJECT.md)\nScope: src/**\n\nBilling summary.\n\nStandards: security\n',
      },
      files: { 'CLAUDE.local.md': block, 'src/a.js': 'export const a = 1;' },
    } },
  }).project('api');

  planRefresh(root);
  completeRefresh(root);
  assert.equal(refreshStatus(root).needsRefresh, false);

  // The routing index is not a topic: editing it alone asks for no refresh.
  writeFileSync(join(root, '..', '.devocd', 'standards', 'index.md'), '# Standards\n\n- New: [Security](security.md).\n');
  const indexOnly = refreshStatus(root);
  assert.equal(indexOnly.needsRefresh, false);
  assert.deepEqual(indexOnly.standardsChanged, []);
  assert.deepEqual(indexOnly.stalePages, []);

  writeFileSync(join(root, '..', '.devocd', 'standards', 'security.md'), '# Security\n\n- New rule.\n');
  const status = refreshStatus(root);
  assert.equal(status.needsRefresh, true);
  assert.equal(status.reason, 'standards-changed');
  assert.deepEqual(status.standardsChanged, ['security']);
  assert.deepEqual(status.stalePages, ['code/billing/index.md']);
});

/** What onboarding itself creates, after discovery: project state, the pointer block, local settings. */
function onboard(/** @type {string} */ root) {
  makeTree(root, {
    '.devocd/state.json': JSON.stringify(defaultProjectState()),
    '.devocd/PROJECT.md': '# API\n', '.devocd/pointer.md': 'Start with PROJECT.md',
    'CLAUDE.local.md': '<!-- devocd:begin -->\nStart with PROJECT.md\n<!-- devocd:end -->\n',
    '.claude/settings.local.json': '{}',
  });
}

test('first-time setup: onboarding\'s own files never change the discovery fingerprint', t => {
  const root = workspace(t).root;
  // A genuinely fresh project: discovery runs BEFORE .devocd exists.
  makeTree(root, { 'src/a.js': 'export const a = 1;' });
  const atDiscovery = sourceFingerprint(root);
  onboard(root);
  assert.equal(sourceFingerprint(root), atDiscovery, 'creating .devocd, the pointer and local settings is not a source change');
  const r = baselineRefresh(root, atDiscovery);
  assert.equal(r.current, true, JSON.stringify(r));
  assert.equal(refreshStatus(root).needsRefresh, false);
});

test('first-time setup in a git repository records its baseline too', t => {
  const root = workspace(t).root;
  makeTree(root, { 'src/a.js': 'export const a = 1;', '.gitignore': 'node_modules/\n' });
  const init = spawnSync('git', ['-c', 'gc.auto=0', '-C', root, 'init', '-q'], { encoding: 'utf8' });
  assert.equal(init.status, 0, init.stderr);
  const atDiscovery = sourceFingerprint(root);
  onboard(root);
  const r = baselineRefresh(root, atDiscovery);
  assert.equal(r.current, true, JSON.stringify(r));
});

test('refresh-baseline refuses to bless source that changed since discovery', t => {
  const root = fixture(t);
  const atGather = sourceFingerprint(root);
  // The user keeps coding between discovery and approval.
  writeFileSync(join(root, 'src/a.js'), 'export const a = 99;');
  const r = baselineRefresh(root, atGather);
  assert.equal(r.current, false);
  assert.equal(r.baseline, 'source-changed-during-setup');
  assert.equal(refreshStatus(root).reason, 'no-baseline');
  // Unchanged source with the matching fingerprint records the baseline.
  const ok = baselineRefresh(root, sourceFingerprint(root));
  assert.equal(ok.current, true);
  assert.equal(refreshStatus(root).needsRefresh, false);
});

test('refresh-baseline with a real source gap renders the graph but records no baseline', t => {
  const root = fixture(t);
  makeTree(root, { 'src/huge.py': 'x'.repeat(256 * 1024 + 1) });
  const r = baselineRefresh(root);
  assert.equal(r.current, false);
  assert.equal(refreshStatus(root).reason, 'no-baseline');
});

test('bulk files and notebook outputs neither block the baseline nor make it stale', t => {
  const root = fixture(t);
  const nb = (/** @type {string} */ src, /** @type {string} */ img) => JSON.stringify({
    cells: [{ cell_type: 'code', source: [src], outputs: [{ data: { 'image/png': img.repeat(300 * 1024) } }] }],
  });
  makeTree(root, { 'integration.log': 'x'.repeat(300 * 1024), 'package-lock.json': '{}', 'analysis.ipynb': nb('import pandas\n', 'A') });
  // The log alone once flipped the inventory incomplete and this call threw KNOWLEDGE_LIMIT.
  planRefresh(root);
  completeRefresh(root);
  assert.equal(refreshStatus(root).needsRefresh, false);
  // Re-running the notebook (outputs change, source does not) and log growth stay current.
  writeFileSync(join(root, 'analysis.ipynb'), nb('import pandas\n', 'B'));
  writeFileSync(join(root, 'integration.log'), 'y'.repeat(400 * 1024));
  assert.equal(refreshStatus(root).needsRefresh, false);
  // An edited cell is a real change.
  writeFileSync(join(root, 'analysis.ipynb'), nb('import numpy\n', 'B'));
  const status = refreshStatus(root);
  assert.equal(status.needsRefresh, true);
  assert.ok(status.changed.some(f => f.path === 'analysis.ipynb' && f.kind === 'modified'));
});

test('concurrent edits and failed project checks cannot replace the last good baseline', t => {
  const root = fixture(t);
  planRefresh(root); completeRefresh(root);
  const baseline = readFileSync(join(root, '.devocd/refresh.json'), 'utf8');
  planRefresh(root);
  writeFileSync(join(root, 'src/a.js'), 'changed during discovery');
  assert.throws(() => completeRefresh(root), /Source changed during refresh/);
  assert.equal(readFileSync(join(root, '.devocd/refresh.json'), 'utf8'), baseline);
  planRefresh(root);
  rmSync(join(root, '.devocd/PROJECT.md'));
  assert.throws(() => completeRefresh(root), /checks failed/);
  assert.equal(readFileSync(join(root, '.devocd/refresh.json'), 'utf8'), baseline);
});

test('partial inventories and invalid saved evidence never report fresh', t => {
  const root = fixture(t);
  writeFileSync(join(root, 'src/huge.js'), 'x'.repeat(256 * 1024 + 1));
  assert.throws(() => planRefresh(root), /partial/);
  assert.equal(refreshStatus(root).needsRefresh, true);
  writeFileSync(join(root, '.devocd/refresh.json'), '{}');
  assert.throws(() => refreshStatus(root), /snapshot is invalid/);
});

test('skipped knowledge pages never report or record knowledge as current', t => {
  const root = fixture(t);
  makeTree(root, { '.devocd/bad.md': 'a\0b' });
  const r = baselineRefresh(root);
  assert.equal(r.current, false);
  assert.equal(r.baseline, 'skipped-pages');
  assert.equal(refreshStatus(root).reason, 'no-baseline');

  const ok = fixture(t);
  baselineRefresh(ok);
  const baseline = readFileSync(join(ok, '.devocd/refresh.json'), 'utf8');
  planRefresh(ok);
  makeTree(ok, { '.devocd/bad.md': 'a\0b' });
  assert.throws(() => completeRefresh(ok), { code: 'INVALID_DRAFT', message: /skipped \(1\)/ });
  assert.equal(readFileSync(join(ok, '.devocd/refresh.json'), 'utf8'), baseline);
});

// --- T99: the completion helpers report the check result they were gated on ----

/** @param {string} root */
function counts(root) {
  const c = { errors: 0, warnings: 0, information: 0 };
  for (const i of checkTree(root).issues) {
    if (i.severity === 'error') c.errors += 1;
    else if (i.severity === 'warning') c.warnings += 1;
    else c.information += 1;
  }
  return c;
}

/** A fixture that is valid but not clean, so the counts are not all zero. */
function warned(t) {
  return workspace(t, { projects: { api: {
    pages: { 'PROJECT.md': '# API\n', 'pointer.md': 'Start with PROJECT.md', 'code/b.md': '# B\n\nNothing useful.\n' },
    files: {
      'CLAUDE.local.md': '<!-- devocd:begin -->\nStart with PROJECT.md\n<!-- devocd:end -->\n',
      'src/a.js': 'export const a = 1;',
    },
  } } }).project('api');
}

test('refresh-baseline reports the check counts it was gated on', t => {
  const root = warned(t);
  const expected = counts(root);
  const r = baselineRefresh(root);
  assert.equal(r.current, true);
  assert.deepEqual(r.checks, expected);
  assert.equal(r.checks.errors, 0);
  assert.ok(r.checks.warnings + r.checks.information > 0, 'the fixture has something to report');
});

test('refresh-complete reports the check counts it was gated on', t => {
  const root = warned(t);
  planRefresh(root);
  const expected = counts(root);
  const r = completeRefresh(root);
  assert.equal(r.current, true);
  assert.deepEqual(r.checks, expected);
});

test('every current:false path carries checks too', t => {
  // Source changed since discovery.
  const changed = warned(t);
  const atGather = sourceFingerprint(changed);
  writeFileSync(join(changed, 'src/a.js'), 'export const a = 99;');
  const beforeChanged = counts(changed);
  const r1 = baselineRefresh(changed, atGather);
  assert.equal(r1.current, false);
  assert.equal(r1.baseline, 'source-changed-during-setup');
  assert.deepEqual(r1.checks, beforeChanged);

  // A partial inventory.
  const partial = warned(t);
  makeTree(partial, { 'src/huge.py': 'x'.repeat(256 * 1024 + 1) });
  const beforePartial = counts(partial);
  const r2 = baselineRefresh(partial);
  assert.equal(r2.current, false);
  assert.equal(r2.baseline, 'skipped-partial-inventory');
  assert.deepEqual(r2.checks, beforePartial);

  // Skipped knowledge pages.
  const skipped = warned(t);
  makeTree(skipped, { '.devocd/bad.md': 'a\0b' });
  const beforeSkipped = counts(skipped);
  const r3 = baselineRefresh(skipped);
  assert.equal(r3.current, false);
  assert.equal(r3.baseline, 'skipped-pages');
  assert.deepEqual(r3.checks, beforeSkipped);
});

test('the checks carry counts only, never issue text', t => {
  const root = warned(t);
  const r = baselineRefresh(root);
  assert.deepEqual(Object.keys(r.checks).sort(), ['errors', 'information', 'warnings']);
  for (const v of Object.values(r.checks)) assert.equal(typeof v, 'number');
  assert.doesNotMatch(JSON.stringify(r.checks), /rule|message|hint|page\/|evidence\//);
});

test('an error still blocks, and the message carries the counts', t => {
  const root = warned(t);
  planRefresh(root);
  rmSync(join(root, '.devocd/PROJECT.md'));
  const expected = counts(root);
  assert.ok(expected.errors > 0, 'the fixture has an error');
  const n = (/** @type {number} */ v, /** @type {string} */ w) => `${v} ${w}${v === 1 ? '' : 's'}`;
  const want = new RegExp(`\\(${n(expected.errors, 'error')}, ${n(expected.warnings, 'warning')}\\)`);
  assert.throws(() => completeRefresh(root), (e) => {
    assert.equal(/** @type {any} */ (e).code, 'INVALID_DRAFT');
    assert.match(/** @type {any} */ (e).message, /checks failed/);
    assert.match(/** @type {any} */ (e).message, want);
    return true;
  });
  const base = warned(t);
  rmSync(join(base, '.devocd/PROJECT.md'));
  const expectedBase = counts(base);
  assert.ok(expectedBase.errors > 0);
  const wantBase = new RegExp(`\\(${n(expectedBase.errors, 'error')}, ${n(expectedBase.warnings, 'warning')}\\)`);
  assert.throws(() => baselineRefresh(base), wantBase);
});

/**
 * A copy of refresh.mjs whose checkTree is counted, so "once per call" is measured rather
 * than asserted. This Node build has no mock.module, so the module is copied with the one
 * import redirected; every other import points straight at the real files.
 */
async function countedRefresh(t) {
  const lib = fileURLToPath(new URL('../../scripts/lib/', import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), 'refresh-count-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const shim = join(dir, 'counting-check.mjs');
  writeFileSync(shim, [
    `import * as real from ${JSON.stringify(pathToFileURL(join(lib, 'check.mjs')).href)};`,
    'export const calls = { n: 0 };',
    'export function checkTree(...args) { calls.n += 1; return real.checkTree(...args); }',
    'export const stateProblem = real.stateProblem;',
    '',
  ].join('\n'));
  const copy = join(dir, 'refresh.mjs');
  // Point checkTree at the counting shim, and every other relative import back at the real files.
  const src = readFileSync(join(lib, 'refresh.mjs'), 'utf8')
    .replace("from './check.mjs'", `from ${JSON.stringify(pathToFileURL(shim).href)}`)
    .replace(/from '\.\/([^']+)'/g, (_m, f) => `from ${JSON.stringify(pathToFileURL(join(lib, f)).href)}`);
  writeFileSync(copy, src);
  const shimModule = await import(pathToFileURL(shim).href);
  const mod = await import(pathToFileURL(copy).href);
  return { mod, calls: shimModule.calls };
}

test('checkTree runs once per call, not twice', async t => {
  const { mod, calls } = await countedRefresh(t);
  const root = warned(t);
  calls.n = 0;
  mod.baselineRefresh(root);
  assert.equal(calls.n, 1, 'baselineRefresh checks once');
  planRefresh(root);
  calls.n = 0;
  mod.completeRefresh(root);
  assert.equal(calls.n, 1, 'completeRefresh checks once');
  const blocked = warned(t);
  planRefresh(blocked);
  rmSync(join(blocked, '.devocd/PROJECT.md'));
  calls.n = 0;
  assert.throws(() => mod.completeRefresh(blocked), /checks failed/);
  assert.equal(calls.n, 1, 'the error path does not check again');
});

test('a refresh clears the notice, but not when an edit was missed after the snapshot began', t => {
  const proj = fixture(t);
  const notice = join(proj, '.devocd/journal/untracked.json');
  mkdirSync(join(proj, '.devocd/journal'), { recursive: true });
  writeFileSync(notice, JSON.stringify({ since: '2026-01-01T00:00:00.000Z', last: '2026-01-01T00:00:00.000Z', count: 1 }));
  clearStale(proj, '2026-02-01T00:00:00.000Z');
  assert.ok(!existsSync(notice), 'missed before the snapshot: cleared');
  writeFileSync(notice, JSON.stringify({ since: '2026-03-01T00:00:00.000Z', last: '2026-03-01T00:00:00.000Z', count: 1 }));
  clearStale(proj, '2026-02-01T00:00:00.000Z');
  assert.ok(existsSync(notice), 'missed after the snapshot began: kept');
});

// --- T111: a governing file in the policy repo changes like a local standard ---

const POLICY_ORIGIN = 'https://example.com/acme/policy';

/** A project whose page names `description`, governed by a real clone's index. */
function policyProject(t, standard = false) {
  const base = workspace(t).root;
  const clone = gitRepo(join(base, 'clone'), { origin: POLICY_ORIGIN });
  makeTree(clone, {
    'index.md': '- Create or edit a PR title/body: [PR description](pr/description.md).\n',
    'pr/description.md': '# Description\n\nOld policy.\n',
  });
  git(clone, 'add', '-A');
  git(clone, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'policy');
  const company = standard ? { standards: { 'description.md': '# Description\n\nLocal rule.\n' } } : {};
  const ws = workspace(t, {
    company: {
      ...company,
      files: { '.devocd/state.json': JSON.stringify(companyState({
        projects: [{ id: 'api', path: 'api', description: '' }],
        policyRepo: { path: toPosix(clone), remote: POLICY_ORIGIN, index: 'index.md', builtAt: null },
      })) },
    },
    projects: { api: { pages: {
      'PROJECT.md': '# API\n',
      'pointer.md': 'p',
      'code/billing/index.md': '# Billing\nParent: [PROJECT](../../PROJECT.md)\nScope: src/**\n\nBilling.\n\nStandards: description\n',
    }, files: { 'CLAUDE.local.md': '<!-- devocd:begin -->\nStart at PROJECT.md\n<!-- devocd:end -->\n', 'src/a.js': 'x\n' } } },
  });
  return { root: ws.project('api'), clone, ws };
}

test('editing a linked policy file marks the pages that cite its topic stale', t => {
  const { root, clone } = policyProject(t);
  planRefresh(root);
  completeRefresh(root);
  assert.equal(refreshStatus(root).needsRefresh, false);

  writeFileSync(join(clone, 'pr/description.md'), '# Description\n\nNew policy.\n');
  const status = refreshStatus(root);
  assert.equal(status.needsRefresh, true);
  assert.equal(status.reason, 'standards-changed');
  assert.deepEqual(status.standardsChanged, ['description']);
  assert.deepEqual(status.stalePages, ['code/billing/index.md']);
});

test('a new commit that only touches an unlinked file keeps the refresh current', t => {
  const { root, clone } = policyProject(t);
  planRefresh(root);
  completeRefresh(root);
  assert.equal(refreshStatus(root).needsRefresh, false);

  writeFileSync(join(clone, 'notes.txt'), 'not linked from the index\n');
  git(clone, 'add', '-A');
  git(clone, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'unlinked');
  const status = refreshStatus(root);
  assert.equal(status.needsRefresh, false);
  assert.deepEqual(status.standardsChanged, []);
});

test('a repo wins over a local standards file with the same topic', t => {
  const { root, ws } = policyProject(t, true);
  planRefresh(root);
  completeRefresh(root);
  writeFileSync(join(ws.root, '.devocd', 'standards', 'description.md'), '# Description\n\nLocal edit.\n');
  assert.equal(refreshStatus(root).needsRefresh, false);
});
