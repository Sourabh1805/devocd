// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeTree } from '../helpers/tree.mjs';
import { traceKnowledge } from '../../plugin/scripts/lib/trace.mjs';

const cli = fileURLToPath(new URL('../../plugin/scripts/devocd.mjs', import.meta.url));
const INVOICE = 'export const invoice = 1;\n';
const sha = (/** @type {string} */ s) => createHash('sha256').update(s).digest('hex');
const SECRET = 'Zebra-unique-body-sentence-9137.';

function project(t, extra = {}, billingScope = 'src/billing/**') {
  const root = mkdtempSync(join(tmpdir(), 'devocd-trace-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return makeTree(root, {
    'src/billing/invoice.ts': INVOICE,
    'src/billing/tax/rate.ts': 'export const rate = 2;\n',
    'src/other.ts': 'x\n',
    '.devocd/PROJECT.md': `# Project\nProject summary line\n\n${SECRET}\n`,
    '.devocd/code/billing/index.md': `# Billing\nParent: [Project](../../PROJECT.md)\nScope: ${billingScope}\nStandards: coding\n\nInvoices summary line\n\n${SECRET}\n\n## Evidence\n- src/billing/invoice.ts sha256:${sha(INVOICE)} 2026-01-01\n`,
    '.devocd/code/billing/tax/index.md': '# Tax\nParent: [Billing](../index.md)\nScope: src/billing/tax/**\n\nTax rates\n',
    '.devocd/flows/pay.md': '# Pay\nScope: src/pay/**\n\nPayment settlement flow\n',
    '.devocd/standards/coding.md': '# Coding\nStyle rules\n',
    '.devocd/decisions.md': '# Decisions\nLog\n',
    ...extra,
  });
}

test('path mode picks the most specific scope and walks the chain to the project', t => {
  const r = traceKnowledge(project(t), './src/billing/tax/rate.ts');
  assert.equal(r.mode, 'path');
  assert.equal(r.leaf?.id, 'code/billing/tax/index.md');
  assert.deepEqual(r.chain.map(c => c.id), ['code/billing/index.md', 'PROJECT.md']);
  assert.deepEqual(r.alternatives.map(a => a.id), ['code/billing/index.md']);
});

test('evidence citation wins over a more specific scope', t => {
  const root = project(t, { '.devocd/code/billing/tax/index.md': `# Tax\nParent: [Billing](../index.md)\nScope: src/billing/**\n\n## Evidence\n- src/billing/tax/rate.ts sha256:${'0'.repeat(64)} 2026-01-01\n` });
  const r = traceKnowledge(root, 'src/billing/tax/rate.ts');
  assert.equal(r.leaf?.id, 'code/billing/tax/index.md');
  const r2 = traceKnowledge(root, 'src/billing/invoice.ts');
  assert.equal(r2.leaf?.id, 'code/billing/index.md');
});

test('plain directory scope matches as a prefix; brace globs work', t => {
  const a = traceKnowledge(project(t, {}, 'src/billing'), 'src/billing/x.ts');
  assert.equal(a.leaf?.id, 'code/billing/index.md');
  const b = traceKnowledge(project(t, {}, 'src/{billing,pay}/*.ts'), 'src/billing/z.ts');
  assert.equal(b.leaf?.id, 'code/billing/index.md');
  assert.equal(traceKnowledge(project(t, {}, 'src/{billing,pay}/*.ts'), 'src/misc/z.ts').leaf, null);
});

test('a folder query matches a trailing /** scope; absolute paths resolve against the project', t => {
  const root = project(t);
  assert.equal(traceKnowledge(root, 'src/billing/tax').leaf?.id, 'code/billing/tax/index.md');
  assert.equal(traceKnowledge(root, join(root, 'src', 'billing', 'tax', 'rate.ts')).leaf?.id, 'code/billing/tax/index.md');
});

test('a path-looking word with no scope match falls back to words search', t => {
  const w = traceKnowledge(project(t, { '.devocd/flows/node.md': '# Node.js runtime\nRuntime notes\n' }), 'Node.js');
  assert.equal(w.mode, 'words');
  assert.equal(w.leaf?.id, 'flows/node.md');
});

test('words mode returns a leaf with alternatives, preferring module and flow pages', t => {
  const r = traceKnowledge(project(t), 'payment settlement');
  assert.equal(r.mode, 'words');
  assert.equal(r.leaf?.id, 'flows/pay.md');
  const w = traceKnowledge(project(t), 'invoices');
  assert.equal(w.leaf?.id, 'code/billing/index.md');
  assert.ok(Array.isArray(w.alternatives));
});

test('policies are collected up the chain, de-duplicated, with next ordering', t => {
  const r = traceKnowledge(project(t), 'src/billing/tax/rate.ts');
  assert.deepEqual(r.policies.map(p => p.id), ['standards/coding.md']);
  assert.deepEqual(r.decisions?.id, 'decisions.md');
  assert.deepEqual(r.next, ['code/billing/tax/index.md', 'code/billing/index.md', 'PROJECT.md', 'standards/coding.md']);
  assert.match(r.note, /Open the leaf first/);
});

test('freshness: current, then stale after edit, unknown with no evidence', t => {
  const root = project(t);
  assert.equal(traceKnowledge(root, 'src/billing/invoice.ts').leaf?.freshness, 'current');
  assert.equal(traceKnowledge(root, 'src/billing/tax/rate.ts').leaf?.freshness, 'unknown');
  writeFileSync(join(root, 'src/billing/invoice.ts'), 'changed\n');
  assert.equal(traceKnowledge(root, 'src/billing/invoice.ts').leaf?.freshness, 'stale');
});

