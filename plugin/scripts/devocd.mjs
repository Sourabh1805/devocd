#!/usr/bin/env node
// @ts-check
import { existsSync, realpathSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkTree } from './lib/check.mjs';
import { writeBlock } from './lib/block.mjs';
import { estimateTokens } from './lib/tokens.mjs';
import { codedError, isRegularFile, lstatOrNull, readTextOrNull, toPosix } from './lib/fsutil.mjs';
import { protectRepo } from './lib/protect.mjs';
import { backupDir, restoreDir } from './lib/backup.mjs';
import { editSettings, SETTINGS_OPS } from './lib/settings.mjs';
import { applyDraft, registerProject, writeParent } from './lib/parent.mjs';
import { preflight } from './lib/preflight.mjs';
import { splitTeam } from './lib/split.mjs';
import { reviewDiff } from './lib/reviewdiff.mjs';
import { buildKnowledge, scopeKnowledge, searchKnowledge, routeKnowledge, writeKnowledge } from './lib/knowledge.mjs';
import { inventoryKnowledge } from './lib/inventory.mjs';
import { discoverProjects } from './lib/projects.mjs';
import { detectCommands } from './lib/commands.mjs';
import { detectDependencies } from './lib/deps.mjs';
import { refreshStatus, planRefresh, completeRefresh, baselineRefresh } from './lib/refresh.mjs';
import { integrateProject } from './lib/integrations.mjs';
import { readContextDraft, readContextQuery, loadContext, publishContext, inspectContext } from './lib/context-store.mjs';
import { resolveContext, affectedContext } from './lib/context-resolver.mjs';
import { adaptContext, agentRequest } from './lib/context-adapters.mjs';
import { refreshContext } from './lib/context-refresh.mjs';

const USAGE = [
  'usage: devocd <command> [args]',
  '  context-publish <company> <draft.json> <base-generation|none> [--apply]  validate, preview or atomically activate',
  '  context-resolve <company> <query.json> [claude|codex|antigravity]  deterministic context or adapter output',
  '  context-impact <company>       read-only: stale evidence and dependent records',
  '  context-refresh <company> <draft.json> <base-generation> [--apply]  preserve unaffected records',
  '  context-agent <company> <query.json> <mapper|policy-auditor|incident-investigator> [question]  bounded optional request',
  '  integrate <project> <codex|antigravity|all> [--apply]  preview or install native startup guidance',
  '  knowledge-route <dir> <query> [offset]  read-only: five matching page summaries, no page bodies',
  '  refresh-status <project>       read-only: detect changes since semantic refresh',
  '  refresh-plan <project>         capture source snapshot before semantic refresh',
  '  refresh-complete <project>     check, render and record an unchanged source snapshot',
  '  refresh-baseline <project>     render the graph and record the first freshness baseline after setup',
  '  discover-projects <parent>     read-only: immediate project folders, including non-Git folders',
  '  detect-commands <project>      read-only: documented command names from manifests, never script bodies',
  '  detect-dependencies <project>  read-only: cross-repository imports (git, workspace, submodule, nested repo)',
  '  knowledge-inventory <dir>      read-only: recursive source coverage and evidence hashes',
  '  knowledge-scope <dir> <scope>  read-only: nested subgraph (scope paths from knowledge.json)',
  '  knowledge <dir>                generate .devocd/knowledge.json and knowledge.html',
  '  knowledge-search <dir> <query>  read-only: search current Markdown knowledge, returning JSON',
  '  check <dir> [--json]            check a company or project folder',
  '  write-block <dir>/CLAUDE.local.md <dir>/.devocd/pointer.md   put the pointer block into a project set up by add-project',
  '  protect <dir>                   keep devocd files out of git (local exclude only)',
  '  backup <dir>                    back up .devocd and the pointer files',
  '  restore <dir> [stamp]           restore the newest or a named backup',
  '  settings <dir> <op> <value>     op: add-exclude, remove-exclude (a team file in the project state, absolute with /),',
  '                                  add-dir, remove-dir (the company standards folder preflight gives)',
  '  render-parent <company> [draft] write the parent file from state, or apply a *.draft.json state file first',
  '  register <company> <id> <path> <description>',
  '  split-team <dir> <plan>         copy line ranges of a team file into .devocd/team/ as .devocd/split.draft.json says, then delete the plan',
  '  review-diff <dir> <base|-> [--path <file>]  read-only: status, changed files and diff of the branch against a base (- is the default base)',
  '  preflight <dir> --json          read-only: is it home, which parent file, any AGENTS.md below, the company above, team files',
].join('\n');

