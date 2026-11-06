// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateTokens, LIMITS } from '../../plugin/scripts/lib/tokens.mjs';

test('estimateTokens counts ascii by 4 and other characters by 2', () => {
  assert.equal(estimateTokens('abcd'), 1);
  assert.equal(estimateTokens('日本語'), 2);
  assert.equal(estimateTokens(''), 0);
});

test('LIMITS holds the global values', () => {
  assert.deepEqual(LIMITS.parent, { lines: 60, tokens: 500, keyRulesTokens: 300 });
  assert.deepEqual(LIMITS.pointer, { lines: 40, tokens: 400 });
  assert.deepEqual(LIMITS.project, { lines: 80, tokens: 700 });
  assert.deepEqual(LIMITS.entry, { lines: 100, tokens: 900 });
  assert.equal(LIMITS.flow.lines, 80);
  assert.equal(LIMITS.reference.lines, 200);
  assert.equal(LIMITS.launchTokens, 2000);
  assert.equal(LIMITS.footprintTokens, 100);
});
