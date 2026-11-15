// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePageMeta } from '../../plugin/scripts/lib/pagemeta.mjs';

const H = 'a'.repeat(64);
const H2 = '0123456789abcdef'.repeat(4);

test('full example page parses all fields', () => {
  const page = [
    '# billing', '',
    'Parent: [PROJECT](../PROJECT.md#top)',
    'Scope: `src/billing/**`, src/shared/money.ts, ,',
    'Uses: our-shared, proto', '',
    'Prose here.', '',
    'Standards: Coding, Security — route via [PROJECT](../PROJECT.md) Links', '',
    '## Evidence',
    `- src/billing/invoice.ts#L12-64 sha256:${H} 2026-11-14`,
    `- \`src/billing/pay.ts\` sha256:${H2} 2026-11-13`,
    '', '## Other', '- not evidence at all',
  ].join('\n');
  const m = parsePageMeta(page);
  assert.equal(m.parent, '../PROJECT.md');
  assert.deepEqual(m.scope, ['src/billing/**', 'src/shared/money.ts']);
  assert.deepEqual(m.uses, ['our-shared', 'proto']);
  assert.deepEqual(m.standards, ['coding', 'security']);
  assert.deepEqual(m.evidence, [
    { path: 'src/billing/invoice.ts', start: 12, end: 64, sha256: H, date: '2026-11-14' },
    { path: 'src/billing/pay.ts', start: null, end: null, sha256: H2, date: '2026-11-13' },
  ]);
  assert.deepEqual(m.problems, []);
});

test('Standards separators and none form', () => {
  assert.deepEqual(parsePageMeta('Standards: coding - see x').standards, ['coding']);
  assert.deepEqual(parsePageMeta('Standards: Coding').standards, ['coding']);
  const m = parsePageMeta('Standards: none recorded — add with /devocd:company-policy');
  assert.deepEqual(m.standards, []);
  assert.deepEqual(m.problems, []);
});

test('keys inside fences are ignored', () => {
  const m = parsePageMeta('```md\nScope: src/**\nParent: [a](b.md)\n## Evidence\n- junk\n```\n~~~\nUses: x\n~~~\nScope: real/**');
  assert.deepEqual(m.scope, ['real/**']);
  assert.equal(m.parent, null);
  assert.deepEqual(m.uses, []);
  assert.deepEqual(m.problems, []);
});

test('old free-prose evidence gives one problem, no throw', () => {
  const m = parsePageMeta('# x\n\n## Evidence\n`integration/main.py:15-57` sha256:@INV; 2026-01-01\n\n## Next\n');
  assert.deepEqual(m.evidence, []);
  assert.equal(m.problems.length, 1);
  assert.equal(m.problems[0].line, 4);
  assert.ok(m.problems[0].message.length < 200);
});

test('problem messages never echo more than 80 chars of the line', () => {
  const long = 'x'.repeat(300);
  const m = parsePageMeta(`## Evidence\n- ${long}`);
  assert.equal(m.problems.length, 1);
  assert.ok(!m.problems[0].message.includes('x'.repeat(81)));
});

test('evidence line forms', () => {
  const m = parsePageMeta([
    '## Evidence',
    `- a.ts#L12 sha256:${H} 2026-01-02`,
    `- b.ts#L12-40 sha256:${H} 2026-01-02`,
    `- c.ts sha256:${H} 2026-01-02`,
    `- \`d.ts#L3\` sha256:${H} 2026-01-02`,
  ].join('\n'));
  assert.deepEqual(m.problems, []);
  assert.deepEqual(m.evidence.map((e) => [e.path, e.start, e.end]),
    [['a.ts', 12, 12], ['b.ts', 12, 40], ['c.ts', null, null], ['d.ts', 3, 3]]);
});

test('bad hash length is a problem', () => {
  const m = parsePageMeta(`## Evidence\n- a.ts sha256:${'a'.repeat(63)} 2026-01-02`);
  assert.deepEqual(m.evidence, []);
  assert.equal(m.problems.length, 1);
  assert.equal(m.problems[0].line, 2);
});

test('duplicate Scope: first wins, later is a problem', () => {
  const m = parsePageMeta('Scope: a/**\nx\nScope: b/**');
  assert.deepEqual(m.scope, ['a/**']);
  assert.equal(m.problems.length, 1);
  assert.equal(m.problems[0].line, 3);
});

test('.. and absolute paths are rejected with problems', () => {
  const m = parsePageMeta([
    'Scope: ok/**, ../evil, /etc/passwd, C:\\x, d:/y',
    'Uses: fine, a/../b',
    '## Evidence',
    `- ../x.ts sha256:${H} 2026-01-02`,
    `- /abs.ts sha256:${H} 2026-01-02`,
    `- C:/abs.ts sha256:${H} 2026-01-02`,
  ].join('\n'));
  assert.deepEqual(m.scope, ['ok/**']);
  assert.deepEqual(m.uses, ['fine']);
  assert.deepEqual(m.evidence, []);
  assert.equal(m.problems.length, 4 + 1 + 3);
});

