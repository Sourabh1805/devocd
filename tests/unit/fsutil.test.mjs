// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative } from 'node:path';
import { walk, walkFiles } from '../../scripts/lib/fsutil.mjs';

/** @param {import('node:test').TestContext} t */
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'devocd-walk-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'b/deep'), { recursive: true });
  writeFileSync(join(root, 'z.txt'), 'last');
  writeFileSync(join(root, 'b/deep/c.txt'), 'deep');
  writeFileSync(join(root, 'b/a.txt'), 'inside');
  writeFileSync(join(root, 'a.txt'), 'a');
  return root;
}

test('walk sorts entries by name and reports absolute paths and byte sizes', t => {
  const root = fixture(t);
  const result = walk(root);
  assert.deepEqual(result.files.map(f => f.rel), ['a.txt', 'b/a.txt', 'b/deep/c.txt', 'z.txt']);
  assert.deepEqual(result.files.map(f => f.size), [1, 6, 4, 4]);
  assert.ok(result.files.every(f => isAbsolute(f.abs) && f.abs === join(root, f.rel)));
  assert.deepEqual(result.dirs, []);
  assert.deepEqual(result.skipped, []);
  assert.equal(result.truncated, false);
});

test('maxDepth counts folders below root, including files in the last allowed folder', t => {
  const root = fixture(t);
  assert.deepEqual(walk(root, { maxDepth: 0 }).files.map(f => f.rel), ['a.txt', 'z.txt']);
  assert.deepEqual(walk(root, { maxDepth: 1 }).files.map(f => f.rel), ['a.txt', 'b/a.txt', 'z.txt']);
  assert.equal(walk(root, { maxDepth: 2 }).files.length, 4);
});

test('maxEntries counts directories and files, and only truncates if another entry exists', t => {
  const root = fixture(t);
  assert.deepEqual(walk(root, { maxEntries: 0 }), { files: [], dirs: [], skipped: [], truncated: true });
  const limited = walk(root, { maxEntries: 3 });
  assert.deepEqual(limited.files.map(f => f.rel), ['a.txt', 'b/a.txt']);
  assert.equal(limited.truncated, true);
  assert.equal(walk(root, { maxEntries: 6 }).truncated, false);
  assert.equal(walk(root, { skipDir: () => true, maxEntries: 2 }).truncated, true);
});

test('maxBytes is a per-file limit and reports oversized paths in skipped', t => {
  const result = walk(fixture(t), { maxBytes: 4 });
  assert.deepEqual(result.files.map(f => f.rel), ['a.txt', 'b/deep/c.txt', 'z.txt']);
  assert.deepEqual(result.skipped, [{ rel: 'b/a.txt', reason: 'too-large' }]);
  assert.equal(result.truncated, false);
});

test('skipDir receives POSIX relative paths and names and prunes that subtree', t => {
  /** @type {string[][]} */
  const calls = [];
  const result = walk(fixture(t), { skipDir: (rel, name) => { calls.push([rel, name]); return name === 'deep'; } });
  assert.deepEqual(calls, [['b', 'b'], ['b/deep', 'deep']]);
  assert.deepEqual(result.files.map(f => f.rel), ['a.txt', 'b/a.txt', 'z.txt']);
});

test('missing root returns empty results and other root errors propagate', t => {
  const root = fixture(t);
  assert.deepEqual(walk(join(root, 'missing')), { files: [], dirs: [], skipped: [], truncated: false });
  assert.throws(() => walk(join(root, 'a.txt')), { code: 'ENOTDIR' });
  assert.throws(() => walk(join(root, '\0')), { code: 'ERR_INVALID_ARG_VALUE' });
  /** @type {string[][]} */
  const errors = [];
  assert.deepEqual(walk(join(root, '\0'), {
    onReadError: (error, rel) => { errors.push([error.code ?? '', rel]); },
  }), { files: [], dirs: [], skipped: [], truncated: false });
  assert.deepEqual(errors, [['ERR_INVALID_ARG_VALUE', '']]);
});

test('includeDirs returns visited descendant directories, including empty folders', t => {
  const root = fixture(t);
  mkdirSync(join(root, 'empty'));
  assert.deepEqual(walk(root, { includeDirs: true }).dirs, ['b', 'b/deep', 'empty']);
  assert.deepEqual(walk(root, { includeDirs: true, skipDir: (_, name) => name === 'b' }).dirs, ['empty']);
});

test('directory links and a linked root are never followed or counted as files', t => {
  const root = fixture(t);
  const target = fixture(t);
  const link = join(root, 'linked');
  try { symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (error.code === 'EPERM') return t.skip('link creation unavailable'); throw error; }
  assert.equal(walk(root).files.length, 4);
  assert.deepEqual(walk(link), { files: [], dirs: [], skipped: [], truncated: false });
  assert.ok(!walk(root, { includeDirs: true }).dirs.includes('linked'));
});

