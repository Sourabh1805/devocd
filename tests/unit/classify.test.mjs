// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES, DEFAULT_MODELS, classify, recordModel } from '../../scripts/lib/classify.mjs';

/** [name, unit, expected class, expected model]. Defaults resolve unless a case says otherwise. */
const CASES = /** @type {[string, any, string, string|null][]} */ ([
  ['an inventory unit is deterministic', { kind: 'inventory', files: ['a.md', 'b.md'] }, 'deterministic', null],
  ['a hash unit is deterministic', { kind: 'hash', files: ['a.md'] }, 'deterministic', null],
  ['a schema check is deterministic', { kind: 'schema-check', files: ['a.json'] }, 'deterministic', null],
  ['a render unit is deterministic', { kind: 'render', files: ['page.md'] }, 'deterministic', null],
  ['PR selection is deterministic', { kind: 'pr-select', files: [] }, 'deterministic', null],
  ['a fully specified one-file transform is light', { kind: 'transform', files: ['total.js'] }, 'light', 'haiku'],
  ['a fully specified zero-file transform is light', { kind: 'transform' }, 'light', 'haiku'],
  ['a one-file concurrency unit is heavy', { kind: 'transform', files: ['queue.js'], flags: ['concurrency'] }, 'heavy', 'opus'],
  ['a one-file destructive unit is heavy', { kind: 'transform', files: ['migrate.sql'], flags: ['destructive'] }, 'heavy', 'opus'],
  ['a one-file architecture unit is heavy', { kind: 'transform', files: ['server.js'], flags: ['architecture'] }, 'heavy', 'opus'],
  ['a one-file conflicting-evidence unit is heavy', { kind: 'transform', files: ['a.md'], flags: ['conflicting-evidence'] }, 'heavy', 'opus'],
  ['a one-file ambiguous-boundary unit is heavy', { kind: 'transform', files: ['a.md'], flags: ['ambiguous-boundary'] }, 'heavy', 'opus'],
  ['risk high is heavy regardless of size', { kind: 'inventory', files: ['a.md'], risk: 'high' }, 'heavy', 'opus'],
  ['multi-file evidence synthesis is standard', { kind: 'evidence-synthesis', files: ['a.md', 'b.md', 'c.md'] }, 'standard', 'sonnet'],
  ['an incremental two-file page update is standard', { kind: 'page-update', files: ['a.md', 'b.md'] }, 'standard', 'sonnet'],
  ['a multi-file fully specified transform is standard', { kind: 'transform', files: ['a.js', 'b.js'] }, 'standard', 'sonnet'],
  ['PR claim extraction defaults to standard', { kind: 'pr-claims', files: ['claims.json'] }, 'standard', 'sonnet'],
  ['unrecognised work defaults to standard', { kind: 'mystery', files: ['a.md'] }, 'standard', 'sonnet'],
]);

for (const [name, unit, expected, model] of CASES) {
  test(name, () => {
    const result = classify(unit);
    assert.equal(result.class, expected);
    assert.equal(result.model, model);
    assert.ok(result.reasons.length > 0, 'every decision carries a reason');
  });
}

test('CLASSES is complete and frozen, and DEFAULT_MODELS matches the plan', () => {
  assert.deepEqual([...CLASSES], ['deterministic', 'light', 'standard', 'heavy']);
  assert.ok(Object.isFrozen(CLASSES) && Object.isFrozen(DEFAULT_MODELS));
  assert.deepEqual({ ...DEFAULT_MODELS }, { light: 'haiku', standard: 'sonnet', heavy: 'opus' });
});

test('a company models map overrides defaults per class, and gaps fall back to defaults', () => {
  const models = { light: 'gpt-mini', standard: 'gpt', heavy: 'gpt-max' };
  assert.equal(classify({ kind: 'transform', files: ['a.js'] }, models).model, 'gpt-mini');
  assert.equal(classify({ kind: 'page-update', files: ['a.md', 'b.md'] }, models).model, 'gpt');
  assert.equal(classify({ flags: ['destructive'] }, models).model, 'gpt-max');
  assert.equal(classify({ kind: 'inventory' }, models).model, null, 'deterministic never gets a model');
  assert.equal(classify({ flags: ['concurrency'] }, { light: 'gpt-mini' }).model, 'opus', 'an absent class falls back');
  assert.equal(classify({ flags: ['concurrency'] }, { heavy: '  opus-large  ' }).model, 'opus-large', 'the recorded name is trimmed');
});

test("heavy refuses 'inherit' in any case instead of substituting opus", () => {
  const heavy = { files: ['queue.js'], flags: ['concurrency'] };
  for (const inherit of ['inherit', 'Inherit', 'INHERIT']) {
    assert.throws(() => classify(heavy, { heavy: inherit }), (/** @type {any} */ err) => err.code === 'INHERIT_MODEL' && /inherit/.test(err.message), inherit);
  }
  assert.equal(classify(heavy, { heavy: 'opus' }).model, 'opus');
  assert.equal(classify(heavy, { heavy: '   ' }).model, 'opus', 'blank override falls back to the default');
});

test('PR claim extraction records why it is still standard', () => {
  const result = classify({ kind: 'pr-claims', files: ['claims.json'] });
  assert.ok(result.reasons.some((/** @type {string} */ reason) => reason.includes('T45')));
});

test('odd unit fields never throw and never downgrade a risky or multi-file unit', () => {
  assert.equal(classify({ flags: 'concurrency', files: 'a.js' }).class, 'heavy');
  assert.equal(classify({ kind: 'transform', files: 'a.js,b.js,c.js' }).class, 'standard');
  assert.equal(classify({ kind: 'transform', files: ['q.js'], flags: ['Destructive'] }).class, 'heavy');
  assert.equal(classify({ kind: 'inventory', risk: ' High ' }).class, 'heavy');
  assert.equal(classify({}).class, 'standard');
});

test('inherit is refused for every class', () => {
  for (const [unit, cls] of [[{ kind: 'transform', files: ['a'] }, 'light'], [{ files: ['a', 'b'] }, 'standard'], [{ risk: 'high' }, 'heavy']]) {
    assert.throws(() => classify(unit, { [cls]: 'Inherit' }), (/** @type {any} */ err) => err.code === 'INHERIT_MODEL');
  }
});

test('recordModel writes only the passed unit and returns the classification', () => {
  const unit = { kind: 'transform', files: ['total.js'] };
  const result = recordModel(unit);
  assert.deepEqual(unit, { kind: 'transform', files: ['total.js'], class: 'light', model: 'haiku' });
  assert.deepEqual(result, { class: 'light', model: 'haiku', reasons: ['one fully specified transform, no interpretation'] });
  assert.throws(() => recordModel({ flags: ['destructive'] }, { heavy: 'inherit' }), (/** @type {any} */ err) => err.code === 'INHERIT_MODEL');
});
