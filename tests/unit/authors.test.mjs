import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { badIdentities } from '../tools/authors.mjs';
import { workspace } from '../helpers/workspace.mjs';
import { git } from '../helpers/git.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, '..', 'tools', 'authors.mjs');

const CASES = [
  { name: 'login-only noreply author', author: 'sourabh@users.noreply.github.com', committer: 'noreply@github.com', bad: true },
  { name: 'numeric noreply author', author: '35189997+Sourabh1805@users.noreply.github.com', committer: 'noreply@github.com', bad: false },
  { name: 'GitHub web merge', author: 'noreply@github.com', committer: 'noreply@github.com', bad: false },
  { name: 'ordinary Gmail address', author: 'someone@gmail.com', committer: 'noreply@github.com', bad: false },
  { name: 'reserved example domain', author: 't46@example.invalid', committer: 'noreply@github.com', bad: true },
  { name: 'bad committer behind a good author', author: '35189997+Sourabh1805@users.noreply.github.com', committer: 'sourabh@users.noreply.github.com', bad: true },
  { name: 'uppercase login-only noreply', author: 'SOURABH@USERS.NOREPLY.GITHUB.COM', committer: 'noreply@github.com', bad: true },
];

for (const c of CASES) {
  test(`authors: ${c.name} is ${c.bad ? 'bad' : 'fine'}`, () => {
    const entries = [{ hash: 'a'.repeat(40), author: c.author, committer: c.committer }];
    assert.equal(badIdentities(entries).length, c.bad ? 1 : 0);
  });
}

test('authors CLI names only the bad commit and uses exit 1', t => {
  const root = workspace(t).root;
  git(root, 'init', '-q');
  git(root, 'config', 'user.name', 'Test');
  git(root, 'config', 'user.email', '35189997+Sourabh1805@users.noreply.github.com');
  git(root, 'config', 'commit.gpgsign', 'false');
  writeFileSync(join(root, 'README.md'), 'one\n');
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'good');
  const good = git(root, 'rev-parse', 'HEAD').trim();
  writeFileSync(join(root, 'README.md'), 'two\n');
  git(root, 'add', '.');
  git(root, '-c', 'user.email=sourabh@users.noreply.github.com', 'commit', '-q', '-m', 'bad');
  const bad = git(root, 'rev-parse', 'HEAD').trim();
  const base = git(root, 'rev-list', '--max-parents=0', 'HEAD').trim();
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' });

  const dirty = run(good, 'HEAD');
  assert.equal(dirty.status, 1);
  const lines = dirty.stdout.trim().split('\n');
  assert.equal(lines.length, 1);
  assert.ok(lines[0].startsWith(bad.slice(0, 7)));
  assert.match(lines[0], /author=sourabh@users\.noreply\.github\.com/);
  assert.match(lines[0], /committer=sourabh@users\.noreply\.github\.com/);

  const clean = run(base, good);
  assert.equal(clean.status, 0);
  assert.equal(clean.stdout, '');

  const wrongArguments = run(good);
  assert.equal(wrongArguments.status, 2);
});
