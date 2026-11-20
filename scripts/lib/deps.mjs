// Read-only detection of cross-repository imports: git dependencies, workspaces,
// local paths, submodules and nested repositories, plus the artifacts (images, S3, registries,
// Terraform modules, Helm charts) the project consumes or produces. Registry package dependencies stay out:
// they are derivable from the manifest itself and are not cross-project links.
// Values are sanitized text for JSON output; nothing is cloned, fetched or executed.
import { realpathSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, posix, relative, resolve } from 'node:path';
import { assertSafeTarget, codedError, lstatOrNull, isRegularFile, readTextOrNull, toPosix, walk } from './fsutil.mjs';
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

/** Case-insensitive path comparison on Windows, like the rest of the CLI. */
const samePath = (/** @type {string} */ a, /** @type {string} */ b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);

/** A relative path that leaves its folder, or an absolute one. */
const escapes = (/** @type {string} */ rel) => rel === '' || isAbsolute(rel) || rel.split(/[\\/]/)[0] === '..';

/** A git URL reduced to its repository name, compared with a registered project's id or folder name. */
function repoSlug(/** @type {string | undefined} */ ref) {
  const clean = String(ref ?? '').split(/[?#]/)[0].replace(/\/+$/, '');
  return (clean.split('/').pop() ?? '').replace(/\.git$/i, '').toLowerCase();
}

/**
 * The PROJECT.md of a registered project, or null. Only a regular file inside the company folder
 * qualifies: a stale pointer, a link or a path that leaves the company is ignored, never read.
 * @param {any} project @param {string} companyDir
 * @returns {string | null}
 */
function registryTarget(project, companyDir) {
  if (!project || typeof project.id !== 'string' || typeof project.path !== 'string') return null;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(project.id)) return null;
  if (project.path === '' || project.path.includes('\\') || isAbsolute(project.path) || /^[a-z]:/i.test(project.path)) return null;
  if (project.path.split('/').some((part) => part === '' || part === '.' || part === '..')) return null;
  const dir = resolve(companyDir, project.path);
  if (escapes(relative(companyDir, dir))) return null;
  const target = join(dir, '.devocd', 'PROJECT.md');
  if (!isRegularFile(target)) return null;
  try {
    if (escapes(relative(realpathSync(companyDir), realpathSync(target)))) return null;
  } catch { return null; }
  return target;
}

/**
 * The registered project a dependency points at: its local path when it has one, else the
 * repository name in a git URL (or a workspace package name) matched against the registry id or
 * folder name. This stays inside the company and reads no other project's files.
 * ponytail: git deps match by repository name, not by the registered project's remote, because
 * reading another project's .git/config is forbidden here; add remote-URL matching if the
 * company registry ever records each project's remote.
 * @param {{ name: string, kind: string, ref?: string, path?: string }} dep
 * @param {{ project: any, target: string }[]} registry
 * @param {string} root @param {string} companyDir
 */
function dependencyTarget(dep, registry, root, companyDir) {
  if (dep.path !== undefined) {
    const abs = resolve(root, dep.path);
    const hit = registry.find((x) => samePath(abs, resolve(companyDir, x.project.path)));
    if (hit) return hit;
  }
  const names = dep.kind === 'git-dep' || dep.kind === 'submodule'
    ? [repoSlug(dep.ref)]
    : dep.kind === 'workspace' ? [String(dep.name).toLowerCase(), String(dep.name).split('/').pop().toLowerCase()] : [];
  const wanted = names.filter(Boolean);
  if (!wanted.length) return null;
  return registry.find((x) => wanted.includes(x.project.id.toLowerCase()) || wanted.includes(posix.basename(x.project.path).toLowerCase())) ?? null;
}

/**
 * Re-resolve the cross-project links of a project's PROJECT.md `## Dependencies` section against the
 * current company registry. A dependency that now matches a registered project gains a link to that
 * project's PROJECT.md, company-relative; every other byte is left alone and a second run changes
 * nothing. Never reads another project's files: a registry target is only checked to be a regular
 * file inside the company folder. Called by add-project on a rerun, after the approved draft is applied.
 * @param {string} projectDir
 * @returns {{ project: string, changed: boolean, links: { dependency: string, kind: string, project: string, line: number, link: string }[] }}
 */
export function resolveProjectLinks(projectDir) {
  const root = resolve(projectDir);
  const stateFile = join(root, '.devocd', 'state.json');
  const stateText = readTextOrNull(stateFile);
  if (stateText === null) throw codedError('NO_STATE', `no readable .devocd/state.json in ${toPosix(root)}`, 'Run link-projects on a project add-project has set up.');
  let state;
  try { state = JSON.parse(stateText); }
  catch { throw codedError('NO_STATE', `${toPosix(stateFile)} is not valid JSON; nothing was changed`, 'Fix the JSON by hand, then run this again.'); }
  if (!state || state.kind !== 'project' || typeof state.companyRel !== 'string' || isAbsolute(state.companyRel)) {
    throw codedError('NO_STATE', `${toPosix(stateFile)} is not a project state file`, 'Run link-projects on a project folder, not a company folder.');
  }
  const companyDir = resolve(root, state.companyRel);
  const companyText = readTextOrNull(join(companyDir, '.devocd', 'state.json'));
  if (companyText === null) {
    throw codedError('NO_STATE', `the company folder ${toPosix(companyDir)} has no readable .devocd/state.json`, 'Register this project in its company folder first.');
  }
  let company;
  try { company = JSON.parse(companyText); }
  catch { throw codedError('NO_STATE', 'the company state is not valid JSON; nothing was changed', 'Fix it by hand, then run this again.'); }
  if (!company || company.kind !== 'company' || !Array.isArray(company.projects)) {
    throw codedError('NO_STATE', `${toPosix(join(companyDir, '.devocd', 'state.json'))} is not a company state file`, 'Run link-projects on a project inside an installed company.');
  }
  const projectMd = join(root, '.devocd', 'PROJECT.md');
  const text = readTextOrNull(projectMd);
  if (text === null) {
    throw codedError('NOT_REGULAR', `${toPosix(projectMd)} is missing, a link or not a regular file; nothing was changed`, 'Write PROJECT.md first, then run this again.');
  }
  const lines = text.split('\n');
  const start = lines.findIndex((line) => /^##[ \t]+Dependencies[ \t\r]*$/.test(line));
  if (start < 0) return { project: toPosix(projectMd), changed: false, links: [] };
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) if (/^ {0,3}#{1,6}[ \t]/.test(lines[i])) { end = i; break; }

  const registry = company.projects
    .map((project) => ({ project, target: registryTarget(project, companyDir) }))
    .filter((x) => x.target !== null);
  const linkable = detectDependencies(root).dependencies
    .map((dep) => ({ dep, hit: dependencyTarget(dep, registry, root, companyDir) }))
    .filter((x) => x.hit !== null);

  /** @type {{ dependency: string, kind: string, project: string, line: number, link: string }[]} */
  const links = [];
  const linkedTargets = new Set();
  for (let i = start + 1; i < end; i++) {
    const line = lines[i];
    const eol = line.endsWith('\r') ? '\r' : '';
    const body = eol ? line.slice(0, -1) : line;
    const named = /^[ \t]*[-*+] `([^`]+)`/.exec(body);
    if (!named || /\[[^\]]*\]\(/.test(body)) continue; // a bullet with a link is kept, never duplicated
    const candidates = linkable.filter((x) => x.dep.name === named[1]);
    if (!candidates.length) continue;
    const pick = candidates.find((x) => x.dep.path !== undefined && body.includes(String(x.dep.path))) ?? candidates[0];
    if (samePath(pick.hit.target, projectMd) || linkedTargets.has(pick.hit.target)) continue; // no self-link, no duplicate
    linkedTargets.add(pick.hit.target);
    const link = toPosix(relative(join(root, '.devocd'), pick.hit.target));
    const encoded = link.split('/').map((seg) => (seg === '.' || seg === '..' ? seg : encodeURIComponent(seg))).join('/');
    const href = encoded.startsWith('.') ? encoded : './' + encoded;
    lines[i] = `${body} — [${pick.hit.project.id} project](${href})${eol}`;
    links.push({ dependency: pick.dep.name, kind: pick.dep.kind, project: pick.hit.project.id, line: i + 1, link: href });
  }
  const changed = links.length > 0;
  if (changed) {
    assertSafeTarget(projectMd);
    writeFileSync(projectMd, lines.join('\n'));
  }
  return { project: toPosix(projectMd), changed, links };
}