test('CRLF input', () => {
  const m = parsePageMeta(`Parent: [P](../P.md)\r\nScope: a, b\r\nStandards: coding\r\n## Evidence\r\n- a.ts#L1 sha256:${H} 2026-01-02\r\n`);
  assert.equal(m.parent, '../P.md');
  assert.deepEqual(m.scope, ['a', 'b']);
  assert.deepEqual(m.standards, ['coding']);
  assert.equal(m.evidence.length, 1);
  assert.deepEqual(m.problems, []);
});

test('empty and odd input returns empty result', () => {
  const empty = { parent: null, scope: [], standards: [], uses: [], evidence: [], problems: [] };
  assert.deepEqual(parsePageMeta(''), empty);
  assert.deepEqual(parsePageMeta('# Old page\n\nJust prose.\n'), empty);
  // @ts-expect-error deliberately wrong type
  assert.deepEqual(parsePageMeta(undefined), empty);
});

test('"none" means an empty Scope or Uses list, never an item named none', () => {
  const meta = parsePageMeta('# x\nUses: none\nScope: None\n');
  assert.deepEqual(meta.uses, []);
  assert.deepEqual(meta.scope, []);
  assert.deepEqual(meta.problems, []);
});

test('commas inside brace globs do not split an item', () => {
  assert.deepEqual(parsePageMeta('Scope: src/{a,b}/**, `lib/x.ts`\n').scope, ['src/{a,b}/**', 'lib/x.ts']);
});

test('Evidence section ends at a recognised key line', () => {
  const m = parsePageMeta(`## Evidence\n- a.ts sha256:${H} 2026-01-01\n\nStandards: coding — x`);
  assert.deepEqual(m.standards, ['coding']);
  assert.deepEqual(m.problems, []);
  assert.equal(m.evidence.length, 1);
});

test('colon-form evidence is parsed but flagged to use #L', () => {
  const m = parsePageMeta(`## Evidence\n- \`a/b.ts:15-57\` sha256:${H} 2026-01-01\n- c.ts:9 sha256:${H} 2026-01-01`);
  assert.deepEqual(m.evidence.map((e) => [e.path, e.start, e.end]), [['a/b.ts', 15, 57], ['c.ts', 9, 9]]);
  assert.equal(m.problems.length, 2);
  assert.ok(m.problems[0].message.includes('#L15-57'));
});

test('evidence ranges and dates are validated', () => {
  const m = parsePageMeta([
    '## Evidence',
    `- a.ts#L0 sha256:${H} 2026-01-01`,
    `- b.ts#L10-5 sha256:${H} 2026-01-01`,
    `- c.ts sha256:${H} 2026-02-30`,
    `- d.ts sha256:${H} 2026-13-01`,
    `- e.ts#L2-3 sha256:${H} 2024-02-29`,
  ].join('\n'));
  assert.deepEqual(m.evidence.map((e) => e.path), ['e.ts']);
  assert.equal(m.problems.length, 4);
});

test('Parent must be a relative target', () => {
  for (const t of ['https://x.com/a.md', 'mailto:a@b.c', '/abs.md', '\\srv\\a.md', 'C:/a.md', 'a\\b.md']) {
    const m = parsePageMeta(`Parent: [P](${t})`);
    assert.equal(m.parent, null, t);
    assert.equal(m.problems.length, 1, t);
  }
  assert.equal(parsePageMeta('Parent: [P](../up/P.md)').parent, '../up/P.md');
});

test('path safety is segment based', () => {
  const m = parsePageMeta('Scope: src/a..b.ts, src\\win\\x.ts, a/../b, ../c');
  assert.deepEqual(m.scope, ['src/a..b.ts']);
  assert.equal(m.problems.length, 3);
});

test('an info-string fence line does not close a fence', () => {
  const m = parsePageMeta('```\ncode\n``` js\nScope: leaked\n```\n');
  assert.deepEqual(m.scope, []);
  assert.deepEqual(m.problems, []);
});

test('Parent link with angle brackets and spaces', () => {
  assert.equal(parsePageMeta('Parent: [P](<../My Project.md>)').parent, '../My Project.md');
});

test('none inside a mixed list is dropped with a problem', () => {
  const m = parsePageMeta('Uses: none, foo');
  assert.deepEqual(m.uses, ['foo']);
  assert.equal(m.problems.length, 1);
  assert.ok(m.problems[0].message.includes('none cannot be combined'));
});

test('Parent/Scope/Uses only count in the header region', () => {
  const m = parsePageMeta('# t\nUses: real-dep\n\n## Notes\n\nUses: the retry helper wraps\nScope: nope\nParent: [x](x.md)\nStandards: coding\n');
  assert.deepEqual(m.uses, ['real-dep']);
  assert.deepEqual(m.scope, []);
  assert.equal(m.parent, null);
  assert.deepEqual(m.standards, ['coding']);
  assert.deepEqual(m.problems, []);
});

test('Standards none check uses a word boundary', () => {
  assert.deepEqual(parsePageMeta('Standards: noneditable-ui, security').standards, ['noneditable-ui', 'security']);
  assert.deepEqual(parsePageMeta('Standards: none').standards, []);
});
