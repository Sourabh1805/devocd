// @ts-check
// What a live run touched, worked out from its tool calls. Used by tests/e2e/routing.test.mjs.
import { resolve } from 'node:path';

/** Lower-case forward-slash form, so paths compare on Windows. */
export const norm = (/** @type {string} */ p) => p.split('\\').join('/').toLowerCase();

/** The leading path segments of a glob that hold no wildcard, e.g. `auth/src/**` gives `auth/src`. */
function literalPrefix(/** @type {unknown} */ glob) {
  if (typeof glob !== 'string') return '';
  const keep = [];
  for (const seg of glob.split(/[\\/]/)) {
    if (/[*?{[]/.test(seg)) break;
    keep.push(seg);
  }
  return keep.join('/');
}

/**
 * Every path a run read or searched, absolute and normalised. A Glob or Grep with no path searches the run folder,
 * and a glob that embeds a path narrows it. A search that still covers the whole company folder is `broad`.
 * @param {any[]} events @param {string} cwd @param {string} company
 * @returns {{ paths: string[], broad: boolean }}
 */
export function accessed(events, cwd, company) {
  /** @type {string[]} */ const paths = [];
  let broad = false;
  for (const e of events) {
    if (e.type !== 'assistant' || !Array.isArray(e.message?.content)) continue;
    for (const b of e.message.content) {
      if (b.type !== 'tool_use') continue;
      const inp = b.input ?? {};
      if (b.name === 'Read' && typeof inp.file_path === 'string') paths.push(norm(resolve(cwd, inp.file_path)));
      else if (b.name === 'Glob' || b.name === 'Grep') {
        const base = resolve(cwd, typeof inp.path === 'string' ? inp.path : '.');
        const eff = norm(resolve(base, literalPrefix(b.name === 'Glob' ? inp.pattern : inp.glob)));
        if (eff === norm(resolve(company))) broad = true;
        else paths.push(eff);
      }
    }
  }
  return { paths, broad };
}

/**
 * Projects other than `own` that a run touched: a path at or inside one, or a broad search of the company folder.
 * @param {string[]} ids @param {string} own @param {string} company @param {{ paths: string[], broad: boolean }} a
 */
export function unrelatedTouched(ids, own, company, a) {
  return ids.filter((id) => {
    if (id === own) return false;
    const dir = norm(resolve(company, id));
    return a.broad || a.paths.some((p) => p === dir || p.startsWith(dir + '/'));
  });
}
