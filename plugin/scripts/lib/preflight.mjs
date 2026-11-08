// @ts-check
import { readdirSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { toPosix } from './fsutil.mjs';
import { insideWorkTree } from './protect.mjs';

const MAX_LEVELS = 4;
const SKIP = new Set(['.git', 'node_modules', '.devocd']);

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
  const walk = (/** @type {string} */ rel, /** @type {number} */ level) => {
    let entries;
    try { entries = readdirSync(join(root, rel), { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const child = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (level < MAX_LEVELS && !SKIP.has(e.name)) walk(child, level + 1);
      } else if (e.name === 'AGENTS.md') found.push(toPosix(child));
    }
  };
  walk('', 0);
  return found.sort();
}

/**
 * What install needs to know before it starts. Read-only.
 * @param {string} dir
 * @returns {{ isHome: boolean, parentFile: 'CLAUDE.md' | 'CLAUDE.local.md', agentsMd: string[] }}
 */
export function preflight(dir) {
  const root = resolve(dir);
  const isHome = canonical(root) === canonical(homedir());
  return { isHome, parentFile: insideWorkTree(root) ? 'CLAUDE.local.md' : 'CLAUDE.md', agentsMd: isHome ? [] : findAgentsMd(root) };
}
