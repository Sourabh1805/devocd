import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyDiscount, MAX_TOTAL_CENTS } from './discount.js';

test('no discount and a full discount', () => {
  assert.equal(applyDiscount(1000, 0), 1000);
  assert.equal(applyDiscount(1000, 100), 0);
});

test('the discount is rounded down to a whole cent', () => {
  assert.equal(applyDiscount(999, 10), 900);
});

test('the largest total is exact', () => {
  assert.equal(applyDiscount(MAX_TOTAL_CENTS, 99), 10_000_000_000);
});

test('rejects a total out of range or fractional, and a percent out of range or fractional', () => {
  assert.throws(() => applyDiscount(-1, 10), RangeError);
  assert.throws(() => applyDiscount(10.5, 10), RangeError);
  assert.throws(() => applyDiscount(MAX_TOTAL_CENTS + 1, 10), RangeError);
  assert.throws(() => applyDiscount(1000, 101), RangeError);
  assert.throws(() => applyDiscount(1000, 2.5), RangeError);
});
