import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { routeKnowledge } from '../../plugin/scripts/lib/knowledge.mjs';
import { checkTree } from '../../plugin/scripts/lib/check.mjs';
import { estimateTokens } from '../../plugin/scripts/lib/tokens.mjs';
import { makeTree } from '../helpers/tree.mjs';

test('routing is paginated and omits large page bodies while retaining file locations', () => {
  const graph = { version: 2, nodes: Array.from({ length: 12 }, (_, i) => ({ id: `code/${i}.md`, title: 'Billing', text: '# Billing\n' + 'DETAIL '.repeat(2000), sha256: '' })), edges: [] };
  const first = routeKnowledge(graph, 'billing');
  assert.equal(first.results.length, 5);
  assert.equal(first.totalMatches, 12);
  assert.equal(first.nextOffset, 5);
  assert.doesNotMatch(JSON.stringify(first), /DETAIL|sha256/);
  assert.ok(estimateTokens(JSON.stringify(first)) < 500);
  assert.equal(routeKnowledge(graph, 'billing', 10).results.length, 2);
  assert.equal(routeKnowledge(graph, 'billing', 10).nextOffset, null);
  assert.equal(routeKnowledge(graph, 'missing').results.length, 0);
  assert.throws(() => routeKnowledge(graph, 'billing', -1), { code: 'USAGE' });
});

test('context checks warn on large pages and duplicated prose, without echoing content', t => {
  const root = mkdtempSync(join(tmpdir(), 'devocd-context-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const paragraph = 'A detailed explanation of the billing boundary and its responsibilities. '.repeat(5);
  makeTree(root, {
    '.devocd/state.json': JSON.stringify({version:1,kind:'company',name:'Co',description:'',parentFile:'CLAUDE.md',keyRules:[],projects:[],sources:[]}),
    'CLAUDE.md': '<!-- devocd:begin -->\nCompany\n<!-- devocd:end -->',
    '.devocd/code/a.md': '# A\n\n' + paragraph,
    '.devocd/code/b.md': '# B\n\n' + paragraph,
    '.devocd/code/medium.md': '# Medium\n' + 'word '.repeat(560),
    '.devocd/code/large.md': '# Large\n' + 'word '.repeat(800)
  });
  const issues = checkTree(root).issues;
  assert.ok(issues.some(i => i.rule === 'context/repeated' && i.severity === 'warning'));
  assert.ok(issues.some(i => i.rule === 'context/over-target' && i.severity === 'warning' && i.file?.includes('large')));
  // Module pages are not loaded at launch; depth up to the raised target is free and draws no warning.
  assert.ok(!issues.some(i => i.rule === 'context/over-target' && i.file?.includes('medium')), JSON.stringify(issues.filter(i => i.rule === 'context/over-target')));
  assert.doesNotMatch(JSON.stringify(issues), /A detailed explanation/);
});