/** Error codes that mean devocd refused or the input was bad (exit 1). Anything else is the environment (exit 3). */
const REFUSALS = new Set(['BLOCK_MALFORMED', 'NO_DIR', 'NOT_REGULAR', 'NOT_UTF8', 'ALREADY_TRACKED', 'KEY_RULES_TOO_LONG', 'PARENT_TOO_LONG',
  'INVALID_CONTEXT', 'STALE_CONTEXT', 'CONTEXT_CONFLICT', 'CONTEXT_LOCKED', 'CONTEXT_BLOCKED', 'CONTEXT_BUDGET',
  'PROJECT_OUTSIDE_COMPANY', 'INVALID_ID', 'SETTINGS_MALFORMED', 'NO_BACKUP', 'NO_DEVOCD', 'NO_STATE', 'INVALID_DRAFT', 'INVALID_PLAN', 'NO_BASE', 'BAD_PATH',
  'NOT_IGNORED', 'BAD_TARGET', 'BAD_SETTING', 'KNOWLEDGE_LIMIT', 'KNOWLEDGE_SECRET']);

/** @typedef {{ code: number, out?: string }} Result */

class UsageError extends Error {
  /** @param {string} message */
  constructor(message) { super(message); this.hint = USAGE; }
}

/** @param {string[]} args @returns {Result} */
function cmdCheck(args) {
  const json = args.includes('--json');
  const rest = args.filter((a) => a !== '--json');
  if (rest.length !== 1 || rest[0].startsWith('--')) throw new UsageError('check needs exactly one folder');
  const dir = resolve(rest[0]);
  if (!existsSync(dir)) throw Object.assign(new Error(`folder not found: ${toPosix(dir)}`), { code: 'ENOENT', hint: 'Check the path and run again.' });
  const r = checkTree(dir, {});
  const failed = r.issues.some((i) => i.severity === 'error');
  if (json) return { code: failed ? 1 : 0, out: JSON.stringify(r, null, 2) };
  const lines = [`devocd check ${toPosix(dir)}`];
  for (const f of r.files) lines.push(`  ${f.path}: ${f.kind}, ${f.lines} lines, about ${f.tokens} estimated tokens`);
  lines.push(`  launch: about ${r.launch.tokens} estimated tokens across ${r.launch.files.length} files`);
  for (const n of r.launch.notes) lines.push(`  note: ${n}`);
  for (const i of r.issues) {
    const where = i.file ? ` ${i.file}${i.line ? ':' + i.line : ''}` : '';
    lines.push(`${i.severity} ${i.rule}${where}: ${i.message}`);
    if (i.hint) lines.push(`  hint: ${i.hint}`);
  }
  const count = (/** @type {string} */ s) => r.issues.filter((i) => i.severity === s).length;
  lines.push(`${count('error')} errors, ${count('warning')} warnings, ${count('information')} information`);
  return { code: failed ? 1 : 0, out: lines.join('\n') };
}

/** Paths compare case-insensitively on Windows. */
const samePath = (/** @type {string} */ a, /** @type {string} */ b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);

/** dir's project state, read from a real .devocd folder, or null when there is none. */
function projectState(/** @type {string} */ dir) {
  const dev = lstatOrNull(join(dir, '.devocd'));
  if (!dev || dev.isSymbolicLink() || !dev.isDirectory()) return null;
  const text = readTextOrNull(join(dir, '.devocd', 'state.json'));
  try {
    const s = text === null ? null : JSON.parse(text);
    return s && typeof s === 'object' && s.kind === 'project' ? s : null;
  } catch { return null; }
}

/**
 * write-block takes one shape only, the one add-project uses: <project>/CLAUDE.local.md from <project>/.devocd/pointer.md,
 * in a folder holding project state. So this pre-approved command can't put text into any other file.
 * @param {string[]} args @returns {Result}
 */
