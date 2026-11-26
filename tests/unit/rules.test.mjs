import { workspace, companyState as defaultCompanyState, projectState as defaultProjectState } from '../helpers/workspace.mjs';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, writeFileSync, readFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { makeTree } from '../helpers/tree.mjs';
import { git, makeRepo as createRepo, tryLink } from '../helpers/git.mjs';
const makeRepo = (sub = '') => createRepo(sub, workspace({ after }).root);
const tmp = (_prefix = 'devocd-') => workspace({ after }).root;
import { buildKnowledge, writeKnowledge } from '../../scripts/lib/knowledge.mjs';
import { composeNote, planRuleStubs, writeRuleStubs } from '../../scripts/lib/rules.mjs';
import { stateProblem } from '../../scripts/lib/check.mjs';
import { protectRepo } from '../../scripts/lib/protect.mjs';

const INVOICE = 'export const invoice = 1;\n';
const sha = (/** @type {string} */ s) => createHash('sha256').update(s).digest('hex');
const STATE = (extra = {}) => JSON.stringify(defaultProjectState({ id: 'p', ...extra }));
const BILLING = `# Billing\nParent: [Project](../../PROJECT.md)\nScope: src/billing/**\nStandards: coding, testing\n\nInvoices and payments.\n\n- Entry points: \`src/billing/invoice.ts:1\` (invoice)\n- Pitfalls: rounding in cents\n\n## Evidence\n- src/billing/invoice.ts sha256:${sha(INVOICE)} 2026-01-01\n`;
const MARKER = 'DevOCD module note, generated from .devocd/code/billing/index.md by devocd. Do not edit; it is regenerated.';

function project(t, extra = {}, dir = undefined) {
  const root = dir ?? workspace(t).root;
  if (dir) t.after(() => rmSync(dir, { recursive: true, force: true }));
  return makeTree(root, {
    'src/billing/invoice.ts': INVOICE,
    '.devocd/state.json': STATE(),
    '.devocd/PROJECT.md': '# Project\nSummary\n',
    '.devocd/code/billing/index.md': BILLING,
    '.devocd/flows/pay.md': '# Pay\nScope: src/{pay,checkout}/**\n\nSettlement flow.\n',
    '.devocd/code/noscope.md': '# Nothing\nNo scope here\n',
    '.devocd/standards/coding.md': '# Coding\nrules\n',
    '.devocd/decisions.md': '# Decisions\nLog\n',
    ...extra,
  });
}
const dirOf = (/** @type {string} */ root) => join(root, '.claude', 'rules', 'devocd');

test('plans one stub per scoped module/flow with exact paths, frontmatter and ordered body', t => {
  const root = project(t);
  const plan = planRuleStubs(buildKnowledge(root));
  assert.deepEqual(plan.map(p => p.file).sort(), ['.claude/rules/devocd/code--billing.md', '.claude/rules/devocd/flows--pay.md']);
  const b = /** @type {any} */ (plan.find(p => p.file.endsWith('code--billing.md'))).content;
  assert.ok(b.startsWith('---\npaths:\n  - "src/billing/**"\n---\n\n'));
  const body = b.slice(b.indexOf('---\n\n') + 5).trimEnd().split('\n');
  assert.ok(body.length <= 12);
  assert.equal(body[0], MARKER);
  // T97: what matters while editing comes first; summary and navigation follow.
  assert.deepEqual(body.slice(1), [
    'Pitfalls: rounding in cents',
    'Entry points: `src/billing/invoice.ts:1` (invoice)',
    'Purpose: Invoices and payments.',
    'Policies: coding, testing — read them via .devocd/PROJECT.md Links before changing behaviour.',
    'Decisions: check .devocd/decisions.md before changing behaviour here.',
    'Full page: .devocd/code/billing/index.md; or run devocd trace . "<this file>" for parents, policies and freshness.',
  ]);
  const f = /** @type {any} */ (plan.find(p => p.file.endsWith('flows--pay.md'))).content;
  assert.ok(f.startsWith('---\npaths:\n  - "src/{pay,checkout}/**"\n---\n\n'));
});

