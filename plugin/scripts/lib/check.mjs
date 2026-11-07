// @ts-check
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { countLines, lstatOrNull, readTextOrNull, toPosix, walkFiles } from './fsutil.mjs';
import { findBlock } from './block.mjs';
import { scanSecrets } from './secrets.mjs';
import { estimateTokens, LIMITS } from './tokens.mjs';

/**
 * @typedef {{ rule: string, severity: 'error'|'warning'|'information', file: string, line?: number, message: string, hint: string, count?: number }} Issue
 * @typedef {{ path: string, kind: string, lines: number, tokens: number, exempt?: boolean }} FileInfo
 */

const STATE_HINT = 'Run /devocd:install (company) or /devocd:add-project (project) to create it.';

/** Blank out fenced code and inline code spans, keeping line count and length. */
export function maskCode(/** @type {string} */ text) {
  let fence = '';
  return text.split('\n').map((line) => {
    const m = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length) fence = '';
      return line.replace(/[^\r]/g, ' ');
    }
    if (m) { fence = m[1]; return line.replace(/[^\r]/g, ' '); }
    return line.replace(/(`+)[^`]*?\1/g, (s) => s.replace(/[^\r]/g, ' '));
  }).join('\n');
}

/** @returns {string[]} link targets on one masked line */
function linkTargets(/** @type {string} */ line) {
  /** @type {string[]} */
  const out = [];
  for (const m of line.matchAll(/\[[^\]]*\]\(\s*(<[^>]*>|[^)\s]*)[^)]*\)/g)) out.push(m[1].replace(/^<|>$/g, ''));
  const def = /^ {0,3}\[[^\]]+\]:\s*(<[^>]*>|\S+)/.exec(line);
  if (def) out.push(def[1].replace(/^<|>$/g, ''));
  return out;
}

/** @returns {string[]} `@path.ext` import tokens on one masked line */
function importTokens(/** @type {string} */ line) {
  /** @type {string[]} */
  const out = [];
  for (const m of line.matchAll(/(?<![\w@/])@[\w./~-]+/g)) {
    const tok = m[0].replace(/\.+$/, '');
    if (/\.[A-Za-z0-9]+$/.test(tok.slice(tok.lastIndexOf('/') + 1))) out.push(tok);
  }
  return out;
}

/**
 * Validate state. Returns an error message or null.
 * @param {any} s
 */
function stateProblem(s) {
  const isObj = (/** @type {any} */ v) => v && typeof v === 'object' && !Array.isArray(v);
  const strs = (/** @type {any} */ v) => Array.isArray(v) && v.every((x) => typeof x === 'string');
  const sources = (/** @type {any} */ v) => Array.isArray(v) && v.every((x) => isObj(x) && typeof x.type === 'string' && typeof x.ref === 'string' && typeof x.readAt === 'string');
  if (!isObj(s)) return 'state.json must be a JSON object';
  if (s.version !== 1) return 'version must be 1';
  if (s.kind === 'company') {
    if (typeof s.name !== 'string') return 'name must be a string';
    if (typeof s.description !== 'string') return 'description must be a string';
    if (s.parentFile !== 'CLAUDE.md' && s.parentFile !== 'CLAUDE.local.md') return 'parentFile must be CLAUDE.md or CLAUDE.local.md';
    if (!strs(s.keyRules)) return 'keyRules must be an array of strings';
    if (!Array.isArray(s.projects) || !s.projects.every((/** @type {any} */ p) => isObj(p) && typeof p.id === 'string' && typeof p.path === 'string' && typeof p.description === 'string')) return 'projects must be an array of { id, path, description }';
    if (!sources(s.sources)) return 'sources must be an array of { type, ref, readAt }';
    return null;
  }
  if (s.kind === 'project') {
    if (typeof s.id !== 'string') return 'id must be a string';
    if (typeof s.companyRel !== 'string') return 'companyRel must be a string';
    if (!Array.isArray(s.teamFiles) || !s.teamFiles.every((/** @type {any} */ t) => isObj(t) && typeof t.path === 'string' && typeof t.sha256 === 'string' && typeof t.excluded === 'boolean')) return 'teamFiles must be an array of { path, sha256, excluded }';
    if (!strs(s.approvedCommands)) return 'approvedCommands must be an array of strings';
    if (!sources(s.sources)) return 'sources must be an array of { type, ref, readAt }';
    return null;
  }
  return 'kind must be company or project';
}

/** Glob (** * ?) to RegExp, matched against absolute forward-slash paths. */
function globToRegExp(/** @type {string} */ glob) {
  let re = '';
  const g = toPosix(glob);
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') { re += '.*'; i++; if (g[i + 1] === '/') i++; } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`, process.platform === 'win32' ? 'i' : '');
}

/** @param {string} text */
function hasPathsFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  return !!m && /^paths\s*:/m.test(m[1]);
}

/**
 * Estimate what loads at launch from dir.
 * @param {string} dir
 */
