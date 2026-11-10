// @ts-check
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, posix, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { codedError, lstatOrNull } from './fsutil.mjs';
import { insideWorkTree } from './protect.mjs';
import { scanSecrets } from './secrets.mjs';

const EXCLUDED = new Set(['.git', '.devocd', '.ssh', '.aws', '.azure', '.gnupg', 'node_modules', 'vendor', 'dist', 'build', 'coverage', '.next', '.venv', 'venv', '__pycache__', '.terraform']);
const PRIVATE = /^(?:\.env(?:\..*)?|\.npmrc|\.netrc|credentials(?:\..*)?|id_rsa|id_ed25519)$|\.(?:pem|key|p12|pfx)$/i;

/** Inventory every eligible directory, without following links or running repository code.
 * Hashes identify the bytes available for evidence; they do not assert that an agent read them.
 * @param {string} dir
 */
export function inventoryKnowledge(dir) {
  const root = resolve(dir);
  const st = lstatOrNull(root);
  if (!st?.isDirectory() || st.isSymbolicLink()) throw codedError('BAD_TARGET', 'Inventory requires a real directory.');
  const git = insideWorkTree(root);
  let allowed = null;
  const allowedDirectories = new Set();
  if (git) {
    const run = spawnSync('git', ['-C', root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', '.'], { encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
    if (run.error || run.status !== 0) throw codedError('GIT_FAILED', 'Cannot enumerate repository files.');
    allowed = new Set(run.stdout.split('\0').filter(Boolean));
    for (const file of allowed) {
      for (let parent = posix.dirname(file); parent !== '.'; parent = posix.dirname(parent)) allowedDirectories.add(parent);
    }
  }
  const files = [];
  const directories = [];
  const skipped = [];
  const pending = ['.'];
  let entriesSeen = 0;
  let bytesRead = 0;
  let complete = true;
  while (pending.length) {
    const path = pending.pop();
    let entries;
    try { entries = readdirSync(join(root, path), { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0); }
    catch { skipped.push({ path, reason: 'unreadable-directory' }); complete = false; continue; }
    directories.push(path);
    for (const entry of entries) {
      if (++entriesSeen > 20000) throw codedError('KNOWLEDGE_LIMIT', 'Inventory exceeds 20000 entries; split into explicit project roots. No complete inventory was produced.');
      const id = path === '.' ? entry.name : `${path}/${entry.name}`;
      if (scanSecrets(id).length) { skipped.push({ path: '(filename withheld)', reason: 'secret-filename' }); continue; }
      if (entry.isSymbolicLink()) { skipped.push({ path: id, reason: 'link' }); continue; }
      if (EXCLUDED.has(entry.name) || PRIVATE.test(entry.name)) { skipped.push({ path: id, reason: 'excluded' }); continue; }
      if (entry.isDirectory()) {
        // A nested repository is a separate project, never silently traverse it.
        if (lstatOrNull(join(root, id, '.git'))) { skipped.push({ path: id, reason: 'nested-repository' }); continue; }
        if (allowed && !allowedDirectories.has(id)) { skipped.push({ path: id, reason: 'ignored-or-empty' }); continue; }
        pending.push(id);
        continue;
      }
      if (!entry.isFile()) { skipped.push({ path: id, reason: 'not-regular' }); continue; }
      if (allowed && !allowed.has(id)) { skipped.push({ path: id, reason: 'git-ignored' }); continue; }
      const size = lstatOrNull(join(root, id))?.size;
      if (size === undefined || size > 256 * 1024 || bytesRead + size > 16 * 1024 * 1024) {
        files.push({ path: id, status: 'not-read', reason: size === undefined ? 'unreadable' : 'size-limit' }); complete = false; continue;
      }
      try {
        const bytes = readFileSync(join(root, id));
        bytesRead += bytes.length;
        const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        if (text.includes('\0')) { skipped.push({ path: id, reason: 'binary' }); continue; }
        if (scanSecrets(text).length) { skipped.push({ path: id, reason: 'secret-content' }); continue; }
        files.push({ path: id, status: 'available', sha256: createHash('sha256').update(bytes).digest('hex') });
      } catch { files.push({ path: id, status: 'not-read', reason: 'unreadable-or-binary' }); complete = false; }
    }
  }
  return { version: 1, git, complete, directories: directories.sort(), files: files.sort((a, b) => a.path.localeCompare(b.path)), skipped: skipped.sort((a, b) => a.path.localeCompare(b.path)) };
}
