// @ts-check
// Layered redundancy: a fact stated in one layer is not restated in another layer loaded with it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findRepeats, memoryDirFor } from '../../plugin/scripts/lib/redundancy.mjs';
import { checkTree } from '../../plugin/scripts/lib/check.mjs';
import { makeTree } from '../helpers/tree.mjs';

const FACT = 'Invoices are always stored in integer cents and rounded half-even before totals are shown.';
const POLICY = 'Every pull request needs one approving review from the owning team before it is merged.';

/** @param {string} file @param {string} text @param {Partial<import('../../plugin/scripts/lib/redundancy.mjs').Layer>} [extra] */
const layer = (file, text, extra = {}) => ({ file, text, rank: 5, load: /** @type {const} */ ('demand'), readOnly: false, ...extra });

test('exact repeats across layers are found, once, with lines, and the general layer keeps a policy', () => {
  const r = findRepeats([
    layer('CLAUDE.md', `# Company\n\n- ${POLICY}\n`, { rank: 1, load: 'always' }),
    layer('.devocd/PROJECT.md', `# shop\n\nIntro line.\n\n- ${POLICY}\n`, { rank: 4 }),
  ]);
  assert.equal(r.length, 1);
  assert.deepEqual({ file: r[0].file, line: r[0].line, keep: r[0].keep, keepLine: r[0].keepLine, match: r[0].match },
    { file: '.devocd/PROJECT.md', line: 5, keep: 'CLAUDE.md', keepLine: 3, match: 'exact' });
  assert.ok(r[0].tokensPerSession > 0);
});

test('a code fact (it cites a source path) stays in the more specific page', () => {
  const fact = `${FACT} See \`src/billing/invoice.ts\`.`;
  const r = findRepeats([
    layer('.devocd/PROJECT.md', `# shop\n\n${fact}\n`, { rank: 4 }),
    layer('.devocd/code/billing/index.md', `# billing\n\n- ${fact}\n`, { rank: 7 }),
  ]);
  assert.equal(r.length, 1);
  assert.equal(r[0].keep, '.devocd/code/billing/index.md');
  assert.equal(r[0].file, '.devocd/PROJECT.md');
});

test('near duplicates (small wording changes) match; different facts and short lines do not', () => {
  const near = 'Invoices are always stored in integer cents and are rounded half-even before the totals are shown.';
  const r = findRepeats([
    layer('a.md', `- ${FACT}\n- Payments retry three times with exponential backoff before the order is cancelled.\n- Use npm test.\n`, { rank: 6 }),
    layer('b.md', `${near}\n\nRefunds are issued to the original card within five business days of approval.\n- Use npm test.\n`, { rank: 7 }),
  ]);
  assert.deepEqual(r.map(x => [x.file, x.match]), [['b.md', 'near']]);
});

test('normalization ignores case, markdown and punctuation', () => {
  const r = findRepeats([
    layer('a.md', `**Every** pull request needs ONE approving review, from the owning team, before it is merged!\n`, { rank: 1 }),
    layer('b.md', `- ${POLICY}\n`, { rank: 4 }),
  ]);
  assert.equal(r.length, 1);
  assert.equal(r[0].match, 'exact');
});

test('code blocks, headings, header key lines and evidence lists are not compared', () => {
  const code = 'const total = lines.reduce((sum, line) => sum + line.cents * line.quantity, 0);';
  const r = findRepeats([
    layer('a.md', `# Billing totals and invoices for every customer account in the system\n\n\`\`\`js\n${code}\n\`\`\`\nScope: src/billing/** src/invoices/** src/payments/** src/refunds/**\n\n## Evidence\n- src/billing/invoice.ts sha256:${'a'.repeat(64)} 2026-01-01 extra words here to pass eight\n`),
    layer('b.md', `# Billing totals and invoices for every customer account in the system\n\n\`\`\`js\n${code}\n\`\`\`\nScope: src/billing/** src/invoices/** src/payments/** src/refunds/**\n\n## Evidence\n- src/billing/invoice.ts sha256:${'a'.repeat(64)} 2026-01-01 extra words here to pass eight\n`),
  ]);
  assert.deepEqual(r, []);
});