function cmdWriteBlock(args) {
  if (args.length !== 2) throw new UsageError('write-block needs <dir>/CLAUDE.local.md <dir>/.devocd/pointer.md');
  const target = resolve(args[0]);
  const dir = dirname(target);
  const pointer = join(dir, '.devocd', 'pointer.md');
  const refuse = (/** @type {string} */ why) => codedError('BAD_TARGET', `write-block refused ${toPosix(target)}: ${why}`,
    'It writes only <project>/CLAUDE.local.md from <project>/.devocd/pointer.md, in a folder add-project has set up. Nothing was written.');
  if (basename(target) !== 'CLAUDE.local.md') throw refuse('the file must be CLAUDE.local.md');
  if (!samePath(resolve(args[1]), pointer)) throw refuse(`the text must come from ${toPosix(pointer)}`);
  if (!projectState(dir)) throw refuse('the folder has no devocd project state');
  if (!isRegularFile(pointer)) throw refuse(`${toPosix(pointer)} is missing, a link or not a regular file`);
  return { code: 0, out: `wrote ${writeBlock(target, pointer)}` };
}

/** @param {string} dir */
function realDir(dir) {
  const abs = resolve(dir);
  if (!existsSync(abs)) throw Object.assign(new Error(`folder not found: ${toPosix(abs)}`), { code: 'ENOENT', hint: 'Check the path and run again.' });
  return abs;
}

/** @param {string[]} args @returns {Result} */
function cmdProtect(args) {
  if (args.length !== 1) throw new UsageError('protect needs exactly one folder');
  const r = protectRepo(realDir(args[0]));
  if (r.status === 'not-a-repo') return { code: 0, out: 'not a git repository; nothing to protect' };
  return { code: 0, out: r.added.length ? `protected: added ${r.added.join(', ')} to the local git exclude file` : 'protected: already up to date' };
}

/** @param {string[]} args @returns {Result} */
function cmdBackup(args) {
  if (args.length !== 1) throw new UsageError('backup needs exactly one folder');
  return { code: 0, out: `backup ${backupDir(realDir(args[0]))} saved in .devocd/.backups` };
}

/** @param {string[]} args @returns {Result} */
function cmdRestore(args) {
  if (args.length < 1 || args.length > 2) throw new UsageError('restore needs <dir> and an optional stamp');
  return { code: 0, out: `restored backup ${restoreDir(realDir(args[0]), args[1])}` };
}

/** The team files add-project records; only these may be excluded. */
const TEAM_FILE_PATHS = new Set(['CLAUDE.md', '.claude/CLAUDE.md', 'AGENTS.md']);

/**
 * settings takes only the values add-project uses, in a folder holding project state: for *-dir, the company standards
 * folder preflight gives for it; for *-exclude, the absolute forward-slash path of a team file its state records.
 * @param {string} dir @param {string} op @param {string} value
 */
function assertSettingAllowed(dir, op, value) {
  const refuse = (/** @type {string} */ why, /** @type {string} */ hint) => codedError('BAD_SETTING', `settings ${op} refused: ${why}`, `${hint} Nothing was changed.`);
  const state = projectState(dir);
  if (!state) throw refuse(`${toPosix(dir)} has no devocd project state`, 'Run it on a project folder add-project has set up.');
  if (op.endsWith('-dir')) {
    const standards = preflight(dir).company?.standards;
    if (!standards) throw refuse('no company folder holds this project', 'Run /devocd:install in the company folder first.');
    if (!samePath(value, standards)) throw refuse('the only folder it takes is the company standards folder', `For this project that is ${standards}.`);
    return;
  }
  const allowed = (Array.isArray(state.teamFiles) ? state.teamFiles : [])
    .filter((/** @type {any} */ t) => t && TEAM_FILE_PATHS.has(t.path)).map((/** @type {any} */ t) => toPosix(join(dir, t.path)));
  if (!allowed.some((a) => samePath(value, a))) {
    throw refuse("the only paths it takes are team files in this project's state, absolute with forward slashes", allowed.length ? `For this project: ${allowed.join(', ')}.` : 'This project records no team file.');
  }
}

/** @param {string[]} args @returns {Result} */
function cmdSettings(args) {
  if (args.length !== 3) throw new UsageError('settings needs <dir> <op> <value>');
  const dir = realDir(args[0]);
  if (SETTINGS_OPS.includes(args[1])) assertSettingAllowed(dir, args[1], args[2]);
  editSettings(dir, args[1], args[2]);
  return { code: 0, out: `settings ${args[1]} done` };
}

/** @param {{ file: string, block: string, overflow: boolean }} r */
function describeParent(r) {
  return `wrote ${r.file}: ${r.block.split('\n').length} lines, about ${estimateTokens(r.block)} estimated tokens${r.overflow ? '; project list is in .devocd/projects.md' : ''}`;
}

