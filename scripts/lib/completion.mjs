// @ts-check
// Separate completion states: collecting history, publishing approved knowledge and refreshing
// the source snapshot advance independently, so a failed or declined step advances nothing.
import { join, resolve } from 'node:path';
import { assertSafeTarget, codedError, readTextOrNull, writeFilesAtomic } from './fsutil.mjs';

/** @typedef {'historyCollected'|'knowledgePublished'|'sourceRefreshed'} CompletionStep */
/** @typedef {{ historyCollected: string|null, knowledgePublished: string|null, sourceRefreshed: string|null }} Completion */

/** @type {CompletionStep[]} */
export const COMPLETION_STEPS = ['historyCollected', 'knowledgePublished', 'sourceRefreshed'];

/** @param {string} root @returns {any} state object or null when unreadable */
function readState(root) {
  const text = readTextOrNull(join(resolve(root), '.devocd', 'state.json'));
  if (text === null) return null;
  try {
    const state = JSON.parse(text);
    return state && typeof state === 'object' && !Array.isArray(state) ? state : null;
  } catch { return null; }
}

/**
 * Completion timestamps in a project (or company) state file. Missing completion, a missing
 * state file or an unreadable one reads as "nothing reached yet"; every step is `null`.
 * @param {string} root
 * @returns {Completion}
 */
export function readCompletion(root) {
  const completion = readState(root)?.completion;
  return /** @type {Completion} */ (Object.fromEntries(COMPLETION_STEPS.map((step) =>
    [step, typeof completion?.[step] === 'string' ? completion[step] : null])));
}

/**
 * Record one completion step and leave the others untouched. Writes state.json atomically
 * (temp file + rename), so a failed write never truncates a valid state file.
 * @param {string} root
 * @param {CompletionStep} step
 * @param {string} [at] ISO-8601 timestamp; defaults to now
 * @returns {Completion} the written completion object
 */
export function advanceCompletion(root, step, at = new Date().toISOString()) {
  if (!COMPLETION_STEPS.includes(step)) {
    throw codedError('USAGE', `unknown completion step '${String(step)}'`, `Steps: ${COMPLETION_STEPS.join(', ')}.`);
  }
  const dir = resolve(root), file = join(dir, '.devocd', 'state.json');
  const state = readState(dir);
  if (!state) throw codedError('NO_STATE', 'Completion needs a readable .devocd/state.json.', 'Run add-project or install first.');
  assertSafeTarget(file);
  const current = readCompletion(dir);
  current[step] = at;
  state.completion = current;
  writeFilesAtomic([{ path: file, content: JSON.stringify(state, null, 2) + '\n' }]);
  return { ...current };
}
