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
import { planRuleStubs, writeRuleStubs } from '../../scripts/lib/rules.mjs';
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
  assert.ok(body.length <= 10);
  assert.equal(body[0], MARKER);
  assert.deepEqual(body.slice(1), [
    'Purpose: Invoices and payments.',
    'Entry points: `src/billing/invoice.ts:1` (invoice)',
    'Pitfalls: rounding in cents',
    'Policies: coding, testing — read them via .devocd/PROJECT.md Links before changing behaviour.',
    'Decisions: check .devocd/decisions.md before changing behaviour here.',
    'Full page: .devocd/code/billing/index.md; or run devocd trace . "<this file>" for parents, policies and freshness.',
  ]);
  const f = /** @type {any} */ (plan.find(p => p.file.endsWith('flows--pay.md'))).content;
  assert.ok(f.startsWith('---\npaths:\n  - "src/{pay,checkout}/**"\n---\n\n'));
});

test('stale freshness adds the note last; current does not; long lines are clipped', t => {
  const root = project(t, { '.devocd/code/billing/index.md': BILLING.replace('rounding in cents', 'x'.repeat(400)) });
  const g = buildKnowledge(root);
  const cur = planRuleStubs(g, { freshness: { 'code/billing/index.md': 'current' } })[0].content;
  assert.ok(!cur.includes('may be stale'));
  assert.ok(cur.split('\n').every(l => l.length <= 200));
  const stale = /** @type {any} */ (planRuleStubs(g, { freshness: { 'code/billing/index.md': 'stale' } }).find(p => p.file.endsWith('code--billing.md')));
  assert.ok(stale.content.trimEnd().endsWith('Note: this page may be stale (its cited source changed); verify against source.'));
  assert.ok(stale.content.trimEnd().split('\n').length <= 5 + 10);
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