/** @param {string[]} args @returns {Result} */
function cmdRenderParent(args) {
  if (args.length < 1 || args.length > 2) throw new UsageError('render-parent needs a company folder and at most one draft state file');
  const dir = realDir(args[0]);
  return { code: 0, out: describeParent(args.length === 2 ? applyDraft(dir, args[1]) : writeParent(dir)) };
}

/** @param {string[]} args @returns {Result} */
function cmdPreflight(args) {
  const rest = args.filter((a) => a !== '--json');
  if (rest.length !== 1 || !args.includes('--json')) throw new UsageError('preflight needs <dir> --json');
  return { code: 0, out: JSON.stringify(preflight(realDir(rest[0]))) };
}

/** @param {string[]} args @returns {Result} */
function cmdRegister(args) {
  if (args.length !== 4) throw new UsageError('register needs <company> <id> <path> <description>');
  const [company, id, path, description] = args;
  return { code: 0, out: describeParent(registerProject(realDir(company), { id, path, description })) };
}

/** @param {string[]} args @returns {Result} */
function cmdSplitTeam(args) {
  if (args.length !== 2) throw new UsageError('split-team needs <dir> <plan-file>');
  return { code: 0, out: JSON.stringify(splitTeam(realDir(args[0]), args[1]), null, 2) };
}

/** @param {string[]} args @returns {Result} */
function cmdReviewDiff(args) {
  const i = args.indexOf('--path');
  const rest = i < 0 ? args : args.slice(0, i);
  const path = i < 0 ? undefined : args[i + 1];
  if (rest.length !== 2 || (i >= 0 && (args.length !== i + 2 || path === undefined))) throw new UsageError('review-diff needs <dir> <base|-> and an optional --path <file>');
  return { code: 0, out: reviewDiff(realDir(rest[0]), rest[1], { path }) };
}

