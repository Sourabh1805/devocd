import { workspace } from '../helpers/workspace.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { CLAIM_CATEGORIES, CLAIM_AUTHORITIES, CLAIM_ORIGINS, CLAIM_STATUSES, validateClaims, approveClaim, currentness } from '../../scripts/lib/claims.mjs';

/** @typedef {import('../../scripts/lib/claims.mjs').Claim} Claim */
/** @typedef {import('../../scripts/lib/claims.mjs').Evidence} Evidence */
/** @type {Evidence} */
const FILE = { type: 'file', path: 'src/queue.mjs', sha256: 'a'.repeat(64), lines: 'L12-40' };
/** @type {Evidence} */
const PR = { type: 'pr', number: 42, state: 'merged', date: '2024-02-29' };
/** @type {Evidence} */
const SESSION = { type: 'session', id: 'abcdef12', date: '2024-02-29' };
/** @param {Partial<Claim>} [changes] @returns {Claim} */
const claim = (changes = {}) => structuredClone({
  id: 'C-0001', statement: 'The queue preserves message ordering.', category: 'source-fact', authority: 'observed',
  scope: { project: 'shop', paths: ['src/**'], environment: 'prod' }, evidence: [FILE], origin: 'tool',
  status: 'proposed', recordedAt: '2024-02-29', verifiedAt: null, supersedes: [], ...changes,
});
/** @param {unknown} input @param {string} rule */
function rejects(input, rule) {
  const result = validateClaims(input);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.rule === rule), `missing rule ${rule}`);
}

const VALID = [
  claim(),
  claim({ id: 'C-0002', category: 'practice', evidence: [PR, { ...PR, number: 43 }] }),
  claim({ id: 'C-0003', category: 'decision', authority: 'team-accepted', origin: 'human', status: 'accepted', evidence: [PR] }),
  claim({ id: 'C-0004', category: 'policy', authority: 'company-policy', origin: 'team' }),
  claim({ id: 'C-0005', category: 'hypothesis', authority: 'none', origin: 'assistant', evidence: [SESSION] }),
];

test('one valid claim of every category and exported immutable enums', () => {
  assert.deepEqual(validateClaims(VALID), { ok: true, errors: [] });
  assert.deepEqual(CLAIM_CATEGORIES, ['source-fact', 'practice', 'decision', 'policy', 'hypothesis']);
  assert.deepEqual(CLAIM_AUTHORITIES, ['observed', 'team-accepted', 'company-policy', 'none']);
  assert.deepEqual(CLAIM_ORIGINS, ['human', 'team', 'assistant', 'tool']);
  assert.deepEqual(CLAIM_STATUSES, ['proposed', 'accepted', 'superseded', 'rejected']);
  for (const values of [CLAIM_CATEGORIES, CLAIM_AUTHORITIES, CLAIM_ORIGINS, CLAIM_STATUSES]) assert.ok(Object.isFrozen(values));
  assert.deepEqual(validateClaims([]), { ok: true, errors: [] });
  assert.equal(validateClaims([claim({ scope: { project: null, paths: [], environment: null } })]).ok, true);
});

test('shape rejects non-arrays, missing fields, wrong types/enums and unknown keys at every object level', () => {
  for (const bad of [null, {}, 'claims', 1, true]) rejects(bad, 'shape');
  for (const bad of [null, [], 'claim', 1]) rejects([bad], 'shape');
  for (const key of Object.keys(claim())) {
    const bad = /** @type {Record<string, unknown>} */ (claim());
    delete bad[key];
    rejects([bad], 'shape');
  }
  for (const key of ['category', 'authority', 'origin', 'status']) rejects([{ ...claim(), [key]: 'invalid' }], 'shape');
  for (const bad of [
    { ...claim(), extra: true }, { ...claim(), scope: { ...claim().scope, extra: true } },
    ...[FILE, PR, SESSION, { type: 'review-comment', pr: 42, comment: 7, outcome: 'accepted' }].map(e => ({ ...claim(), evidence: [{ ...e, extra: true }] })),
    { ...claim(), evidence: [] }, { ...claim(), evidence: Array(21).fill(FILE) },
    { ...claim(), evidence: [null] }, { ...claim(), evidence: [{ type: 'other' }] },
    { ...claim(), scope: null }, { ...claim(), supersedes: 'C-0002' }, { ...claim(), scope: { project: 1, paths: [], environment: null } },
    { ...claim(), evidence: new Array(1) }, { ...claim(), supersedes: new Array(1) },
    { ...claim(), scope: { ...claim().scope, paths: new Array(1) } },
  ]) rejects([bad], 'shape');
  assert.equal(validateClaims([claim({ evidence: Array(20).fill(FILE) })]).ok, true);
});

