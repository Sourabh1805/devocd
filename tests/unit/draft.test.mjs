// @ts-check
// clean-draft is the only way a skill may remove .devocd/draft/ (skills have no delete tool). Because it deletes,
// it is scoped hard: only that one folder, never through a link, never a tracked file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeTree } from '../helpers/tree.mjs';
import { cleanDraft } from '../../scripts/lib/draft.mjs';

const cli = fileURLToPath(new URL('../../scripts/devocd.mjs', import.meta.url));
const LINK = process.platform === 'win32' ? 'junction' : 'dir';

/** @param {import('node:test').TestContext} t @param {Record<string, string>} files */
function fixture(t, files) {
  const root = mkdtempSync(join(tmpdir(), 'devocd-draft-clean-'));
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  return makeTree(root, files);
}

test('removes the draft folder and everything in it, and nothing else', t => {
  const root = fixture(t, {
    '.devocd/draft/PROJECT.md': '# draft', '.devocd/draft/code/a/index.md': '# a draft',
    '.devocd/PROJECT.md': '# live', '.devocd/state.json': '{}', 'src/a.js': 'code', 'draft/keep.md': 'a source folder named draft',
  });
  assert.deepEqual(cleanDraft(root), { removed: true });
  assert.ok(!existsSync(join(root, '.devocd', 'draft')));
  for (const keep of ['.devocd/PROJECT.md', '.devocd/state.json', 'src/a.js', 'draft/keep.md']) assert.ok(existsSync(join(root, keep)), keep);
});

test('a folder with no draft, or no .devocd yet, is a quiet no-op', t => {
  const root = fixture(t, { '.devocd/PROJECT.md': '# live' });
  assert.deepEqual(cleanDraft(root), { removed: false });
  const bare = fixture(t, { 'src/a.js': 'code' });
  assert.deepEqual(cleanDraft(bare), { removed: false });
});

test('a draft that is a link is refused, and the link target is untouched', t => {
  const external = fixture(t, { 'precious.txt': 'do not delete' });
  const root = fixture(t, { '.devocd/PROJECT.md': '# live' });
  symlinkSync(external, join(root, '.devocd', 'draft'), LINK);
  assert.throws(() => cleanDraft(root), { code: 'BAD_TARGET' });
  assert.equal(readFileSync(join(external, 'precious.txt'), 'utf8'), 'do not delete');
});

test('a link inside the draft is removed as a link, never followed', t => {
  const external = fixture(t, { 'precious.txt': 'do not delete' });
  const root = fixture(t, { '.devocd/draft/PROJECT.md': '# draft' });
  symlinkSync(external, join(root, '.devocd', 'draft', 'escape'), LINK);
  cleanDraft(root);
  assert.ok(!existsSync(join(root, '.devocd', 'draft')));
  assert.equal(readFileSync(join(external, 'precious.txt'), 'utf8'), 'do not delete');
});

test('a .devocd that is a link is refused', t => {
  const external = fixture(t, { 'draft/x.md': 'outside' });
  const root = fixture(t, { 'src/a.js': 'code' });
  symlinkSync(external, join(root, '.devocd'), LINK);
  assert.throws(() => cleanDraft(root), { code: 'BAD_TARGET' });
  assert.ok(existsSync(join(external, 'draft', 'x.md')));
});

test('git-tracked draft files are never deleted', t => {
  const root = fixture(t, { '.devocd/draft/PROJECT.md': '# tracked by mistake', 'src/a.js': 'code' });
  const run = (/** @type {string[]} */ ...a) => spawnSync('git', ['-c', 'gc.auto=0', '-C', root, ...a], { encoding: 'utf8' });
  assert.equal(run('init', '-q').status, 0);
  assert.equal(run('add', '-f', '.devocd/draft/PROJECT.md').status, 0);
  assert.throws(() => cleanDraft(root), { code: 'ALREADY_TRACKED' });
  assert.ok(existsSync(join(root, '.devocd', 'draft', 'PROJECT.md')));
});

test('the CLI cleans the draft, reports it as JSON and rejects extra arguments', t => {
  const root = fixture(t, { '.devocd/draft/PROJECT.md': '# draft', '.devocd/state.json': '{}' });
  const ok = spawnSync(process.execPath, [cli, 'clean-draft', root], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.deepEqual(JSON.parse(ok.stdout), { removed: true });
  assert.ok(!existsSync(join(root, '.devocd', 'draft')));
  const bad = spawnSync(process.execPath, [cli, 'clean-draft', root, 'extra'], { encoding: 'utf8' });
  assert.equal(bad.status, 2);
});
