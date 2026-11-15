import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Script, runInNewContext } from 'node:vm';
import { makeTree } from '../helpers/tree.mjs';
import { buildKnowledge, scopeKnowledge, searchKnowledge, routeKnowledge, writeKnowledge } from '../../plugin/scripts/lib/knowledge.mjs';
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
    { source: 'PROJECT.md', target: 'code/billing.md', line: 2, type: 'links' },
    { source: 'code/billing.md', target: 'PROJECT.md', line: 3, type: 'links' },
    { source: 'code/extra.md', target: 'code/billing.md', line: 8, type: 'links' },
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

test('capture history is excluded from current graph, search and route without deleting it', t => {
  const history = '# Retired instructions\n```diff\n- Use obsolete-cache for billing\n```\n';
  const root = fixture(t, {
    '.devocd/decision-history/d1.md': history,
    '.devocd/decision-history/parts/d1.md': '# Archived details\nobsolete-cache',
    '.devocd/decisions.md': '# Decisions\nUse current-cache for billing',
  });
  const graph = buildKnowledge(root);
  assert.ok(graph.nodes.some(node => node.id === 'decisions.md'));
  assert.ok(graph.nodes.every(node => !node.id.startsWith('decision-history/')));
  assert.deepEqual(searchKnowledge(graph, 'obsolete-cache'), []);
  assert.equal(routeKnowledge(graph, 'obsolete-cache').totalMatches, 0);
  assert.equal(routeKnowledge(graph, 'current-cache').results[0].id, 'decisions.md');
  writeKnowledge(root);
  assert.doesNotMatch(readFileSync(join(root, '.devocd/knowledge.json'), 'utf8'), /obsolete-cache/);
  assert.equal(readFileSync(join(root, '.devocd/decision-history/d1.md'), 'utf8'), history);
});

test('nested module and runtime flow scopes preserve internal links and root membership', t => {
  const root = fixture(t, {
    '.devocd/code/apps/api/index.md': '# API\n[Billing](billing/index.md)',
    '.devocd/code/apps/api/billing/index.md': '# Billing\n[API](../index.md)',
    '.devocd/flows/runtime/checkout/index.md': '# Checkout\n[Charge](charge/index.md)',
    '.devocd/flows/runtime/checkout/charge/index.md': '# Charge',
  });
  const graph = buildKnowledge(root);
  assert.equal(graph.version, 3);
  assert.deepEqual(scopeKnowledge(graph, '.'), graph);
  const api = scopeKnowledge(graph, 'code/apps/api');
  assert.equal(api.nodes.length, 2);
  assert.equal(api.edges.length, 2);
  assert.ok(api.scopes.some(s => s.id === 'code/apps/api/billing' && s.parent === 'code/apps/api'));
  assert.equal(scopeKnowledge(graph, 'flows/runtime/checkout').nodes.length, 2);
  assert.throws(() => scopeKnowledge(graph, '../outside'), { code: 'BAD_TARGET' });
});

test('company graph exposes registry pointers without reading project trees', t => {
  const state = { version: 1, kind: 'company', name: 'Acme', description: '', parentFile: 'CLAUDE.md', keyRules: [], sources: [], projects: [{ id: 'api', path: 'repos/api', description: 'API' }] };
  const root = fixture(t, { '.devocd/state.json': JSON.stringify(state), 'repos/api/private.js': 'unread source' });
  const graph = buildKnowledge(root);
  assert.deepEqual(graph.projects, [{ id: 'api', entry: 'repos/api/.devocd/PROJECT.md' }]);
  assert.doesNotMatch(JSON.stringify(graph), /unread source/);
  state.projects[0].path = '../outside';
  writeFileSync(join(root, '.devocd/state.json'), JSON.stringify(state));
  assert.throws(() => buildKnowledge(root), { code: 'BAD_TARGET' });
});

