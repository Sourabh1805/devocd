// @ts-check
// PROJECT.md lives in P/.devocd/, so its relative links resolve from that folder, one level
// below the project root that preflight's company.rel is measured from. The template must say
// so, and the corrected form must pass checkTree inside a company (no ref/broken, no ref/escape).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTree } from '../helpers/tree.mjs';
import { checkTree } from '../../plugin/scripts/lib/check.mjs';

const template = () => readFileSync(fileURLToPath(new URL('../../plugin/skills/add-project/references/project-template.md', import.meta.url)), 'utf8');

test('the template computes company links from .devocd, not from the project root', () => {
  const t = template();
  assert.ok(t.includes('../<company.rel>/CLAUDE.md'), 'company parent link example carries the extra ../ for .devocd');
  assert.ok(t.includes('../<company.rel>/.devocd/standards/index.md'), 'standards index link too');
  assert.doesNotMatch(t, /\]\(<company\.rel>\//, 'no link resolves company.rel straight from .devocd');
});

test('the corrected link form passes checkTree inside a company; the uncorrected form is broken', t => {
  const root = mkdtempSync(join(tmpdir(), 'devocd-links-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  // companyRel for api/ is '..': from api/.devocd/PROJECT.md the company parent is ../../CLAUDE.md.
  makeTree(root, {
    'CLAUDE.md': '<!-- devocd:begin -->\n# Co\n<!-- devocd:end -->\n',
    '.devocd/state.json': JSON.stringify({ version: 1, kind: 'company', name: 'Co', description: '', parentFile: 'CLAUDE.md', keyRules: [], projects: [{ id: 'api', path: 'api', description: 'x' }], sources: [] }),
    '.devocd/standards/index.md': '# Standards\n',
    'api/.devocd/state.json': JSON.stringify({ version: 1, kind: 'project', id: 'api', companyRel: '..', teamFiles: [], approvedCommands: [], sources: [] }),
    'api/.devocd/PROJECT.md': '# api\n\n## Links\n- [Company rules](../../CLAUDE.md) and [standards index](../../.devocd/standards/index.md)\n',
    'api/.devocd/pointer.md': 'Start with PROJECT.md',
    'api/CLAUDE.local.md': '<!-- devocd:begin -->\nStart with PROJECT.md\n<!-- devocd:end -->\n',
  });
  const good = checkTree(join(root, 'api')).issues.filter(i => i.rule.startsWith('ref/'));
  assert.deepEqual(good, [], JSON.stringify(good));
  // The off-by-one form (company.rel used directly from .devocd) points at the project's own folder.
  makeTree(root, { 'api/.devocd/PROJECT.md': '# api\n\n## Links\n- [Company rules](../CLAUDE.md)\n' });
  const bad = checkTree(join(root, 'api')).issues.filter(i => i.rule === 'ref/broken');
  assert.ok(bad.length > 0, 'the uncorrected form is a broken link in a plain project');
});
