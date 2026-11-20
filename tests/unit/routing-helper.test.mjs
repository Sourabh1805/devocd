// The live routing test decides what a run touched with these helpers; they are checked here on made-up tool calls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { accessed, norm, unrelatedTouched } from '../helpers/routing.mjs';

const company = '/work/company';
const IDS = ['billing', 'auth', 'catalog'];
const ev = (/** @type {string} */ name, /** @type {any} */ input) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'x', name, input }] } });
const unrelated = (/** @type {any[]} */ events, /** @type {string} */ cwd, /** @type {string} */ own) =>
  unrelatedTouched(IDS, own, company, accessed(events, cwd, company));

test('a Read of a file in another project is touching it', () => {
  assert.deepEqual(unrelated([ev('Read', { file_path: '/work/company/auth/src/x.js' })], company, 'billing'), ['auth']);
  assert.deepEqual(unrelated([ev('Read', { file_path: '/work/company/billing/src/x.js' })], company, 'billing'), []);
});

test('a relative path is resolved against the run folder', () => {
  assert.deepEqual(unrelated([ev('Read', { file_path: '../auth/a.js' })], '/work/company/billing', 'billing'), ['auth']);
});

test('a Glob or Grep with no path from the company folder searches every other project', () => {
  assert.deepEqual(unrelated([ev('Glob', { pattern: '**/*.js' })], company, 'billing'), ['auth', 'catalog']);
  assert.deepEqual(unrelated([ev('Grep', { pattern: 'refund' })], company, 'billing'), ['auth', 'catalog']);
});

test('a Glob pattern that embeds a path is narrowed to it', () => {
  assert.deepEqual(unrelated([ev('Glob', { pattern: 'billing/**/*.js' })], company, 'billing'), []);
  assert.deepEqual(unrelated([ev('Glob', { pattern: 'auth/**' })], company, 'billing'), ['auth']);
  assert.deepEqual(unrelated([ev('Glob', { pattern: '../auth/**', path: '/work/company/billing' })], company, 'billing'), ['auth']);
  assert.deepEqual(unrelated([ev('Grep', { pattern: 'x', glob: 'catalog/src/*.js' })], company, 'billing'), ['catalog']);
});

test('a search with a path inside the project is not broad', () => {
  const a = accessed([ev('Grep', { pattern: 'x', path: '/work/company/billing/src' })], company, company);
  assert.equal(a.broad, false);
  assert.deepEqual(a.paths, [norm(resolve('/work/company/billing/src'))]);
});
