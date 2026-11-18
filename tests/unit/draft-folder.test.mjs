// @ts-check
// A rejected or interrupted run can leave .devocd/draft/ behind. Draft files are written for
// their FINAL location, so scanned in place their links resolve one level deep and fail. The
// checker and the graph must treat draft/ like .backups: invisible until applied.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeTree } from '../helpers/tree.mjs';
import { checkTree } from '../../scripts/lib/check.mjs';
import { buildKnowledge } from '../../scripts/lib/knowledge.mjs';

function fixture(/** @type {import('node:test').TestContext} */ t) {
  const root = mkdtempSync(join(tmpdir(), 'devocd-draft-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return makeTree(root, {
    '.devocd/state.json': JSON.stringify({ version: 1, kind: 'project', id: 'api', companyRel: '..', teamFiles: [], approvedCommands: [], sources: [] }),
    '.devocd/PROJECT.md': '# api\n',
    '.devocd/pointer.md': 'Start with PROJECT.md',
    'CLAUDE.local.md': '<!-- devocd:begin -->\nStart with PROJECT.md\n<!-- devocd:end -->\n',
    '.devocd/draft/PROJECT.md': '# api draft\n\n[broken when scanned in place](../code/missing.md)\n',
    '.devocd/draft/code/billing/index.md': '# billing draft\n',
  });
}

test('checkTree ignores .devocd/draft so a leftover draft never fails checks or refresh', t => {
  const root = fixture(t);
  const issues = checkTree(root).issues;
  assert.deepEqual(issues.filter(i => i.file?.includes('draft')), [], JSON.stringify(issues, null, 2));
});

test('buildKnowledge leaves draft pages out of the graph', t => {
  const root = fixture(t);
  const graph = buildKnowledge(root);
  assert.ok(!graph.nodes.some((/** @type {any} */ n) => String(n.id ?? n.path ?? '').includes('draft')), JSON.stringify(graph.nodes?.map((/** @type {any} */ n) => n.id ?? n.path)));
});