function computeLaunch(dir) {
  /** @type {string[]} */ let excludes = [];
  try {
    const raw = JSON.parse(readFileSync(join(dir, '.claude', 'settings.local.json'), 'utf8'));
    if (Array.isArray(raw.claudeMdExcludes)) excludes = raw.claudeMdExcludes.filter((/** @type {any} */ x) => typeof x === 'string');
  } catch { /* no settings */ }
  const excluded = excludes.map(globToRegExp);
  /** @type {string[]} */ const chain = [];
  for (let d = dir; ; d = dirname(d)) {
    chain.unshift(d);
    if (dirname(d) === d) break;
  }
  /** @type {{ path: string, tokens: number }[]} */ const files = [];
  let claudeAtOrAbove = false;
  for (const d of chain) {
    // Observed (Claude Code 2.1.319): a CLAUDE.md or CLAUDE.local.md at or above turns AGENTS.md off, unless that file is excluded by claudeMdExcludes.
    for (const name of ['CLAUDE.md', 'CLAUDE.local.md']) {
      const f = join(d, name);
      if (lstatOrNull(f) && !excluded.some((re) => re.test(toPosix(f)))) claudeAtOrAbove = true;
    }
    const candidates = [join(d, 'CLAUDE.md'), join(d, '.claude', 'CLAUDE.md'), join(d, 'CLAUDE.local.md')];
    const rulesDir = join(d, '.claude', 'rules');
    for (const f of walkFiles(rulesDir)) if (f.endsWith('.md')) candidates.push(f);
    if (!claudeAtOrAbove) candidates.push(join(d, 'AGENTS.md'));
    for (const f of candidates) {
      const text = readTextOrNull(f);
      if (text === null) continue;
      if (excluded.some((re) => re.test(toPosix(f)))) continue;
      if (f.startsWith(rulesDir) && hasPathsFrontmatter(text)) continue;
      files.push({ path: toPosix(f), tokens: estimateTokens(text) });
    }
  }
  return {
    tokens: files.reduce((n, f) => n + f.tokens, 0),
    files,
    notes: [
      'Counts memory files only (CLAUDE.md, CLAUDE.local.md, .claude/rules, AGENTS.md); token figures are estimated.',
      'Plugins, hooks, auto memory and organization instructions are not counted. Run /context in Claude Code for the real figure.',
    ],
  };
}

/**
 * Check one company or project folder.
 * @param {string} dir
 * @param {object} [opts]
 * @returns {{ issues: Issue[], files: FileInfo[], launch: { tokens: number, files: { path: string, tokens: number }[], notes: string[] } }}
 */
