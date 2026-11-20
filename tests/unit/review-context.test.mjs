import { workspace } from '../helpers/workspace.mjs';
// review-context: one graph build gives pr-review the leaf page, parents, policies and decisions for every changed file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { reviewContext } from '../../scripts/lib/trace.mjs';

const cli = fileURLToPath(new URL('../../scripts/devocd.mjs', import.meta.url));
const INVOICE = 'export const invoice = 1;\n';
const sha = (/** @type {string} */ s) => createHash('sha256').update(s).digest('hex');
const BODY = 'Zebra-unique-body-sentence-9137.';

function project(t, extra = {}) {
  return workspace(t, { files: {
    'src/billing/invoice.ts': INVOICE,
    'src/billing/tax/rate.ts': 'export const rate = 2;\n',
    '.devocd/PROJECT.md': '# Project\nProject summary line\n',
    '.devocd/code/billing/index.md': `# Billing\nParent: [Project](../../PROJECT.md)\nScope: src/billing/**\nStandards: coding\n\nInvoices summary line\n\n${BODY}\n\n## Evidence\n- src/billing/invoice.ts sha256:${sha(INVOICE)} 2026-01-01\n`,
    '.devocd/code/billing/tax/index.md': '# Tax\nParent: [Billing](../index.md)\nScope: src/billing/tax/**\n\nTax rates\n',
    '.devocd/standards/coding.md': '# Coding\nStyle rules\n',
    '.devocd/decisions.md': '# Decisions\nLog\n',
    ...extra,
  } }).root;
}

test('groups changed files by leaf page, collects parents once, and keeps leaves out of parents', t => {
  const r = reviewContext(project(t), ['src/billing/invoice.ts', './src/billing/tax/rate.ts', 'src/billing/new.ts']);
  assert.deepEqual(r.pages.map(p => [p.id, p.files]), [
    ['code/billing/index.md', ['src/billing/invoice.ts', 'src/billing/new.ts']],
    ['code/billing/tax/index.md', ['src/billing/tax/rate.ts']],
  ]);
  assert.equal(r.pages[0].path, '.devocd/code/billing/index.md', 'a repo-relative path the skill can Read');
  assert.equal(r.pages[0].freshness, 'current');
  assert.deepEqual(r.parents.map(p => p.id), ['PROJECT.md'], 'billing is a leaf here, so only PROJECT.md is a parent');
  assert.equal(r.parents[0].path, '.devocd/PROJECT.md');
  assert.deepEqual(r.unmapped, []);
  assert.equal(r.decisions?.path, '.devocd/decisions.md');
});

test('policies come from the leaf and its chain, once each, with the files they govern', t => {
  const r = reviewContext(project(t), ['src/billing/invoice.ts', 'src/billing/tax/rate.ts']);
  assert.deepEqual(r.policies.map(p => ['id' in p ? p.id : p.external, p.files]), [
    ['standards/coding.md', ['src/billing/invoice.ts', 'src/billing/tax/rate.ts']],
  ]);
});

test('files no page maps are unmapped, never guessed by word search', t => {
  // "billing" would match by words; a review must not attach a page that does not cover the file.
  const r = reviewContext(project(t), ['docs/billing.md', 'README']);
  assert.deepEqual(r.pages, []);
  assert.deepEqual(r.unmapped, ['docs/billing.md', 'README']);
});

test('metadata only: no page bodies, and stale pages say so', t => {
  const root = project(t, { 'src/billing/invoice.ts': 'export const invoice = 2;\n' });
  const r = reviewContext(root, ['src/billing/invoice.ts']);
  assert.doesNotMatch(JSON.stringify(r), /Zebra-unique/);
  assert.equal(r.pages[0].freshness, 'stale');
  assert.match(r.note, /stale/i);
});

test('the file list is capped and duplicates collapse', t => {
  const many = Array.from({ length: 205 }, (_, i) => `src/billing/f${i}.ts`);
  const r = reviewContext(project(t), [...many, 'src/billing/f0.ts']);
  assert.equal(r.truncated, true);
  assert.equal(r.pages[0].files.length, 200);
  const small = reviewContext(project(t), ['src/billing/a.ts', 'src/billing/a.ts', 'src\\billing\\a.ts']);
  assert.equal(small.truncated, false);
  assert.deepEqual(small.pages[0].files, ['src/billing/a.ts']);
});

test('a project without knowledge says so instead of failing', t => {
  const root = workspace(t).root;
  const r = reviewContext(root, ['src/a.ts']);
  assert.deepEqual(r.pages, []);
  assert.deepEqual(r.unmapped, ['src/a.ts']);
  assert.equal(r.decisions, null);
});

test('CLI: review-context prints JSON and refuses a call without files', t => {
  const root = project(t);
  const ok = spawnSync(process.execPath, [cli, 'review-context', root, 'src/billing/invoice.ts'], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(JSON.parse(ok.stdout).pages[0].id, 'code/billing/index.md');
  for (const args of [['review-context', root], ['review-context', root, ' ']]) {
    const bad = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
    assert.notEqual(bad.status, 0, args.join(' '));
  }
});

test('absolute paths from the editor map like project-relative ones', t => {
  const root = project(t);
  const r = reviewContext(root, [join(root, 'src', 'billing', 'invoice.ts')]);
  assert.deepEqual(r.pages.map(p => [p.id, p.files]), [['code/billing/index.md', ['src/billing/invoice.ts']]]);
});

test('without a canonical context pointer, canonical says not present', t => {
  assert.deepEqual(reviewContext(project(t), ['src/billing/invoice.ts']).canonical, { present: false });
});

test('a parent outside the repo is listed as external, not dropped', t => {
  const root = project(t, { '.devocd/PROJECT.md': '# Project\nParent: [Company](../../CLAUDE.md)\n\nProject summary line\n' });
  const r = reviewContext(root, ['src/billing/invoice.ts']);
  assert.ok(r.parents.some(p => 'external' in p && /^(\.\.\/)+CLAUDE\.md$/.test(String(p.external))), JSON.stringify(r.parents));
});

test('files past the cap are named, so none disappears silently', t => {
  const many = Array.from({ length: 203 }, (_, i) => `src/billing/f${i}.ts`);
  const r = reviewContext(project(t), many);
  assert.deepEqual(r.notLooked, many.slice(200));
  assert.deepEqual(reviewContext(project(t), ['src/billing/a.ts']).notLooked, []);
});
