// @ts-check
// Layered redundancy: a fact stated in one layer is not restated in another layer loaded with it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findRepeats, memoryDirFor } from '../../scripts/lib/redundancy.mjs';
import { checkTree } from '../../scripts/lib/check.mjs';
import { makeTree } from '../helpers/tree.mjs';

const FACT = 'Invoices are always stored in integer cents and rounded half-even before totals are shown.';
const POLICY = 'Every pull request needs one approving review from the owning team before it is merged.';

/** @param {string} file @param {string} text @param {Partial<import('../../scripts/lib/redundancy.mjs').Layer>} [extra] */
const layer = (file, text, extra = {}) => ({ file, text, rank: 5, load: /** @type {const} */ ('demand'), readOnly: false, ...extra });

test('three cited copies each point to the surviving deepest page', () => {
  const text = `${FACT} See \`src/billing/invoice.ts\`.`;
  const r = findRepeats([layer('project.md', text, { rank: 4 }), layer('module.md', text, { rank: 7 }), layer('leaf.md', text, { rank: 8 })]);
  assert.deepEqual(r.map(x => [x.file, x.keep]), [['module.md', 'leaf.md'], ['project.md', 'leaf.md']]);
});

test('opposite rules are excluded when negation changes scope', () => {
  const r = findRepeats([layer('a.md', POLICY), layer('b.md', POLICY.replace('needs', 'does not need'))]);
  assert.deepEqual(r, []);
});

test('soft-wrapped sentences and bullets match and preserve starting line numbers', () => {
  for (const prefix of ['', '- ']) {
    const wrapped = POLICY.replace('one approving', 'one\n  approving').replace('owning team', 'owning\n  team');
    const r = findRepeats([layer('a.md', POLICY), layer('b.md', `# Title\n\n${prefix}${wrapped}`)]);
    assert.equal(r.length, 1);
    assert.deepEqual([r[0].file, r[0].line, r[0].match], ['b.md', 3, 'exact']);
  }
});

test('evidence subheadings and closing heading markers stay excluded', () => {
  const text = `## Evidence ##\n### Files\n- ${POLICY}\n## Behavior\n${FACT}`;
  const r = findRepeats([layer('a.md', text), layer('b.md', text)]);
  assert.equal(r.length, 1);
  assert.equal(r[0].line, 5);
});