test('stale freshness adds the note last; current does not; a rule line is never cut', t => {
  const longPitfall = `rounding in cents, and never delete the old parent before the new child is attached (${'x'.repeat(220)})`;
  const root = project(t, { '.devocd/code/billing/index.md': BILLING.replace('rounding in cents', longPitfall) });
  const g = buildKnowledge(root);
  const cur = planRuleStubs(g, { freshness: { 'code/billing/index.md': 'current' } })[0].content;
  assert.ok(!cur.includes('may be stale'));
  assert.ok(cur.split('\n').includes(`Pitfalls: ${longPitfall}`), 'the long pitfall is kept whole');
  const stale = /** @type {any} */ (planRuleStubs(g, { freshness: { 'code/billing/index.md': 'stale' } }).find(p => p.file.endsWith('code--billing.md')));
  assert.ok(stale.content.trimEnd().endsWith('Note: this page may be stale (its cited source changed); verify against source.'));
  assert.ok(stale.content.trimEnd().split('\n').length <= 5 + 12);
});

test('a long non-rule line is cut at a word boundary and ends with an ellipsis', t => {
  const many = Array.from({ length: 40 }, (_, i) => `topic-${i}`).join(', ');
  const root = project(t, { '.devocd/code/billing/index.md': BILLING.replace('Standards: coding, testing', `Standards: ${many}`) });
  const body = /** @type {any} */ (planRuleStubs(buildKnowledge(root)).find(p => p.file.endsWith('code--billing.md'))).content.split('\n');
  const policies = body.find(l => l.startsWith('Policies: '));
  assert.ok(policies.length <= 200, `${policies.length} characters`);
  assert.ok(policies.endsWith('\u2026'), 'ends with an ellipsis');
  assert.ok(!policies.endsWith(' \u2026'), 'the word boundary keeps no trailing space');
});

test('composeNote cuts 201 characters at a word boundary, keeps 199 and 200, and never cuts a rule', () => {
  const plain = (/** @type {number} */ n) => 'a'.repeat(n);
  assert.equal(composeNote('code/x/index.md', [plain(199)])[0], plain(199));
  assert.equal(composeNote('code/x/index.md', [plain(200)])[0], plain(200));
  const cut = composeNote('code/x/index.md', [plain(201)])[0];
  assert.equal(cut.length, 200);
  assert.ok(cut.endsWith('\u2026'));

  const sentence = `${'word '.repeat(60)}end`;
  const spaced = composeNote('code/x/index.md', [sentence])[0];
  assert.ok(spaced.length <= 200);
  assert.ok(spaced.endsWith('\u2026'));
  const cutIndex = sentence.slice(0, 199).lastIndexOf(' ');
  assert.equal(sentence[cutIndex], ' ', 'the cut sits on a word boundary');
  assert.equal(spaced, `${sentence.slice(0, cutIndex)}\u2026`);

  // A rule is never cut: by its wording, and by the page's Pitfalls block even without a keyword.
  const prohibition = `Never delete the old parent before the new child is attached ${'x'.repeat(300)}`;
  assert.equal(composeNote('code/x/index.md', [prohibition])[0], prohibition);
  const silentRule = 'x'.repeat(300);
  assert.equal(composeNote('code/x/index.md', [silentRule], new Set([silentRule]))[0], silentRule);
});

test('composeNote replaces dropped lines with their count and the page', () => {
  const lines = Array.from({ length: 13 }, (_, i) => `line ${i}`);
  const body = composeNote('code/x/index.md', lines);
  assert.equal(body.length, 12);
  assert.deepEqual(body.slice(-2), ['line 10', '(+2 more in code/x/index.md)']);
  assert.deepEqual(composeNote('code/x/index.md', lines.slice(0, 12)), lines.slice(0, 12));
});

test('names sanitise and collisions get a hash suffix', t => {
  const root = project(t, {
    '.devocd/code/A B.md': '# A\nScope: a/**\n\nx\n',
    '.devocd/code/a-b.md': '# A2\nScope: b/**\n\nx\n',
  });
  const files = planRuleStubs(buildKnowledge(root)).map(p => p.file);
  const h = sha('code/a-b.md').slice(0, 6), h2 = sha('code/A B.md').slice(0, 6);
  assert.ok(files.includes(`.claude/rules/devocd/code--a-b-${h}.md`) && files.includes(`.claude/rules/devocd/code--a-b-${h2}.md`), files.join());
});

