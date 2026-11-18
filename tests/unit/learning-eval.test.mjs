// @ts-check
// Evaluation contract only: never import a mock learner or silently skip a broken real module.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateClaims, currentness } from '../../plugin/scripts/lib/claims.mjs';
import { detectArtifacts } from '../../plugin/scripts/lib/artifacts.mjs';
import { baselineRefresh, refreshStatus } from '../../plugin/scripts/lib/refresh.mjs';
import { walkFiles } from '../../plugin/scripts/lib/fsutil.mjs';
import { makeTree } from '../helpers/tree.mjs';

/** @typedef {import('../../plugin/scripts/lib/claims.mjs').Claim} Claim */
const fixtureDir = fileURLToPath(new URL('../fixtures/learning/', import.meta.url));
const prs = JSON.parse(readFileSync(join(fixtureDir, 'history/prs.json'), 'utf8'));
const expected = JSON.parse(readFileSync(join(fixtureDir, 'expected.json'), 'utf8'));
const learnerUrl = new URL('../../plugin/scripts/lib/learn.mjs', import.meta.url);
const learner = existsSync(learnerUrl) ? await import(learnerUrl.href) : {};
const learnFromHistory = learner.learnFromHistory;
if (learnFromHistory !== undefined) assert.equal(typeof learnFromHistory, 'function', 'learnFromHistory must be callable');
const learningOptions = typeof learnFromHistory === 'function' ? {} : { todo: 'T49 learnFromHistory' };

/** Partial deep matching; arrays are unordered subsets with distinct item assignments.
 * $contains requires every case-insensitive substring in a string. @param {any} value @param {any} matcher @returns {boolean} */
function matches(value, matcher) {
  if (matcher === null || typeof matcher !== 'object') return Object.is(value, matcher);
  if (Array.isArray(matcher)) {
    if (!Array.isArray(value)) return false;
    /** @param {number} i @param {Set<number>} used @returns {boolean} */
    const assign = (i, used) => i === matcher.length || value.some((v, n) => !used.has(n)
      && matches(v, matcher[i]) && assign(i + 1, new Set([...used, n])));
    return assign(0, new Set());
  }
  if (Object.hasOwn(matcher, '$contains')) return typeof value === 'string'
    && matcher.$contains.every((/** @type {string} */ word) => value.toLowerCase().includes(word.toLowerCase()));
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.entries(matcher).every(([k, v]) => Object.hasOwn(value, k) && matches(value[k], v));
}

