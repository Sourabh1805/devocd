import { workspace } from '../helpers/workspace.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, writeFileSync, statSync, readFileSync } from 'node:fs';
import { join, dirname, delimiter } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const bin = join(here, '..', '..', 'bin', 'devocd');
const cmd = join(here, '..', '..', 'bin', 'devocd.cmd');
const script = join(here, '..', '..', 'scripts', 'devocd.mjs');

/** @param {import('node:test').TestContext} t */
function tmp(t) {
  const root = workspace(t).root;
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

  // T119: a missing state and a missing register path are one clear line, exit 1, no stack.
  const noState = run(script, ['context-resolve', root, 'query.json']);
  assert.equal(noState.status, 1);
  assert.match(noState.stderr, /^error: no DevOCD state at .+; run setup$/m);
  assert.doesNotMatch(noState.stderr, /\n\s+at .+:\d+:\d+/);
  const missing = run(script, ['register', root, 'api', 'repos/missing', 'd']);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /^error: project path 'repos\/missing' does not exist under .+$/m);
  assert.doesNotMatch(missing.stderr, /\n\s+at .+:\d+:\d+/);
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

function installed(t) {
  const root = tmp(t);
  const plugin = join(root, 'installed plugin');
  const project = join(root, 'project with spaces');
  // Copy only runtime components; no dependence on the repository package.json.
  for (const component of ['bin', 'scripts']) {
    cpSync(join(here, '..', '..', component), join(plugin, component), { recursive: true });
  }
  mkdirSync(project);
  writeFileSync(join(project, 'README.md'), '# Empty project\n');
  assert.equal(existsSync(join(root, 'package.json')), false);
  assert.equal(existsSync(join(plugin, 'package.json')), false);
  // Windows environment names are case-insensitive. Avoid competing PATH/Path
  // keys when Node serializes the environment for the child process.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toLowerCase() !== 'path'));
  const inheritedPath = Object.entries(process.env).find(([key]) => key.toLowerCase() === 'path')?.[1] ?? '';
  env.PATH = [join(plugin, 'bin'), dirname(process.execPath), inheritedPath].join(delimiter);
  env.DEVOCD_TEST_PROJECT = project;
  return { plugin, project, env };
}

function shellRun(command, fixture) {
  const windows = process.platform === 'win32';
  return spawnSync(windows ? (process.env.ComSpec ?? 'cmd.exe') : '/bin/sh',
    windows ? ['/d', '/s', '/c', command] : ['-c', command], {
      cwd: fixture.project, env: fixture.env, encoding: 'utf8',
      windowsVerbatimArguments: windows,
    });
}

test('installed plugin runs without repository package metadata from another cwd', t => {
  const fixture = installed(t);
  const result = run(join(fixture.plugin, 'bin', 'devocd'),
    ['detect-commands', fixture.project, '--json'], { cwd: fixture.project });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  assert.deepEqual(JSON.parse(result.stdout), { detected: [], suggestedForApproval: [] });
});

test('bare command resolves through the platform shell PATH and preserves arguments and failures', t => {
  const fixture = installed(t);
  const target = process.platform === 'win32' ? '"%DEVOCD_TEST_PROJECT%"' : '"$DEVOCD_TEST_PROJECT"';
  const result = shellRun(`devocd detect-commands ${target} --json`, fixture);
  assert.equal(result.status, 0, result.stderr || String(result.error));
  assert.deepEqual(JSON.parse(result.stdout), { detected: [], suggestedForApproval: [] });
  const failed = shellRun('devocd no-such-command', fixture);
  const direct = run(join(fixture.plugin, 'scripts', 'devocd.mjs'), ['no-such-command']);
  assert.equal(failed.status, 2, failed.stderr || String(failed.error));
  assert.equal(failed.stdout, direct.stdout);
  assert.equal(failed.stderr, direct.stderr);
});

test('Windows cmd shim executes from a spaced installation path', { skip: process.platform !== 'win32' }, t => {
  const fixture = installed(t);
  const result = shellRun('devocd.cmd detect-commands "%DEVOCD_TEST_PROJECT%" --json', fixture);
  assert.equal(result.status, 0, result.stderr || String(result.error));
  assert.deepEqual(JSON.parse(result.stdout), { detected: [], suggestedForApproval: [] });
  assert.equal(shellRun('devocd.cmd no-such-command', fixture).status, 2);
});
