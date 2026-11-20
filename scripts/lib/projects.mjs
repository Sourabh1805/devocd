import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { codedError, lstatOrNull } from './fsutil.mjs';
import { scanSecrets } from './secrets.mjs';

const EXCLUDED = new Set(['node_modules', 'vendor', 'dist', 'build', 'coverage', 'venv', '__pycache__']);

/** Discover immediate project candidates without entering source trees or requiring Git.
 * @param {string} dir
 */
export function discoverProjects(dir) {
  const root = resolve(dir);
  const stat = lstatOrNull(root);
  if (!stat?.isDirectory() || stat.isSymbolicLink()) throw codedError('BAD_TARGET', 'Project discovery requires a real parent directory.');
  const entries = readdirSync(root, { withFileTypes: true });
  if (entries.length > 20000) throw codedError('KNOWLEDGE_LIMIT', 'Parent exceeds 20000 entries; choose a smaller workspace.');
  const projects = [];
  const skipped = [];
  for (const entry of entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
    if (scanSecrets(entry.name).length) { skipped.push({ path: '(filename withheld)', reason: 'secret-filename' }); continue; }
    if (entry.isSymbolicLink()) { skipped.push({ path: entry.name, reason: 'link' }); continue; }
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.') || EXCLUDED.has(entry.name)) { skipped.push({ path: entry.name, reason: 'excluded' }); continue; }
    projects.push({ path: entry.name, gitMarker: !!lstatOrNull(join(root, entry.name, '.git')) });
  }
  return { version: 1, projects, skipped };
}
