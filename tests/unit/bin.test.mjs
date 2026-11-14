import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, statSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const bin = join(here, '..', '..', 'plugin', 'bin', 'devocd');
const cmd = join(here, '..', '..', 'plugin', 'bin', 'devocd.cmd');
const script = join(here, '..', '..', 'plugin', 'scripts', 'devocd.mjs');

/** @param {import('node:test').TestContext} t */
function tmp(t) {
  const root = mkdtempSync(join(tmpdir(), 'devocd-bin-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

const run = (file, args, opts = {}) =>
  spawnSync(process.execPath, [file, ...args], { encoding: 'utf8', ...opts });

test('launcher files exist as regular files', () => {
  assert.ok(statSync(bin).isFile());
  assert.ok(statSync(cmd).isFile());
});

test('detect-commands on a README-only folder returns empty lists', t => {
  const root = tmp(t);
  writeFileSync(join(root, 'README.md'), '# x\n');
  const r = run(bin, ['detect-commands', root, '--json']);
  assert.equal(r.status, 0);
  assert.deepEqual(JSON.parse(r.stdout), { detected: [], suggestedForApproval: [] });
});

test('output and exit status match the script, including unknown commands', t => {
  const root = tmp(t);
  writeFileSync(join(root, 'README.md'), '# x\n');
  for (const args of [['detect-commands', root, '--json'], ['no-such-command']]) {
    const a = run(bin, args);
    const b = run(script, args);
    assert.equal(a.status, b.status);
    assert.equal(a.stdout, b.stdout);
    assert.equal(a.stderr, b.stderr);
  }
  assert.equal(run(bin, ['no-such-command']).status, 2);
  assert.equal(run(script, ['no-such-command']).status, 2);
});

test('works from a different working directory', t => {
  const root = tmp(t);
  writeFileSync(join(root, 'README.md'), '# x\n');
  const r = run(bin, ['detect-commands', root, '--json'], { cwd: root });
  assert.equal(r.status, 0);
  assert.deepEqual(JSON.parse(r.stdout), { detected: [], suggestedForApproval: [] });
});

test('shebang and cmd shim content', () => {
  assert.equal(readFileSync(bin, 'utf8').split(/\r?\n/)[0], '#!/usr/bin/env node');
  const c = readFileSync(cmd, 'utf8');
  assert.ok(c.includes('%~dp0devocd'));
  assert.ok(c.includes('%*'));
});

test('launcher has an executable bit', { skip: process.platform === 'win32' }, () => {
  assert.ok(statSync(bin).mode & 0o111);
});
