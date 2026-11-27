import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { countLines, lstatOrNull, readTextOrNull, toPosix, walkFiles } from './fsutil.mjs';
import { findBlock } from './block.mjs';
import { findRepeats, memoryDirFor } from './redundancy.mjs';
import { scanSecrets } from './secrets.mjs';
import { estimateTokens, LIMITS, CONTEXT_TARGETS } from './tokens.mjs';
import { decisionIssues, pageIssues } from './content-check.mjs';
import { COMPLETION_STEPS } from './completion.mjs';
import { parsePageMeta } from './pagemeta.mjs';
import { readHookStats } from './hookstats.mjs';
import { policyRepoProblem, policyRepoStatus, readPolicyIndex } from './policyrepo.mjs';

/**
 * @typedef {{ rule: string, severity: 'error'|'warning'|'information', file: string, line?: number, message: string, hint: string, count?: number }} Issue
 * @typedef {{ path: string, kind: string, lines: number, tokens: number, exempt?: boolean }} FileInfo
 */

const STATE_HINT = 'Run /devocd:install (company) or /devocd:add-project (project) to create it.';

/** @returns {boolean[]} per line: true when the line is part of a fenced code block (fence lines included) */
export function fencedLines(/** @type {string} */ text) {
  let fence = '';
  return text.split('\n').map((line) => {
    const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      // A closing fence is only the same character, at least as long, then whitespace.
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length && /^[ \t\r]*$/.test(m[2])) fence = '';
      return true;
    }
    if (m) { fence = m[1]; return true; }
    return false;
  });
}

/** Blank out fenced code and inline code spans, keeping line count and length. */
export function maskCode(/** @type {string} */ text) {
  const fenced = fencedLines(text);
  return text.split('\n').map((line, i) => (fenced[i]
    ? line.replace(/[^\r]/g, ' ')
    : line.replace(/(`+)[^`]*?\1/g, (s) => s.replace(/[^\r]/g, ' ')))).join('\n');
}

/**
 * The prompt hook (`devocd-hooks.mjs`, `onPrompt`) only matches an index bullet written
 * `- <task words>: [title](file.md)`. A standards link without those trigger words never
 * matches a prompt, so the standard is inert and nothing says so. Headings and bullets with
 * no standards link are notes, not entries.
 * @param {string} indexAbs @param {string} file @returns {Issue[]}
 */
export function indexTriggerIssues(/** @type {string} */ indexAbs, /** @type {string} */ file) {
  const text = readTextOrNull(indexAbs);
  if (text === null) return [];
  const fenced = fencedLines(text);
  // The same shape the hook accepts, but the trigger must start with a non-space character.
  const triggered = /^\s*[-*]\s+\S.*?:\s*\[[^\]]*\]\([^)\s]+\)/;
  /** @type {Issue[]} */
  const out = [];
  text.split('\n').forEach((line, i) => {
    if (fenced[i]) return;
    const bullet = /^\s*[-*]\s+(\S.*)$/.exec(line);
    if (!bullet) return;
    const link = /\[[^\]]*\]\(([^)\s]+?\.md)(?:[?#][^)\s]*)?\)/.exec(bullet[1]);
    if (!link) return;
    if (triggered.test(line)) return;
    out.push({
      rule: 'standards/index-no-trigger', severity: 'error', file, line: i + 1,
      message: `index entry for ${link[1]} has no trigger words before its link, so no prompt can match it`,
      hint: 'Write it as "- <task words>: [<title>](<file>.md)", e.g. "- Change a port or host: [Security](security.md)."',
    });
  });
  return out;
}

