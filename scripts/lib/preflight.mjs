import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { countLines, isRegularFile, readTextOrNull, toPosix, walk } from './fsutil.mjs';
import { insideWorkTree } from './protect.mjs';
import { policyRepoProblem, policyRepoStatus } from './policyrepo.mjs';

const MAX_LEVELS = 4;
const SKIP = new Set(['.git', 'node_modules', '.devocd']);
/** The team's own memory files at the top of a project, which add-project reads and records with a hash. */
const TEAM_FILES = ['CLAUDE.md', '.claude/CLAUDE.md', 'AGENTS.md'];

/** The path as the file system sees it, for comparing two spellings of a folder. */
function canonical(/** @type {string} */ p) {
  let abs = resolve(p);
  try { abs = realpathSync(abs); } catch { /* keep the resolved path */ }
  return process.platform === 'win32' ? abs.toLowerCase() : abs;
}

/**
 * Relative forward-slash paths of AGENTS.md files at most 4 folders down. Follows no links.
 * @param {string} root
 * @returns {string[]}
 */
function findAgentsMd(root) {
  /** @type {string[]} */
  const found = [];
  walk(root, {
    maxDepth: MAX_LEVELS, skipDir: (_, name) => SKIP.has(name), onReadError: () => {},
    onEntry: (rel, entry) => {
      if (entry.isDirectory()) return true;
      // Preserve name-only discovery, including a link named AGENTS.md, without following it.
      if (entry.name === 'AGENTS.md') found.push(rel);
      return false;
    },
  });
  return found.sort();
}

/** The kind of readable DevOCD state in dir itself: 'company', 'project', or null when there is none or it can't be read. */
function stateKind(/** @type {string} */ dir) {
  const text = readTextOrNull(join(dir, '.devocd', 'state.json'));
  try {
    const kind = text === null ? null : JSON.parse(text)?.kind;
    return kind === 'company' || kind === 'project' ? kind : null;
  } catch { return null; }
}

/** True when dir holds readable company state. */
const isCompany = (/** @type {string} */ dir) => stateKind(dir) === 'company';

const relOrDot = (/** @type {string} */ from, /** @type {string} */ to) => toPosix(relative(from, to)) || '.';

/** The read-only status of the company's configured policy repo, or null when there is none or it is invalid. Never throws. */
function policyRepoFor(/** @type {string} */ dir) {
  try {
    const text = readTextOrNull(join(dir, '.devocd', 'state.json'));
    if (text === null) return null;
    const state = JSON.parse(text);
    if (!state || typeof state !== 'object' || state.kind !== 'company' || state.policyRepo === undefined) return null;
    if (policyRepoProblem(state.policyRepo)) return null;
    return policyRepoStatus(state.policyRepo);
  } catch { return null; }
}

/**
 * The nearest folder at or above root holding company state, as the paths add-project needs: `path` from the
 * current folder (for commands), `rel` from root (project state's companyRel), `project` root from the company
 * (register's path), `standards`, the absolute forward-slash form that permissions.additionalDirectories
 * matches (observed on Windows, docs/research/claude-code.md), and `policyRepo`, the read-only clone status
 * (`null` when the company records none).
 * @param {string} root
 */
function findCompany(root) {
  for (let d = root; ; d = dirname(d)) {
    if (isCompany(d)) {
      return { path: relOrDot(process.cwd(), d), rel: relOrDot(root, d), project: relOrDot(d, root), standards: toPosix(join(d, '.devocd', 'standards')), policyRepo: policyRepoFor(d) };
    }
    if (dirname(d) === d) return null;
  }
}

/** @param {string} root @returns {{ path: string, sha256: string, lines: number, absolute: string }[]} */
function teamFiles(root) {
  return TEAM_FILES.filter((f) => isRegularFile(join(root, f)))
    .map((f) => {
      const bytes = readFileSync(join(root, f));
      return { path: f, sha256: createHash('sha256').update(bytes).digest('hex'), lines: countLines(bytes.toString('utf8')), absolute: toPosix(join(root, f)) };
    });
}

/**
 * What install and add-project need to know before they start. Read-only.
 * @param {string} dir
 * @returns {{ isHome: boolean, parentFile: 'CLAUDE.md' | 'CLAUDE.local.md', agentsMd: string[],
 *   company: { path: string, rel: string, project: string, standards: string,
 *     policyRepo: { path: string | null, remote: string | null, index: string | null, head: string | null,
 *       builtAt: string | null, status: 'ok' | 'missing' | 'no-git' | 'not-a-clone' | 'wrong-remote' | 'moved' } | null } | null,
 *   teamFiles: { path: string, sha256: string, lines: number, absolute: string }[],
 *   state: 'company' | 'project' | null }}
 * `state` is the kind of DevOCD state in this folder itself, so a company folder with `state: 'company'` is a rerun of install.
 */
export function preflight(dir) {
  const root = resolve(dir);
  const isHome = canonical(root) === canonical(homedir());
  return {
    isHome,
    parentFile: insideWorkTree(root) ? 'CLAUDE.local.md' : 'CLAUDE.md',
    agentsMd: isHome ? [] : findAgentsMd(root),
    company: findCompany(root),
    teamFiles: teamFiles(root),
    state: stateKind(root),
  };
}
