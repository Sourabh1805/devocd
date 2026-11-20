// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { workspace } from '../helpers/workspace.mjs';
import { makeTree } from '../helpers/tree.mjs';
import * as proposalModule from '../../scripts/lib/proposal.mjs';
import { STATUSES, validateProposal } from '../../scripts/lib/proposal.mjs';

const PERMITTED = ['.devocd/draft/'];
const SOURCE = 'export const answer = 42;\n';
const sha256 = (/** @type {string} */ text) => createHash('sha256').update(text).digest('hex');

/** A workspace with one readable evidence file, cleaned up by the test context. */
function fixture(/** @type {import('node:test').TestContext} */ t) {
  const root = workspace(t).root;
  makeTree(root, { 'src/api.js': SOURCE });
  return root;
}

/** @param {Record<string, unknown>} [overrides] */
function good(overrides = {}) {
  return {
    unit: 'api-page',
    status: 'DONE',
    summary: 'Draft the API page.',
    proposals: [{ kind: 'page', path: '.devocd/draft/code/api.md', content: '# API\n' }],
    evidence: [{ type: 'file', path: 'src/api.js', sha256: sha256(SOURCE) }],
    concerns: [],
    ...overrides,
  };
}

/** @param {string} root @param {Record<string, unknown>} [overrides] */
const check = (root, overrides = {}) => validateProposal(good(overrides), { root, permittedPaths: PERMITTED });
/** @param {{ problems: { rule: string, message: string }[] }} result */
const rules = (result) => result.problems.map((problem) => problem.rule);

test('STATUSES lists the four contract statuses in order', () => {
  assert.deepEqual([...STATUSES], ['DONE', 'DONE_WITH_CONCERNS', 'NEEDS_CONTEXT', 'BLOCKED']);
  assert.ok(Object.isFrozen(STATUSES));
});

test('accepts a valid DONE proposal', (t) => {
  const result = check(fixture(t));
  assert.deepEqual(result, { ok: true, problems: [] });
});

test('rejects a proposal that is not an object', () => {
  for (const value of [null, [], 'DONE', 42]) {
    const result = validateProposal(value, { root: process.cwd(), permittedPaths: PERMITTED });
    assert.equal(result.ok, false);
    assert.equal(result.problems[0].rule, 'schema');
  }
});

test('rejects each missing field', (t) => {
  const root = fixture(t);
  for (const field of ['unit', 'status', 'summary', 'proposals', 'evidence', 'concerns']) {
    const proposal = good();
    delete (/** @type {Record<string, unknown>} */ (proposal))[field];
    const result = validateProposal(proposal, { root, permittedPaths: PERMITTED });
    assert.equal(result.ok, false, `${field} is required`);
    assert.ok(result.problems.some((problem) => problem.message.includes(`"${field}"`)), field);
  }
});

test('rejects unknown proposal fields and wrongly typed fields', (t) => {
  const root = fixture(t);
  assert.equal(check(root, { approved: true }).ok, false);
  assert.equal(check(root, { unit: '' }).ok, false);
  assert.equal(check(root, { unit: 7 }).ok, false);
  assert.equal(check(root, { summary: 'two\nlines' }).ok, false);
  assert.equal(check(root, { summary: '' }).ok, false);
  assert.equal(check(root, { proposals: 'none' }).ok, false);
  assert.equal(check(root, { concerns: 'none' }).ok, false);
  assert.equal(check(root, { concerns: [7] }).ok, false);
});

test('rejects a status outside the four, and says which are allowed', (t) => {
  const root = fixture(t);
  for (const status of ['APPROVED', 'done', 'PUBLISHED', 42]) {
    const result = check(root, { status });
    assert.equal(result.ok, false);
    assert.ok(rules(result).includes('status'));
  }
  assert.match(validateProposal(good({ status: 'APPROVED' }), { root, permittedPaths: PERMITTED }).problems[0].message, /DONE_WITH_CONCERNS/);
});

