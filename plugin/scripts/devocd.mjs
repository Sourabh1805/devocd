#!/usr/bin/env node
// @ts-check
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkTree } from './lib/check.mjs';
import { writeBlock } from './lib/block.mjs';
import { estimateTokens } from './lib/tokens.mjs';
import { toPosix } from './lib/fsutil.mjs';
import { protectRepo } from './lib/protect.mjs';
import { backupDir, restoreDir } from './lib/backup.mjs';
import { editSettings } from './lib/settings.mjs';
import { applyDraft, registerProject, writeParent } from './lib/parent.mjs';
import { preflight } from './lib/preflight.mjs';

const USAGE = [
  'usage: devocd <command> [args]',
  '  check <dir> [--json]            check a company or project folder',
  '  write-block <file> <inner-file> put the managed block into a file',
  '  protect <dir>                   keep devocd files out of git (local exclude only)',
  '  backup <dir>                    back up .devocd and the pointer files',
  '  restore <dir> [stamp]           restore the newest or a named backup',
  '  settings <dir> <op> <value>     op: add-exclude, remove-exclude, add-dir, remove-dir',
  '  render-parent <company> [draft] write the parent file from state, or apply a *.draft.json state file first',
  '  register <company> <id> <path> <description>',
  '  preflight <dir> --json          read-only: is it home, which parent file, any AGENTS.md below, the company above, team files',
].join('\n');

/** Error codes that mean devocd refused or the input was bad (exit 1). Anything else is the environment (exit 3). */
const REFUSALS = new Set(['BLOCK_MALFORMED', 'NO_DIR', 'NOT_REGULAR', 'NOT_UTF8', 'ALREADY_TRACKED', 'KEY_RULES_TOO_LONG', 'PARENT_TOO_LONG',
  'PROJECT_OUTSIDE_COMPANY', 'INVALID_ID', 'SETTINGS_MALFORMED', 'NO_BACKUP', 'NO_DEVOCD', 'NO_STATE', 'INVALID_DRAFT']);

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

/** @param {string[]} args @returns {Result} */
function cmdWriteBlock(args) {
  if (args.length !== 2) throw new UsageError('write-block needs <file> <inner-file>');
  return { code: 0, out: `wrote ${writeBlock(args[0], args[1])}` };
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

/** @param {string[]} args @returns {Result} */
function cmdSettings(args) {
  if (args.length !== 3) throw new UsageError('settings needs <dir> <op> <value>');
  editSettings(realDir(args[0]), args[1], args[2]);
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

/** Add new commands here. */
const COMMANDS = /** @type {Record<string, (args: string[]) => Result>} */ ({
  check: cmdCheck,
  'write-block': cmdWriteBlock,
  protect: cmdProtect,
  backup: cmdBackup,
  restore: cmdRestore,
  settings: cmdSettings,
  'render-parent': cmdRenderParent,
  register: cmdRegister,
  preflight: cmdPreflight,
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
