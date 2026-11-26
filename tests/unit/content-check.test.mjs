import { workspace, companyState as defaultCompanyState } from '../helpers/workspace.mjs';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkTree } from '../../scripts/lib/check.mjs';
import { makeTree } from '../helpers/tree.mjs';

const cli = fileURLToPath(new URL('../../scripts/devocd.mjs', import.meta.url));

const SRC = 'export const SECRET_BODY_TEXT = 1;\n';
const sha = (/** @type {string} */ s) => createHash('sha256').update(s).digest('hex');
const evidence = (/** @type {string} */ body = SRC) => `\n## Evidence\n- src/a.js#L1 sha256:${sha(body)} 2026-11-01\n`;
const GOOD = `# Billing\nParent: [Project](../PROJECT.md)\nScope: src/**\n\n- Entry points: \`src/a.js:1\`\n- Run/test this part: \`src/a.test.js\`\n- Pitfalls: cents only\n\nStandards: none\n${evidence()}`;

/** @param {Record<string, string>} files */
function project(files = {}) {
  return workspace({ after }, { projects: { api: { files: {
    'CLAUDE.local.md': '<!-- devocd:begin -->\nStart with PROJECT.md\n<!-- devocd:end -->\n',
    '.devocd/PROJECT.md': '# Project\n', '.devocd/pointer.md': 'Start with PROJECT.md',
    'src/a.js': SRC, ...files,
  } } } }).project('api');
}
const content = (/** @type {string} */ d) => checkTree(d, {}).issues.filter((i) => /^(page|evidence|decisions)\//.test(i.rule));

test('a complete module page has no content warnings', () => {
  assert.deepEqual(content(project({ '.devocd/code/billing.md': GOOD })), []);
});

test('a module page missing Pitfalls and Standards is flagged once per rule', () => {
  const d = project({ '.devocd/code/b.md': `# B\n- Entry points: x\n${evidence()}` });
  const i = content(d);
  const sec = i.filter((x) => x.rule === 'page/section-missing');
  assert.equal(sec.length, 1);
  assert.match(sec[0].message, /Pitfalls/);
  assert.doesNotMatch(sec[0].message, /Entry points/);
  assert.equal(sec[0].severity, 'warning');
  assert.equal(i.filter((x) => x.rule === 'page/standards-missing').length, 1);
  assert.equal(i.find((x) => x.rule === 'page/standards-missing')?.severity, 'warning');
});

test('lines inside code fences do not satisfy sections', () => {
  const d = project({ '.devocd/code/b.md': `# B\n\`\`\`\n- Entry points: x\n- Pitfalls: y\nStandards: none\n\`\`\`\n${evidence()}` });
  assert.match(content(d).find((x) => x.rule === 'page/section-missing')?.message ?? '', /Entry points.*Pitfalls/);
});

test('a flow page without evidence warns, and needs no sections', () => {
  // T98: a flow page reports only the entry point reason, so this fixture gets both notes.
  const d = project({ '.devocd/flows/pay.md': '# Pay\nStandards: none\n' });
  assert.deepEqual(content(d).map((i) => [i.rule, i.severity]), [['page/not-actionable', 'warning'], ['page/evidence-missing', 'warning']]);
});

test('a malformed header line is a page/header warning with its line', () => {
  const d = project({ '.devocd/flows/pay.md': `# Pay\nScope: ../x\nStandards: none\n${evidence()}` });
  const h = content(d).filter((i) => i.rule === 'page/header');
  assert.equal(h.length, 1);
  assert.equal(h[0].severity, 'warning');
  assert.equal(h[0].line, 2);
});

test('draft, decision-history and generated pages are skipped', () => {
  const d = project({ '.devocd/draft/code/x.md': '# x\n', '.devocd/decision-history/h.md': '# h\nScope: ../x\n', '.devocd/coverage.md': '# c\nScope: ../x\n' });
  assert.deepEqual(content(d), []);
});

test('evidence/stale appears only after a cited file changes, without leaking hashes or bodies', () => {
  const d = project({ '.devocd/code/billing.md': GOOD });
  assert.equal(content(d).filter((i) => i.rule === 'evidence/stale').length, 0);
  writeFileSync(join(d, 'src', 'a.js'), 'export const CHANGED_BODY_TEXT = 2;\n');
  const stale = content(d).filter((i) => i.rule === 'evidence/stale');
  assert.equal(stale.length, 1);
  assert.equal(stale[0].severity, 'warning');
  assert.equal(stale[0].file, '.devocd/code/billing.md');
  assert.match(stale[0].message, /1/);
  for (const i of checkTree(d, {}).issues) {
    assert.doesNotMatch(JSON.stringify(i), /[0-9a-f]{64}|BODY_TEXT/);
  }
});

test('a missing cited file also makes the page stale', () => {
  const d = project({ '.devocd/code/billing.md': GOOD });
  rmSync(join(d, 'src', 'a.js'));
  assert.equal(content(d).filter((i) => i.rule === 'evidence/stale').length, 1);
});

test('content warnings never fail check', () => {
  const d = project({ '.devocd/code/b.md': '# B\nScope: ../x\n', '.devocd/decisions.md': '## D-1 — a\nDate: nope\n' });
  const r = checkTree(d, {});
  assert.ok(r.issues.length > 0);
  assert.equal(r.issues.filter((i) => i.severity === 'error').length, 0);
  assert.equal(spawnSync(process.execPath, [cli, 'check', d, '--json'], { encoding: 'utf8' }).status, 0);
});

const dec = (/** @type {string} */ text) => content(project({ '.devocd/decisions.md': text })).filter((i) => i.rule.startsWith('decisions/'));

test('valid decisions.md entries produce no issues', () => {
  const t = '# Decisions\n\n## D-1 — First\nDate: 2026-01-05\nBody.\n\n## D-2 - Second\nDate: 2026-02-01\nSupersedes: D-1\n\n## D-3 — Third\nDate: 2026-03-01\nRetires: D-1, D-2\n';
  assert.deepEqual(dec(t), []);
});

test('a repeated ID is decisions/duplicate', () => {
  const r = dec('## D-1 — a\nDate: 2026-01-05\n\n## D-1 — b\nDate: 2026-01-06\n');
  assert.deepEqual(r.map((i) => [i.rule, i.severity, i.line]), [['decisions/duplicate', 'warning', 4]]);
});

test('a dangling or self link is decisions/link', () => {
  const r = dec('## D-1 — a\nDate: 2026-01-05\nSupersedes: D-9\n\n## D-2 — b\nDate: 2026-01-05\nRetires: D-2\n');
  assert.deepEqual(r.map((i) => i.rule), ['decisions/link', 'decisions/link']);
  assert.ok(r.every((i) => i.severity === 'warning'));
});

test('a supersedes cycle is decisions/cycle', () => {
  const r = dec('## D-1 — a\nDate: 2026-01-05\nSupersedes: D-2\n\n## D-2 — b\nDate: 2026-01-05\nSupersedes: D-1\n');
  assert.deepEqual(r.map((i) => [i.rule, i.severity]), [['decisions/cycle', 'warning']]);
});

test('an invalid or missing date, or invalid ID, is decisions/format', () => {
  const r = dec('## D-1 — a\nDate: 2026-02-30\n\n## D-2 — b\n\n## d-3 — c\nDate: 2026-01-01\n\n## D-4 — ok\nDate: 2026-01-01\n');
  assert.deepEqual(r.map((i) => [i.rule, i.severity, i.line]), [['decisions/format', 'warning', 1], ['decisions/format', 'warning', 4], ['decisions/format', 'warning', 6]]);
});

test('a free-form decisions.md is one information note and nothing else', () => {
  const r = dec('# Decisions\n\nWe chose Postgres.\n\n## Open questions\nNone.\n');
  assert.deepEqual(r.map((i) => [i.rule, i.severity]), [['decisions/unstructured', 'information']]);
});

test('company decisions.md is checked too', () => {
  const d = workspace({ after }).root;
  makeTree(d, {
    '.devocd/state.json': JSON.stringify(defaultCompanyState({ name: 'A', description: 'd' })),
    'CLAUDE.md': '<!-- devocd:begin -->\n# A\n<!-- devocd:end -->\n', '.devocd/PROJECT.md': '# P\n',
    '.devocd/decisions.md': '## D-1 — a\nDate: 2026-01-05\nSupersedes: D-7\n',
  });
  assert.deepEqual(content(d).map((i) => i.rule), ['decisions/link']);
});

test('version-like headings are not entry IDs; a lowercase ID-shaped one is', () => {
  assert.deepEqual(dec('## D-1 — a\nDate: 2026-01-05\n\n## v2 — migration notes\nBody.\n'), []);
  const r = dec('## D-1 — a\nDate: 2026-01-05\n\n## d-0003 — lowercase id\nDate: 2026-01-01\n');
  assert.deepEqual(r.map((i) => [i.rule, i.line]), [['decisions/format', 4]]);
});

test('a duplicate entry is still checked for date and links', () => {
  const r = dec('## D-0003 — a\nDate: 2026-01-05\n\n## D-0003 — b\nSupersedes: D-0003\n');
  assert.deepEqual(r.map((i) => i.rule), ['decisions/duplicate', 'decisions/format', 'decisions/link']);
});

// --- T98: page/not-actionable -------------------------------------------------
/** A module page with every required ingredient; `over` replaces single lines. */
const page = (/** @type {Record<string, string>} */ over = {}) => {
  const f = { entry: '- Entry points: `src/a.js:1`', run: '- Run/test this part: `src/a.test.js`', pits: '- Pitfalls: cents only', ...over };
  return `# Billing\nParent: [Project](../PROJECT.md)\nScope: src/**\n\n${f.entry}\n${f.run}\n${f.pits}\n\nStandards: none\n${evidence()}`;
};
const actionable = (/** @type {string} */ text) => content(project({ '.devocd/code/b.md': text })).filter((i) => i.rule === 'page/not-actionable');

test('a complete module page is actionable: no page/not-actionable', () => {
  assert.deepEqual(actionable(page()), []);
});

/** One case per reason: the single issue names exactly that reason. */
const ONE_REASON = [
  { name: 'the entry point is a bare path, with no line', over: { entry: '- Entry points: src/a.js' }, reason: 'no concrete entry point (file:line)' },
  { name: 'the page names no test file', over: { run: '- Run/test this part: the suite' }, reason: 'no covering test' },
  { name: 'Pitfalls says none', over: { pits: '- Pitfalls: none' }, reason: 'no extension recipe or pitfall' },
];
for (const c of ONE_REASON) {
  test(`table: ${c.name} is page/not-actionable naming only that reason`, () => {
    const i = actionable(page(c.over));
    assert.equal(i.length, 1, 'one issue per page');
    assert.equal(i[0].severity, 'warning');
    assert.match(i[0].message, new RegExp(c.reason.replace(/[()]/g, '\\$&')));
    for (const other of ONE_REASON.filter((o) => o.reason !== c.reason)) {
      assert.ok(!i[0].message.includes(other.reason), `must not also name ${other.reason}`);
    }
  });
}

test('all three reasons on one page give one issue listing all three', () => {
  const i = actionable(page({ entry: '- Entry points: see the code', run: '- Run/test this part: later', pits: '- Pitfalls: TBD' }));
  assert.equal(i.length, 1);
  for (const r of ['no concrete entry point (file:line)', 'no covering test', 'no extension recipe or pitfall']) assert.ok(i[0].message.includes(r), r);
  assert.match(i[0].message, /^module page has /);
});

test('a pitfall written as a bullet with sub-bullets counts as one item', () => {
  const CASES = [
    ['one line', '- Pitfalls: cents only', 0],
    ['nested', '- Pitfalls:\n  - cents only', 0],
    ['nested deeper', '- Pitfalls:\n  - rounding: cents only\n    - never use floats', 0],
    ['empty', '- Pitfalls:', 1],
    ['a placeholder sub-bullet', '- Pitfalls:\n  - none', 1],
  ];
  for (const [name, pits, want] of CASES) {
    const i = actionable(page({ pits }));
    const notActionable = i.filter((x) => x.message.includes('no extension recipe or pitfall'));
    assert.equal(notActionable.length, want, String(name));
  }
});

test('a test path only inside ## Evidence or a fenced block does not count', () => {
  const onlyEvidence = page({ run: '- Run/test this part: the suite' });
  assert.ok(actionable(onlyEvidence)[0].message.includes('no covering test'));
  const fencedBody = page({ run: '- Run/test this part: the suite' }).replace('Standards: none', '```\n- Run/test this part: src/a.test.js\n```\n\nStandards: none');
  assert.ok(actionable(fencedBody)[0].message.includes('no covering test'));
});

test('every test-file shape counts as a covering test', () => {
  for (const p of ['src/a.test.js', 'src/a.spec.ts', 'test_a.py', 'a_test.go', '__tests__/a.js', 'tests/a.js', 'src/test/java/A.java']) {
    const i = actionable(page({ run: `- Run/test this part: ${p}` }));
    assert.ok(!i.some((x) => x.message.includes('no covering test')), p);
  }
});

test('a flow page reports only the entry point reason', () => {
  const d = project({ '.devocd/flows/pay.md': `# Pay\nStandards: none\n${evidence()}` });
  const i = content(d).filter((x) => x.rule === 'page/not-actionable');
  assert.equal(i.length, 1);
  assert.match(i[0].message, /^flow page has no concrete entry point \(file:line\)$/);
  const ok = content(project({ '.devocd/flows/pay.md': `# Pay\n- Entry points: \`src/a.js:1\`\nStandards: none\n${evidence()}` })).filter((x) => x.rule === 'page/not-actionable');
  assert.deepEqual(ok, []);
});

test('a missing section is only page/section-missing, never also page/not-actionable', () => {
  const d = project({ '.devocd/code/b.md': `# B\nScope: src/**\n\n- Pitfalls: cents only\n\nStandards: none\n${evidence()}` });
  const i = content(d);
  assert.equal(i.filter((x) => x.rule === 'page/section-missing').length, 1);
  assert.ok(!i.some((x) => x.rule === 'page/not-actionable' && x.message.includes('entry point')));
});

test('no issue message echoes page text', () => {
  const text = page({ entry: '- Entry points: see the code', run: '- Run/test this part: later', pits: '- Pitfalls: CANARY-PAGE-BODY' });
  for (const i of content(project({ '.devocd/code/b.md': text }))) {
    assert.doesNotMatch(i.message, /CANARY-PAGE-BODY|see the code|later/);
    assert.doesNotMatch(i.hint, /CANARY-PAGE-BODY/);
  }
});