test('check protects company team text but permits managed parent cleanup', t => {
  const root = mkdtempSync(join(tmpdir(), 'devocd-redund-parent-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const cited = `${FACT} See \`src/billing/invoice.ts\`.`;
  makeTree(root, {
    '.devocd/state.json': JSON.stringify({ version: 1, kind: 'company', name: 'Co', description: '', parentFile: 'CLAUDE.md', keyRules: [], projects: [], sources: [] }),
    'CLAUDE.md': `${POLICY}\n<!-- devocd:begin -->\n${cited}\n<!-- devocd:end -->`,
    '.devocd/code/billing/index.md': `${POLICY}\n\n${cited}`,
    'shop/.devocd/state.json': JSON.stringify({ version: 1, kind: 'project', id: 'shop', companyRel: '..', teamFiles: [], approvedCommands: [], sources: [] }),
    'shop/CLAUDE.md': POLICY,
    'shop/.devocd/code/billing/index.md': cited,
  });
  const company = checkTree(root, { memoryDir: join(root, 'no-memory') }).issues.filter(i => i.rule === 'context/repeated');
  assert.ok(company.some(i => i.file === 'CLAUDE.md' && i.line === 3 && i.severity === 'warning'));
  assert.ok(!company.some(i => i.file === 'CLAUDE.md' && i.line === 1));
  const project = checkTree(join(root, 'shop'), { memoryDir: join(root, 'no-memory') }).issues.filter(i => i.rule === 'context/repeated');
  assert.ok(project.some(i => i.file === '../CLAUDE.md' && i.line === 1 && i.severity === 'information'));
  assert.ok(project.some(i => i.file === '../CLAUDE.md' && i.line === 3 && i.severity === 'warning'));
});

test('exact repeats across layers are found, once, with lines, and the general layer keeps a policy', () => {
  const r = findRepeats([
    layer('CLAUDE.md', `# Company\n\n- ${POLICY}\n`, { rank: 1, load: 'always' }),
    layer('.devocd/PROJECT.md', `# shop\n\nIntro line.\n\n- ${POLICY}\n`, { rank: 4 }),
  ]);
  assert.equal(r.length, 1);
  assert.deepEqual({ file: r[0].file, line: r[0].line, keep: r[0].keep, keepLine: r[0].keepLine, match: r[0].match },
    { file: '.devocd/PROJECT.md', line: 5, keep: 'CLAUDE.md', keepLine: 3, match: 'exact' });
  assert.ok(r[0].estimatedWeight > 0);
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
  assert.ok(always.estimatedWeight > demand.estimatedWeight, `${always.estimatedWeight} > ${demand.estimatedWeight}`);
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
  for (const i of issues) {
    assert.match(i.message, /^repeats .+:\d+ \((exact|near), estimated weight \d+\)$/);
    assert.ok(!i.message.includes('tokens per session'));
    assert.equal(i.hint, 'State each fact once, in its home layer, and link or cite it elsewhere. The weight is a rough estimate, not measured savings.');
  }
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

test('near matches reject differences in environment, strength, region and version scope', () => {
  const sentence = 'Production deployments require approval from the release manager before rollout.';
  for (const [a, b] of [
    [sentence, sentence.replace('Production', 'Development')],
    [sentence.replace('require', 'must require'), sentence.replace('require', 'should require')],
    [sentence.replace('rollout', 'rollout in us-east-1'), sentence.replace('rollout', 'rollout in eu-west-1')],
    [sentence.replace('rollout', 'rollout of v2'), sentence.replace('rollout', 'rollout of v3')],
    [sentence.replace('rollout', 'rollout of 1.2.3'), sentence.replace('rollout', 'rollout of 1.3.2')],
  ]) assert.deepEqual(findRepeats([layer('a.md', a), layer('b.md', b)]), [], `${a} vs ${b}`);
});

test('adding or removing any scope word blocks near matches in either order', () => {
  for (const scope of ['prod', 'production', 'staging', 'stage', 'dev', 'development', 'qa', 'test', 'sandbox', 'local',
    'must', 'should', 'may', 'never', 'always', 'not', 'no', 'us-gov-west-1', 'ap-southeast-2', 'v2', '1.2.3']) {
    const changed = POLICY.replace('needs', `${scope} needs`);
    for (const pair of [[POLICY, changed], [changed, POLICY]]) {
      assert.deepEqual(findRepeats(pair.map((text, i) => layer(`${i}.md`, text))), [], scope);
    }
  }
});

test('stemming cannot collapse distinct scope tokens, including test, tests and testing', () => {
  for (const [a, b] of [['test', 'tests'], ['test', 'testing'], ['tests', 'testing'], ['staging', 'stag'], ['always', 'alway'], ['prod', 'production']]) {
    const text = (/** @type {string} */ word) => `The ${word} deployments require approval from the release manager before rollout.`;
    assert.deepEqual(findRepeats([layer('a.md', text(a)), layer('b.md', text(b))]), [], `${a} vs ${b}`);
  }
});

test('two-word insertion without changed scope stays near, with rounded similarity and severity', () => {
  const r = findRepeats([layer('a.md', POLICY), layer('b.md', POLICY.replace('review', 'careful independent review'))]);
  assert.equal(r.length, 1);
  assert.equal(r[0].match, 'near');
  assert.equal(r[0].similarity, 0.88); // 15 shared / 17 distinct words
  assert.equal(r[0].severity, 'information');
  assert.ok(r[0].similarity >= 0.8 && r[0].similarity < 1);
});

test('strong near matches warn, while exact repeats retain read-only severity', () => {
  const near = findRepeats([layer('a.md', POLICY), layer('b.md', POLICY.replace('review', 'careful review'))])[0];
  assert.equal(near.match, 'near');
  assert.equal(near.similarity, 0.94);
  assert.equal(near.severity, 'warning');
  for (const readOnly of [false, true]) {
    const r = findRepeats([layer('a.md', POLICY, { readOnly }), layer('b.md', POLICY, { readOnly })]);
    assert.equal(r[0].similarity, 1);
    assert.equal(r[0].match, 'exact');
    assert.equal(r[0].severity, readOnly ? 'information' : 'warning');
    assert.ok(!('tokensPerSession' in r[0]));
  }
});

test('scope normalization preserves case-insensitive exact matches and filters only conflicting candidates', () => {
  const text = 'Production deployments must require approval from the release manager in us-east-1 for v2.';
  const exact = findRepeats([layer('a.md', text), layer('b.md', text.toUpperCase())])[0];
  assert.equal(exact.match, 'exact');
  assert.equal(exact.similarity, 1);
  const repeats = findRepeats([
    layer('a.md', text.replace('Production', 'Development')),
    layer('b.md', text),
    layer('c.md', text.replace('approval', 'explicit approval')),
  ]);
  assert.equal(repeats.length, 1);
  assert.equal(repeats[0].keep, 'b.md');
  assert.equal(repeats[0].file, 'c.md');
});

test('severity uses the raw Jaccard threshold before rounding similarity for output', () => {
  const nine = 'alpha beta gamma delta epsilon zeta eta theta iota';
  const boundary = findRepeats([layer('a.md', nine), layer('b.md', `${nine} kappa`)])[0];
  assert.equal(boundary.similarity, 0.9);
  assert.equal(boundary.severity, 'warning');
  const words = Array.from({ length: 26 }, (_, i) => `item${String.fromCharCode(97 + i)}`).join(' ');
  const rounded = findRepeats([layer('a.md', words), layer('b.md', `${words} extra unique wording`)])[0];
  assert.equal(rounded.similarity, 0.9); // 26/29 is below 0.9 before rounding.
  assert.equal(rounded.severity, 'information');
  const readOnly = findRepeats([layer('a.md', nine, { readOnly: true }), layer('b.md', `${nine} kappa`, { readOnly: true })])[0];
  assert.equal(readOnly.severity, 'information');
});

test('estimated weight retains the fixed load-weight calculation for all load modes', () => {
  const tokens = Math.ceil(POLICY.length / 4);
  /** @type {[import('../../scripts/lib/redundancy.mjs').Layer['load'], number][]} */
  const modes = [['always', 1], ['touch', 0.5], ['demand', 0.25]];
  for (const [load, weight] of modes) {
    const repeat = findRepeats([layer('a.md', POLICY, { rank: 1 }), layer('b.md', POLICY, { load, rank: 2 })])[0];
    assert.equal(repeat.estimatedWeight, Math.max(1, Math.round(tokens * weight)));
  }
});

test('check formats near matches with estimated weight and never echoes their prose', t => {
  const root = mkdtempSync(join(tmpdir(), 'devocd-redund-near-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  makeTree(root, {
    '.devocd/state.json': JSON.stringify({ version: 1, kind: 'company', name: 'Co', description: '', parentFile: 'CLAUDE.md', keyRules: [], projects: [], sources: [] }),
    'CLAUDE.md': POLICY,
    '.devocd/decisions.md': POLICY.replace('review', 'careful independent review'),
  });
  const issues = checkTree(root, { memoryDir: join(root, 'no-memory') }).issues.filter(i => i.rule === 'context/repeated');
  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /^repeats CLAUDE\.md:1 \(near, estimated weight \d+\)$/);
  assert.equal(issues[0].severity, 'information');
  assert.ok(!JSON.stringify(issues).includes('approving review'));
  assert.ok(!JSON.stringify(issues).includes('tokens per session'));
});
