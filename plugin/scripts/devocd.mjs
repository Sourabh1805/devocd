#!/usr/bin/env node
// @ts-check
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkTree } from './lib/check.mjs';
import { writeBlock } from './lib/block.mjs';
import { toPosix } from './lib/fsutil.mjs';

const USAGE = [
  'usage: devocd <command> [args]',
  '  check <dir> [--json]            check a company or project folder',
  '  write-block <file> <inner-file> put the managed block into a file',
].join('\n');

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

/** Add new commands here. */
const COMMANDS = /** @type {Record<string, (args: string[]) => Result>} */ ({
  check: cmdCheck,
  'write-block': cmdWriteBlock,
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
    if (err instanceof UsageError) return 2;
    if (err.code === 'BLOCK_MALFORMED' || err.code === 'NO_DIR' || err.code === 'NOT_REGULAR' || err.code === 'NOT_UTF8') return 1;
    return 3;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
