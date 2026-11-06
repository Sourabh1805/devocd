// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, symlinkSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { upsertBlock } from '../../plugin/scripts/lib/block.mjs';

const B = '<!-- devocd:begin -->';
const E = '<!-- devocd:end -->';
const cli = fileURLToPath(new URL('../../plugin/scripts/devocd.mjs', import.meta.url));

test('upsertBlock keeps every byte outside the block', () => {
  const before = '﻿---\r\ntitle: x\r\n---\r\nuser text\r\nlast line no newline';
  const out = upsertBlock(before, 'one\ntwo');
  assert.ok(out.startsWith('﻿---\r\ntitle: x\r\n---\r\n' + B + '\r\none\r\ntwo\r\n' + E));
  assert.ok(out.endsWith('user text\r\nlast line no newline'));
  const again = upsertBlock(out, 'three');
  assert.ok(again.startsWith('﻿---\r\ntitle: x\r\n---\r\n'));
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

test('write-block writes the block and leaves other text alone', () => {
  const d = mkdtempSync(join(tmpdir(), 'devocd-wb-'));
  try {
    writeFileSync(join(d, 'CLAUDE.md'), 'mine\n');
    writeFileSync(join(d, 'inner.txt'), 'rule one\n');
    const r = run('write-block', join(d, 'CLAUDE.md'), join(d, 'inner.txt'));
    assert.equal(r.status, 0, r.stderr);
    assert.equal(readFileSync(join(d, 'CLAUDE.md'), 'utf8'), `${B}\nrule one\n${E}\n\nmine\n`);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('write-block refuses a symlink target and a junction parent', (t) => {
  const d = mkdtempSync(join(tmpdir(), 'devocd-wb-'));
  try {
    writeFileSync(join(d, 'real.md'), 'keep\n');
    writeFileSync(join(d, 'inner.txt'), 'x\n');
    mkdirSync(join(d, 'realdir'));
    let linked = false;
    try { symlinkSync(join(d, 'real.md'), join(d, 'link.md'), 'file'); linked = true; } catch { /* unsupported */ }
    if (linked) {
      const r = run('write-block', join(d, 'link.md'), join(d, 'inner.txt'));
      assert.equal(r.status, 1);
      assert.match(r.stderr, /^error:/m);
      assert.equal(readFileSync(join(d, 'real.md'), 'utf8'), 'keep\n');
    }
    let junction = false;
    try { symlinkSync(join(d, 'realdir'), join(d, 'jdir'), 'junction'); junction = true; } catch { /* unsupported */ }
    if (junction) {
      const r = run('write-block', join(d, 'jdir', 'CLAUDE.md'), join(d, 'inner.txt'));
      assert.equal(r.status, 1);
      assert.ok(!existsSync(join(d, 'realdir', 'CLAUDE.md')));
    }
    if (!linked && !junction) t.skip('links unsupported here');
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('a BOM file without frontmatter can be upserted twice', () => {
  const once = upsertBlock('﻿hello\n', 'a');
  assert.ok(once.startsWith('﻿' + B));
  const twice = upsertBlock(once, 'b');
  assert.equal(twice, '﻿' + `${B}\nb\n${E}\n\nhello\n`);
  assert.equal(upsertBlock(twice, 'b'), twice);
});

test('write-block refuses a non-UTF-8 file and writes nothing', () => {
  const d = mkdtempSync(join(tmpdir(), 'devocd-wb-'));
  try {
    const bytes = Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a]);
    writeFileSync(join(d, 'CLAUDE.md'), bytes);
    writeFileSync(join(d, 'inner.txt'), 'x\n');
    const r = run('write-block', join(d, 'CLAUDE.md'), join(d, 'inner.txt'));
    assert.equal(r.status, 1);
    assert.match(r.stderr, /^error:.*UTF-8/m);
    assert.deepEqual(readFileSync(join(d, 'CLAUDE.md')), bytes);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('write-block refuses a junction ancestor below the folder holding .devocd', () => {
  const d = mkdtempSync(join(tmpdir(), 'devocd-wb-'));
  try {
    mkdirSync(join(d, '.devocd'));
    mkdirSync(join(d, 'realdir', 'sub'), { recursive: true });
    writeFileSync(join(d, 'inner.txt'), 'x\n');
    try { symlinkSync(join(d, 'realdir'), join(d, 'jdir'), 'junction'); } catch { return; }
    const r = run('write-block', join(d, 'jdir', 'sub', 'CLAUDE.md'), join(d, 'inner.txt'));
    assert.equal(r.status, 1);
    assert.ok(!existsSync(join(d, 'realdir', 'sub', 'CLAUDE.md')));
  } finally { rmSync(d, { recursive: true, force: true }); }
});