/** Add new commands here. */
const COMMANDS = /** @type {Record<string, (args: string[]) => Result>} */ ({
  'context-refresh': args => {
    if (args.length < 3 || args.length > 4 || (args.length === 4 && args[3] !== '--apply') || !/^[a-f0-9]{64}$/.test(args[2])) throw new UsageError('context-refresh needs company, draft, base generation and optional --apply');
    const root = realDir(args[0]);
    return { code: 0, out: JSON.stringify(refreshContext(root, readContextDraft(root, args[1]), { apply: args[3] === '--apply', expectedGeneration: args[2] }), null, 2) };
  },
  'context-publish': args => {
    if (args.length < 3 || args.length > 4 || (args.length === 4 && args[3] !== '--apply') || (args[2] !== 'none' && !/^[a-f0-9]{64}$/.test(args[2]))) throw new UsageError('context-publish needs company, relative draft path, base generation or none, and optional --apply');
    const root = realDir(args[0]);
    return { code: 0, out: JSON.stringify(publishContext(root, readContextDraft(root, args[1]), { apply: args[3] === '--apply', expectedGeneration: args[2] === 'none' ? null : args[2] }), null, 2) };
  },
  'context-impact': args => {
    if (args.length !== 1) throw new UsageError('context-impact needs a company folder');
    const root = realDir(args[0]), snapshot = loadContext(root), inspection = inspectContext(root, snapshot);
    return { code: 0, out: JSON.stringify({ generation: snapshot.generation, ...affectedContext(snapshot.model, inspection.evidence), ...inspection }, null, 2) };
  },
  ...Object.fromEntries(['context-resolve', 'context-agent'].map(command => [command, args => {
    if (args.length < 2 || args.length > (command === 'context-agent' ? 4 : 3) || (command === 'context-agent' && args.length < 3)) throw new UsageError(`${command} needs company, relative query JSON and optional host or required agent/question`);
    const root = realDir(args[0]), snapshot = loadContext(root), { generation, model } = snapshot;
    const query = readContextQuery(root, args[1]);
    const inspection = inspectContext(root, snapshot);
    const result = resolveContext(model, query, inspection.evidence);
    if (!inspection.complete || inspection.discoveryProjects.includes(query.project)) {
      result.status = 'blocked';
      result.discoveryRequired = true;
    }
    const output = command === 'context-agent' ? agentRequest(args[2], result, { model, question: args[3] }) : args[2] ? adaptContext(args[2], result) : result;
    return { code: result.status === 'blocked' && command !== 'context-agent' ? 1 : 0, out: JSON.stringify({ generation, ...output }, null, 2) };
  }])),
  integrate: (args) => {
    if (args.length < 2 || args.length > 3 || (args.length === 3 && args[2] !== '--apply')) throw new UsageError('integrate needs a project, tool and optional --apply');
    return { code: 0, out: JSON.stringify(integrateProject(realDir(args[0]), args[1], args[2] === '--apply'), null, 2) };
  },
  'knowledge-route': (args) => {
    if (args.length < 2 || args.length > 3 || (args[2] !== undefined && !/^\d+$/.test(args[2]))) throw new UsageError('knowledge-route needs a folder, query and optional nonnegative offset');
    return { code: 0, out: JSON.stringify(routeKnowledge(buildKnowledge(realDir(args[0])), args[1], Number(args[2] ?? 0)), null, 2) };
  },
  ...Object.fromEntries([['refresh-status', refreshStatus], ['refresh-plan', planRefresh], ['refresh-complete', completeRefresh], ['refresh-baseline', baselineRefresh]].map(([name, fn]) => [name, (args) => {
    if (args.length !== 1) throw new UsageError(`${name} needs exactly one project folder`);
    return { code: 0, out: JSON.stringify(fn(realDir(args[0])), null, 2) };
  }])),
  'discover-projects': (args) => {
    if (args.length !== 1) throw new UsageError('discover-projects needs exactly one parent folder');
    return { code: 0, out: JSON.stringify(discoverProjects(realDir(args[0])), null, 2) };
  },
  'detect-commands': (args) => {
    const rest = args.filter((a) => a !== '--json');
    if (rest.length !== 1) throw new UsageError('detect-commands needs exactly one project folder');
    return { code: 0, out: JSON.stringify(detectCommands(realDir(rest[0])), null, 2) };
  },
  'detect-dependencies': (args) => {
    const rest = args.filter((a) => a !== '--json');
    if (rest.length !== 1) throw new UsageError('detect-dependencies needs exactly one project folder');
    return { code: 0, out: JSON.stringify(detectDependencies(realDir(rest[0])), null, 2) };
  },
  'knowledge-scope': (args) => {
    if (args.length !== 2) throw new UsageError('knowledge-scope needs a folder and scope');
    return { code: 0, out: JSON.stringify(scopeKnowledge(buildKnowledge(realDir(args[0])), args[1]), null, 2) };
  },
  'knowledge-inventory': (args) => {
    if (args.length !== 1) throw new UsageError('knowledge-inventory needs exactly one folder');
    return { code: 0, out: JSON.stringify(inventoryKnowledge(realDir(args[0])), null, 2) };
  },
  knowledge: (args) => {
    if (args.length !== 1) throw new UsageError('knowledge needs exactly one folder');
    return { code: 0, out: JSON.stringify(writeKnowledge(realDir(args[0])), null, 2) };
  },
  'knowledge-search': (args) => {
    if (args.length !== 2 || !args[1].trim()) throw new UsageError('knowledge-search needs a folder and a non-empty quoted query');
    return { code: 0, out: JSON.stringify(searchKnowledge(buildKnowledge(realDir(args[0])), args[1]), null, 2) };
  },
  check: cmdCheck,
  'write-block': cmdWriteBlock,
  protect: cmdProtect,
  backup: cmdBackup,
  restore: cmdRestore,
  settings: cmdSettings,
  'render-parent': cmdRenderParent,
  register: cmdRegister,
  preflight: cmdPreflight,
  'split-team': cmdSplitTeam,
  'review-diff': cmdReviewDiff,
});

/** @param {string[]} argv @returns {number} exit code */
export function main(argv) {
  const [cmd, ...args] = argv;
  try {
    const fn = cmd && Object.hasOwn(COMMANDS, cmd) ? COMMANDS[cmd] : null;
    if (!fn) throw new UsageError(cmd ? `unknown command '${cmd}'` : 'no command given');
    const r = fn(args);
    if (r.out) console.log(r.out);
    return r.code;
  } catch (e) {
    const err = /** @type {any} */ (e);
    console.error(`error: ${err.message}`);
    if (err.hint) console.error(err.hint.split('\n').map((/** @type {string} */ l, /** @type {number} */ i) => (i === 0 ? `hint: ${l}` : l)).join('\n'));
    if (process.env.DEVOCD_DEBUG === '1') console.error(err.stack);
    if (err instanceof UsageError || err.code === 'USAGE') return 2;
    if (REFUSALS.has(err.code)) return 1;
    return 3;
  }
}

if (process.argv[1] && existsSync(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