test('file links are never returned', t => {
  const root = fixture(t);
  try { symlinkSync(join(root, 'a.txt'), join(root, 'alias.txt'), 'file'); }
  catch (error) { if (error.code === 'EPERM') return t.skip('file symlink creation unavailable'); throw error; }
  assert.equal(walk(root).files.length, 4);
});

test('walkFiles preserves path ordering and its absolute-path skip callback', t => {
  const root = fixture(t);
  /** @type {string[][]} */
  const calls = [];
  const files = walkFiles(root, (abs, name) => { calls.push([abs, name]); return name === 'deep'; });
  assert.deepEqual(files, ['a.txt', 'b/a.txt', 'z.txt'].map(rel => join(root, rel)));
  assert.deepEqual(calls, [[join(root, 'b'), 'b'], [join(root, 'b/deep'), 'deep']]);
});

test('relative roots still produce absolute walk paths without changing walkFiles path spelling', t => {
  const root = fixture(t);
  const rel = relative(process.cwd(), root);
  assert.ok(walk(rel).files.every(f => isAbsolute(f.abs)));
  assert.deepEqual(walkFiles(rel), ['a.txt', 'b/a.txt', 'b/deep/c.txt', 'z.txt'].map(f => join(rel, f)));
});

test('an empty directory does not exhaust a zero entry budget', t => {
  const root = fixture(t);
  const empty = join(root, 'empty');
  mkdirSync(empty);
  assert.deepEqual(walk(empty, { maxEntries: 0, includeDirs: true }), {
    files: [], dirs: [], skipped: [], truncated: false,
  });
});

test('directory-stack compatibility preserves root-first files and cap selection', t => {
  const root = fixture(t);
  const options = { order: /** @type {const} */ ('directory-stack') };
  assert.deepEqual(walk(root, options).files.map(f => f.rel), ['a.txt', 'z.txt', 'b/a.txt', 'b/deep/c.txt']);
  const capped = walk(root, { ...options, maxEntries: 3 });
  assert.deepEqual(capped.files.map(f => f.rel), ['a.txt', 'z.txt']);
  assert.equal(capped.truncated, true);
  assert.equal(walk(root, { ...options, maxEntries: 6 }).truncated, false);
});

test('classification hooks can prune entries and observe successfully visited directories', t => {
  /** @type {string[]} */
  const visited = [];
  /** @type {string[]} */
  const seen = [];
  const result = walk(fixture(t), {
    onDirectory: rel => { visited.push(rel); },
    onEntry: (rel, entry) => { seen.push(rel); return entry.name !== 'deep' && entry.name !== 'a.txt'; },
  });
  assert.deepEqual(visited, ['', 'b']);
  assert.deepEqual(seen, ['a.txt', 'b', 'b/a.txt', 'b/deep', 'z.txt']);
  assert.deepEqual(result.files.map(f => f.rel), ['z.txt']);
});

test('read errors propagate by default and compatibility handling continues with siblings', t => {
  const root = fixture(t);
  const removeChild = (/** @type {string} */ rel) => {
    if (rel === 'b') rmSync(join(root, rel), { recursive: true });
    return false;
  };
  assert.throws(() => walk(root, { skipDir: removeChild }), { code: 'ENOENT' });
  mkdirSync(join(root, 'b'));
  /** @type {string[][]} */
  const errors = [];
  const result = walk(root, { skipDir: removeChild,
    onReadError: (error, rel) => { errors.push([error.code ?? '', rel]); },
  });
  assert.deepEqual(errors, [['ENOENT', 'b']]);
  assert.deepEqual(result.files.map(f => f.rel), ['a.txt', 'z.txt']);
  assert.equal(result.truncated, false);
});

test('classification errors are not swallowed by directory-read error handlers', t => {
  const error = new Error('classification failed');
  assert.throws(() => walk(fixture(t), { onEntry: () => { throw error; }, onReadError: () => {} }), e => e === error);
});

test('a directory replaced with a link before descent is not followed', t => {
  const root = fixture(t);
  const target = fixture(t);
  try { symlinkSync(target, join(root, 'probe'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (error.code === 'EPERM') return t.skip('link creation unavailable'); throw error; }
  const result = walk(root, { skipDir: rel => {
    if (rel === 'b') {
      rmSync(join(root, rel), { recursive: true });
      symlinkSync(target, join(root, rel), process.platform === 'win32' ? 'junction' : 'dir');
    }
    return false;
  } });
  assert.deepEqual(result.files.map(f => f.rel), ['a.txt', 'z.txt']);
});

test('a file deleted mid-walk is skipped instead of aborting the walk', t => {
  const root = fixture(t);
  const result = walk(root, { onEntry: rel => { if (rel === 'a.txt') rmSync(join(root, rel)); } });
  assert.deepEqual(result.files.map(f => f.rel), ['b/a.txt', 'b/deep/c.txt', 'z.txt']);
});