test('shape validates IDs, statement bounds and newlines', () => {
  for (const id of ['C-001', 'c-0001', 'C-0001\n', 'C-0001 ', 'bad']) rejects([claim({ id })], 'shape');
  for (const statement of ['', '  ', 'x'.repeat(301), 'a\nb', 'a\rb', 'a\u2028b', 'a\u2029b']) rejects([claim({ statement })], 'shape');
  assert.equal(validateClaims([claim({ id: 'C-12345', statement: 'x'.repeat(300) })]).ok, true);
});

test('shape uses real Gregorian dates for claims and dated evidence', () => {
  for (const value of ['2023-02-29', '1900-02-29', '2024-04-31', '2024-00-10', '2024-13-01', '0000-01-01', '2024-1-01', '2024-01-01T00:00:00Z']) {
    rejects([claim({ recordedAt: value })], 'shape');
    rejects([claim({ verifiedAt: value })], 'shape');
    rejects([claim({ evidence: [{ ...PR, date: value }] })], 'shape');
    rejects([claim({ evidence: [{ ...SESSION, date: value }] })], 'shape');
  }
  for (const value of ['0001-01-01', '2000-02-29', '2024-02-29', '9999-12-31']) assert.equal(validateClaims([claim({ recordedAt: value })]).ok, true);
});

test('shape rejects unsafe paths and allows scoped globs but only concrete file evidence', () => {
  for (const value of ['', '../x', 'x/../y', '/root/x', 'x\\y', 'C:/x', 'x\0y', './x', 'x//y', 'x/']) {
    rejects([claim({ scope: { project: 'shop', paths: [value], environment: null } })], 'shape');
    rejects([claim({ evidence: [{ ...FILE, path: value }] })], 'shape');
  }
  for (const value of ['src/**', 'packages/*/src?.mjs', 'src/[ab].mjs', 'src/{a,b}.mjs']) {
    assert.equal(validateClaims([claim({ scope: { project: null, paths: [value], environment: null } })]).ok, true);
    rejects([claim({ evidence: [{ ...FILE, path: value }] })], 'shape');
  }
});

test('shape checks evidence identifiers, hashes and inclusive line ranges', () => {
  for (const sha256 of ['g'.repeat(64), 'a'.repeat(63), 'a'.repeat(64) + '\n']) rejects([claim({ evidence: [{ ...FILE, sha256 }] })], 'shape');
  for (const lines of ['L0-2', 'L3-2', '12-40', 'L1', 'L1-2\n', 'L1-999999999999999999999']) rejects([claim({ evidence: [{ ...FILE, lines }] })], 'shape');
  for (const id of ['1234567', 'gggggggg', 'abcdef12\n']) rejects([claim({ evidence: [{ ...SESSION, id }] })], 'shape');
  for (const n of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    rejects([claim({ evidence: [{ ...PR, number: n }] })], 'shape');
    rejects([claim({ evidence: [{ type: 'review-comment', pr: n, comment: 1, outcome: 'unknown' }] })], 'shape');
    rejects([claim({ evidence: [{ type: 'review-comment', pr: 1, comment: n, outcome: 'unknown' }] })], 'shape');
  }
  rejects([{ ...claim(), evidence: [{ ...PR, number: '42' }] }], 'shape');
  assert.equal(validateClaims([claim({ evidence: [{ ...FILE, sha256: 'A'.repeat(64), lines: 'L1-1' }] })]).ok, true);
});