test('quotes and backslashes in scope are escaped', t => {
  const root = project(t, { '.devocd/code/q.md': '# Q\nScope: src/a"b/**\n\nx\n' });
  const q = planRuleStubs(buildKnowledge(root)).find(p => p.file.endsWith('code--q.md'));
  assert.ok(/** @type {any} */ (q).content.includes('  - "src/a\\"b/**"'));
});

test('a stub whose content holds a secret is skipped', t => {
  const root = project(t, { '.devocd/code/billing/index.md': BILLING.replace('rounding in cents', 'key AKIAABCDEFGHIJKLMNOP') });
  const files = planRuleStubs(buildKnowledge(root)).map(p => p.file);
  assert.deepEqual(files, ['.claude/rules/devocd/flows--pay.md']);
});

test('writeKnowledge writes stubs, reports counts, and marks stale after the cited source changes', t => {
  const root = project(t);
  const r = writeKnowledge(root);
  assert.deepEqual(r.ruleStubs, { written: 2, removed: 0 });
  const p = join(dirOf(root), 'code--billing.md');
  assert.ok(!readFileSync(p, 'utf8').includes('may be stale'));
  writeFileSync(join(root, 'src/billing/invoice.ts'), 'changed\n');
  writeKnowledge(root);
  assert.match(readFileSync(p, 'utf8'), /may be stale/);
});

test('removes generated stubs that are no longer planned, never user files', t => {
  const root = project(t);
  writeKnowledge(root);
  writeFileSync(join(dirOf(root), 'mine.md'), '---\npaths:\n  - "x"\n---\n\nMy own rule\n');
  writeFileSync(join(dirOf(root), 'plain.md'), 'no frontmatter\n');
  rmSync(join(root, '.devocd/flows/pay.md'));
  const r = writeRuleStubs(root);
  assert.deepEqual(r, { written: 1, removed: 1 });
  assert.deepEqual(readdirSync(dirOf(root)).sort(), ['code--billing.md', 'mine.md', 'plain.md']);
});

test('ruleStubs:false writes nothing and removes existing generated stubs only', t => {
  const root = project(t);
  writeKnowledge(root);
  writeFileSync(join(dirOf(root), 'mine.md'), 'user\n');
  writeFileSync(join(root, '.devocd/state.json'), STATE({ ruleStubs: false }));
  const r = writeKnowledge(root);
  assert.deepEqual(r.ruleStubs, { written: 0, removed: 2 });
  assert.deepEqual(readdirSync(dirOf(root)), ['mine.md']);
});

test('refuses a symlinked .claude/rules and a non-directory .claude', t => {
  const root = project(t);
  mkdirSync(join(root, '.claude'));
  const outside = tmp('devocd-out-');
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  if (tryLink(outside, join(root, '.claude', 'rules'))) {
    assert.throws(() => writeRuleStubs(root), { code: 'BAD_TARGET' });
    assert.deepEqual(readdirSync(outside), []);
  }
  const base = tmp('devocd-r2-');
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const root2 = project(t, { '.claude': 'file' }, join(base, 'p'));
  assert.throws(() => writeRuleStubs(root2), { code: 'BAD_TARGET' });
});

test('refuses when a stub path is tracked by git', t => {
  const root = makeRepo();
  project(t, {}, root);
  protectRepo(root);
  makeTree(root, { '.claude/rules/devocd/code--billing.md': 'x\n' });
  git(root, 'add', '-f', '.claude/rules/devocd/code--billing.md');
  assert.throws(() => writeRuleStubs(root), { code: 'ALREADY_TRACKED' });
});

test('stubs in a git repo stay out of git status once protected', t => {
  const root = makeRepo();
  project(t, {}, root);
  protectRepo(root);
  writeKnowledge(root);
  assert.ok(existsSync(join(dirOf(root), 'code--billing.md')));
  assert.equal(git(root, 'status', '--porcelain').includes('.claude'), false);
});

