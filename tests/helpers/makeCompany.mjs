// @ts-check
import { join } from 'node:path';
import { makeTree } from './tree.mjs';
import { git } from './git.mjs';

/**
 * Build a company folder with one real git repo per project (or one repo for the whole folder when monorepo).
 * Every repo has a local identity and one commit. The company folder itself is never a repo unless monorepo.
 * @param {string} root
 * @param {{ projects: string[], monorepo?: boolean, teamClaudeMd?: Record<string, string>, teamAgentsMd?: Record<string, string> }} o
 * @returns {{ company: string, repos: Record<string, string> }}
 */
export function makeCompany(root, o) {
  const company = join(root, 'company');
  /** @type {Record<string, string>} */ const repos = {};
  /** @type {Record<string, string>} */ const files = {};
  for (const id of o.projects) {
    repos[id] = join(company, id);
    files[`${id}/README.md`] = `# ${id}\n`;
    files[`${id}/.gitignore`] = 'node_modules/\n';
    if (o.teamClaudeMd?.[id] !== undefined) files[`${id}/CLAUDE.md`] = o.teamClaudeMd[id];
    if (o.teamAgentsMd?.[id] !== undefined) files[`${id}/AGENTS.md`] = o.teamAgentsMd[id];
  }
  makeTree(company, files);
  const initRepo = (/** @type {string} */ dir) => {
    git(dir, 'init', '-q');
    git(dir, 'config', 'user.name', 'Test');
    git(dir, 'config', 'user.email', 'test@example.com');
    git(dir, 'config', 'commit.gpgsign', 'false');
    git(dir, 'add', '.');
    git(dir, 'commit', '-q', '-m', 'init');
  };
  if (o.monorepo) initRepo(company);
  else for (const dir of Object.values(repos)) initRepo(dir);
  return { company, repos };
}
