// Read the hook counters behind `devocd hook-stats`. Read-only: nothing in this module writes.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lstatOrNull } from './fsutil.mjs';

/** The events the hooks record, in the order they are shown. */
export const HOOK_EVENTS = ['UserPromptSubmit', 'SessionStart'];

/** @param {string} message */
const malformed = (message) => Object.assign(new Error(message), { code: 'HOOK_STATS_MALFORMED' });

/**
 * `.devocd/journal/hook-stats.json` for a folder, or null when there is none.
 * Throws (code HOOK_STATS_MALFORMED) when the file is a link or not a counters object.
 * @param {string} dir
 */
export function readHookStats(dir) {
  const path = join(dir, '.devocd', 'journal', 'hook-stats.json');
  const found = lstatOrNull(path);
  if (!found) return null;
  if (!found.isFile() || found.isSymbolicLink()) throw malformed('hook-stats.json is not a regular file');
  let raw;
  try { raw = JSON.parse(readFileSync(path, 'utf8')); } catch { throw malformed('hook-stats.json is not valid JSON'); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !raw.events || typeof raw.events !== 'object' || Array.isArray(raw.events)) {
    throw malformed('hook-stats.json is not a counters file');
  }
  return raw;
}

/** A counter that is not a number counts as zero, so a damaged line never blocks the rest. */
const count = (/** @type {unknown} */ v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

/** One line per event, then the policy pointers recorded, then the date the counters started.
 * @param {any} stats */
export function formatHookStats(stats) {
  const events = stats.events ?? {};
  const known = HOOK_EVENTS.filter((name) => Object.hasOwn(events, name));
  const rest = Object.keys(events).filter((name) => !HOOK_EVENTS.includes(name)).sort();
  const lines = [...known, ...rest].map((name) => {
    const e = events[name] ?? {};
    const bytes = count(e.bytes);
    return `${name}: ${count(e.runs)} runs, ${count(e.injected)} injected, ${bytes} bytes (~${Math.round(bytes / 4)} estimated tokens)`;
  });
  const pointers = stats.pointers && typeof stats.pointers === 'object' && !Array.isArray(stats.pointers) ? Object.keys(stats.pointers).length : 0;
  if (pointers) lines.push(`pointers: ${pointers} recorded`);
  lines.push(`since ${typeof stats.since === 'string' ? stats.since : 'unknown'}`);
  return lines.join('\n');
}