test('read-only layers (team files, memory) always keep; two read-only layers repeating is information only', () => {
  const r = findRepeats([
    layer('CLAUDE.md', `- ${POLICY}\n`, { rank: 0, load: 'always', readOnly: true }),
    layer('~memory/feedback.md', `${POLICY}\n`, { rank: 0, load: 'demand', readOnly: true }),
    layer('.devocd/PROJECT.md', `- ${POLICY}\n`, { rank: 4 }),
  ]);
  const dev = r.find(x => x.file === '.devocd/PROJECT.md');
  assert.ok(dev && dev.keep === 'CLAUDE.md', JSON.stringify(r));
  assert.equal(dev.severity, 'warning');
  const ro = r.find(x => x.file === '~memory/feedback.md');
  assert.ok(ro && ro.severity === 'information', JSON.stringify(r));
});

test('a sentence repeated inside one file is reported against its first line', () => {
  const r = findRepeats([layer('a.md', `- ${FACT}\n\nOther text that is long enough to count as a unit here.\n\n- ${FACT}\n`)]);
  assert.deepEqual(r.map(x => [x.file, x.line, x.keep, x.keepLine]), [['a.md', 5, 'a.md', 1]]);
});

test('waste is weighted by how often the repeating file loads', () => {
  const base = [layer('CLAUDE.md', `- ${POLICY}\n`, { rank: 1, load: 'always' })];
  const always = findRepeats([...base, layer('p.md', `- ${POLICY}\n`, { rank: 3, load: 'always' })])[0];
  const demand = findRepeats([...base, layer('p.md', `- ${POLICY}\n`, { rank: 3, load: 'demand' })])[0];
  assert.ok(always.tokensPerSession > demand.tokensPerSession, `${always.tokensPerSession} > ${demand.tokensPerSession}`);
});

test('memoryDirFor follows Claude Code folder naming and CLAUDE_CONFIG_DIR', () => {
  assert.equal(memoryDirFor('d:\\work\\DevOCD', { home: '/h' }).replace(/\\/g, '/'), '/h/.claude/projects/d--work-DevOCD/memory');
  assert.equal(memoryDirFor('/srv/my.app', { home: '/h', configDir: '/cfg' }).replace(/\\/g, '/'), '/cfg/projects/-srv-my-app/memory');
});