test('DONE requires a proposal and an evidence entry', (t) => {
  const root = fixture(t);
  const noProposals = check(root, { proposals: [] });
  assert.equal(noProposals.ok, false);
  assert.ok(rules(noProposals).includes('proposal'));
  const noEvidence = check(root, { evidence: [] });
  assert.equal(noEvidence.ok, false);
  assert.ok(rules(noEvidence).includes('evidence'));
});

test('DONE_WITH_CONCERNS requires a concern and a proposal', (t) => {
  const root = fixture(t);
  assert.equal(check(root, { status: 'DONE_WITH_CONCERNS', evidence: [] }).ok, false);
  assert.equal(check(root, { status: 'DONE_WITH_CONCERNS', concerns: ['Sources disagree on retries.'] }).ok, true);
  assert.equal(check(root, { status: 'DONE_WITH_CONCERNS', concerns: [], proposals: [] }).ok, false);
});

test('NEEDS_CONTEXT and BLOCKED may carry no proposals', (t) => {
  const root = fixture(t);
  for (const status of ['NEEDS_CONTEXT', 'BLOCKED']) {
    const result = validateProposal(good({ status, proposals: [], evidence: [] }), { root, permittedPaths: PERMITTED });
    assert.deepEqual(result, { ok: true, problems: [] }, status);
  }
});

test('rejects page paths outside the permitted prefixes', (t) => {
  const root = fixture(t);
  for (const path of ['.devocd/code/api.md', '.devocd/draft-other/api.md', 'src/api.md', '.devocd/draft']) {
    const result = check(root, { proposals: [{ kind: 'page', path, content: 'x' }] });
    assert.equal(result.ok, false, path);
    assert.ok(rules(result).includes('permitted-path'), path);
  }
});

test('rejects traversal, absolute, Windows and malformed paths', (t) => {
  const root = fixture(t);
  const bad = [
    ['.devocd/draft/../secret.md', 'path'],
    ['../outside.md', 'path'],
    ['/etc/passwd', 'path'],
    ['C:\\temp\\page.md', 'path'],
    ['C:/temp/page.md', 'path'],
    ['\\\\server\\share\\page.md', 'path'],
    ['.devocd/draft/code\\api.md', 'path'],
    ['.devocd/draft//api.md', 'path'],
    ['.devocd/draft/control\u0000.md', 'path'],
    ['', 'path'],
    ['.devocd/draft/code/api.md\u2028', 'path'],
  ];
  for (const [path, rule] of bad) {
    const result = check(root, { proposals: [{ kind: 'page', path, content: 'x' }] });
    assert.equal(result.ok, false, JSON.stringify(path));
    assert.ok(rules(result).includes(rule), `${JSON.stringify(path)}: ${JSON.stringify(rules(result))}`);
  }
});

test('rejects unknown keys and bad types inside proposal entries', (t) => {
  const root = fixture(t);
  assert.equal(check(root, { proposals: [{ kind: 'page', path: '.devocd/draft/a.md', content: 'x', approved: true }] }).ok, false);
  assert.equal(check(root, { proposals: [{ kind: 'write', path: '.devocd/draft/a.md' }] }).ok, false);
  assert.equal(check(root, { proposals: [{ kind: 'page', path: '.devocd/draft/a.md', content: 7 }] }).ok, false);
  assert.equal(check(root, { proposals: [{ kind: 'claim' }] }).ok, false);
  assert.equal(check(root, { proposals: [{ kind: 'claim', claim: null }] }).ok, false);
  assert.equal(check(root, { proposals: [{ kind: 'claim', claim: { id: 'C-0001' } }] }).ok, true);
});

