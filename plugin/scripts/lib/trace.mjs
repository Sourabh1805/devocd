// @ts-check
// Read-only leaf-first lookup: closest page, parent chain, governing policies, freshness. Metadata only.

import { buildKnowledge } from './knowledge.mjs';
import { rankPages } from './search.mjs';
import { inventoryKnowledge } from './inventory.mjs';
import { isAbsolute, relative, resolve } from 'node:path';

/** @typedef {import('./knowledge.mjs').KnowledgeNode} KnowledgeNode */

const NOTE = 'Open the leaf first; go up the chain or to a policy only if it does not answer the task.';
const NO_MATCH = 'No page matches; search different terms or inspect source.';
const CHAIN_CAP = 20;
const GLOB_CHARS = /[*?{]/;

/** Translate a small glob (`**`, `*`, `?`, `{a,b}`) into an anchored RegExp. */
function globToRegExp(/** @type {string} */ glob) {
  let out = '';
  let depth = 0;
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') { i++; out += '(?:.*/)?'; }
        // A trailing `/**` also matches the folder itself, so tracing `src/billing` finds `src/billing/**`.
        else if (i === glob.length - 1 && out.endsWith('/')) out = `${out.slice(0, -1)}(?:/.*)?`;
        else out += '.*';
      } else out += '[^/]*';
    } else if (c === '?') out += '[^/]';
    else if (c === '{') { depth++; out += '(?:'; }
    else if (c === '}' && depth > 0) { depth--; out += ')'; }
    else if (c === ',' && depth > 0) out += '|';
    else out += c.replace(/[.+^$()|[\]\\{}]/g, '\\$&');
  }
  while (depth-- > 0) out += ')';
  return new RegExp(`^${out}$`);
}

