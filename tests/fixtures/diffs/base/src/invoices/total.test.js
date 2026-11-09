import { test } from 'node:test';
import assert from 'node:assert/strict';
import { invoiceTotal } from './total.js';

test('adds line totals in cents', () => {
  assert.equal(invoiceTotal([{ amountCents: 250, quantity: 2 }, { amountCents: 100, quantity: 1 }]), 600);
});

test('rejects lines that are not an array', () => {
  assert.throws(() => invoiceTotal(null), TypeError);
});