export function checkTree(dir, opts = {}) {
  void opts;
  const root = resolve(dir);
  /** @type {Issue[]} */ const issues = [];
  /** @type {FileInfo[]} */ const files = [];
  const launch = computeLaunch(root);
  const statePath = join(root, '.devocd', 'state.json');
  const stateIssue = (/** @type {string} */ message) => ({
    issues: [/** @type {Issue} */ ({ rule: 'state/invalid', severity: 'error', file: '.devocd/state.json', message, hint: STATE_HINT })],
    files, launch,
  });

  const stateText = readTextOrNull(statePath);
  if (stateText === null) return stateIssue('no .devocd/state.json found');
  let state;
  try { state = JSON.parse(stateText); } catch (e) { return stateIssue(`state.json is not valid JSON: ${/** @type {Error} */ (e).message}`); }
  const problem = stateProblem(state);
  if (problem) return stateIssue(problem);

  const companyRoot = state.kind === 'company' ? root : resolve(root, state.companyRel);
  const rel = (/** @type {string} */ abs) => toPosix(relative(root, abs));
  /** @param {Omit<Issue, 'hint'> & { hint?: string }} i */
  const add = (i) => issues.push({ hint: '', ...i });

  /**
   * Run link, import and secret checks over lines [from, to) (0-based) of a file.
   * @param {string} abs @param {string} text @param {number} from @param {number} to
   */
  function scanText(abs, text, from, to) {
    const file = rel(abs);
    const masked = maskCode(text).split('\n');
    for (let i = from; i < to && i < masked.length; i++) {
      for (const target of linkTargets(masked[i])) {
        if (/^[a-z][a-z0-9+.-]+:/i.test(target) || target.startsWith('#') || target === '') continue;
        let path = target.split('#')[0].split('?')[0];
        try { path = decodeURIComponent(path); } catch { /* keep raw */ }
        if (path === '') continue;
        const abst = isAbsolute(path) ? resolve(path) : resolve(dirname(abs), path);
        const fromCompany = relative(companyRoot, abst);
        if (fromCompany.split(/[\\/]/)[0] === '..' || isAbsolute(fromCompany)) {
          add({ rule: 'ref/escape', severity: 'error', file, line: i + 1, message: `link "${target}" leaves the company folder`, hint: 'Link only to files inside the company folder.' });
        } else if (!lstatOrNull(abst)) {
          add({ rule: 'ref/broken', severity: 'error', file, line: i + 1, message: `link "${target}" does not exist`, hint: 'Fix the path or regenerate the file.' });
        }
      }
      for (const tok of importTokens(masked[i])) {
        add({ rule: 'import/present', severity: 'error', file, line: i + 1, message: `generated file contains the import ${tok}`, hint: 'Replace the @import with a plain relative link.' });
      }
    }
    const lines = text.split('\n').slice(from, to).join('\n');
    for (const h of scanSecrets(lines)) {
      add({ rule: 'secret/found', severity: 'error', file, line: from + h.line, message: `possible secret (${h.kind})`, hint: 'Remove it and rotate the credential if it was real.' });
    }
  }

  /** @param {string} abs @param {string} kind @param {string} text @param {boolean} [exempt] */
  function budget(abs, kind, text, exempt = false) {
    const file = rel(abs);
    const lines = countLines(text);
    const tokens = estimateTokens(text);
    files.push({ path: file, kind, lines, tokens, ...(exempt ? { exempt: true } : {}) });
    const lim = /** @type {Record<string, {lines?: number, tokens?: number}>} */ (LIMITS)[kind];
    if (!lim || exempt) return;
    if (lim.lines !== undefined && lines > lim.lines) {
      add({ rule: 'budget/lines', severity: 'error', file, message: `${kind} file has ${lines} lines, limit is ${lim.lines}`, hint: 'Shorten it, or move detail into .devocd/ references.' });
    }
    if (lim.tokens !== undefined && tokens > lim.tokens) {
      add({ rule: 'budget/tokens', severity: 'error', file, message: `${kind} file is about ${tokens} estimated tokens, limit is ${lim.tokens}`, hint: 'Shorten it, or move detail into .devocd/ references.' });
    }
  }

  // Parent or pointer block.
  const blockFile = state.kind === 'company' ? state.parentFile : 'CLAUDE.local.md';
  const blockKind = state.kind === 'company' ? 'parent' : 'pointer';
  const blockAbs = join(root, blockFile);
  const blockText = readTextOrNull(blockAbs);
  if (blockText !== null) {
    let found = null;
    try { found = findBlock(blockText); } catch (e) {
      add({ rule: 'block/malformed', severity: 'error', file: blockFile, message: /** @type {Error} */ (e).message, hint: 'Fix or delete the devocd marker lines.' });
    }
    if (found) {
      budget(blockAbs, blockKind, found.inner);
      scanText(blockAbs, blockText, found.begin + 1, found.end);
    }
  }
  if (state.kind === 'company') {
    const t = estimateTokens(state.keyRules.join('\n'));
    if (t > LIMITS.parent.keyRulesTokens) {
      add({ rule: 'budget/tokens', severity: 'error', file: '.devocd/state.json', message: `key rules are about ${t} estimated tokens, limit is ${LIMITS.parent.keyRulesTokens}`, hint: 'Keep fewer or shorter key rules.' });
    }
  }

  // .devocd/**
  const devDir = join(root, '.devocd');
  let unconfirmed = 0;
  const devFiles = walkFiles(devDir, (abs, name) => name === '.backups' && dirname(abs) === devDir);
  for (const abs of devFiles) {
    const text = readTextOrNull(abs);
    if (text === null) continue;
    const r = toPosix(relative(devDir, abs));
    const isMd = r.endsWith('.md');
    if (isMd) {
      const kind = r === 'PROJECT.md' ? 'project' : r.startsWith('flows/') ? 'flow' : 'reference';
      budget(abs, kind, text, r === 'projects.md');
      scanText(abs, text, 0, text.split('\n').length);
    } else {
      for (const h of scanSecrets(text)) {
        add({ rule: 'secret/found', severity: 'error', file: rel(abs), line: h.line, message: `possible secret (${h.kind})`, hint: 'Remove it and rotate the credential if it was real.' });
      }
    }
    if (r !== 'state.json') unconfirmed += (text.match(/\bunconfirmed\b/gi) || []).length;
  }
  if (unconfirmed > 0) {
    add({ rule: 'source/unconfirmed', severity: 'information', file: '.devocd', message: `${unconfirmed} unconfirmed marker${unconfirmed === 1 ? '' : 's'} in .devocd`, hint: 'Confirm these facts with the team when you can.', count: unconfirmed });
  }

  // Team files.
  if (state.kind === 'project') {
    for (const t of state.teamFiles) {
      const abs = resolve(root, t.path);
      const text = lstatOrNull(abs)?.isFile() ? readFileSync(abs) : null;
      const sha = text ? createHash('sha256').update(text).digest('hex') : null;
      if (sha !== t.sha256) {
        add({ rule: 'team-file/changed', severity: 'warning', file: toPosix(t.path), message: sha ? 'team file changed since it was last read' : 'team file is missing', hint: 'Re-run /devocd:add-project to re-read it.' });
      }
    }
  }

  if (launch.tokens > LIMITS.launchTokens) {
    add({ rule: 'launch/over-target', severity: 'warning', file: '', message: `launch loads about ${launch.tokens} estimated tokens, target is ${LIMITS.launchTokens}`, hint: 'Trim the larger memory files listed by check --json.' });
  }
  return { issues, files, launch };
}
