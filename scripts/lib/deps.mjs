// Read-only detection of cross-repository imports: git dependencies, workspaces,
// local paths, submodules and nested repositories, plus the artifacts (images, S3, registries,
// Terraform modules, Helm charts) the project consumes or produces. Registry package dependencies stay out:
// they are derivable from the manifest itself and are not cross-project links.
// Values are sanitized text for JSON output; nothing is cloned, fetched or executed.
import { join } from 'node:path';
import { lstatOrNull, readTextOrNull, walk } from './fsutil.mjs';
import { detectArtifacts } from './artifacts.mjs';

const EXCLUDED = new Set(['.git', '.devocd', 'node_modules', 'vendor', 'dist', 'build', 'coverage', '.next', '.venv', 'venv', '__pycache__', '.terraform']);

/** Printable, shell-inert text: credentials, quotes, backticks and expansion characters are removed. */
function sanitize(/** @type {unknown} */ value) {
  return String(value)
    .replace(/\/\/[^@/\s]+@/, '//')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/["'`$\\;|&<>(){}]/g, '')
    .trim().slice(0, 200);
}

/** @param {string} root @param {string} name */
const read = (root, name) => readTextOrNull(join(root, name));

/**
 * @param {string} root
 * @returns {{ dependencies: { name: string, kind: string, ref?: string, path?: string, source: string }[], artifacts: import('./artifacts.mjs').Artifact[], artifactsTruncated: boolean }}
 */
export function detectDependencies(root) {
  /** @type {Map<string, { name: string, kind: string, ref?: string, path?: string, source: string }>} */
  const found = new Map();
  const add = (/** @type {{ name: string, kind: string, ref?: string, path?: string, source: string }} */ dep) => {
    const name = sanitize(dep.name);
    if (!name) return;
    // A nested repository or submodule is identified by where it lives: two different repos can share a folder name.
    const key = `${name}\0${dep.kind}\0${dep.path === undefined ? '' : sanitize(dep.path)}`;
    if (!found.has(key)) found.set(key, { ...dep, name, ref: dep.ref === undefined ? undefined : sanitize(dep.ref), path: dep.path === undefined ? undefined : sanitize(dep.path) });
  };

  const pkgText = read(root, 'package.json');
  if (pkgText) {
    let pkg; try { pkg = JSON.parse(pkgText); } catch { pkg = null; }
    for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
      const deps = pkg?.[section];
      if (!deps || typeof deps !== 'object') continue;
      for (const [name, value] of Object.entries(deps)) {
        if (typeof value !== 'string') continue;
        if (value.startsWith('workspace:')) add({ name, kind: 'workspace', ref: value, source: 'package.json' });
        else if (/^(git\+|git:|github:|gitlab:|bitbucket:)/.test(value) || /\.git(#|$)/.test(value)) add({ name, kind: 'git-dep', ref: value, source: 'package.json' });
        else if (/^(file:|link:)/.test(value)) add({ name, kind: 'local-path', path: value.replace(/^(file:|link:)/, ''), source: 'package.json' });
      }
    }
  }

  for (const file of ['requirements.txt', 'requirements-dev.txt']) {
    const text = read(root, file);
    if (!text) continue;
    for (const m of text.matchAll(/^\s*([A-Za-z0-9_.-]+)\s*@\s*(git\+\S+)/gm)) add({ name: m[1], kind: 'git-dep', ref: m[2], source: file });
    for (const m of text.matchAll(/^\s*-e\s+(git\+\S+?)#egg=([A-Za-z0-9_.-]+)/gm)) add({ name: m[2], kind: 'git-dep', ref: m[1], source: file });
  }

  for (const file of ['pyproject.toml', 'Cargo.toml']) {
    const text = read(root, file);
    if (!text) continue;
    for (const m of text.matchAll(/^\s*([A-Za-z0-9_.-]+)\s*=\s*\{([^}]*)\}/gm)) {
      const [, name, body] = m;
      const git = /\bgit\s*=\s*"([^"]+)"/.exec(body);
      const path = /\bpath\s*=\s*"([^"]+)"/.exec(body);
      if (git) add({ name, kind: 'git-dep', ref: git[1], source: file });
      else if (path) add({ name, kind: 'local-path', path: path[1], source: file });
    }
  }

  const gomod = read(root, 'go.mod');
  if (gomod) {
    for (const m of gomod.matchAll(/^\s*replace\s+(\S+)(?:\s+\S+)?\s*=>\s*(\.\.?\/\S*)/gm)) add({ name: m[1], kind: 'local-path', path: m[2], source: 'go.mod' });
  }

  const composerText = read(root, 'composer.json');
  if (composerText) {
    let composer; try { composer = JSON.parse(composerText); } catch { composer = null; }
    const repos = Array.isArray(composer?.repositories) ? composer.repositories : [];
    for (const repo of repos) {
      if (repo?.type === 'vcs' && typeof repo.url === 'string') add({ name: repo.url.split('/').pop()?.replace(/\.git$/, '') ?? repo.url, kind: 'git-dep', ref: repo.url, source: 'composer.json' });
      if (repo?.type === 'path' && typeof repo.url === 'string') add({ name: repo.url.split('/').pop() ?? repo.url, kind: 'local-path', path: repo.url, source: 'composer.json' });
    }
  }

  const gitmodules = read(root, '.gitmodules');
  if (gitmodules) {
    for (const m of gitmodules.matchAll(/\[submodule "([^"]+)"\]([^[]*)/g)) {
      const path = /\bpath\s*=\s*(.+)/.exec(m[2])?.[1]?.trim();
      const url = /\burl\s*=\s*(.+)/.exec(m[2])?.[1]?.trim();
      add({ name: m[1], kind: 'submodule', ref: url, path, source: '.gitmodules' });
    }
  }

  // Nested repositories: separate projects vendored or cloned inside this one.
  walk(root, {
    maxEntries: 5000, order: 'directory-stack', sortEntries: false,
    onReadError: () => {}, onEntry: (_, entry) => entry.isDirectory(),
    skipDir: (id, name) => {
      if (EXCLUDED.has(name)) return true;
      if (!lstatOrNull(join(root, id, '.git'))) return false;
      add({ name, kind: 'nested-repo', path: id, source: 'filesystem' });
      return true;
    },
  });

  const dependencies = [...found.values()]
    .map(d => JSON.parse(JSON.stringify(d)))
    .sort((a, b) => a.name.localeCompare(b.name) || a.kind.localeCompare(b.kind));
  const { artifacts, truncated } = detectArtifacts(root);
  return { dependencies, artifacts, artifactsTruncated: truncated };
}
