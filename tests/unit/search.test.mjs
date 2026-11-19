// @ts-check
import { workspace } from '../helpers/workspace.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTree } from '../helpers/tree.mjs';
import { buildKnowledge, searchKnowledge, routeKnowledge } from '../../scripts/lib/knowledge.mjs';
import { renderKnowledge } from '../../scripts/lib/knowledge-view.mjs';
import { rankPages } from '../../scripts/lib/search.mjs';

function graphOf(t) {
  const root = workspace(t).root;
  makeTree(root, {
    '.devocd/PROJECT.md': '# Project\nOverview of the system.\n',
    '.devocd/code/dispatcher.md': '# Dispatcher\nRoutes messages.\nEND events are ignored by the dispatcher.\nOther notes.\n',
    '.devocd/guides/billing.md': '# Billing guide\nTo add a new charge type, extend ChargeKind.\n',
    '.devocd/guides/retry.md': '# Retries\nretry logic for payments\n',
    '.devocd/guides/invoice.md': '# Notes\nEach invoice has a total.\nSee createInvoice for details.\n',
    '.devocd/guides/rapid.md': '# Speed\nRapid prototyping notes.\n',
    '.devocd/TOOLS.md': '# Tools\nEND events are ignored by the dispatcher.\n',
  });
  return buildKnowledge(root);
}
const ids = (g, q) => searchKnowledge(g, q).map(r => r.id);

test('stop words and stemming: natural question finds the dispatcher page first', t => {
  const g = graphOf(t);
  assert.equal(ids(g, 'why are END events ignored')[0], 'code/dispatcher.md');
});

test('natural wording finds the billing page first', t => {
  assert.equal(ids(graphOf(t), 'how do I add a charge type')[0], 'guides/billing.md');
});

test('plural and tense variants meet', t => {
  const g = graphOf(t);
  assert.ok(ids(g, 'payment retries').includes('guides/retry.md'));
  assert.ok(ids(g, 'invoices').includes('guides/invoice.md'));
});

test('four-letter -e words meet their -ed/-ing forms', () => {
  const mk = (id, text) => ({ id, title: id, text, kind: 'page', headings: [], summary: '', meta: {} });
  const nodes = [mk('a.md', 'Moving a folder can lose saved state.'), mk('b.md', 'unrelated')];
  assert.deepEqual(rankPages(nodes, [], 'move save').map(r => r.id), ['a.md']);
  assert.deepEqual(rankPages([mk('r.md', 'it retried twice')], [], 'retry').map(r => r.id), ['r.md']);
});

test('a term is a whole token, not a substring', t => {
  assert.ok(!ids(graphOf(t), 'api').includes('guides/rapid.md'));
});

test('identifiers split into parts and keep the whole', t => {
  const g = graphOf(t);
  assert.ok(ids(g, 'createInvoice()').includes('guides/invoice.md'));
  assert.ok(ids(g, 'create invoice').includes('guides/invoice.md'));
});

test('generated pages rank below the module page', t => {
  const g = graphOf(t);
  const r = ids(g, 'END events ignored dispatcher');
  assert.ok(r.indexOf('code/dispatcher.md') < r.indexOf('TOOLS.md'));
});

test('snippet is the best line; line is 1-based', t => {
  const hit = searchKnowledge(graphOf(t), 'END events ignored')[0];
  assert.equal(hit.line, 3);
  assert.equal(hit.snippet, 'END events are ignored by the dispatcher.');
  assert.equal(typeof hit.score, 'number');
});

test('empty and stop-word-only queries', t => {
  const g = graphOf(t);
  assert.deepEqual(searchKnowledge(g, ''), []);
  assert.deepEqual(searchKnowledge(g, '   '), []);
  assert.deepEqual(searchKnowledge(g, '?!'), []);
  assert.ok(searchKnowledge(g, 'the').length >= 0);
  const nodes = [{ id: 'a.md', title: 'A', text: 'the one', kind: 'page', headings: [], summary: '', meta: { scope: [], standards: [], uses: [] } }];
  assert.equal(rankPages(nodes, [], 'the').length, 1);
});

test('never throws on odd input and honours limit', () => {
  assert.deepEqual(rankPages([], [], 'x'), []);
  assert.deepEqual(rankPages(undefined, undefined, undefined), []);
  assert.deepEqual(rankPages([{ id: 'a' }], null, 'a'), rankPages([{ id: 'a' }], [], 'a'));
  const g = [1, 2, 3].map(n => ({ id: `p${n}.md`, title: 'Same', text: 'same', kind: 'page', headings: [], summary: '', meta: {} }));
  assert.equal(rankPages(g, [], 'same', { limit: 2 }).length, 2);
  assert.deepEqual(rankPages(g, [], 'same').map(r => r.id), ['p1.md', 'p2.md', 'p3.md']);
});

test('neighbour boost raises a page linked to a strong match', () => {
  const mk = (id, text) => ({ id, title: id, text, kind: 'page', headings: [], summary: '', meta: {} });
  const nodes = [mk('a.md', 'zebra'), mk('b.md', 'zebra'), mk('c.md', 'other')];
  const edges = [{ source: 'b.md', target: 'a.md', type: 'links' }];
  const plain = rankPages(nodes, [], 'zebra');
  const boosted = rankPages(nodes, edges, 'zebra');
  assert.equal(plain.find(r => r.id === 'b.md').score < boosted.find(r => r.id === 'b.md').score, true);
});

test('route results carry a snippet', t => {
  const r = routeKnowledge(graphOf(t), 'billing charge type');
  assert.equal(typeof r.results[0].snippet, 'string');
});

test('viewer embeds the shared ranker and stays offline', t => {
  const html = renderKnowledge(graphOf(t));
  assert.ok(html.includes('rankPages'));
  assert.ok(html.includes(rankPages.toString().slice(0, 40)));
  assert.doesNotMatch(html, /https?:\/\/(?!www\.w3\.org\/2000\/svg)/);
});

test('coverage is the share of query terms a page matches', () => {
  const nodes = [{ id: 'a.md', title: 'Alpha', text: 'alpha only here', kind: 'guide' }];
  assert.equal(rankPages(nodes, [], 'alpha beta gamma')[0].coverage, 0.33);
  assert.equal(rankPages(nodes, [], 'alpha')[0].coverage, 1);
});

test('route results carry coverage and still carry snippets for the visible window', t => {
  const g = graphOf(t);
  const first = routeKnowledge(g, 'END events dispatcher').results;
  assert.ok(first.length > 0);
  for (const r of first) { assert.equal(typeof r.coverage, 'number'); assert.ok(r.snippet.length > 0 && r.line >= 1); }
});

test('snippets option limits snippet work to the first N results without changing order or scores', () => {
  const nodes = ['a', 'b', 'c'].map((x, i) => ({ id: `${x}.md`, title: x, text: `x\nalpha ${'z '.repeat(i)}`, kind: 'guide' }));
  const all = rankPages(nodes, [], 'alpha');
  const some = rankPages(nodes, [], 'alpha', { snippets: 1 });
  assert.deepEqual(some.map(r => [r.id, r.score]), all.map(r => [r.id, r.score]));
  assert.ok(some[0].snippet.length > 0);
  assert.equal(some[2].snippet, '');
  assert.equal(some[2].line, null);
});