/** @param {any} value @param {string[]} names */
function keys(value, names) { assert.ok(value && typeof value === 'object' && !Array.isArray(value)); assert.deepEqual(Object.keys(value).sort(), [...names].sort()); }
/** @param {any} n */
const positive = n => Number.isSafeInteger(n) && n > 0;
/** @param {any} path */
const safePath = path => typeof path === 'string' && !/^[A-Za-z]:|[\\\x00-\x1f\x7f\p{Zl}\p{Zp}]/u.test(path) && path.split('/').every(p => p && p !== '.' && p !== '..');
/** @param {any} p */
function assertPR(p) {
  keys(p, ['number', 'title', 'body', 'author', 'authorIsBot', 'state', 'mergedAt', 'labels', 'files', 'reviewComments', 'revertedBy']);
  assert.ok(positive(p.number));
  for (const key of ['title', 'body', 'author']) assert.equal(typeof p[key], 'string');
  assert.ok(p.title.trim() && p.author.trim());
  assert.equal(typeof p.authorIsBot, 'boolean');
  assert.ok(['merged', 'closed'].includes(p.state));
  if (p.state === 'closed') assert.equal(p.mergedAt, null);
  else {
    assert.match(p.mergedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    assert.equal(new Date(p.mergedAt).toISOString(), p.mergedAt.replace('Z', '.000Z'));
  }
  assert.ok(Array.isArray(p.labels) && p.labels.every((/** @type {any} */ s) => typeof s === 'string'));
  assert.ok(Array.isArray(p.files) && p.files.length > 0);
  for (const f of p.files) {
    keys(f, ['path', 'additions', 'deletions']); assert.ok(safePath(f.path));
    for (const k of ['additions', 'deletions']) assert.ok(Number.isSafeInteger(f[k]) && f[k] >= 0);
  }
  assert.ok(Array.isArray(p.reviewComments));
  for (const r of p.reviewComments) {
    keys(r, ['id', 'author', 'body', 'outcome']); assert.ok(positive(r.id));
    assert.ok(typeof r.author === 'string' && r.author.trim()); assert.equal(typeof r.body, 'string');
    assert.ok(['accepted', 'rejected', 'unknown'].includes(r.outcome));
  }
  assert.ok(p.revertedBy === null || positive(p.revertedBy) && p.revertedBy !== p.number);
}

/** @param {string} root @returns {string[]} */
function filesIn(root) {
  return walkFiles(root).map(p => relative(root, p).split(sep).join('/')).sort();
}
/** @param {import('node:test').TestContext} t */
function setup(t) {
  const temp = mkdtempSync(join(tmpdir(), 'devocd-learning-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const root = join(temp, 'repo');
  cpSync(join(fixtureDir, 'repo'), root, { recursive: true });
  cpSync(join(fixtureDir, 'company'), join(temp, 'company'), { recursive: true });
  makeTree(root, {
    '.devocd/state.json': JSON.stringify({ version: 1, kind: 'project', id: 'api', companyRel: '../company', teamFiles: [], approvedCommands: [], sources: [] }),
    '.devocd/PROJECT.md': '# API\n', '.devocd/pointer.md': 'Start with PROJECT.md',
    'CLAUDE.local.md': '<!-- devocd:begin -->\nStart with PROJECT.md\n<!-- devocd:end -->\n',
  });
  assert.equal(baselineRefresh(root).current, true);
  assert.equal(refreshStatus(root).needsRefresh, false);
  const baseline = readFileSync(join(root, '.devocd/refresh.json'), 'utf8');
  writeFileSync(join(temp, 'baseline.json'), baseline); // Generated snapshot, never committed hashes.
  writeFileSync(join(root, 'src/billing/invoice.ts'), '// Unrelated edit after baseline; no PR covers it.\nexport const invoiceTotal = () => 0;\n');
  return { root, standardsDir: join(temp, 'company/.devocd/standards'), baseline };
}

/** @param {any} matcher @param {number} id @param {boolean} verified @returns {Claim} */
function complete(matcher, id, verified) {
  const evidence = (matcher.evidence ?? [{ type: 'pr', number: 106 }]).map((/** @type {any} */ e) => {
    if (e.type === 'file') return { sha256: createHash('sha256').update(readFileSync(join(fixtureDir, 'repo', e.path))).digest('hex'), ...e };
    if (e.type === 'pr') return { state: 'merged', date: '2026-11-01', ...e };
    throw new Error('Add completion support for this evidence type.');
  });
  return { id: `C-${String(id).padStart(4, '0')}`, category: 'decision', authority: 'observed',
    origin: 'human', status: 'proposed', recordedAt: '2026-11-01', verifiedAt: verified ? '2026-11-18' : null, supersedes: [],
    ...matcher, statement: matcher.statement?.$contains?.join(' ') ?? matcher.statement ?? 'Fixture expectation is expressible.',
    scope: { project: 'api', paths: [], environment: null, ...matcher.scope }, evidence };
}
/** @param {Claim} c @param {any} matcher */
const evidenceOnly = (c, matcher) => c.evidence.length > 0 && c.evidence.every(e => matcher.evidence.some((/** @type {any} */ m) => matches(e, m)));
/** Capture baseline/pending snapshots and any T46 sourceRefreshed fields, allowing history-only bookkeeping.
 * @param {string} root */
function sourceRefreshState(root) {
  /** @type {Record<string, any>} */ const state = {};
  /** @param {any} value @param {string} path */
  const visit = (value, path) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, v] of Object.entries(value)) {
      if (key === 'sourceRefreshed') state[`${path}/${key}`] = v;
      else visit(v, `${path}/${key}`);
    }
  };
  for (const path of filesIn(join(root, '.devocd')).filter(p => p.endsWith('.json'))) {
    const text = readFileSync(join(root, '.devocd', path), 'utf8');
    if (/(^|\/)refresh(?:[.-].*)?\.json$/.test(path)) state[path] = text;
    visit(JSON.parse(text), path);
  }
  return state;
}