test('writes deterministic JSON and offline HTML with safe embedded source text', t => {
  const root = fixture(t, { '.devocd/unsafe.md': '# </script><script>alert(1)</script>\n<img src=x onerror=alert(1)>' });
  const result = writeKnowledge(root);
  const before = result.files.map(p => readFileSync(p, 'utf8'));
  assert.equal(result.nodes, 3);
  assert.equal(result.skipped, 0);
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

test('skips secrets, binary and oversized sources, records them, and never fails the build', t => {
  const root = fixture(t);
  const source = join(root, '.devocd/bad.md');
  for (const [text, reason] of [['# Key\nAKIA' + 'A'.repeat(16), 'secret'], ['\0', 'binary'], [Buffer.from([0xff]), 'not-utf8'], ['a'.repeat(256 * 1024 + 1), 'too-large']]) {
    writeFileSync(source, text);
    const graph = buildKnowledge(root);
    assert.deepEqual(graph.skipped, [{ id: 'bad.md', reason }]);
    assert.equal(graph.nodes.length, 2);
    assert.equal(writeKnowledge(root).skipped, 1);
  }
});

test('a secret page is left out of knowledge.json and knowledge.html; a secret filename is withheld', t => {
  const secret = 'AKIA' + 'A'.repeat(16);
  const root = fixture(t, { '.devocd/bad.md': '# Key\n' + secret, ['.devocd/' + secret + '.md']: '# x' });
  const graph = buildKnowledge(root);
  assert.equal(graph.nodes.length, 2);
  assert.deepEqual(graph.skipped.map(s => s.reason), ['secret', 'secret']);
  assert.deepEqual(graph.skipped.map(s => s.id).sort(), ['(filename withheld)', 'bad.md']);
  const result = writeKnowledge(root);
  for (const p of result.files) assert.ok(!readFileSync(p, 'utf8').includes(secret));
});

test('MAX_NODES stays fatal', t => {
  const files = {};
  for (let i = 0; i < 501; i++) files[`.devocd/n${i}.md`] = '# n';
  assert.throws(() => buildKnowledge(fixture(t, files)), { code: 'KNOWLEDGE_LIMIT' });
});

test('nodes carry kind, headings, summary, estimatedTokens and meta', t => {
  const paths = { 'code/a.md': 'module', 'flows/f.md': 'flow', 'standards/s.md': 'policy', 'decisions.md': 'decision', 'PROJECT.md': 'project', 'pointer.md': 'generated', 'coverage.md': 'generated', 'coverage/x.md': 'generated', 'TOOLS.md': 'generated', 'CAPTURE.md': 'generated', 'REFRESH.md': 'generated', 'REFRESH-APPLY.md': 'generated', 'cicd.md': 'thematic', 'history.md': 'thematic', 'guides/g.md': 'thematic', 'operations/o.md': 'thematic', 'team/t.md': 'thematic', 'misc.md': 'page' };
  const files = {};
  for (const p of Object.keys(paths)) files['.devocd/' + p] = '# T\n';
  const graph = buildKnowledge(fixture(t, files));
  for (const [p, kind] of Object.entries(paths)) assert.equal(graph.nodes.find(n => n.id === p).kind, kind, p);
  assert.equal(graph.nodes.find(n => n.id === 'misc.md').summary, '');
});

test('headings and summary ignore fences, header key lines and list items', t => {
  const text = '# Title\nParent: [P](../PROJECT.md)\nScope: src/**\nStandards: none\nUses: none\n\n- item\n```\n## fake\nfake prose\n```\n## Real\n### Deeper ##\n' + 'x'.repeat(200) + '\n';
  const node = buildKnowledge(fixture(t, { '.devocd/code/p.md': text })).nodes.find(n => n.id === 'code/p.md');
  assert.deepEqual(node.headings, ['Real', 'Deeper']);
  assert.equal(node.summary, 'x'.repeat(160));
  assert.equal(typeof node.estimatedTokens, 'number');
  assert.deepEqual(Object.keys(node.meta).sort(), ['evidence', 'problems', 'scope', 'standards', 'uses']);
  assert.deepEqual(node.meta.scope, ['src/**']);
});

test('Parent line link is one parent edge, not also a links edge', t => {
  const graph = buildKnowledge(fixture(t, { '.devocd/code/c.md': '# C\nParent: [Billing](billing.md)\n[again](extra.md)\n', '.devocd/code/extra.md': '# E' }));
  const edges = graph.edges.filter(e => e.source === 'code/c.md');
  assert.deepEqual(edges, [
    { source: 'code/c.md', target: 'code/billing.md', line: 2, type: 'parent' },
    { source: 'code/c.md', target: 'code/extra.md', line: 3, type: 'links' },
  ]);
});

test('Standards topic becomes governed-by edge when the policy exists, else an external item', t => {
  const page = '# P\nStandards: coding, security\n';
  const graph = buildKnowledge(fixture(t, { '.devocd/code/p.md': page, '.devocd/standards/coding.md': '# Coding' }));
  assert.deepEqual(graph.edges.filter(e => e.type === 'governed-by'), [{ source: 'code/p.md', target: 'standards/coding.md', line: 2, type: 'governed-by' }]);
  assert.deepEqual(graph.external.filter(e => e.type === 'governed-by'), [{ source: 'code/p.md', target: 'standards/security.md', line: 2, type: 'governed-by' }]);
});

test('links leaving .devocd are external, URLs and absolute paths are not recorded; Uses is external', t => {
  const graph = buildKnowledge(fixture(t, { '.devocd/PROJECT.md': '# P\n[c](../CLAUDE.md)\n[w](https://example.com)\n[a](/abs.md)\nUses: our-shared\n' }));
  assert.deepEqual(graph.external, [
    { source: 'PROJECT.md', target: '../CLAUDE.md', line: 2, type: 'links' },
    { source: 'PROJECT.md', target: 'our-shared', line: 5, type: 'uses' },
  ]);
});

test('Parent link leaving .devocd is an external parent item', t => {
  const graph = buildKnowledge(fixture(t, { '.devocd/PROJECT.md': '# P\nParent: [Co](../../CLAUDE.md)\n' }));
  assert.deepEqual(graph.external, [{ source: 'PROJECT.md', target: '../../CLAUDE.md', line: 2, type: 'parent' }]);
});

test('sources maps cited files to sorted unique page ids', t => {
  const ev = () => `# P\n## Evidence\n- src/a.js#L1-2 sha256:${'a'.repeat(64)} 2026-01-01\n- src/a.js#L5 sha256:${'a'.repeat(64)} 2026-01-01\n`;
  const graph = buildKnowledge(fixture(t, { '.devocd/code/z.md': ev(), '.devocd/code/b.md': ev() }));
  assert.deepEqual(graph.sources, { 'src/a.js': ['code/b.md', 'code/z.md'] });
});

test('scopeKnowledge returns external items for in-scope sources only', t => {
  const graph = buildKnowledge(fixture(t, { '.devocd/code/a.md': '# A\n[c](../../CLAUDE.md)\n', '.devocd/flows/f.md': '# F\n[c](../../X.md)\n' }));
  assert.deepEqual(scopeKnowledge(graph, 'code').external, [{ source: 'code/a.md', target: '../CLAUDE.md', line: 2, type: 'links' }]);
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
  const elements = new Map(['data', 'search', 'results', 'status', 'graph', 'title', 'path', 'content', 'connections', 'scopes', 'projects'].map(id => [id, new Element()]));
  elements.get('data').textContent = JSON.stringify(graph);
  const document = {
    getElementById: id => elements.get(id),
    createElement: () => new Element(),
    createElementNS: () => new Element(),
  };
  const scripts = [...renderKnowledge(graph).matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)];
  runInNewContext(scripts[1][1], { document });
  assert.equal(elements.get('results').children.length, 2);
  elements.get('scopes').children.find(b => b.textContent === 'Graph: code').onclick();
  assert.equal(elements.get('results').children.length, 1);
  assert.equal(elements.get('results').children[0].dataset.id, 'code/billing.md');
  elements.get('scopes').children.find(b => b.textContent === 'Up: .').onclick();
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
