// @ts-check
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

/** Run git with argv only; throws on failure. */
export function git(/** @type {string} */ cwd, /** @type {string[]} */ ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout;
}

export function tmp(/** @type {string} */ prefix = 'devocd-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** A real temp git repo with one commit and local identity. */
export function makeRepo(/** @type {string} */ sub = '', /** @type {string} */ base = tmp('devocd-repo-')) {
  const dir = sub ? join(base, sub) : base;
  if (sub) mkdirSync(dir);
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.name', 'Test');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'commit.gpgsign', 'false');
  // Keep Git's background housekeeping from racing with read-only snapshots
  // of .git or fixture cleanup (notably maintenance.lock on macOS).
  git(dir, 'config', 'maintenance.auto', 'false');
  git(dir, 'config', 'gc.auto', '0');
  writeFileSync(join(dir, 'README.md'), 'hello\n');
  writeFileSync(join(dir, '.gitignore'), 'node_modules/\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'init');
  return dir;
}

/** Make a directory link (junction on Windows). Returns false when it cannot be created. */
export function tryLink(/** @type {string} */ target, /** @type {string} */ path) {
  try { mkdirSync(target, { recursive: true }); symlinkSync(target, path, 'junction'); return true; } catch { return false; }
}
