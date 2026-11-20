import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { insideWorkTree, assertNotTracked } from './protect.mjs';
import { assertSafeTarget, prepareTarget, codedError, lstatOrNull, toPosix } from './fsutil.mjs';

export const SETTINGS_OPS = Object.freeze(['add-exclude', 'remove-exclude', 'add-dir', 'remove-dir']);

/** @param {any} v */
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Edit .claude/settings.local.json under dir. Unrelated keys are kept; malformed files are refused.
 * @param {string} dir
 * @param {string} op one of SETTINGS_OPS
 * @param {string} value
 */
export function editSettings(dir, op, value) {
  if (!SETTINGS_OPS.includes(op)) throw codedError('USAGE', `unknown settings operation '${op}'`, `Use one of: ${SETTINGS_OPS.join(', ')}.`);
  if (typeof value !== 'string' || value === '') throw codedError('USAGE', 'settings needs a value', 'Give the path or pattern to add or remove.');
  const file = resolve(dir, '.claude', 'settings.local.json');
  if (insideWorkTree(resolve(dir))) assertNotTracked(resolve(dir), ['.claude/settings.local.json']);
  if (lstatOrNull(resolve(dir, '.claude'))) assertSafeTarget(file);
  const exists = !!lstatOrNull(file);
  /** @type {any} */
  let obj = {};
  if (exists) {
    const bad = () => codedError('SETTINGS_MALFORMED', `${toPosix(file)} is not a valid settings object; nothing was changed`, 'Fix the JSON by hand, then run again.');
    try { obj = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); } catch { throw bad(); }
    if (!isObj(obj)) throw bad();
    if (obj.claudeMdExcludes !== undefined && !Array.isArray(obj.claudeMdExcludes)) throw bad();
    if (obj.permissions !== undefined && !isObj(obj.permissions)) throw bad();
    if (isObj(obj.permissions) && obj.permissions.additionalDirectories !== undefined && !Array.isArray(obj.permissions.additionalDirectories)) throw bad();
  }

  const adding = op.startsWith('add-');
  const isExclude = op.endsWith('-exclude');
  const key = isExclude ? 'claudeMdExcludes' : 'additionalDirectories';
  if (adding && !isExclude && obj.permissions === undefined) obj.permissions = {};
  /** @type {any} */
  const holder = isExclude ? obj : obj.permissions;
  /** @type {string[]} */
  const list = (holder && holder[key]) || [];
  if (adding) {
    if (list.includes(value)) return; // already there: leave the file alone
    holder[key] = [...list, value];
  } else {
    if (!list.includes(value)) return; // nothing to remove: leave the file alone
    const rest = list.filter((x) => x !== value);
    if (rest.length) holder[key] = rest;
    else delete holder[key];
    if (!isExclude && Object.keys(holder).length === 0) delete obj.permissions;
  }

  if (Object.keys(obj).length === 0) {
    if (exists) rmSync(file);
    return;
  }
  const out = JSON.stringify(obj, null, 2) + '\n';
  prepareTarget(file);
  writeFileSync(file, out);
}
