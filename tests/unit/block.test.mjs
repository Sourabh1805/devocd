// @ts-check
import { workspace, companyState as defaultCompanyState, projectState as defaultProjectState } from '../helpers/workspace.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, symlinkSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { upsertBlock, writeBlock } from '../../scripts/lib/block.mjs';

const B = '<!-- devocd:begin -->';
const E = '<!-- devocd:end -->';
const cli = fileURLToPath(new URL('../../scripts/devocd.mjs', import.meta.url));

test('upsertBlock keeps every byte outside the block', () => {
  const before = '\uFEFF---\r\ntitle: x\r\n---\r\nuser text\r\nlast line no newline';
  const out = upsertBlock(before, 'one\ntwo');
  assert.ok(out.startsWith('\uFEFF---\r\ntitle: x\r\n---\r\n' + B + '\r\none\r\ntwo\r\n' + E));
  assert.ok(out.endsWith('user text\r\nlast line no newline'));
  const again = upsertBlock(out, 'three');
  assert.ok(again.startsWith('\uFEFF---\r\ntitle: x\r\n---\r\n'));
  assert.ok(again.endsWith('user text\r\nlast line no newline'));
  assert.ok(!again.includes('\r\r'));
});

test('upsertBlock places a block at the top of a plain file and in an empty one', () => {
  assert.equal(upsertBlock('hello\n', 'x'), `${B}\nx\n${E}\n\nhello\n`);
  assert.equal(upsertBlock('', 'x'), `${B}\nx\n${E}\n`);
});

test('upsertBlock replaces in place; a second run is identical', () => {
  const start = 'top\n' + `${B}\nold\n${E}\n` + 'bottom';
  const once = upsertBlock(start, 'new');
  assert.equal(once, `top\n${B}\nnew\n${E}\nbottom`);
  assert.equal(upsertBlock(once, 'new'), once);
});

test('begin without end, end before begin, or two begins throw', () => {
  for (const bad of [`${B}\nx`, `${E}\n${B}\n`, `${B}\n${E}\n${B}\n${E}\n`, `${E}\n`]) {
    assert.throws(() => upsertBlock(bad, 'x'), { code: 'BLOCK_MALFORMED' });
  }
});

/** @param {...string} args */
function run(...args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
}

/** A folder as add-project leaves it before write-block: project state and the block's text in .devocd/pointer.md. */
function project(/** @type {string} */ d, inner = 'rule one\n') {
  mkdirSync(join(d, '.devocd'), { recursive: true });
  writeFileSync(join(d, '.devocd', 'state.json'), JSON.stringify(defaultProjectState()));
  writeFileSync(join(d, '.devocd', 'pointer.md'), inner);
  return d;
}
const pointerOf = (/** @type {string} */ d) => join(d, '.devocd', 'pointer.md');