/** @param {any} scenario @param {Claim[]} claims */
function assertMatchers(scenario, claims) {
  for (const matcher of scenario.must) assert.ok(claims.some(c => matches(c, matcher)), `case ${scenario.case}: missing required claim`);
  for (const matcher of scenario.mustNot) assert.ok(!claims.some(c => matches(c, matcher)
    && (!scenario.onlyEvidence || evidenceOnly(c, matcher))), `case ${scenario.case}: forbidden claim`);
}

/** @param {Claim[]} claims */
function assertImageClaims(claims) {
  for (const c of claims) {
    const images = expected[5].artifacts.filter((/** @type {any} */ a) => c.statement.includes(a.ref)
      || c.statement.includes(a.account) || c.evidence.some(e => e.type === 'file' && e.path === `k8s/${a.environment}/deploy.yaml`)
      || c.scope.paths.some(p => p.startsWith(`k8s/${a.environment}/`) || /^k8s(\/|$)/.test(p) && !/^k8s\/(prod|staging)\//.test(p)));
    const aboutImage = /\bapi\b/i.test(c.statement) && /\bimage\b|api:1\.2/i.test(c.statement) || images.length > 0;
    if (!aboutImage) continue;
    assert.ok(['prod', 'staging'].includes(c.scope.environment ?? ''), 'API image claims need explicit environment');
    assert.ok(images.length <= 1, 'one claim cannot merge the two environment-specific images');
    assert.ok(!(/\b(prod|production)\b/i.test(c.statement) && /\b(stage|staging)\b/i.test(c.statement)), 'one image claim cannot span both environments');
    if (images.length) assert.equal(c.scope.environment, images[0].environment);
  }
}

test('learning fixture loads all six cases and the eight linked synthetic PRs', () => {
  assert.deepEqual(expected.map((/** @type {any} */ c) => c.case), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(prs.map((/** @type {any} */ p) => p.number), [101, 102, 103, 104, 105, 106, 107, 108]);
  assert.ok(filesIn(fixtureDir).length < 40);
  for (const scenario of expected) assert.ok(Array.isArray(scenario.must) && Array.isArray(scenario.mustNot));
  assert.match(readFileSync(join(fixtureDir, 'repo/infra/queue.tf'), 'utf8'), /fifo_queue = true/);
  assert.match(readFileSync(join(fixtureDir, 'repo/deploy/prod.tf'), 'utf8'), /region = "us-east-1"/);
  assert.match(readFileSync(join(fixtureDir, 'company/.devocd/standards/regions.md'), 'utf8'), /Production must deploy only to eu-west-1 and eu-central-1\./);
  assert.equal(prs[0].reviewComments[0].outcome, 'rejected');
  assert.match(prs[0].reviewComments[0].body, /Kinesis/);
  assert.equal(prs[1].revertedBy, prs[2].number);
  for (const p of prs.slice(3, 5)) { assert.match(p.body, /us-east-1/); assert.equal(p.files[0].path, 'deploy/prod.tf'); }
  for (const p of prs.slice(5, 7)) { assert.match(p.body, /Redis was chosen for latency/); assert.ok(p.body.endsWith('🤖 Generated with Claude Code')); }
  assert.match(readFileSync(join(fixtureDir, 'repo/docs/notes.md'), 'utf8'), /Redis was chosen for latency/);
  assert.ok(prs.every((/** @type {any} */ p) => p.files.every((/** @type {any} */ f) => f.path !== 'src/billing/invoice.ts')));
  assert.equal(prs[7].author, 'dependabot[bot]'); assert.equal(prs[7].authorIsBot, true);
});

test('every PR follows the documented input shape, including strict nested keys', () => {
  for (const p of prs) assertPR(p);
  const closed = { ...prs[0], state: 'closed', mergedAt: null }; assertPR(closed);
  for (const bad of [{ ...prs[0], extra: true }, { ...prs[0], mergedAt: '2026-02-30T12:00:00Z' },
    { ...prs[0], authorIsBot: 'false' }, { ...prs[0], files: [{ path: '../escape', additions: 1, deletions: 0 }] },
    { ...prs[0], reviewComments: [{ ...prs[0].reviewComments[0], outcome: 'approved' }] }]) assert.throws(() => assertPR(bad));
});

test('partial matchers handle unordered evidence, exact scalars and case-insensitive topics', () => {
  assert.ok(matches({ evidence: [{ type: 'file', path: 'x' }, { type: 'pr', number: 101 }] }, { evidence: [{ number: 101 }, { type: 'file' }] }));
  assert.ok(!matches({ status: 'accepted' }, { status: 'proposed' }));
  assert.ok(!matches([{ type: 'pr' }], [{ type: 'pr' }, { type: 'pr' }]));
  assert.ok(matches('Redis was chosen for low LATENCY.', { $contains: ['redis', 'latency'] }));
  assert.ok(!matches('Redis was chosen for cost.', { $contains: ['redis', 'latency'] }));
  const rejected = expected[0].mustNot[0];
  const c = /** @type {Claim} */ ({ status: 'proposed', evidence: [...rejected.evidence] });
  assert.ok(evidenceOnly(c, rejected));
  assert.ok(!evidenceOnly({ ...c, evidence: [...c.evidence, { type: 'pr', number: 101, state: 'merged', date: '2026-11-01' }] }, rejected));
});

test('every must matcher can be completed into a valid T44 claim without changing its constraints', () => {
  /** @type {Claim[]} */ const claims = [];
  for (const scenario of expected) for (const matcher of scenario.must) {
    const c = complete(matcher, claims.length + 1, scenario.currentness === 'verified');
    assert.ok(matches(c, matcher)); claims.push(c);
    if (scenario.currentness) assert.equal(currentness(c), scenario.currentness);
  }
  assert.deepEqual(validateClaims(claims), { ok: true, errors: [] });
});

test('expectations reject missing decisions and unsupported active claims without forbidding supported ones', () => {
  const decision = complete(expected[0].must[0], 1, true);
  assert.throws(() => assertMatchers(expected[0], []));
  assertMatchers(expected[0], [decision]);
  const suggestion = { ...decision, id: 'C-0002', evidence: [{ type: 'review-comment', pr: 101, comment: 9001, outcome: 'rejected' }] };
  assert.throws(() => assertMatchers(expected[0], [decision, /** @type {Claim} */ (suggestion)]));
  assertMatchers(expected[0], [{ ...decision, evidence: [...decision.evidence, /** @type {import('../../plugin/scripts/lib/claims.mjs').Evidence} */ (suggestion.evidence[0])] }]);
  const reverted = complete({ evidence: [{ type: 'pr', number: 102, state: 'reverted' }] }, 2, false);
  assert.throws(() => assertMatchers(expected[1], [reverted]));
  assertMatchers(expected[1], [{ ...reverted, status: 'rejected' }]);
});

test('case 6: detector keeps api images separate by account and environment', () => {
  const artifacts = detectArtifacts(join(fixtureDir, 'repo')).artifacts.filter(a => a.ref.endsWith('/api:1.2'));
  assert.equal(artifacts.length, 2);
  for (const matcher of expected[5].artifacts) assert.equal(artifacts.filter(a => matches(a, matcher)).length, 1);
  assert.equal(new Set(artifacts.map(a => a.account)).size, 2);
  assert.equal(new Set(artifacts.map(a => a.environment)).size, 2);
});

test('case 6 claim guards reject unscoped images and shared cross-environment claims', () => {
  const c = complete({ statement: 'The API uses this image.', scope: { environment: 'prod' } }, 1, false);
  assertImageClaims([c]); assertImageClaims([]);
  assert.throws(() => assertImageClaims([{ ...c, scope: { ...c.scope, environment: null } }]));
  assert.throws(() => assertImageClaims([{ ...c, statement: 'API image is shared across prod and staging.' }]));
  assert.throws(() => assertImageClaims([{ ...c, statement: 'API image belongs to 111111111111 and 222222222222.' }]));
});

test('case 5: a real generated baseline detects the unrelated billing edit', t => {
  const { root, baseline } = setup(t);
  const status = refreshStatus(root);
  assert.equal(status.reason, 'source-changed'); assert.equal(status.needsRefresh, true);
  assert.deepEqual(status.changed, [{ path: expected[4].stale[0], kind: 'modified' }]);
  assert.equal(readFileSync(join(root, '.devocd/refresh.json'), 'utf8'), baseline);
});

for (const scenario of expected) test(`learning case ${scenario.case}: ${scenario.name}`, learningOptions, async t => {
  if (typeof learnFromHistory !== 'function') return; // Explicit TODO only; real module errors are never swallowed.
  const { root, standardsDir } = setup(t);
  const before = sourceRefreshState(root);
  const result = await learnFromHistory({ root, prs: structuredClone(prs), standardsDir });
  assert.ok(result && Array.isArray(result.claims) && Array.isArray(result.conflicts) && Array.isArray(result.skipped));
  /** @type {Claim[]} */ const claims = result.claims;
  assert.deepEqual(validateClaims(claims), { ok: true, errors: [] });
  assert.ok(claims.every(c => c.status !== 'accepted'), 'learning never auto-accepts claims');
  for (const c of claims) for (const e of c.evidence) {
    if (e.type === 'pr') {
      const p = prs.find((/** @type {any} */ p) => p.number === e.number); assert.ok(p, 'PR evidence must come from the input');
      assert.equal(e.state, p.revertedBy === null ? p.state : 'reverted');
    } else if (e.type === 'review-comment') {
      const p = prs.find((/** @type {any} */ p) => p.number === e.pr);
      const comment = p?.reviewComments.find((/** @type {any} */ r) => r.id === e.comment); assert.ok(comment);
      assert.equal(e.outcome, comment.outcome);
    } else if (e.type === 'file' && existsSync(join(root, e.path))) {
      assert.equal(e.sha256, createHash('sha256').update(readFileSync(join(root, e.path))).digest('hex'), `file evidence ${e.path} must hash the current copy`);
    }
  }
  assertMatchers(scenario, claims);
  assert.ok(result.skipped.some((/** @type {any} */ item) => item.number === 108 && typeof item.reason === 'string' && /bot/i.test(item.reason)), 'bot PR #108 needs an explicit bot reason');
  if (scenario.case === 1) {
    const hash = createHash('sha256').update(readFileSync(join(root, 'infra/queue.tf'))).digest('hex');
    assert.ok(claims.some(c => matches(c, scenario.must[0]) && currentness(c) === scenario.currentness
      && c.evidence.some(e => e.type === 'file' && e.path === 'infra/queue.tf' && e.sha256 === hash)), 'a matching decision must be verified against the current file');
  } else if (scenario.case === 2) {
    for (const c of claims.filter(c => evidenceOnly(c, scenario.optional))) assert.ok(matches(c, scenario.optional));
    for (const c of claims) for (const e of c.evidence) if (e.type === 'pr' && e.number === 102) assert.equal(e.state, 'reverted');
  } else if (scenario.case === 3) {
    for (const conflict of scenario.conflicts) assert.ok(result.conflicts.some((/** @type {any} */ actual) => actual.standard === conflict.standard
      && claims.some(c => c.id === actual.claimId && matches(c, conflict.claim))), 'practice must be paired with the governing standard');
  } else if (scenario.case === 4) {
    const redis = claims.filter(c => matches(c.statement, scenario.must[0].statement));
    assert.equal(redis.length, scenario.count);
    assert.ok(matches(redis[0], scenario.must[0]));
    const support = new Set(redis[0].evidence.map(e => scenario.supportGroup.some((/** @type {any} */ m) => matches(e, m)) ? 'one-assistant-guess' : JSON.stringify(e)));
    assert.deepEqual([...support], ['one-assistant-guess']); assert.equal(support.size, scenario.independentSupport);
  } else if (scenario.case === 5) {
    const status = refreshStatus(root); assert.equal(status.needsRefresh, true);
    for (const path of scenario.stale) assert.ok(status.changed.some(f => f.path === path && f.kind === 'modified'));
    assert.deepEqual(sourceRefreshState(root), before, 'learning must not advance source-refresh state');
  } else if (scenario.case === 6) {
    assertImageClaims(claims);
  }
});