test('check: layers across company parent, standards, pointer, pages, team file and memory; no prose echoed', t => {
  const root = mkdtempSync(join(tmpdir(), 'devocd-redund-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const mem = join(root, 'mem');
  makeTree(root, {
    'co/.devocd/state.json': JSON.stringify({ version: 1, kind: 'company', name: 'Co', description: '', parentFile: 'CLAUDE.md', keyRules: [], projects: [{ id: 'shop', path: 'shop', description: 'Shop' }], sources: [] }),
    'co/CLAUDE.md': `<!-- devocd:begin -->\n# Co\n\n- ${POLICY}\n<!-- devocd:end -->\n`,
    'co/.devocd/standards/review.md': `# Review\n\nReviews look at tests, naming and the change size of every pull request.\n`,
    'co/shop/.devocd/state.json': JSON.stringify({ version: 1, kind: 'project', id: 'shop', companyRel: '..', teamFiles: [], approvedCommands: [], sources: [] }),
    'co/shop/CLAUDE.md': `# Team\n\n- Run the linter before pushing any branch to the shared remote repository.\n`,
    'co/shop/CLAUDE.local.md': `<!-- devocd:begin -->\n# shop\n\n- ${POLICY}\n<!-- devocd:end -->\n`,
    'co/shop/.devocd/pointer.md': `# shop\n\n- ${POLICY}\n`,
    'co/shop/.devocd/PROJECT.md': `# shop\n\nShop.\n\n- Run the linter before pushing any branch to the shared remote repository.\n- Reviews look at tests, naming and the change size of every pull request.\n`,
    'co/shop/.devocd/code/billing/index.md': `# billing\n\nParent: [PROJECT](../../PROJECT.md)\n\n- ${FACT}\n`,
    'co/shop/.devocd/decisions.md': `# Decisions\n\n${FACT}\n`,
    'co/shop/.devocd/draft/PROJECT.md': `# draft\n\n- ${FACT}\n`,
    'mem/MEMORY.md': '- [Pref](pref.md) — likes short answers\n',
    'mem/pref.md': `---\nname: pref\ndescription: x\nmetadata:\n  type: feedback\n---\n\n${FACT}\n`,
  });
  const issues = checkTree(join(root, 'co', 'shop'), { memoryDir: mem }).issues.filter(i => i.rule === 'context/repeated');
  const where = issues.map(i => `${i.file}<-${i.message}`);
  const has = (/** @type {string} */ file, /** @type {RegExp} */ keep) => issues.some(i => i.file === file && keep.test(i.message));
  assert.ok(has('CLAUDE.local.md', /\.\.\/CLAUDE\.md/), `pointer block repeats the company parent: ${where.join(' | ')}`);
  assert.ok(has('.devocd/PROJECT.md', /^repeats CLAUDE\.md/), `PROJECT.md repeats the team CLAUDE.md: ${where.join(' | ')}`);
  assert.ok(has('.devocd/PROJECT.md', /standards\/review\.md/), `PROJECT.md repeats a standard: ${where.join(' | ')}`);
  assert.ok(issues.some(i => /memory\/pref\.md/.test(`${i.file} ${i.message}`)), `memory compared: ${where.join(' | ')}`);
  assert.ok(!issues.some(i => i.file.includes('draft/')), 'drafts are not live knowledge');
  assert.ok(!issues.some(i => i.file === '.devocd/pointer.md'), 'the pointer source and its block are one layer');
  for (const i of issues) assert.match(i.message, /tokens? per session/);
  const out = JSON.stringify(issues);
  for (const prose of ['Invoices are always', 'approving review', 'Run the linter']) assert.ok(!out.includes(prose), prose);
  assert.equal(checkTree(join(root, 'co', 'shop'), { memoryDir: mem }).issues.filter(i => i.rule === 'context/duplicate').length, 0, 'replaced');
});

test('a shared memory fact (project/reference) yields to .devocd, even when it cites a path, as information', () => {
  const fact = `${FACT} See \`src/billing/invoice.ts\`.`;
  const r = findRepeats([
    layer('~memory/billing.md', `${fact}\n`, { rank: 0, readOnly: true, yields: true }),
    layer('.devocd/decisions.md', `- ${fact}\n`, { rank: 5 }),
  ]);
  assert.equal(r.length, 1, JSON.stringify(r));
  assert.deepEqual([r[0].file, r[0].keep, r[0].severity], ['~memory/billing.md', '.devocd/decisions.md', 'information']);
});

test('check: a project-type memory fact repeated in .devocd points at the memory file, a feedback one does not', t => {
  const root = mkdtempSync(join(tmpdir(), 'devocd-redund-mem-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  makeTree(root, {
    'p/.devocd/state.json': JSON.stringify({ version: 1, kind: 'company', name: 'Co', description: '', parentFile: 'CLAUDE.md', keyRules: [], projects: [], sources: [] }),
    'p/.devocd/decisions.md': `# Decisions\n\n- ${FACT}\n- ${POLICY}\n`,
    'mem/shared.md': `---\nname: s\ndescription: x\nmetadata:\n  type: project\n---\n\n${FACT}\n`,
    'mem/mine.md': `---\nname: m\ndescription: x\ntype: feedback\n---\n\n${POLICY}\n`,
  });
  const issues = checkTree(join(root, 'p'), { memoryDir: join(root, 'mem') }).issues.filter(i => i.rule === 'context/repeated');
  assert.ok(issues.some(i => i.file === '~memory/shared.md' && i.severity === 'information' && /decisions\.md/.test(i.message)), JSON.stringify(issues));
  assert.ok(issues.some(i => i.file === '.devocd/decisions.md' && /memory\/mine\.md/.test(i.message)), JSON.stringify(issues));
});
