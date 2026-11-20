import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { makeTree } from './tree.mjs';
import { git } from './git.mjs';

/** Defaults shared by installed fixtures and draft/state-mutation tests.
 * Overrides intentionally allow invalid values for negative tests.
 * @param {Record<string, any>} [overrides]
 */
export function companyState(overrides = {}) {
  return { version: 1, kind: 'company', name: 'Test', description: '', parentFile: 'CLAUDE.md',
    keyRules: [], projects: [], sources: [], ...overrides };
}

/** @param {Record<string, any>} [overrides] */
export function projectState(overrides = {}) {
  return { version: 1, kind: 'project', id: 'api', companyRel: '..', teamFiles: [],
    approvedCommands: [], sources: [], ...overrides };
}

/** @typedef {{ state?: Record<string, any>, pages?: Record<string, string>, files?: Record<string, string>, git?: boolean }} ProjectOptions */
/** @typedef {{ company?: { name?: string, parentFile?: string, keyRules?: string[], projects?: string[], standards?: Record<string, string>, files?: Record<string, string> },
 * projects?: Record<string, ProjectOptions>, memory?: Record<string, string>, files?: Record<string, string> }} WorkspaceOptions */

/** Initialize only explicitly requested repositories, using the shared argv-only Git helper.
 * @param {string} dir
 * @param {boolean} [commit]
 */
function initGit(dir, commit = false) {
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.name', 'Test');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'commit.gpgsign', 'false');
  git(dir, 'config', 'maintenance.auto', 'false');
  git(dir, 'config', 'gc.auto', '0');
  if (commit) { git(dir, 'add', '.'); git(dir, 'commit', '-q', '-m', 'init'); }
}

/** Shared writer. Uninstalled live fixtures must not receive DevOCD state.
 * @param {string} root
 * @param {WorkspaceOptions} options
 * @param {boolean} [installed]
 */
function build(root, { company, projects = {}, memory, files = {} }, installed = true) {
  makeTree(root, {});
  if (company) {
    const registered = company.projects ?? Object.keys(projects);
    makeTree(root, {
      ...(installed ? { '.devocd/state.json': JSON.stringify(companyState({
        name: company.name ?? 'Test', parentFile: company.parentFile ?? 'CLAUDE.md', keyRules: company.keyRules ?? [],
        projects: registered.map(id => ({ id, path: id, description: '' })),
      })) } : {}),
      ...Object.fromEntries(Object.entries(company.standards ?? {}).map(([path, text]) => [`.devocd/standards/${path}`, text])),
      ...company.files,
    });
  }
  /** @type {Record<string, string>} */
  const paths = Object.create(null);
  for (const [id, project] of Object.entries(projects)) {
    const dir = join(root, id);
    paths[id] = dir;
    makeTree(dir, {
      ...(installed ? { '.devocd/state.json': JSON.stringify(projectState({ id,
        companyRel: relative(dir, root).split('\\').join('/') || '.', ...project.state })) } : {}),
      ...Object.fromEntries(Object.entries(project.pages ?? {}).map(([path, text]) => [`.devocd/${path}`, text])),
      ...project.files,
    });
  }
  const memoryDir = memory === undefined ? null : join(root, '.auto-memory');
  if (memoryDir) makeTree(memoryDir, memory);
  // Explicit files are last, allowing precise malformed/incomplete fixture layouts.
  makeTree(root, files);
  for (const [id, project] of Object.entries(projects)) if (project.git) initGit(paths[id]);
  return { root, company: company ? root : null,
    project: (/** @type {string} */ id) => {
      if (!Object.hasOwn(paths, id)) throw new Error(`Unknown fixture project: ${id}`);
      return paths[id];
    }, memoryDir };
}

/** A bare workspace creates no state; company/projects opt into valid installed defaults.
 * Cleanup is registered before writing so partial setup failures are cleaned too.
 * @param {Pick<import('node:test').TestContext, 'after'>} t
 * @param {WorkspaceOptions} [options]
 */
export function workspace(t, options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'devocd-workspace-'));
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  return build(root, options);
}

/** Compatibility adapter for live onboarding tests: caller owns root cleanup,
 * there is no installed state, and repositories need an initial commit.
 * @param {string} root
 * @param {{ projects: string[], monorepo?: boolean, teamClaudeMd?: Record<string, string>, teamAgentsMd?: Record<string, string> }} options
 */
export function makeCompany(root, options) {
  const projects = Object.fromEntries(options.projects.map(id => [id, { files: {
    'README.md': `# ${id}\n`, '.gitignore': 'node_modules/\n',
    ...(options.teamClaudeMd?.[id] === undefined ? {} : { 'CLAUDE.md': options.teamClaudeMd[id] }),
    ...(options.teamAgentsMd?.[id] === undefined ? {} : { 'AGENTS.md': options.teamAgentsMd[id] }),
  } }]));
  const result = build(join(root, 'company'), { company: {}, projects }, false);
  const repos = Object.fromEntries(options.projects.map(id => [id, result.project(id)]));
  if (options.monorepo) initGit(result.root, true);
  else for (const dir of Object.values(repos)) initGit(dir, true);
  return { company: result.root, repos };
}
