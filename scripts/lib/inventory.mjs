// @ts-check
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, posix, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { codedError, lstatOrNull, walk } from './fsutil.mjs';
import { insideWorkTree } from './protect.mjs';
import { scanSecrets } from './secrets.mjs';

const EXCLUDED = new Set(['.git', '.devocd', '.ssh', '.aws', '.azure', '.gnupg', 'node_modules', 'vendor', 'dist', 'build', 'coverage', '.next', '.venv', 'venv', '__pycache__', '.terraform']);
const PRIVATE = /^(?:\.env(?:\..*)?|\.npmrc|\.netrc|credentials(?:\..*)?|id_rsa|id_ed25519)$|\.(?:pem|key|p12|pfx)$/i;

// Irrelevant bulk: never source knowledge, so it is classified and skipped rather than
// counted as a coverage gap. Only unread SOURCE files make an inventory incomplete.
const LOCKFILES = new Set(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'poetry.lock', 'pipfile.lock', 'cargo.lock', 'composer.lock', 'gemfile.lock', 'go.sum', 'flake.lock', 'bun.lockb', 'uv.lock']);
const BULK = /\.(?:log(?:\.\d+)?|out|png|jpe?g|gif|webp|ico|bmp|tiff?|psd|woff2?|ttf|otf|eot|zip|tar|gz|tgz|bz2|xz|7z|rar|jar|war|mp[34]|m4a|wav|avi|mov|webm|mkv|pdf|docx?|xlsx?|pptx?|exe|dll|so|dylib|bin|dat|sqlite3?|db|pyc|class|wasm|map|min\.(?:js|css))$/i;
const isBulk = (/** @type {string} */ name) => LOCKFILES.has(name.toLowerCase()) || BULK.test(name);

/** The cell sources of a notebook, with outputs and attachments left behind; null when it isn't one. */
function notebookSource(/** @type {Buffer} */ bytes) {
  let parsed;
  try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { return null; }
  if (!Array.isArray(parsed?.cells)) return null;
  return parsed.cells.map((/** @type {any} */ c) => {
    const source = Array.isArray(c?.source) ? c.source.join('') : typeof c?.source === 'string' ? c.source : '';
    return `<<${typeof c?.cell_type === 'string' ? c.cell_type : ''}>>\n${source}`;
  }).join('\n');
}

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
  let bytesRead = 0;
  let complete = true;
  const traversal = walk(root, {
    maxEntries: 20000, order: 'directory-stack',
    onDirectory: rel => directories.push(rel || '.'),
    onReadError: (_, rel) => { skipped.push({ path: rel || '.', reason: 'unreadable-directory' }); complete = false; },
    // Classification and content budgets stay here; traversal never reads file content.
    onEntry: (id, entry) => {
      if (scanSecrets(id).length) { skipped.push({ path: '(filename withheld)', reason: 'secret-filename' }); return false; }
      if (entry.isSymbolicLink()) { skipped.push({ path: id, reason: 'link' }); return false; }
      if (EXCLUDED.has(entry.name) || PRIVATE.test(entry.name)) { skipped.push({ path: id, reason: 'excluded' }); return false; }
      if (entry.isDirectory()) {
        // A nested repository is a separate project, never silently traverse it.
        if (lstatOrNull(join(root, id, '.git'))) { skipped.push({ path: id, reason: 'nested-repository' }); return false; }
        if (allowed && !allowedDirectories.has(id)) { skipped.push({ path: id, reason: 'ignored-or-empty' }); return false; }
        return true;
      }
      if (!entry.isFile()) { skipped.push({ path: id, reason: 'not-regular' }); return false; }
      if (allowed && !allowed.has(id)) { skipped.push({ path: id, reason: 'git-ignored' }); return false; }
      if (isBulk(entry.name)) { skipped.push({ path: id, reason: 'irrelevant-bulk' }); return false; }
      const size = lstatOrNull(join(root, id))?.size;
      if (/\.ipynb$/i.test(entry.name)) {
        // Notebooks are read by cell source: stored outputs neither block coverage nor shift the hash.
        if (size === undefined || size > 8 * 1024 * 1024) { files.push({ path: id, status: 'not-read', reason: size === undefined ? 'unreadable' : 'size-limit' }); complete = false; return false; }
        let source = null;
        let raw = null;
        try { raw = readFileSync(join(root, id)); source = notebookSource(raw); } catch { /* unreadable */ }
        if (source === null || raw === null) { files.push({ path: id, status: 'not-read', reason: 'invalid-notebook' }); complete = false; return false; }
        if (bytesRead + source.length > 16 * 1024 * 1024) { files.push({ path: id, status: 'not-read', reason: 'size-limit' }); complete = false; return false; }
        bytesRead += source.length;
        // Scan the whole decoded file: a secret in a stored OUTPUT cell must also withhold the notebook.
        if (scanSecrets(source).length || scanSecrets(raw.toString('utf8')).length) { skipped.push({ path: id, reason: 'secret-content' }); return false; }
        files.push({ path: id, status: 'available', sha256: createHash('sha256').update(source).digest('hex'), notebook: true });
        return false;
      }
      if (size === undefined || size > 256 * 1024 || bytesRead + size > 16 * 1024 * 1024) {
        files.push({ path: id, status: 'not-read', reason: size === undefined ? 'unreadable' : 'size-limit' }); complete = false; return false;
      }
      try {
        const bytes = readFileSync(join(root, id));
        bytesRead += bytes.length;
        const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        if (text.includes('\0')) { skipped.push({ path: id, reason: 'binary' }); return false; }
        if (scanSecrets(text).length) { skipped.push({ path: id, reason: 'secret-content' }); return false; }
        files.push({ path: id, status: 'available', sha256: createHash('sha256').update(bytes).digest('hex') });
      } catch { files.push({ path: id, status: 'not-read', reason: 'unreadable-or-binary' }); complete = false; }
      return false;
    },
  });
  if (traversal.truncated) throw codedError('KNOWLEDGE_LIMIT', 'Inventory exceeds 20000 entries; split into explicit project roots. No complete inventory was produced.');
  return { version: 1, git, complete, directories: directories.sort(), files: files.sort((a, b) => a.path.localeCompare(b.path)), skipped: skipped.sort((a, b) => a.path.localeCompare(b.path)) };
}