test('rejects a missing evidence file and a fake hash', (t) => {
  const root = fixture(t);
  const missing = check(root, { evidence: [{ type: 'file', path: 'src/missing.js', sha256: sha256(SOURCE) }] });
  assert.equal(missing.ok, false);
  assert.ok(rules(missing).includes('evidence'));
  assert.match(missing.problems[0].message, /does not exist/);
  const fake = check(root, { evidence: [{ type: 'file', path: 'src/api.js', sha256: '0'.repeat(64) }] });
  assert.equal(fake.ok, false);
  assert.match(fake.problems[0].message, /hash does not match/);
  assert.equal(check(root, { evidence: [{ type: 'file', path: 'src/api.js', sha256: 'abc' }] }).ok, false);
});

test('evidence paths must stay inside root and use POSIX form', (t) => {
  const root = fixture(t);
  for (const path of ['../outside.js', '/etc/passwd', 'C:/temp/x.js', 'src\\api.js']) {
    const result = check(root, { evidence: [{ type: 'file', path, sha256: sha256(SOURCE) }] });
    assert.equal(result.ok, false, path);
  }
});

test('a symlinked evidence file is refused', (t) => {
  const root = fixture(t);
  try {
    symlinkSync(join(root, 'src', 'api.js'), join(root, 'src', 'link.js'), 'file');
  } catch (error) {
    if (/** @type {any} */ (error).code === 'EPERM' || /** @type {any} */ (error).code === 'EACCES') {
      t.skip('symlinks are not available to this user');
      return;
    }
    throw error;
  }
  const result = check(root, { evidence: [{ type: 'file', path: 'src/link.js', sha256: sha256(SOURCE) }] });
  assert.equal(result.ok, false);
  assert.ok(rules(result).includes('evidence'));
});

test('PR and session evidence are type-checked', (t) => {
  const root = fixture(t);
  for (const number of [0, -1, 1.5, '2', null]) {
    assert.equal(check(root, { evidence: [{ type: 'pr', number }] }).ok, false, String(number));
  }
  assert.equal(check(root, { evidence: [{ type: 'pr', number: 42 }] }).ok, true);
  assert.equal(check(root, { evidence: [{ type: 'session', id: 's-1' }] }).ok, true);
  assert.equal(check(root, { evidence: [{ type: 'session', id: '' }] }).ok, false);
  assert.equal(check(root, { evidence: [{ type: 'file' }] }).ok, false, 'file evidence needs its fields');
  assert.equal(check(root, { evidence: [{ type: 'unknown' }] }).ok, false);
  assert.equal(check(root, { evidence: [{ type: 'pr', number: 1, sha256: 'x' }] }).ok, false, 'unknown evidence key');
});

test('does not mutate the proposal', (t) => {
  const root = fixture(t);
  const proposal = good();
  const before = structuredClone(proposal);
  validateProposal(proposal, { root, permittedPaths: PERMITTED });
  assert.deepEqual(proposal, before);
});

test('a validated DONE proposal is ready to check, never approved, and nothing is written', (t) => {
  const root = fixture(t);
  const result = check(root);
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result).sort(), ['ok', 'problems'], 'the result carries no approval state');
  assert.ok(!('approved' in result) && !('published' in result) && !('ready' in result));
  assert.deepEqual(Object.keys(proposalModule).sort(), ['STATUSES', 'validateProposal'], 'the module exposes no approve or publish path');
  assert.equal(existsSync(join(root, '.devocd')), false, 'validating writes nothing');
  assert.equal(readFileSync(join(root, 'src', 'api.js'), 'utf8'), SOURCE, 'the evidence file is untouched');
});

test('odd options are rejected rather than throwing', () => {
  const result = validateProposal(good(), /** @type {any} */ ({ root: '', permittedPaths: 'all' }));
  assert.equal(result.ok, false);
  assert.ok(rules(result).includes('config'));
  const noRoot = validateProposal(good(), { permittedPaths: PERMITTED });
  assert.equal(noRoot.ok, false);
  assert.ok(rules(noRoot).includes('config'));
});