test('write-block writes the block into CLAUDE.local.md and leaves other text alone', t => {
  const d = workspace(t).root;
  try {
    project(d);
    writeFileSync(join(d, 'CLAUDE.local.md'), 'mine\n');
    const r = run('write-block', join(d, 'CLAUDE.local.md'), pointerOf(d));
    assert.equal(r.status, 0, r.stderr);
    assert.equal(readFileSync(join(d, 'CLAUDE.local.md'), 'utf8'), `${B}\nrule one\n${E}\n\nmine\n`);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('write-block refuses a symlink target and a junction parent', (t) => {
  const d = mkdtempSync(join(tmpdir(), 'devocd-wb-'));
  try {
    project(d);
    writeFileSync(join(d, 'real.md'), 'keep\n');
    project(join(d, 'realdir'));
    let linked = false;
    try { symlinkSync(join(d, 'real.md'), join(d, 'CLAUDE.local.md'), 'file'); linked = true; } catch { /* unsupported */ }
    if (linked) {
      const r = run('write-block', join(d, 'CLAUDE.local.md'), pointerOf(d));
      assert.equal(r.status, 1);
      assert.match(r.stderr, /^error:/m);
      assert.equal(readFileSync(join(d, 'real.md'), 'utf8'), 'keep\n');
    }
    let junction = false;
    try { symlinkSync(join(d, 'realdir'), join(d, 'jdir'), 'junction'); junction = true; } catch { /* unsupported */ }
    if (junction) {
      const r = run('write-block', join(d, 'jdir', 'CLAUDE.local.md'), pointerOf(join(d, 'jdir')));
      assert.equal(r.status, 1);
      assert.ok(!existsSync(join(d, 'realdir', 'CLAUDE.local.md')));
    }
    if (!linked && !junction) t.skip('links unsupported here');
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('write-block refuses every other shape with exit 1 and writes nothing', () => {
  const d = mkdtempSync(join(tmpdir(), 'devocd-wb-'));
  try {
    const p = project(join(d, 'api'));
    const outside = join(d, 'elsewhere');
    mkdirSync(outside);
    writeFileSync(join(outside, 'inner.txt'), 'x\n');
    const company = join(d, 'company');
    mkdirSync(join(company, '.devocd'), { recursive: true });
    writeFileSync(join(company, '.devocd', 'state.json'), JSON.stringify(defaultCompanyState({ name: 'Acme', description: 'x' })));
    writeFileSync(join(company, '.devocd', 'pointer.md'), 'x\n');
    const noState = join(d, 'plain');
    mkdirSync(join(noState, '.devocd'), { recursive: true });
    writeFileSync(join(noState, '.devocd', 'pointer.md'), 'x\n');
    for (const [target, inner, why] of [
      [join(outside, 'CLAUDE.local.md'), pointerOf(p), 'a folder outside the project, with no devocd state'],
      [join(outside, 'CLAUDE.md'), join(outside, 'inner.txt'), 'any file anywhere'],
      [join(p, '..', 'CLAUDE.local.md'), pointerOf(p), 'the folder above the project'],
      [join(p, 'CLAUDE.md'), pointerOf(p), "the team's CLAUDE.md"],
      [join(p, 'notes.md'), pointerOf(p), 'another file name'],
      [join(p, 'CLAUDE.local.md'), join(outside, 'inner.txt'), 'an inner file outside .devocd'],
      [join(p, 'CLAUDE.local.md'), join(p, '.devocd', 'state.json'), 'another .devocd file as the text'],
      [join(company, 'CLAUDE.local.md'), pointerOf(company), 'company state is not project state'],
      [join(noState, 'CLAUDE.local.md'), pointerOf(noState), 'no state at all'],
    ]) {
      const r = run('write-block', target, inner);
      assert.equal(r.status, 1, `${why}: ${r.stderr}`);
      assert.match(r.stderr, /^error: write-block /m, why);
      assert.ok(!r.stderr.includes('    at '), why);
      assert.ok(!existsSync(target), `${why}: nothing written`);
    }
    rmSync(pointerOf(p));
    const missing = run('write-block', join(p, 'CLAUDE.local.md'), pointerOf(p));
    assert.equal(missing.status, 1, 'a missing pointer.md is a refusal, not an environment error');
    assert.match(missing.stderr, /pointer\.md/);
    assert.ok(!existsSync(join(p, 'CLAUDE.local.md')));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('a BOM file without frontmatter can be upserted twice', () => {
  const once = upsertBlock('\uFEFFhello\n', 'a');
  assert.ok(once.startsWith('\uFEFF' + B));
  const twice = upsertBlock(once, 'b');
  assert.equal(twice, '\uFEFF' + `${B}\nb\n${E}\n\nhello\n`);
  assert.equal(upsertBlock(twice, 'b'), twice);
});

test('write-block refuses a non-UTF-8 file and writes nothing', () => {
  const d = mkdtempSync(join(tmpdir(), 'devocd-wb-'));
  try {
    project(d, 'x\n');
    const bytes = Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a]);
    writeFileSync(join(d, 'CLAUDE.local.md'), bytes);
    const r = run('write-block', join(d, 'CLAUDE.local.md'), pointerOf(d));
    assert.equal(r.status, 1);
    assert.match(r.stderr, /^error:.*UTF-8/m);
    assert.deepEqual(readFileSync(join(d, 'CLAUDE.local.md')), bytes);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('the block writer refuses a junction ancestor below the folder holding .devocd; the command refuses that folder outright', () => {
  const d = mkdtempSync(join(tmpdir(), 'devocd-wb-'));
  try {
    mkdirSync(join(d, '.devocd'));
    mkdirSync(join(d, 'realdir', 'sub'), { recursive: true });
    writeFileSync(join(d, 'inner.txt'), 'x\n');
    try { symlinkSync(join(d, 'realdir'), join(d, 'jdir'), 'junction'); } catch { return; }
    assert.throws(() => writeBlock(join(d, 'jdir', 'sub', 'CLAUDE.md'), join(d, 'inner.txt')), { code: 'NO_DIR' });
    const r = run('write-block', join(d, 'jdir', 'sub', 'CLAUDE.local.md'), join(d, 'jdir', 'sub', '.devocd', 'pointer.md'));
    assert.equal(r.status, 1);
    assert.ok(!existsSync(join(d, 'realdir', 'sub', 'CLAUDE.md')) && !existsSync(join(d, 'realdir', 'sub', 'CLAUDE.local.md')));
  } finally { rmSync(d, { recursive: true, force: true }); }
});