/** @returns {number} specificity (literal prefix length) when the pattern matches the path, else -1 */
function scopeMatch(/** @type {string} */ pattern, /** @type {string} */ path) {
  const p = pattern.replace(/^\.\//, '').replace(/\/+$/, '');
  if (!p) return -1;
  if (!GLOB_CHARS.test(p)) return path === p || path.startsWith(`${p}/`) ? p.length : -1;
  let re;
  try { re = globToRegExp(p); } catch { return -1; }
  return re.test(path) ? p.search(GLOB_CHARS) : -1;
}

/**
 * Page freshness: cited evidence hashes against the current inventory. Advisory: an inventory that
 * cannot be built (too many entries, git failure) leaves it unknown.
 * @param {string} dir project root
 * @param {{ files: Array<{ path: string, status: string, sha256?: string }>, skipped?: Array<{ path: string, reason: string }> }} [inventory]
 * @returns {(n: KnowledgeNode) => 'current' | 'stale' | 'unknown'}
 */
export function freshnessOf(dir, inventory) {
  let inv = inventory ?? null;
  if (!inv) { try { inv = inventoryKnowledge(dir); } catch { inv = null; } }
  const invByPath = new Map((inv?.files ?? []).map(f => [f.path, f]));
  const skippedPaths = new Set((inv?.skipped ?? []).map(s => s.path));
  return (n) => {
    const ev = n.meta.evidence;
    if (!ev.length || !inv) return 'unknown';
    let unknown = false;
    for (const e of ev) {
      const f = invByPath.get(e.path);
      if (!f) { if (skippedPaths.has(e.path)) unknown = true; else return 'stale'; } // absent entirely: deleted or moved
      else if (f.status !== 'available' || !f.sha256) unknown = true; // present but not hashable
      else if (f.sha256 !== e.sha256) return 'stale';
    }
    return unknown ? 'unknown' : 'current';
  };
}

/**
 * @param {string} dir project root (the folder holding .devocd)
 * @param {string} query source path or task words
 * @param {{ inventory?: { files: Array<{ path: string, status: string, sha256?: string }>, skipped?: Array<{ path: string, reason: string }> } }} [options]
 */
export function traceKnowledge(dir, query, { inventory } = {}) {
  const graph = buildKnowledge(dir);
  const byId = new Map(graph.nodes.map(n => [n.id, n]));
  const node = (/** @type {string} */ id) => /** @type {KnowledgeNode} */ (byId.get(id));
  const trimmed = String(query).trim();
  const isPath = !/\s/.test(trimmed) && (trimmed.includes('/') || trimmed.includes('\\') || /\.[A-Za-z0-9]+$/.test(trimmed));
  let mode = isPath ? 'path' : 'words';

  const modular = (/** @type {string} */ id) => { const k = node(id).kind; return k === 'module' || k === 'flow' ? 0 : 1; };
  const byName = (/** @type {string} */ a, /** @type {string} */ b) => (a < b ? -1 : a > b ? 1 : 0);
  const words = (all = false) => {
    return rankPages(graph.nodes, graph.edges, trimmed, { all, snippets: 0 }).map(h => h.id);
  };
  /** @type {string[]} */
  let candidates;
  if (isPath) {
    // Editors hand out absolute paths; scopes and evidence are project-relative.
    const local = isAbsolute(trimmed) ? relative(resolve(dir), trimmed) : trimmed;
    const path = local.replace(/\\/g, '/').replace(/^(\.\/)+/, '');
    const cited = new Set(graph.sources[path] ?? []);
    /** @type {Map<string, number>} */
    const found = new Map();
    for (const n of graph.nodes) {
      let best = -1;
      for (const s of n.meta.scope) best = Math.max(best, scopeMatch(s, path));
      if (best >= 0) found.set(n.id, best);
    }
    for (const id of cited) if (byId.has(id) && !found.has(id)) found.set(id, -1);
    candidates = [...found.keys()].sort((a, b) =>
      (Number(cited.has(b)) - Number(cited.has(a)))
      || ((found.get(b) ?? -1) - (found.get(a) ?? -1))
      || (modular(a) - modular(b))
      || byName(a, b));
    // A word that only looks like a file name (e.g. "Node.js") still deserves a search, but every
    // part must match: any-term matching would hand an unmapped path ("src/misc/z.ts") a leaf via "src".
    if (!candidates.length) { candidates = words(true); if (candidates.length) mode = 'words'; }
  } else {
    candidates = words();
  }
  if (!candidates.length) return { query, mode, leaf: null, chain: [], policies: [], decisions: null, alternatives: [], next: [], note: NO_MATCH };

  const freshness = freshnessOf(dir, inventory);

  const leafNode = node(candidates[0]);
  /** @type {KnowledgeNode[]} */
  const pages = [leafNode];
  /** @type {Array<{external: string}>} */
  const tail = [];
  const seen = new Set([leafNode.id]);
  let truncated = false;
  for (let cur = leafNode.id; ;) {
    const next = graph.edges.find(e => e.source === cur && e.type === 'parent')?.target;
    if (!next) {
      const ext = graph.external.find(e => e.source === cur && e.type === 'parent');
      if (ext) tail.push({ external: ext.target });
      break;
    }
    if (!byId.has(next) || seen.has(next)) break;
    if (pages.length > CHAIN_CAP) { truncated = true; break; }
    seen.add(next);
    pages.push(node(next));
    cur = next;
  }

  /** @type {Array<{id: string, title: string, estimatedTokens: number} | {external: string}>} */
  const policies = [];
  const policySeen = new Set();
  const governed = [...graph.edges, ...graph.external].filter(e => e.type === 'governed-by');
  for (const page of pages) {
    for (const e of governed) {
      if (e.source !== page.id || policySeen.has(e.target)) continue;
      policySeen.add(e.target);
      const n = byId.get(e.target);
      policies.push(n ? { id: n.id, title: n.title, estimatedTokens: n.estimatedTokens } : { external: e.target });
    }
  }
  const decision = byId.get('decisions.md');
  const nextIds = [...pages.map(p => p.id), ...policies.flatMap(p => ('id' in p ? [p.id] : []))];
  return {
    query,
    mode,
    leaf: { id: leafNode.id, title: leafNode.title, kind: leafNode.kind, summary: leafNode.summary, estimatedTokens: leafNode.estimatedTokens, freshness: freshness(leafNode) },
    chain: [
      ...pages.slice(1).map(p => ({ id: p.id, title: p.title, kind: p.kind, estimatedTokens: p.estimatedTokens, freshness: freshness(p) })),
      ...tail,
    ],
    truncated,
    policies,
    decisions: decision ? { id: decision.id, estimatedTokens: decision.estimatedTokens } : null,
    alternatives: candidates.slice(1, 5).map(id => ({ id, title: node(id).title, kind: node(id).kind })),
    next: [...new Set(nextIds)],
    note: NOTE,
  };
}