test('missing cited file is stale; injected inventory is honoured', t => {
  const root = project(t);
  const r = traceKnowledge(root, 'src/billing/invoice.ts', { inventory: { files: [] } });
  assert.equal(r.leaf?.freshness, 'stale');
  const ok = traceKnowledge(root, 'src/billing/invoice.ts', { inventory: { files: [{ path: 'src/billing/invoice.ts', status: 'available', sha256: sha(INVOICE) }] } });
  assert.equal(ok.leaf?.freshness, 'current');
  const na = traceKnowledge(root, 'src/billing/invoice.ts', { inventory: { files: [{ path: 'src/billing/invoice.ts', status: 'not-read', sha256: sha(INVOICE) }] } });
  assert.equal(na.leaf?.freshness, 'unknown');
});

test('freshness: deleted cited file is stale; size-limited cited file is unknown', t => {
  const root = project(t);
  rmSync(join(root, 'src/billing/invoice.ts'));
  assert.equal(traceKnowledge(root, 'src/billing/invoice.ts').leaf?.freshness, 'stale');
  const big = project(t);
  writeFileSync(join(big, 'src/billing/invoice.ts'), 'x'.repeat(300 * 1024));
  assert.equal(traceKnowledge(big, 'src/billing/invoice.ts').leaf?.freshness, 'unknown');
  const skipped = traceKnowledge(big, 'src/billing/invoice.ts', { inventory: { files: [], skipped: [{ path: 'src/billing/invoice.ts', reason: 'excluded' }] } });
  assert.equal(skipped.leaf?.freshness, 'unknown');
});

test('chain is capped at 20 parents and reports truncation', t => {
  const extra = {};
  for (let i = 0; i < 25; i++) {
    extra[`.devocd/code/c${i}.md`] = `# C${i}\n${i < 24 ? `Parent: [n](c${i + 1}.md)\n` : ''}Scope: deep/c${i}/**\n\nbody\n`;
  }
  const r = traceKnowledge(project(t, extra), 'deep/c0/x.ts');
  assert.equal(r.leaf?.id, 'code/c0.md');
  assert.equal(r.chain.length, 20);
  assert.equal(r.truncated, true);
  assert.equal(traceKnowledge(project(t), 'src/billing/tax/rate.ts').truncated, false);
});

test('no match returns the empty result', t => {
  const r = traceKnowledge(project(t), 'nothing-here-xyz');
  assert.deepEqual(r, { query: 'nothing-here-xyz', mode: 'words', leaf: null, chain: [], policies: [], decisions: null, alternatives: [], next: [], canonical: { present: false }, note: 'No page matches; search different terms or inspect source.' });
});

test('external parent and external policy are appended as external items', t => {
  const r = traceKnowledge(project(t, { '.devocd/PROJECT.md': '# Project\nParent: [Co](../../CLAUDE.md)\nStandards: missing-topic\n' }), 'src/billing/tax/rate.ts');
  assert.deepEqual(r.chain.at(-1), { external: '../../CLAUDE.md' });
});

test('output never contains page body text', t => {
  const r = traceKnowledge(project(t), 'src/billing/invoice.ts');
  assert.ok(!JSON.stringify(r).includes(SECRET));
  assert.ok(!JSON.stringify(traceKnowledge(project(t), 'Zebra-unique-body-sentence')).includes(SECRET));
});

test('CLI matches the library and one argument is a usage error', t => {
  const root = project(t);
  const run = spawnSync(process.execPath, [cli, 'trace', root, 'src/billing/tax/rate.ts'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), JSON.parse(JSON.stringify(traceKnowledge(root, 'src/billing/tax/rate.ts'))));
  const bad = spawnSync(process.execPath, [cli, 'trace', root], { encoding: 'utf8' });
  assert.equal(bad.status, 2);
});

test('trace flags canonical context when the registered company has context-current.json', t => {
  const co = mkdtempSync(join(tmpdir(), 'devocd-trace-co-'));
  t.after(() => rmSync(co, { recursive: true, force: true }));
  const files = {
    '.devocd/state.json': JSON.stringify({ version: 1, kind: 'company', name: 'Acme', description: 'd', parentFile: 'CLAUDE.md', keyRules: [], projects: [{ id: 'billing', path: 'billing', description: 'd' }], sources: [] }),
    'billing/.devocd/state.json': JSON.stringify({ version: 1, kind: 'project', id: 'billing', companyRel: '..', teamFiles: [], approvedCommands: [], sources: [] }),
    'billing/.devocd/PROJECT.md': '# Project\nProject summary line\n',
    'billing/src/a.ts': 'x\n',
  };
  makeTree(co, files);
  const absent = traceKnowledge(join(co, 'billing'), 'project summary');
  assert.deepEqual(absent.canonical, { present: false });
  makeTree(co, { '.devocd/context-current.json': '{}\n' });
  const present = traceKnowledge(join(co, 'billing'), 'project summary');
  assert.equal(present.canonical.present, true);
  assert.match(present.canonical.note, /devocd context-resolve/);
  assert.match(present.canonical.note, /blocked/);
  assert.deepEqual(traceKnowledge(join(co, 'billing'), 'zzzqqq').canonical, { present: true, note: present.canonical.note });
});

test('trace reports canonical absent for a project with no company', t => {
  assert.deepEqual(traceKnowledge(project(t), 'src/billing/invoice.ts').canonical, { present: false });
});
