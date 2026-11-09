// @ts-check
import { readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { assertSafeTarget, codedError, isRegularFile, lstatOrNull, prepareTarget, toPosix, walkFiles } from './fsutil.mjs';

export const PLAN_NAME = 'split.draft.json';
const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_FILE_LINES = 200;
const MAX_TOPIC = 80;

/** @param {string} message @param {string} [hint] */
const refuse = (message, hint = 'Nothing was written. Fix the plan and run again.') => codedError('INVALID_PLAN', message, hint);

/** @param {any} n @param {number} max */
const isLineNo = (n, max) => Number.isInteger(n) && n >= 1 && n <= max;

/** @param {string} r */
const escapes = (r) => r === '' || r === '..' || r.startsWith('..' + sep) || isAbsolute(r);

/**
 * Copy line ranges of a team file into .devocd/team/ and report the inline lines. The agent decides which lines go where;
 * this reads the team file itself and copies bytes, so nothing the agent types is ever written as team content.
 * The plan file is deleted whatever happens, once it is known to be the right file.
 * @param {string} projectDir
 * @param {string} planFile
 * @returns {{ files: { name: string, path: string, topic: string, lines: number }[], inline: { line: number, text: string }[], flagged: number[] }}
 */
export function splitTeam(projectDir, planFile) {
  const dir = resolve(projectDir);
  const plan = resolve(planFile);
  if (plan !== resolve(dir, '.devocd', PLAN_NAME)) {
    throw codedError('USAGE', `the plan must be .devocd/${PLAN_NAME} inside the project folder`, 'Nothing was changed or removed.');
  }
  // A linked .devocd (or project folder) is refused before the plan is read or removed and before .devocd/team is touched.
  assertSafeTarget(plan);
  if (!isRegularFile(plan)) throw refuse(`the plan ${toPosix(plan)} is missing or not a regular file`, 'Write the plan again, then run this again.');
  try {
    return apply(dir, readPlan(plan));
  } finally {
    rmSync(plan, { force: true });
  }
}

/** @param {string} plan */
function readPlan(plan) {
  /** @type {any} */ let p;
  try { p = JSON.parse(readFileSync(plan, 'utf8').replace(/^\uFEFF/, '')); } catch { throw refuse('the plan is not valid JSON'); }
  const ok = p && typeof p === 'object' && !Array.isArray(p) && typeof p.teamFile === 'string' && p.teamFile !== ''
    && Array.isArray(p.inline) && Array.isArray(p.flagged) && Array.isArray(p.files)
    && p.files.every((/** @type {any} */ f) => f && typeof f === 'object' && typeof f.name === 'string' && typeof f.topic === 'string');
  if (!ok) throw refuse('the plan needs teamFile, inline, flagged and files [{ name, topic, from, to }]');
  return p;
}

/** @param {string} dir @param {any} p */
function apply(dir, p) {
  const abs = resolve(dir, p.teamFile);
  const rel = relative(dir, abs);
  if (escapes(rel)) throw refuse(`teamFile '${toPosix(rel).slice(0, 60)}' is not inside the project folder`);
  if (!isRegularFile(abs)) throw refuse(`${toPosix(abs)} is missing, a link or not a regular file`);
  if (escapes(relative(realpathSync(dir), realpathSync(abs)))) throw refuse('teamFile resolves outside the project folder');

  const buf = readFileSync(abs);
  const text = buf.toString('utf8');
  if (buf.includes(0) || !Buffer.from(text, 'utf8').equals(buf)) throw refuse('the team file is not valid UTF-8 text');
  // Each line keeps its own terminator, so a copy is byte for byte (CRLF and a BOM on line 1 included).
  const lines = text === '' ? [] : text.split(/(?<=\n)/);
  const n = lines.length;

  for (const [key, list] of [['inline', p.inline], ['flagged', p.flagged]]) {
    if (!list.every((/** @type {any} */ x) => isLineNo(x, n))) throw refuse(`${key} holds a line number outside 1-${n}`);
  }
  /** @type {Set<string>} */ const names = new Set();
  /** @type {boolean[]} */ const covered = new Array(n + 1).fill(false);
  /** @type {boolean[]} */ const moved = new Array(n + 1).fill(false);
  for (const f of p.files) {
    if (!NAME.test(f.name)) throw refuse(`file name '${f.name.slice(0, 40)}' must be lowercase letters, digits and single hyphens`);
    if (names.has(f.name)) throw refuse(`file name '${f.name}' is used twice`);
    names.add(f.name);
    if (f.topic.length > MAX_TOPIC || /[\r\n]/.test(f.topic)) throw refuse(`the topic of '${f.name}' must be one line of at most ${MAX_TOPIC} characters`);
    if (!isLineNo(f.from, n) || !isLineNo(f.to, n) || f.from > f.to) throw refuse(`'${f.name}' has a range outside 1-${n}`);
    if (f.to - f.from + 2 > MAX_FILE_LINES) throw refuse(`'${f.name}' would have ${f.to - f.from + 2} lines with its header, the limit is ${MAX_FILE_LINES}`, 'Split it into more files.');
    for (let i = f.from; i <= f.to; i++) {
      if (moved[i]) throw refuse(`line ${i} is in more than one file`);
      moved[i] = true;
    }
  }
  for (const x of [...p.inline, ...p.flagged]) covered[x] = true;
  const uncovered = [];
  for (let i = 1; i <= n; i++) if (!covered[i] && !moved[i] && lines[i - 1].trim() !== '') uncovered.push(i);
  if (uncovered.length) {
    throw refuse(`${uncovered.length} non-blank line${uncovered.length === 1 ? '' : 's'} of the team file are in no list; first: ${uncovered.slice(0, 8).join(', ')}`,
      'Every non-blank line must be inline, flagged or in a moved file. Nothing was written.');
  }

  const teamDir = join(dir, '.devocd', 'team');
  const teamSt = lstatOrNull(teamDir);
  if (teamSt && !teamSt.isDirectory()) throw refuse(`${toPosix(teamDir)} is a link or not a real folder`, 'devocd never writes or removes through symlinks or junctions. Nothing was written or removed.');
  const targets = p.files.map((/** @type {any} */ f) => join(teamDir, `${f.name}.md`));
  for (const t of targets) checkTarget(t);
  // Safe to write. First drop moved files an earlier run left that this plan no longer names.
  const keep = new Set(targets.map((/** @type {string} */ t) => resolve(t)));
  for (const f of walkFiles(teamDir, () => true)) if (f.endsWith('.md') && !keep.has(resolve(f))) rmSync(f);
  for (const [i, f] of p.files.entries()) {
    prepareTarget(targets[i]);
    writeFileSync(targets[i], `From ${toPosix(rel)} lines ${f.from}-${f.to}; the team file is the source.\n` + lines.slice(f.from - 1, f.to).join(''));
  }
  return {
    files: p.files.map((/** @type {any} */ f) => ({ name: f.name, path: `.devocd/team/${f.name}.md`, topic: f.topic, lines: f.to - f.from + 1 })),
    inline: [...new Set(/** @type {number[]} */ (p.inline))].sort((a, b) => a - b).map((line) => ({ line, text: lines[line - 1].replace(/\r?\n$/, '') })),
    flagged: [...new Set(/** @type {number[]} */ (p.flagged))].sort((a, b) => a - b),
  };
}

/** Refuse a target that is a link, or sits under one, before anything is removed or written. */
function checkTarget(/** @type {string} */ t) {
  const st = lstatOrNull(t);
  if (st && !st.isFile()) throw codedError('NOT_REGULAR', `${toPosix(t)} is a link or not a regular file`, 'devocd never writes through symlinks.');
  const folder = resolve(t, '..');
  const fst = lstatOrNull(folder);
  if (fst && (fst.isSymbolicLink() || !fst.isDirectory())) throw codedError('NO_DIR', `folder ${toPosix(folder)} is a link`, 'Write inside a real folder, not through a symlink or junction.');
  if (fst) assertSafeTarget(t);
}