test('duplicate-id is reported even when another duplicate has invalid fields', () => {
  rejects([claim(), claim()], 'duplicate-id');
  rejects([claim(), { id: 'C-0001' }], 'duplicate-id');
});

test('secret scanning and every error message never echo statement text', () => {
  const statement = 'Sensitive claim ' + 'AKIA' + 'ABCDEFGHIJKLMNOP';
  const bad = claim({ statement, category: 'hypothesis', authority: 'company-policy', origin: 'assistant', status: 'accepted', evidence: [SESSION], verifiedAt: '2024-02-28', supersedes: ['C-9999'] });
  const result = validateClaims([bad]);
  rejects([bad], 'secret');
  for (const error of result.errors) {
    assert.ok(!error.message.includes(statement));
    assert.ok(!error.message.includes('AKIA'));
  }
  const malformed = validateClaims([{ id: statement, statement, [statement]: true }]);
  assert.ok(malformed.errors.every(e => e.id === null));
  assert.ok(!JSON.stringify(malformed).includes(statement));
});

test('source-fact requires observed authority and at least one file', () => {
  rejects([claim({ authority: 'none' })], 'source-fact');
  rejects([claim({ evidence: [PR] })], 'source-fact');
});

test('practice counts distinct PR numbers and file paths, not copies, sessions or comments', () => {
  const practice = claim({ category: 'practice' });
  for (const evidence of [[PR], [PR, PR], [FILE, { ...FILE, sha256: 'b'.repeat(64) }], [SESSION, SESSION],
    [PR, { type: 'review-comment', pr: 42, comment: 1, outcome: 'accepted' }]]) {
    rejects([{ ...practice, evidence }], 'practice');
  }
  for (const evidence of [[PR, FILE], [FILE, { ...FILE, path: 'src/other.mjs' }], [PR, { ...PR, number: 43, state: 'closed' }]]) {
    assert.equal(validateClaims([{ ...practice, evidence }]).ok, true);
  }
  rejects([{ ...practice, evidence: [PR, FILE], authority: 'team-accepted' }], 'practice');
});

test('accepted decisions require support: sessions, reverted/closed PRs and rejected comments do not qualify', () => {
  const decision = claim({ category: 'decision', authority: 'team-accepted', status: 'accepted' });
  for (const evidence of [[SESSION], [{ ...PR, state: 'reverted' }], [{ ...PR, state: 'closed' }],
    [{ type: 'review-comment', pr: 42, comment: 1, outcome: 'rejected' }], [{ type: 'review-comment', pr: 42, comment: 1, outcome: 'unknown' }]]) {
    rejects([{ ...decision, evidence }], 'decision');
    assert.equal(validateClaims([{ ...decision, status: 'proposed', evidence }]).ok, true);
  }
  for (const evidence of [[FILE], [PR], [{ type: 'review-comment', pr: 42, comment: 1, outcome: 'accepted' }]]) {
    assert.equal(validateClaims([{ ...decision, evidence }]).ok, true);
  }
});

test('policy authority is exclusive and requires files and non-assistant origin', () => {
  const policy = claim({ category: 'policy', authority: 'company-policy', origin: 'team' });
  rejects([{ ...policy, evidence: [PR, SESSION] }], 'policy');
  rejects([{ ...policy, authority: 'observed' }], 'policy');
  rejects([{ ...policy, origin: 'assistant' }], 'policy');
  rejects([claim({ authority: 'company-policy' })], 'policy');
});

test('hypotheses cannot gain authority or acceptance, and assistants can only originate hypotheses', () => {
  rejects([claim({ category: 'hypothesis', authority: 'observed' })], 'hypothesis');
  rejects([claim({ category: 'hypothesis', authority: 'none', status: 'accepted' })], 'hypothesis');
  rejects([claim({ category: 'decision', origin: 'assistant', authority: 'team-accepted' })], 'assistant-origin');
});