test('company folders write no stubs and report none', t => {
  const root = makeTree(workspace(t).root, {
    '.devocd/state.json': JSON.stringify(defaultCompanyState({ name: 'C' })),
    '.devocd/code/m.md': '# M\nScope: src/**\n\nx\n',
  });
  const r = /** @type {any} */ (writeKnowledge(root));
  assert.equal(r.ruleStubs, undefined);
  assert.ok(!existsSync(join(root, '.claude')));
});

test('protect excludes the generated rules folder', t => {
  const root = makeRepo();
  project(t, {}, root);
  protectRepo(root);
  assert.match(readFileSync(join(root, '.git', 'info', 'exclude'), 'utf8'), /\*\*\/\.claude\/rules\/devocd\//);
});

test('state validation accepts a boolean ruleStubs and rejects other types', () => {
  const s = (/** @type {any} */ v) => stateProblem(JSON.parse(STATE({ ruleStubs: v })));
  assert.equal(s(true), null);
  assert.equal(s(false), null);
  assert.match(String(s('no')), /ruleStubs/);
  assert.match(String(s(0)), /ruleStubs/);
});

test('an older install whose exclude file predates rule notes stays git-clean after a rebuild', (t) => {
  const root = workspace(t).root;
  makeTree(root, {
    'src/billing/a.js': 'x',
    '.devocd/state.json': JSON.stringify(defaultProjectState({ id: 'p' })),
    '.devocd/PROJECT.md': '# p\n',
    '.devocd/code/billing/index.md': '# billing\n\nScope: src/billing/**\n\nBilling.\n',
  });
  assert.equal(spawnSync('git', ['-C', root, 'init', '-q']).status, 0);
  // The exclude list an install made before this change: no rule-notes entry.
  writeFileSync(join(root, '.git', 'info', 'exclude'), '.devocd/\nCLAUDE.local.md\n**/.claude/settings.local.json\n');
  writeKnowledge(root);
  const status = spawnSync('git', ['-C', root, 'status', '--short', '--untracked-files=all'], { encoding: 'utf8' }).stdout;
  assert.doesNotMatch(status, /\.claude\/rules/, status);
  assert.ok(existsSync(join(root, '.claude', 'rules', 'devocd', 'code--billing.md')));
});

// --- T97: notes lead with pitfalls and the test to run -------------------------

/** A page that carries every section a note can show. */
const FULL = `# Billing
Parent: [Project](../../PROJECT.md)
Scope: src/billing/**
Standards: coding, testing

Invoices and payments.

- Entry points: \`src/billing/invoice.ts:1\` (invoice)
- Tests: src/billing/invoice.test.ts
- Run/test this part: pnpm test
- Pitfalls: rounding in cents
  - money is stored as integer cents
  - a refund cannot exceed the captured amount
  - the ledger is append-only

## Evidence
- src/billing/invoice.ts sha256:${sha(INVOICE)} 2026-01-01
`;

/** The note body of the billing page, without frontmatter. */
function billingBody(/** @type {string} */ page) {
  const root = project({ after }, { '.devocd/code/billing/index.md': page });
  const b = /** @type {any} */ (planRuleStubs(buildKnowledge(root)).find(p => p.file.endsWith('code--billing.md'))).content;
  return b.slice(b.indexOf('---\n\n') + 5).trimEnd().split('\n');
}

test('a pitfalls bullet keeps up to two of its sub-bullets, so at most three pitfalls', () => {
  const body = billingBody(FULL);
  const start = body.indexOf('Pitfalls: rounding in cents');
  assert.ok(start > -1, body.join('\n'));
  assert.deepEqual(body.slice(start, start + 3), [
    'Pitfalls: rounding in cents',
    '  - money is stored as integer cents',
    '  - a refund cannot exceed the captured amount',
  ]);
  assert.ok(!body.some(l => l.includes('ledger is append-only')), 'the third sub-bullet is over the cap');
});

test('the note leads with pitfalls, the test and the run command, then the rest', () => {
  const body = billingBody(FULL);
  assert.equal(body[0], MARKER);
  assert.deepEqual(body.slice(1), [
    'Pitfalls: rounding in cents',
    '  - money is stored as integer cents',
    '  - a refund cannot exceed the captured amount',
    'Test: src/billing/invoice.test.ts',
    'Run: pnpm test',
    'Entry points: `src/billing/invoice.ts:1` (invoice)',
    'Purpose: Invoices and payments.',
    'Policies: coding, testing — read them via .devocd/PROJECT.md Links before changing behaviour.',
    'Decisions: check .devocd/decisions.md before changing behaviour here.',
    'Full page: .devocd/code/billing/index.md; or run devocd trace . "<this file>" for parents, policies and freshness.',
  ]);
  assert.ok(body.length <= 12, `note body is ${body.length} lines`);
});

test('a stale page with every section still ends with the full-page link and the stale warning', (t) => {
  const root = project(t, { '.devocd/code/billing/index.md': FULL });
  const plan = planRuleStubs(buildKnowledge(root), { freshness: { 'code/billing/index.md': 'stale' } });
  const content = /** @type {any} */ (plan.find(p => p.file.endsWith('code--billing.md'))).content;
  const body = content.slice(content.indexOf('---\n\n') + 5).trimEnd().split('\n');
  assert.ok(body.length <= 12, `note body is ${body.length} lines`);
  assert.match(body[body.length - 2], /^Full page: \.devocd\/code\/billing\/index\.md;/);
  assert.equal(body[body.length - 1], 'Note: this page may be stale (its cited source changed); verify against source.');
});

test('a page with no Pitfalls, Tests or Run still produces a valid note', (t) => {
  const root = project(t, { '.devocd/code/billing/index.md': '# Bare\nScope: src/billing/**\n\nOnly a summary.\n' });
  const content = /** @type {any} */ (planRuleStubs(buildKnowledge(root)).find(p => p.file.endsWith('code--billing.md'))).content;
  const body = content.slice(content.indexOf('---\n\n') + 5).trimEnd().split('\n');
  assert.equal(body[0], MARKER);
  assert.ok(body.every(l => l.trim() !== ''), 'no empty lines');
  assert.ok(!body.some(l => /^Pitfalls:|^Test:|^Run/.test(l)), 'absent sections are skipped');
  assert.ok(body.some(l => l.startsWith('Full page:')), 'the link is still there');
});

test('bare labels take their value from the sub-bullets beneath them', () => {
  const page = FULL
    .replace('- Tests: src/billing/invoice.test.ts', '- Tests:\n  - src/billing/invoice.test.ts\n  - src/billing/refund.test.ts')
    .replace('- Pitfalls: rounding in cents', '- Pitfalls:\n  - rounding in cents');
  const body = billingBody(page);
  assert.ok(body.includes('Test: src/billing/invoice.test.ts'), body.join('\n'));
  assert.ok(!body.some(l => /^Test:\s*$/.test(l)), 'no empty Test line');
  const start = body.indexOf('Pitfalls: rounding in cents');
  assert.deepEqual(body.slice(start, start + 3), [
    'Pitfalls: rounding in cents',
    '  - money is stored as integer cents',
    '  - a refund cannot exceed the captured amount',
  ]);
});

test('wrapped text, blank lines and deeper bullets do not cut or pad the pitfalls', () => {
  const page = FULL.replace('  - money is stored as integer cents\n',
    '  - money is stored as integer cents,\n    never as floats\n    - see `money.ts`\n\n');
  const body = billingBody(page);
  const start = body.indexOf('Pitfalls: rounding in cents');
  assert.deepEqual(body.slice(start, start + 3), [
    'Pitfalls: rounding in cents',
    '  - money is stored as integer cents,',
    '  - a refund cannot exceed the captured amount',
  ]);
});

test('an empty bullet with nothing beneath it leaves no line', () => {
  const body = billingBody(FULL.replace('- Tests: src/billing/invoice.test.ts', '- Tests:'));
  assert.ok(!body.some(l => l.startsWith('Test:')), body.join('\n'));
});
