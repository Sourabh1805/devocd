// Read-only leaf-first lookup: closest page, parent chain, governing policies, freshness. Metadata only.

import { buildKnowledge } from './knowledge.mjs';
import { rankPages } from './search.mjs';
import { inventoryKnowledge } from './inventory.mjs';
import { findScope } from './scope.mjs';
import { existsSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';

/** @typedef {import('./knowledge.mjs').KnowledgeNode} KnowledgeNode */

const NOTE = 'Open the leaf first; go up the chain or to a policy only if it does not answer the task.';
const NO_MATCH = 'No page matches; search different terms or inspect source.';
const CHAIN_CAP = 20;
const CANONICAL_NOTE = 'Resolve canonical context first with devocd context-resolve; if it is blocked, do not rely on these Markdown pages.';

/** Whether the project's registered company holds a canonical context pointer. */
function canonicalOf(/** @type {string} */ dir) {
  try {
    const root = findScope(resolve(dir))?.company?.root;
    if (root && existsSync(join(root, '.devocd', 'context-current.json'))) return { present: true, note: CANONICAL_NOTE };
  } catch { /* advisory */ }
  return { present: false };
}
const GLOB_CHARS = /[*?{]/;

/** A source path as scopes and evidence hold it: project-relative, forward slashes, no leading `./`. */
function projectPath(/** @type {string} */ dir, /** @type {string} */ path) {
  const p = String(path).trim();
  // Editors hand out absolute paths; scopes and evidence are project-relative.
  const local = isAbsolute(p) ? relative(resolve(dir), p) : p;
  return local.replace(/\\/g, '/').replace(/^(\.\/)+/, '');
}

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

/** @type {Map<string, RegExp|null>} */
const GLOB_CACHE = new Map();

/** @returns {number} specificity (literal prefix length) when the pattern matches the path, else -1 */
export function scopeMatch(/** @type {string} */ pattern, /** @type {string} */ path) {
  const p = pattern.replace(/^\.\//, '').replace(/\/+$/, '');
  if (!p) return -1;
  if (!GLOB_CHARS.test(p)) return path === p || path.startsWith(`${p}/`) ? p.length : -1;
  // Refresh impact matches every changed path against every scope: compile each glob once.
  let re = GLOB_CACHE.get(p);
  if (re === undefined) {
    try { re = globToRegExp(p); } catch { re = null; }
    if (GLOB_CACHE.size >= 2000) GLOB_CACHE.clear();
    GLOB_CACHE.set(p, re);
  }
  if (!re) return -1;
  return re.test(path) ? p.search(GLOB_CHARS) : -1;
}

/** Path lookups per inventory, built once however many pages are checked against it. */
const INVENTORY_INDEX = new WeakMap();

/**
 * Freshness of one page against a source inventory. Absent paths and changed hashes are `changed`;
 * paths present but not hashable (or skipped by the inventory) are `unknown`.
 * @param {KnowledgeNode} node
 * @param {{ files: Array<{ path: string, status: string, sha256?: string }>, skipped?: Array<{ path: string, reason: string }> } | null | undefined} inventory
 * @returns {{ status: 'current' | 'stale' | 'unknown', changed: string[], unknown: string[] }}
 */
export function pageFreshness(node, inventory) {
  /** @type {string[]} */ const changed = [];
  /** @type {string[]} */ const unknown = [];
  const ev = node.meta.evidence;
  if (!ev.length || !inventory) return { status: 'unknown', changed, unknown };
  let index = INVENTORY_INDEX.get(inventory);
  if (!index) {
    index = { byPath: new Map(inventory.files.map(f => [f.path, f])), skipped: new Set((inventory.skipped ?? []).map(s => s.path)) };
    INVENTORY_INDEX.set(inventory, index);
  }
  const { byPath, skipped } = index;
  for (const e of ev) {
    const f = byPath.get(e.path);
    if (!f) { if (skipped.has(e.path)) unknown.push(e.path); else changed.push(e.path); } // absent entirely: deleted or moved
    else if (f.status !== 'available' || !f.sha256) unknown.push(e.path); // present but not hashable
    else if (f.sha256 !== e.sha256) changed.push(e.path);
  }
  return { status: changed.length ? 'stale' : unknown.length ? 'unknown' : 'current', changed, unknown };
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
  return (n) => pageFreshness(n, inv).status;
}

/**
 * Pages for one project-relative path, best first: pages that own the path (a scope that covers
 * it as a folder or glob) before pages that only name it (an exact-file scope or a citation),
 * then citation, then the most specific scope (literal prefix length), then module/flow before
 * other kinds, then id.
 * @param {{ nodes: KnowledgeNode[], sources: Record<string, string[]> }} graph
 * @param {string} path
 * @returns {Array<{ id: string, why: 'cited' | 'in-scope' }>}
 */
export function pagesForPath(graph, path) {
  const byId = new Map(graph.nodes.map(n => [n.id, n]));
  const cited = new Set(Object.hasOwn(graph.sources, path) ? graph.sources[path] : []);
  /** @type {Map<string, number>} */
  const found = new Map();
  for (const n of graph.nodes) {
    let best = -1;
    for (const s of n.meta.scope) best = Math.max(best, scopeMatch(s, path));
    if (best >= 0) found.set(n.id, best);
  }
  for (const id of cited) if (byId.has(id) && !found.has(id)) found.set(id, -1);
  const modular = (/** @type {string} */ id) => { const k = byId.get(id)?.kind; return k === 'module' || k === 'flow' ? 0 : 1; };
  // A scope that is the file itself names it; a folder or glob scope owns it. A flow page lists
  // the files it traverses, so it must not outrank the module page that owns the code folder.
  const owns = (/** @type {string} */ id) => /** @type {KnowledgeNode} */ (byId.get(id)).meta.scope
    .some((s) => String(s).replace(/^\.\//, '').replace(/\/+$/, '') !== path && scopeMatch(s, path) >= 0);
  return [...found.keys()].sort((a, b) =>
    (Number(owns(b)) - Number(owns(a)))
    || (Number(cited.has(b)) - Number(cited.has(a)))
    || ((found.get(b) ?? -1) - (found.get(a) ?? -1))
    || (modular(a) - modular(b))
    || (a < b ? -1 : a > b ? 1 : 0))
    .map(id => ({ id, why: cited.has(id) ? 'cited' : 'in-scope' }));
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

  const words = (all = false) => {
    return rankPages(graph.nodes, graph.edges, trimmed, { all, snippets: 0 }).map(h => h.id);
  };
  /** @type {string[]} */
  let candidates;
  if (isPath) {
    candidates = pagesForPath(graph, projectPath(dir, trimmed)).map(h => h.id);
    // A word that only looks like a file name (e.g. "Node.js") still deserves a search, but every
    // part must match: any-term matching would hand an unmapped path ("src/misc/z.ts") a leaf via "src".
    if (!candidates.length) { candidates = words(true); if (candidates.length) mode = 'words'; }
  } else {
    candidates = words();
  }
  const canonical = canonicalOf(dir);
  if (!candidates.length) return { query, mode, leaf: null, chain: [], policies: [], decisions: null, alternatives: [], next: [], canonical, note: NO_MATCH };

  const freshness = freshnessOf(dir, inventory);

  const leafNode = node(candidates[0]);
  const { pages, tail, truncated, policies } = walkUp(graph, byId, leafNode.id);
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
    canonical,
    note: NOTE,
  };
}

/**
 * Leaf to root along parent edges, plus the policies governing any page on the way. Metadata only.
 * @param {{ edges: Array<{source: string, target: string, type: string}>, external: Array<{source: string, target: string, type: string}> }} graph
 * @param {Map<string, KnowledgeNode>} byId
 * @param {string} leafId
 */
function walkUp(graph, byId, leafId) {
  const pages = [/** @type {KnowledgeNode} */ (byId.get(leafId))];
  /** @type {Array<{external: string}>} */
  const tail = [];
  const seen = new Set([leafId]);
  let truncated = false;
  for (let cur = leafId; ;) {
    const next = graph.edges.find(e => e.source === cur && e.type === 'parent')?.target;
    if (!next) {
      const ext = graph.external.find(e => e.source === cur && e.type === 'parent');
      if (ext) tail.push({ external: ext.target });
      break;
    }
    if (!byId.has(next) || seen.has(next)) break;
    if (pages.length > CHAIN_CAP) { truncated = true; break; }
    seen.add(next);
    pages.push(/** @type {KnowledgeNode} */ (byId.get(next)));
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
  return { pages, tail, truncated, policies };
}

const REVIEW_FILE_CAP = 200;
const REVIEW_NOTE = 'Read each leaf page before reviewing its files; go to a parent or policy only when the leaf does not answer. A stale page may be wrong: confirm its claims in the code. Unmapped files have no page; review them from the code alone.';

/**
 * Review context for changed files, from one graph build: the leaf page per file (path match only,
 * never word search), their parents, the policies governing them and the decisions file. Metadata only.
 * @param {string} dir project root
 * @param {string[]} files changed paths, project-relative
 */
export function reviewContext(dir, files) {
  /** @type {ReturnType<typeof buildKnowledge>} */
  let graph;
  try { graph = buildKnowledge(dir); } catch (e) {
    // No knowledge yet: the review still runs, from the code alone.
    if (/** @type {{code?: string}} */ (e).code !== 'NO_DEVOCD') throw e;
    graph = { nodes: [], edges: [], external: [], sources: {} };
  }
  const byId = new Map(graph.nodes.map(n => [n.id, n]));
  const rel = (/** @type {string} */ id) => `.devocd/${id}`;
  const unique = [...new Set(files.map(f => projectPath(dir, f)).filter(Boolean))];
  const truncated = unique.length > REVIEW_FILE_CAP;
  /** @type {Map<string, string[]>} */ const leaves = new Map();
  /** @type {Map<string, KnowledgeNode>} */ const parents = new Map();
  /** @type {Set<string>} */ const externalParents = new Set();
  /** @type {Map<string, {key: Record<string, unknown>, files: string[]}>} */ const policies = new Map();
  /** @type {Map<string, string[]>} */ const policyKeys = new Map();
  /** @type {string[]} */ const unmapped = [];
  for (const file of unique.slice(0, REVIEW_FILE_CAP)) {
    const leafId = pagesForPath(graph, file)[0]?.id;
    if (!leafId) { unmapped.push(file); continue; }
    if (!leaves.has(leafId)) {
      // Walk each leaf once; every file under it shares the same parents and policies.
      leaves.set(leafId, []);
      const walk = walkUp(graph, byId, leafId);
      for (const p of walk.pages.slice(1)) parents.set(p.id, p);
      for (const t of walk.tail) externalParents.add(t.external);
      /** @type {string[]} */ const keys = [];
      for (const p of walk.policies) {
        const k = 'id' in p ? p.id : `external:${p.external}`;
        if (!policies.has(k)) policies.set(k, { key: p, files: [] });
        keys.push(k);
      }
      policyKeys.set(leafId, keys);
    }
    leaves.get(leafId)?.push(file);
    for (const k of policyKeys.get(leafId) ?? []) policies.get(k)?.files.push(file);
  }
  for (const id of leaves.keys()) parents.delete(id);
  // The inventory hashes the source tree: build it only when a page needs a freshness.
  const freshness = leaves.size ? freshnessOf(dir) : (/** @type {KnowledgeNode} */ _n) => /** @type {const} */ ('unknown');
  const describe = (/** @type {KnowledgeNode} */ n) => ({ id: n.id, path: rel(n.id), title: n.title, kind: n.kind, estimatedTokens: n.estimatedTokens, freshness: freshness(n) });
  const decision = byId.get('decisions.md');
  return {
    pages: [...leaves].map(([id, fs]) => ({ ...describe(/** @type {KnowledgeNode} */ (byId.get(id))), files: fs })),
    parents: [...[...parents.values()].map(describe), ...[...externalParents].map(external => ({ external }))],
    policies: [...policies.values()].map(({ key, files: fs }) => ({ ...key, ...('id' in key ? { path: rel(String(key.id)) } : {}), files: fs })),
    decisions: decision ? { id: decision.id, path: rel(decision.id), estimatedTokens: decision.estimatedTokens } : null,
    unmapped,
    truncated,
    notLooked: unique.slice(REVIEW_FILE_CAP),
    canonical: canonicalOf(dir),
    note: REVIEW_NOTE,
  };
}