test('verified requires file evidence and cannot predate recording', () => {
  rejects([claim({ verifiedAt: '2024-02-28' })], 'verified');
  rejects([claim({ category: 'decision', evidence: [PR], verifiedAt: '2024-03-01' })], 'verified');
  for (const verifiedAt of ['2024-02-29', '2024-03-01']) assert.equal(validateClaims([claim({ verifiedAt })]).ok, true);
});

test('supersedes validates existence, self references, cycles and accepted target statuses', () => {
  rejects([claim({ supersedes: ['C-9999'] })], 'supersedes');
  rejects([claim({ supersedes: ['C-0001'] })], 'supersedes');
  rejects([claim({ supersedes: ['C-0002'] }), claim({ id: 'C-0002', supersedes: ['C-0001'] })], 'supersedes');
  for (const status of CLAIM_STATUSES.filter(s => s !== 'superseded')) {
    rejects([claim({ status: 'accepted', supersedes: ['C-0002'] }), claim({ id: 'C-0002', status })], 'supersedes');
  }
  const valid = [claim({ status: 'accepted', supersedes: ['C-0002'] }), claim({ id: 'C-0002', status: 'superseded', supersedes: ['C-0003'] }), claim({ id: 'C-0003', status: 'superseded' })];
  assert.equal(validateClaims(valid).ok, true);
  assert.equal(validateClaims([...valid].reverse()).ok, true);
  const chain = Array.from({ length: 5000 }, (_, i) => claim({ id: `C-${String(i).padStart(4, '0')}`, supersedes: i ? [`C-${String(i - 1).padStart(4, '0')}`] : [] }));
  assert.equal(validateClaims(chain).ok, true);
});

test('approveClaim only changes status and returns an independent copy', () => {
  for (const input of VALID) {
    const before = structuredClone(input);
    const approved = approveClaim(input);
    assert.deepEqual(approved, { ...before, status: 'accepted' });
    assert.deepEqual(input, before);
    approved.scope.paths.push('another/**');
    assert.deepEqual(input, before);
  }
  rejects([approveClaim(VALID[4])], 'hypothesis');
});

test('currentness separates recorded history from verified file evidence', () => {
  assert.equal(currentness(claim()), 'recorded-only');
  assert.equal(currentness(claim({ verifiedAt: '2024-03-01' })), 'verified');
  assert.equal(currentness(claim({ evidence: [PR], verifiedAt: '2024-03-01' })), 'recorded-only');
});

test('claims-check is read-only and returns JSON with exit codes 0/1, and usage exit 2', t => {
  const root = workspace(t).root;
  const cli = fileURLToPath(new URL('../../scripts/devocd.mjs', import.meta.url));
  const file = join(root, 'claims.json');
  const run = (/** @type {string[]} */ args) => spawnSync(process.execPath, [cli, 'claims-check', ...args], { encoding: 'utf8' });
  for (const [input, expected] of [[VALID, 0], [[claim({ category: 'hypothesis', authority: 'observed' })], 1], [{}, 1]]) {
    const content = JSON.stringify(input);
    writeFileSync(file, content);
    const result = run([file]);
    assert.equal(result.status, expected, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), validateClaims(input));
    assert.equal(readFileSync(file, 'utf8'), content);
    assert.deepEqual(readdirSync(root), ['claims.json']);
  }
  const marker = 'DO-NOT-ECHO-THIS-STATEMENT';
  writeFileSync(file, `[{"statement":"${marker}",bad JSON]`);
  for (const args of [[file], [join(root, 'missing.json')], [root]]) {
    const result = run(args);
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stdout).errors[0].rule, 'shape');
    assert.ok(!`${result.stdout}${result.stderr}`.includes(marker));
  }
  for (const args of [[], [file, file], ['--json']]) {
    const result = run(args);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /claims-check <file.json>/);
  }
});