/** @returns {string[]} link targets on one masked line */
export function linkTargets(/** @type {string} */ line) {
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
export function stateProblem(s) {
  const isObj = (/** @type {any} */ v) => v && typeof v === 'object' && !Array.isArray(v);
  const strs = (/** @type {any} */ v) => Array.isArray(v) && v.every((x) => typeof x === 'string');
  const sources = (/** @type {any} */ v) => Array.isArray(v) && v.every((x) => isObj(x) && typeof x.type === 'string' && typeof x.ref === 'string' && typeof x.readAt === 'string');
  if (!isObj(s)) return 'state.json must be a JSON object';
  if (s.version !== 1) return 'version must be 1';
  // Completion is optional so older installs stay valid; when present every step is a date or null.
  if (s.completion !== undefined) {
    if (!isObj(s.completion)) return 'completion must be an object';
    const unknown = Object.keys(s.completion).filter((key) => !COMPLETION_STEPS.includes(/** @type {any} */ (key)));
    if (unknown.length) return `completion has unknown keys: ${unknown.join(', ')}`;
    for (const step of COMPLETION_STEPS) {
      const value = s.completion[step];
      if (value !== null && (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(value) || Number.isNaN(Date.parse(value)))) return `completion.${step} must be an ISO-8601 timestamp or null`;
    }
  }
  if (s.devocdHooks !== undefined && typeof s.devocdHooks !== 'boolean') return 'devocdHooks must be true or false';
  // How long a policy may go uncited and unprompted before check calls it unused (T112b).
  if (s.policyUnusedDays !== undefined) {
    if (s.kind !== 'company') return 'policyUnusedDays belongs in company state only';
    if (!Number.isInteger(s.policyUnusedDays) || s.policyUnusedDays < 1 || s.policyUnusedDays > 3650) {
      return 'policyUnusedDays must be an integer from 1 to 3650';
    }
  }
  // The company's policy repo is optional; when recorded, it must be a safe, credential-free shape.
  // `null` means "no policy repo" so an approved draft can remove a recorded one.
  if (s.policyRepo !== undefined && s.policyRepo !== null) {
    if (s.kind !== 'company') return 'policyRepo belongs in company state only';
    const problem = policyRepoProblem(s.policyRepo);
    if (problem) return problem;
  }
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
    if (s.ruleStubs !== undefined && typeof s.ruleStubs !== 'boolean') return 'ruleStubs must be true or false';
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
    // Observed live (Claude Code 2.1.319, tests/e2e/behaviour.test.mjs): CLAUDE.md or CLAUDE.local.md in the folder or a parent, or .claude/CLAUDE.md
    // in the folder itself, turns AGENTS.md off. A parent's .claude/CLAUDE.md was not tested; it is assumed to do the same. Excluding such a file with
    // claudeMdExcludes turns AGENTS.md back on (observed for CLAUDE.md only; the same rule is applied to the others).
    for (const name of ['CLAUDE.md', join('.claude', 'CLAUDE.md'), 'CLAUDE.local.md']) {
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

/** Module and flow pages whose `Standards:` line names `topic`. Reads pages only, never the graph.
 * @param {string} projectRoot @param {string} topic
 */
function pagesCitingTopic(projectRoot, topic) {
  const base = join(projectRoot, '.devocd');
  /** @type {string[]} */
  const out = [];
  const skipTop = new Set(['draft', 'decision-history', '.backups']);
  for (const abs of walkFiles(base, (a, name) => name.startsWith('.') || (dirname(a) === base && skipTop.has(name)))) {
    const file = toPosix(relative(base, abs));
    if (!/^(code|flows)\//.test(file) || !file.endsWith('.md')) continue;
    const text = readTextOrNull(abs);
    if (text === null) continue;
    try { if (parsePageMeta(text).standards.includes(topic)) out.push(file); } catch { /* a malformed page is reported elsewhere */ }
  }
  return out.sort();
}

const POLICY_UNUSED_DEFAULT = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * One information issue per policy file that no project page cites and no prompt has given for
 * `policyUnusedDays` (default 90). Hook records live in the folder the hook ran in, so the
 * company's and every registered project's are merged. Without history, or with a history newer
 * than the window, it says nothing. Read-only.
 * @param {string} companyRoot
 * @param {any} companyState
 * @param {NonNullable<ReturnType<typeof readPolicyIndex>>} index
 * @param {string} indexPath
 */
function policyUnusedIssues(companyRoot, companyState, index, indexPath) {
  const days = Number.isInteger(companyState.policyUnusedDays) ? companyState.policyUnusedDays : POLICY_UNUSED_DEFAULT;
  const cutoff = Date.now() - days * DAY_MS;
  const roots = [companyRoot, ...(Array.isArray(companyState.projects) ? companyState.projects : []).map((p) => resolve(companyRoot, p.path))];
  /** @type {any[]} */
  const records = [];
  for (const root of roots) {
    try { const stats = readHookStats(root); if (stats) records.push(stats); } catch { /* a damaged record is skipped */ }
  }
  if (!records.length) return [];
  const starts = records.map((r) => Date.parse(typeof r.since === 'string' ? r.since : '')).filter(Number.isFinite);
  if (!starts.length || Math.min(...starts) > cutoff) return [];
  const projectRoots = roots.slice(1);
  /** @type {Map<string, boolean>} */
  const cited = new Map();
  const isCited = (/** @type {string} */ topic) => {
    if (!cited.has(topic)) cited.set(topic, projectRoots.some((p) => pagesCitingTopic(p, topic).length > 0));
    return cited.get(topic) === true;
  };
  /** @type {Issue[]} */
  const issues = [];
  for (const entry of index.entries) {
    if (entry.topic && isCited(entry.topic)) continue;
    let newest = Number.NEGATIVE_INFINITY;
    for (const r of records) {
      const at = r.pointers && typeof r.pointers === 'object' && !Array.isArray(r.pointers) ? r.pointers[entry.file] : undefined;
      const ms = typeof at === 'string' ? Date.parse(at) : NaN;
      if (Number.isFinite(ms)) newest = Math.max(newest, ms);
    }
    if (newest > cutoff) continue;
    issues.push({
      rule: 'policy/unused', severity: 'information', file: indexPath, line: entry.line,
      message: `no page cites and no prompt has used ${entry.file} in ${days} days`,
      hint: 'Delete it from the policy repo if it is obsolete, or link it from the index where it applies.',
    });
  }
  return issues;
}

/**
 * Check one company or project folder.
 * @param {string} dir
 * @param {{ memoryDir?: string }} [opts]
 * @returns {{ issues: Issue[], files: FileInfo[], launch: { tokens: number, files: { path: string, tokens: number }[], notes: string[] } }}
 */
export function checkTree(dir, opts = {}) {
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
   * Read-only policy-repo rules (T112). Company: clone status, index problems and repeated rules.
   * Project: the clone's commit against this project's recorded baseline, and linked files changed
   * since it. Nothing is written and no page is marked stale: refresh-status owns the stale list.
   */
  function policyRepoIssues() {
    if (state.kind === 'company') {
      const repo = state.policyRepo;
      if (policyRepoProblem(repo)) {
        // Local standards mode: the unused rule runs over .devocd/standards/index.md.
        const localIndex = readPolicyIndex({ path: join(root, '.devocd', 'standards'), index: 'index.md' });
        if (localIndex) issues.push(...policyUnusedIssues(root, state, localIndex, '.devocd/standards/index.md'));
        return;
      }
      const status = policyRepoStatus(repo);
      const at = '.devocd/state.json';
      if (status.status === 'missing' || status.status === 'not-a-clone') {
        add({ rule: 'policy-repo/missing', severity: 'error', file: at,
          message: status.status === 'not-a-clone'
            ? `the recorded policy repo path ${repo.path} is not the root of a git clone`
            : `the recorded policy repo clone is missing at ${repo.path}`,
          hint: 'Clone the repo the owner shared at that path, then run /devocd:refresh.' });
      } else if (status.status === 'wrong-remote') {
        add({ rule: 'policy-repo/wrong-remote', severity: 'error', file: at,
          message: 'the clone\'s origin is not the recorded policy repo remote',
          hint: 'Point origin at the recorded URL, or re-run /devocd:install to record this clone.' });
      } else if (status.status === 'no-git') {
        add({ rule: 'policy-repo/no-git', severity: 'information', file: at,
          message: 'git cannot be run, so the policy clone\'s remote and commit cannot be checked',
          hint: 'Install git and make sure it is on PATH, then run check again.' });
      }
      const index = readPolicyIndex(repo);
      if (!index) return;
      for (const p of index.problems) {
        if (p.reason === 'ambiguous-topic') {
          add({ rule: 'policy/ambiguous-topic', severity: 'warning', file: repo.index, line: p.line,
            message: 'two index entries link files with the same name, so this topic resolves to neither',
            hint: 'Give each linked file a distinct name so its topic names one policy.' });
        } else if (p.reason === 'missing-target') {
          add({ rule: 'policy/missing-target', severity: 'error', file: repo.index, line: p.line,
            message: 'this index entry links a file that is not in the clone',
            hint: 'Add the file, correct the link, or remove the entry.' });
        } else {
          add({ rule: 'policy/bad-link', severity: 'warning', file: repo.index, line: p.line,
            message: `this index entry cannot be followed (${p.reason})`,
            hint: 'Keep index links relative, inside the clone, and pointing at regular Markdown files.' });
        }
      }
      const files = [...new Set(index.entries.map((e) => e.file))];
      /** @type {import('./redundancy.mjs').Layer[]} */
      const layers = [];
      for (const file of files) {
        const text = readTextOrNull(join(repo.path, file));
        if (text === null || text.length > 256 * 1024) continue;
        layers.push({ file, text, rank: layers.length, load: 'demand', readOnly: true });
      }
      if (layers.length > 1) {
        for (const r of findRepeats(layers)) {
          add({ rule: 'policy/duplicate', severity: 'warning', file: r.file, line: r.line,
            message: `repeats ${r.keep}:${r.keepLine} (${r.match})`,
            hint: 'State each rule once in the policy repo and link to it from the other file.' });
        }
      }
      issues.push(...policyUnusedIssues(root, state, index, repo.index));
      return;
    }
    // Project: only against a usable clone and a baseline that recorded a policy.
    let company;
    try { company = JSON.parse(readTextOrNull(join(companyRoot, '.devocd', 'state.json')) ?? 'null'); } catch { return; }
    if (company?.kind !== 'company' || policyRepoProblem(company.policyRepo)) return;
    const status = policyRepoStatus(company.policyRepo);
    if (status.status !== 'ok' && status.status !== 'moved') return;
    let baseline;
    try { baseline = JSON.parse(readTextOrNull(join(root, '.devocd', 'refresh.json')) ?? 'null')?.policy; } catch { return; }
    if (!baseline || typeof baseline !== 'object' || typeof baseline.commit !== 'string' ||
      !baseline.files || typeof baseline.files !== 'object') return;
    const short = (/** @type {string} */ s) => s.slice(0, 7);
    if (status.head && baseline.commit !== status.head) {
      add({ rule: 'policy-repo/version', severity: 'warning', file: '.devocd/refresh.json',
        message: `the policy clone is at ${short(status.head)} but this project's knowledge was built at ${short(baseline.commit)}`,
        hint: 'Run git pull in the clone, then /devocd:refresh.' });
    }
    const clone = resolve(company.policyRepo.path);
    for (const [file, before] of Object.entries(baseline.files)) {
      if (typeof before !== 'string') continue;
      const abs = join(clone, file);
      let now = null;
      try {
        const stat = lstatOrNull(abs);
        if (stat?.isFile() && !stat.isSymbolicLink()) now = createHash('sha256').update(readFileSync(abs)).digest('hex');
      } catch { now = null; }
      if (now === before) continue;
      const topic = file.slice(file.lastIndexOf('/') + 1).replace(/\.md$/, '');
      const citing = pagesCitingTopic(root, topic);
      const pages = citing.length ? ` (cited by ${citing.join(', ')})` : '';
      add({ rule: 'policy-repo/changed', severity: 'warning', file: '.devocd/refresh.json',
        message: now === null ? `repo policy ${file} was deleted since the last refresh${pages}` : `repo policy ${file} changed since the last refresh${pages}`,
        hint: 'Run /devocd:refresh so the pages that cite it are rebuilt.' });
    }
  }

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
    const target = CONTEXT_TARGETS[kind];
    if (target && tokens > target && (lim.tokens === undefined || tokens <= lim.tokens)) {
      add({ rule: 'context/over-target', severity: 'warning', file, message: `about ${tokens} estimated tokens; writing target is ${target}`, hint: 'Keep routing in the index; split detail into linked, meaningful child pages.' });
    }
  }

  // Parent or pointer block.
  const blockFile = state.kind === 'company' ? state.parentFile : 'CLAUDE.local.md';
  const blockKind = state.kind === 'company' ? 'parent' : 'pointer';
  const blockAbs = join(root, blockFile);
  const blockText = readTextOrNull(blockAbs);
  if (blockText === null) {
    add({ rule: 'block/missing', severity: 'error', file: blockFile, message: 'required startup file is missing or unreadable', hint: STATE_HINT });
  }
  if (blockText !== null) {
    let found = null;
    try { found = findBlock(blockText); } catch (e) {
      add({ rule: 'block/malformed', severity: 'error', file: blockFile, message: /** @type {Error} */ (e).message, hint: 'Fix or delete the devocd marker lines.' });
    }
    if ((!found || !found.inner.trim()) && !issues.some(i => i.rule === 'block/malformed' && i.file === blockFile)) {
      add({ rule: 'block/missing', severity: 'error', file: blockFile, message: 'required DevOCD startup block is missing or empty', hint: STATE_HINT });
    }
    if (found) {
      budget(blockAbs, blockKind, found.inner);
      scanText(blockAbs, blockText, found.begin + 1, found.end);
    }
  }
  if (state.kind === 'project') {
    for (const name of ['PROJECT.md', 'pointer.md']) {
      const text = readTextOrNull(join(root, '.devocd', name));
      if (text === null || !text.trim()) {
        add({ rule: 'entry/missing', severity: 'error', file: `.devocd/${name}`, message: 'required project entry is missing, empty or unreadable', hint: STATE_HINT });
      }
    }
  }
  if (state.kind === 'company') {
    const t = estimateTokens(state.keyRules.join('\n'));
    if (t > LIMITS.parent.keyRulesTokens) {
      add({ rule: 'budget/tokens', severity: 'error', file: '.devocd/state.json', message: `key rules are about ${t} estimated tokens, limit is ${LIMITS.parent.keyRulesTokens}`, hint: 'Keep fewer or shorter key rules.' });
    }
    // Standards with no index.md is a silent policy outage: pages read "Standards: none
    // recorded", trace returns no policies, and nothing tells the user their rules are inert.
    const standardsDir = join(root, '.devocd', 'standards');
    const std = lstatOrNull(standardsDir);
    /** @type {string[]} */
    const standardsFiles = std && std.isDirectory() && !std.isSymbolicLink()
      ? walkFiles(standardsDir).filter((abs) => abs.endsWith('.md')).map((abs) => toPosix(relative(standardsDir, abs)))
      : [];
    if (standardsFiles.length && !standardsFiles.includes('index.md')) {
      add({ rule: 'standards/index-missing', severity: 'error', file: '.devocd/standards',
        message: `${standardsFiles.length} standards file(s) and no index.md, so no page can cite them and trace returns no policies`,
        hint: 'Add .devocd/standards/index.md listing each standards file, or rerun /devocd:company-policy.' });
    }
    if (standardsFiles.includes('index.md')) {
      issues.push(...indexTriggerIssues(join(standardsDir, 'index.md'), '.devocd/standards/index.md'));
    }
  }

  /** Layered redundancy: one issue per sentence or bullet repeated across loaded layers. */
  function repeatIssues() {
    /** @type {import('./redundancy.mjs').Layer[]} */ const layers = [];
    const seen = new Set();
    /** @param {string} abs @param {string} file @param {number} rank @param {'always'|'touch'|'demand'} load @param {boolean} readOnly @param {string} [textIn] */
    const push = (abs, file, rank, load, readOnly, textIn) => {
      const text = textIn ?? readTextOrNull(abs);
      if (text === null || seen.has(file)) return;
      seen.add(file);
      layers.push({ file, text, rank, load, readOnly });
    };
    // Blank the lines inside or outside the devocd block, keeping line numbers.
    const split = (/** @type {string} */ text) => {
      let b = null;
      try { b = findBlock(text); } catch { /* malformed: everything counts as outside */ }
      if (!b) return [text, ''];
      const lines = text.split('\n');
      return [lines.map((l, i) => (i >= b.begin && i <= b.end ? '' : l)).join('\n'), lines.map((l, i) => (i > b.begin && i < b.end ? l : '')).join('\n')];
    };
    let parentFile = state.parentFile;
    if (state.kind === 'project') {
      try { parentFile = JSON.parse(readTextOrNull(join(companyRoot, '.devocd', 'state.json')) ?? '{}').parentFile; } catch { parentFile = undefined; }
    }
    const parentAbs = resolve(companyRoot, typeof parentFile === 'string' && parentFile ? parentFile : 'CLAUDE.md');
    for (const n of ['CLAUDE.md', '.claude/CLAUDE.md', 'AGENTS.md']) {
      if (resolve(root, n) !== parentAbs) push(join(root, n), n, 0, 'always', true);
    }
    const localText = readTextOrNull(join(root, 'CLAUDE.local.md'));
    const [localOut, localIn] = localText === null ? ['', ''] : split(localText);
    if (localText !== null && join(root, 'CLAUDE.local.md') !== parentAbs) push('', 'CLAUDE.local.md (team)', 0, 'always', true, localOut);
    const memDir = opts.memoryDir ?? memoryDirFor(root);
    /** @type {string[]} */ let mem = [];
    try { mem = readdirSync(memDir, { withFileTypes: true }).filter(e => e.isFile() && e.name.endsWith('.md')).map(e => e.name).sort(); } catch { /* no memory folder */ }
    mem.sort((x, y) => Number(y === 'MEMORY.md') - Number(x === 'MEMORY.md'));
    for (const n of mem) push(join(memDir, n), `~memory/${n}`, 0, n === 'MEMORY.md' ? 'always' : 'demand', true);
    // A project or reference memory is a shared fact that belongs in .devocd/: it yields (personal ones keep theirs).
    for (const l of layers) {
      if (!l.file.startsWith('~memory/')) continue;
      const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(l.text.replace(/^\W*(?=---)/, ''))?.[1] ?? '';
      if (/^\s*type:\s*["']?(project|reference)\b/m.test(fm)) l.yields = true;
    }
    const parentText = readTextOrNull(parentAbs);
    if (parentText !== null) {
      const [outside, inside] = split(parentText);
      push('', `${rel(parentAbs)} (team)`, 0, 'always', true, outside);
      push('', rel(parentAbs), 1, 'always', false, inside);
    }
    for (const abs of walkFiles(join(companyRoot, '.devocd', 'standards'))) if (abs.endsWith('.md')) push(abs, rel(abs), 2, 'demand', false);
    if (state.kind === 'project') push('', 'CLAUDE.local.md', 3, 'always', false, localIn);
    const dev = join(root, '.devocd');
    for (const abs of walkFiles(dev, (a, name) => (name === '.backups' || name === 'draft') && dirname(a) === dev)) {
      const r = toPosix(relative(dev, abs));
      if (!r.endsWith('.md') || r === 'pointer.md') continue;
      const rank = r === 'PROJECT.md' ? 4 : /^(code|flows)\//.test(r) ? 6 + (r.match(/\//g) || []).length : 5;
      push(abs, rel(abs), rank, 'demand', false);
    }
    return findRepeats(layers).map(r => /** @type {Issue} */ ({
      rule: 'context/repeated', severity: r.severity, file: r.file.replace(' (team)', ''), line: r.line,
      message: `repeats ${r.keep.replace(' (team)', '')}:${r.keepLine} (${r.match}, estimated weight ${r.estimatedWeight})`,
      hint: 'State each fact once, in its home layer, and link or cite it elsewhere. The weight is a rough estimate, not measured savings.',
    }));
  }

  // .devocd/**
  const devDir = join(root, '.devocd');
  let unconfirmed = 0;
  // draft/ holds unapproved files written for their final location; like .backups, it is not live knowledge.
  const devFiles = walkFiles(devDir, (abs, name) => (name === '.backups' || name === 'draft') && dirname(abs) === devDir);
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
  issues.push(...repeatIssues());
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

  // Content checks are warnings and notes only.
  if (state.kind === 'project') issues.push(...pageIssues(root));
  issues.push(...decisionIssues(root));
  policyRepoIssues();

  if (launch.tokens > LIMITS.launchTokens) {
    add({ rule: 'launch/over-target', severity: 'warning', file: '', message: `launch loads about ${launch.tokens} estimated tokens, target is ${LIMITS.launchTokens}`, hint: 'Trim the larger memory files listed by check --json.' });
  }
  return { issues, files, launch };
}
