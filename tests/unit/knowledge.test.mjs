import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Script, runInNewContext } from 'node:vm';
import { makeTree } from '../helpers/tree.mjs';
import { buildKnowledge, searchKnowledge, writeKnowledge } from '../../plugin/scripts/lib/knowledge.mjs';
import { renderKnowledge } from '../../plugin/scripts/lib/knowledge-view.mjs';

const cli = fileURLToPath(new URL('../../plugin/scripts/devocd.mjs', import.meta.url));
function fixture(t, files = {}) {
  const root = mkdtempSync(join(tmpdir(), 'devocd-knowledge-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return makeTree(root, { '.devocd/PROJECT.md': '# Project\n[Billing](code/billing.md)\n', '.devocd/code/billing.md': '# Billing\nPayments and invoices\n[Home](../PROJECT.md#stack)\n', ...files });
}

test('builds stable document nodes and directed links with provenance, excluding backups and examples', t => {
  const root = fixture(t, {
    '.devocd/.backups/old.md': '# Old',
    '.devocd/state.json': '{}',
    '.devocd/code/extra.md': '# Extra\n`[ignored](billing.md)`\n```md\n[ignored](billing.md)\n```\n[outside](../../outside.md)\n[web](https://example.com)\n[real](billing.md)\n[duplicate](billing.md)\n',
  });
  const graph = buildKnowledge(root);
  assert.equal(graph.nodes.length, 3);
  assert.deepEqual(graph.edges, [
    { source: 'PROJECT.md', target: 'code/billing.md', line: 2 },
    { source: 'code/billing.md', target: 'PROJECT.md', line: 3 },
    { source: 'code/extra.md', target: 'code/billing.md', line: 8 },
  ]);
  assert.deepEqual(buildKnowledge(root), graph);
  assert.match(graph.nodes[0].sha256, /^[a-f\d]{64}$/);
});

test('literal AND search ranks headings first and reads updated content', t => {
  const root = fixture(t, { '.devocd/notes.md': '# Notes\nBilling payments [x]\n' });
  assert.deepEqual(searchKnowledge(buildKnowledge(root), 'BILLING payments').map(r => r.id), ['code/billing.md', 'notes.md']);
  assert.equal(searchKnowledge(buildKnowledge(root), '[x]')[0].line, 2);
  assert.deepEqual(searchKnowledge(buildKnowledge(root), '   '), []);
  assert.deepEqual(searchKnowledge(buildKnowledge(root), 'not-found'), []);
  writeKnowledge(root);
  writeFileSync(join(root, '.devocd/notes.md'), '# Updated\nnew fact');
  const run = spawnSync(process.execPath, [cli, 'knowledge-search', root, 'new fact'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(JSON.parse(run.stdout)[0].title, 'Updated');
});

test('writes deterministic JSON and offline HTML with safe embedded source text', t => {
  const root = fixture(t, { '.devocd/unsafe.md': '# </script><script>alert(1)</script>\n<img src=x onerror=alert(1)>' });
  const result = writeKnowledge(root);
  const before = result.files.map(p => readFileSync(p, 'utf8'));
  assert.equal(result.nodes, 3);
  assert.deepEqual(JSON.parse(before[0]), buildKnowledge(root));
  assert.doesNotMatch(before[1], /<script>alert|<img src=x/);
  assert.match(before[1], /connect-src 'none'/);
  const scripts = [...before[1].matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 2);
  assert.deepEqual(JSON.parse(scripts[0][1]), buildKnowledge(root));
  assert.doesNotThrow(() => new Script(scripts[1][1]));
  writeKnowledge(root);
  assert.deepEqual(result.files.map(p => readFileSync(p, 'utf8')), before);
});

test('refuses secrets, binary sources and oversized inputs before changing artifacts', t => {
  const root = fixture(t);
  writeKnowledge(root);
  const output = join(root, '.devocd/knowledge.json');
  const before = readFileSync(output, 'utf8');
  const source = join(root, '.devocd/bad.md');
  for (const [text, code] of [['# Key\nAKIA' + 'A'.repeat(16), 'KNOWLEDGE_SECRET'], ['\0', 'NOT_UTF8'], [Buffer.from([0xff]), 'NOT_UTF8'], ['a'.repeat(256 * 1024 + 1), 'KNOWLEDGE_LIMIT']]) {
    writeFileSync(source, text);
    assert.throws(() => writeKnowledge(root), { code });
    assert.equal(readFileSync(output, 'utf8'), before);
  }
});

test('refuses linked destinations before changing either output', t => {
  const root = fixture(t);
  const external = join(root, 'external.html');
  writeFileSync(external, 'untouched');
  try { symlinkSync(external, join(root, '.devocd/knowledge.html')); }
  catch (error) { if (['EPERM', 'EACCES'].includes(error.code)) { t.skip('symlink permission unavailable'); return; } throw error; }
  assert.throws(() => writeKnowledge(root), { code: 'NOT_REGULAR' });
  assert.equal(readFileSync(external, 'utf8'), 'untouched');
  assert.throws(() => readFileSync(join(root, '.devocd/knowledge.json')), { code: 'ENOENT' });
});

test('refuses linked knowledge directories and skips linked sources', t => {
  const root = fixture(t);
  const other = fixture(t);
  symlinkSync(join(other, '.devocd'), join(root, '.devocd/linked'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(buildKnowledge(root).nodes.length, 2);
  const linked = join(root, 'project');
  makeTree(linked, {});
  symlinkSync(join(other, '.devocd'), join(linked, '.devocd'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => buildKnowledge(linked), { code: 'NO_DEVOCD' });
});

test('does not overwrite a tracked artifact', t => {
  const root = fixture(t, { '.devocd/knowledge.html': 'tracked' });
  for (const args of [['init', '-q'], ['add', '-f', '.devocd/knowledge.html']]) {
    const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
  assert.throws(() => writeKnowledge(root), { code: 'ALREADY_TRACKED' });
  assert.equal(readFileSync(join(root, '.devocd/knowledge.html'), 'utf8'), 'tracked');
});

test('empty graph renders and CLI validates arguments and missing folders', t => {
  assert.match(renderKnowledge({ version: 1, nodes: [], edges: [] }), /Project knowledge graph/);
  const root = fixture(t);
  for (const args of [['knowledge'], ['knowledge', root, 'extra'], ['knowledge-search', root, ' ']]) {
    assert.equal(spawnSync(process.execPath, [cli, ...args]).status, 2);
  }
  assert.equal(spawnSync(process.execPath, [cli, 'knowledge', join(root, 'missing')]).status, 3);
});

test('viewer initializes, filters results and follows connections without interpreting document HTML', t => {
  const graph = buildKnowledge(fixture(t));
  class Element {
    children = [];
    dataset = {};
    attrs = {};
    textContent = '';
    value = '';
    listeners = {};
    append(...elements) { this.children.push(...elements); }
    replaceChildren(...elements) { this.children = elements; }
    setAttribute(key, value) { this.attrs[key] = value; }
    addEventListener(name, listener) { this.listeners[name] = listener; }
  }
  const elements = new Map(['data', 'search', 'results', 'status', 'graph', 'title', 'path', 'content', 'connections'].map(id => [id, new Element()]));
  elements.get('data').textContent = JSON.stringify(graph);
  const document = {
    getElementById: id => elements.get(id),
    createElement: () => new Element(),
    createElementNS: () => new Element(),
  };
  const scripts = [...renderKnowledge(graph).matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)];
  runInNewContext(scripts[1][1], { document });
  assert.equal(elements.get('results').children.length, 2);
  assert.equal(elements.get('title').textContent, 'Project');
  elements.get('connections').children[0].onclick();
  assert.equal(elements.get('title').textContent, 'Billing');
  assert.equal(elements.get('content').textContent, graph.nodes[1].text);
  elements.get('search').value = 'payments';
  elements.get('search').listeners.input();
  assert.equal(elements.get('results').children.length, 1);
  assert.equal(elements.get('results').children[0].dataset.id, 'code/billing.md');
  elements.get('search').value = 'absent';
  elements.get('search').listeners.input();
  assert.equal(elements.get('results').children.length, 0);
  assert.match(elements.get('status').textContent, /^0 of 2/);
});
