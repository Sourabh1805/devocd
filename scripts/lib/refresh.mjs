// @ts-check
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { inventoryKnowledge } from './inventory.mjs';
import { assertSafeTarget, codedError, lstatOrNull, readTextOrNull } from './fsutil.mjs';
import { assertNotTracked, insideWorkTree } from './protect.mjs';
import { checkTree, stateProblem } from './check.mjs';
import { buildKnowledge, writeKnowledge } from './knowledge.mjs';
import { advanceCompletion } from './completion.mjs';
import { pagesForPath, scopeMatch } from './trace.mjs';

function project(dir) {
  const root = resolve(dir);
  for (const p of [root, join(root, '.devocd')]) {
    const s = lstatOrNull(p);
    if (!s?.isDirectory() || s.isSymbolicLink()) throw codedError('BAD_TARGET', 'Refresh requires real project and .devocd folders.');
  }
  let state;
  try { state = JSON.parse(readTextOrNull(join(root, '.devocd/state.json')) ?? 'null'); } catch { /* invalid below */ }
  if (state?.kind !== 'project' || stateProblem(state)) throw codedError('NO_STATE', 'Refresh requires valid project state. Run add-project first.');
  return root;
}

function snapshot(root) {
  const inventory = inventoryKnowledge(root);
  // Local routing/settings and the .devocd folder itself are outputs of onboarding, not source evidence.
  // Discovery runs before .devocd exists, so its excluded-directory entry must not shift the fingerprint.
  // Generated rule folders (and the .claude/rules folder that may exist only to hold them) must not shift it either.
  const generated = p => p === 'CLAUDE.local.md' || p === '.claude/settings.local.json' || p.startsWith('.claude/rules/devocd/');
  const generatedDir = p => p === '.claude' || p === '.claude/rules' || p === '.claude/rules/devocd' || p.startsWith('.claude/rules/devocd/');
  inventory.files = inventory.files.filter(f => !generated(f.path));
  inventory.directories = inventory.directories.filter(p => !generatedDir(p));
  inventory.skipped = inventory.skipped.filter(f => !generated(f.path) && !generatedDir(f.path) && f.path !== '.devocd');
  return { version: 1, fingerprint: createHash('sha256').update(JSON.stringify(inventory)).digest('hex'), inventory };
}

function readSnapshot(root, name) {
  const path = join(root, '.devocd', name);
  const stat = lstatOrNull(path);
  if (!stat) return null;
  if (!stat.isFile() || stat.size > 8 * 1024 * 1024) throw codedError('BAD_TARGET', 'Refresh snapshot is linked, invalid or oversized.');
  let value;
  try { value = JSON.parse(readFileSync(path, 'utf8')); } catch { throw codedError('INVALID_DRAFT', 'Refresh snapshot is not valid JSON.'); }
  if (value?.version !== 1 || !Array.isArray(value.inventory?.files) || !/^[a-f0-9]{64}$/.test(value.fingerprint ?? '') ||
      createHash('sha256').update(JSON.stringify(value.inventory)).digest('hex') !== value.fingerprint) throw codedError('INVALID_DRAFT', 'Refresh snapshot is invalid.');
  return value;
}

function safeSnapshotTarget(root, name) {
  const path = join(root, '.devocd', name);
  assertSafeTarget(path);
  if (insideWorkTree(root)) assertNotTracked(root, [`.devocd/${name}`]);
  return path;
}

/** Refuse a linked or non-file stale marker before anything is written. */
function assertStaleTarget(root) {
  const path = join(root, '.devocd', 'stale.json');
  if (lstatOrNull(path)) assertSafeTarget(path);
}

/** Knowledge was just recorded as current, so the edit hook's stale marks no longer apply. */
export function clearStale(root, t0) {
  const dir = join(root, '.devocd');
  const path = join(dir, 'stale.json');
  if (lstatOrNull(path)) { assertSafeTarget(path); rmSync(path, { force: true }); }
  if (!t0) return;
  // Edits journaled after the snapshot began were not captured by it: keep their pages marked.
  const read = p => { const s = lstatOrNull(p); if (!s || !s.isFile() || s.isSymbolicLink() || s.size > 4 * 1024 * 1024) return null; return readFileSync(p, 'utf8'); };
  try {
    const journal = read(join(dir, 'journal', 'edits.jsonl'));
    const sources = JSON.parse(read(join(dir, 'sources.json')) ?? 'null');
    if (!journal || !sources || typeof sources !== 'object') return;
    const pages = new Set();
    let since = null;
    for (const line of journal.split('\n')) {
      let e; try { e = JSON.parse(line); } catch { continue; }
      if (typeof e?.t !== 'string' || typeof e.path !== 'string' || !(e.t > t0) || !Object.hasOwn(sources, e.path) || !Array.isArray(sources[e.path])) continue;
      const ids = sources[e.path].filter(id => typeof id === 'string');
      if (ids.length && (since === null || e.t < since)) since = e.t;
      for (const id of ids) pages.add(id);
    }
    if (pages.size) writeFileSync(path, JSON.stringify({ pages: [...pages].sort(), since }) + '\n');
  } catch { /* best effort: leaving stale unmarked is the pre-existing behavior */ }
}

/** Added, modified and deleted paths between a baseline snapshot (or none) and the current one. */
function diffInventories(previous, current) {
  const before = new Map((previous?.inventory.files ?? []).map(f => [f.path, f.sha256 ?? f.reason]));
  const after = new Map(current.inventory.files.map(f => [f.path, f.sha256 ?? f.reason]));
  const changed = [];
  for (const [path, hash] of after) if (!before.has(path) || before.get(path) !== hash) changed.push({ path, kind: before.has(path) ? 'modified' : 'added' });
  for (const path of before.keys()) if (!after.has(path)) changed.push({ path, kind: 'deleted' });
  return changed;
}

/** Map changed paths to the pages they affect. Paths and page ids only: never contents or hashes. */
function impactOf(root, previous, changed) {
  if (!previous) return { mode: 'full', reason: 'no baseline: every page is unverified' };
  let graph;
  try { graph = buildKnowledge(root); } catch { return { mode: 'full', reason: 'knowledge graph cannot be built' }; }
  const pages = graph.nodes.filter(n => n.kind === 'module' || n.kind === 'flow');
  const known = new Set(graph.nodes.map(n => n.id));
  const pageIds = new Set(pages.map(n => n.id));
  const reasons = new Map(), unmapped = [], citedElsewhere = new Set();
  const add = (id, path, why) => { if (!reasons.has(id)) reasons.set(id, []); reasons.get(id).push({ path, why }); };
  const byId = new Map(graph.nodes.map(n => [n.id, n]));
  for (const { path } of changed) {
    const hits = pagesForPath(graph, path);
    // Only module and flow pages are rebuilt; other citing pages are checked as parents, and decisions are never touched.
    for (const h of hits) if (h.why === 'cited' && !pageIds.has(h.id) && h.id !== 'decisions.md') citedElsewhere.add(h.id);
    const rebuilt = hits.filter(h => h.why === 'cited' && pageIds.has(h.id));
    if (rebuilt.length) { for (const h of rebuilt) add(h.id, path, 'cited'); continue; }
    // Otherwise only the most specific scope match(es) count; ties are all included.
    const score = id => Math.max(-1, ...byId.get(id).meta.scope.map(s => scopeMatch(s, path)));
    const scoped = hits.filter(h => pageIds.has(h.id));
    if (!scoped.length) { unmapped.push(path); continue; }
    const top = score(scoped[0].id);
    for (const h of scoped) if (score(h.id) === top) add(h.id, path, 'in-scope');
  }
  const affected = [...reasons.keys()].sort().map(id => ({ id, reasons: reasons.get(id) }));
  const parentOf = new Map(graph.edges.filter(e => e.type === 'parent').map(e => [e.source, e.target]));
  const parents = new Set();
  for (const { id } of affected) {
    for (let cur = parentOf.get(id), n = 0; cur && known.has(cur) && n < 50; cur = parentOf.get(cur), n++) parents.add(cur);
  }
  const direct = new Set(affected.filter(a => parentOf.get(a.id) === 'PROJECT.md').map(a => a.id));
  if (unmapped.length && known.has('PROJECT.md')) parents.add('PROJECT.md'); else if (!direct.size) parents.delete('PROJECT.md');
  for (const id of citedElsewhere) parents.add(id);
  for (const { id } of affected) parents.delete(id);
  const base = { affected, parents: [...parents].sort(), unmapped };
  if (!pages.length) return { mode: 'full', reason: 'no module or flow pages to update', ...base };
  if (affected.length * 2 > pages.length) return { mode: 'full', reason: `${affected.length} of ${pages.length} pages affected`, ...base };
  return { mode: 'incremental', ...base };
}

/** Read-only freshness check; source hashes detect pulls, local edits, additions and deletions. */
export function refreshStatus(dir) {
  const root = project(dir), previous = readSnapshot(root, 'refresh.json'), current = snapshot(root);
  const changed = diffInventories(previous, current);
  return { needsRefresh: !previous || !current.inventory.complete || previous.fingerprint !== current.fingerprint,
    reason: !previous ? 'no-baseline' : !current.inventory.complete ? 'incomplete-inventory' : previous.fingerprint !== current.fingerprint ? 'source-changed' : 'current',
    changed: changed.slice(0, 100), totalChanged: changed.length, complete: current.inventory.complete };
}

/** Capture source evidence BEFORE rebuilding knowledge; never marks it current. */
export function planRefresh(dir) {
  const root = project(dir), current = snapshot(root);
  if (!current.inventory.complete) throw codedError('KNOWLEDGE_LIMIT', 'Source inventory is partial; resolve gaps before recording a refresh baseline.');
  // An unreadable baseline must not block the refresh that replaces it: plan a full rebuild instead.
  let previous;
  try { previous = readSnapshot(root, 'refresh.json'); } catch { previous = null; }
  writeFileSync(safeSnapshotTarget(root, 'refresh.pending.json'), JSON.stringify(current, null, 2) + '\n');
  const changed = diffInventories(previous, current);
  return { fingerprint: current.fingerprint, files: current.inventory.files.length, changed: changed.slice(0, 100), totalChanged: changed.length,
    affected: [], parents: [], unmapped: [], ...impactOf(root, previous, changed) };
}

/** The snapshot fingerprint of a folder's sources right now; needs no project state yet. */
export function sourceFingerprint(dir) {
  return snapshot(resolve(dir)).fingerprint;
}

/**
 * One-step baseline for a freshly onboarded project: render the graph and, when the source
 * inventory is complete and checks pass, record the snapshot so refresh-status reports current.
 * A partial inventory still renders but records nothing, and the result says so. An expected
 * fingerprint from discovery time guards the gap between discovery and approval: source edited
 * in between is never blessed as current.
 * @param {string} dir @param {string} [expected]
 */
export function baselineRefresh(dir, expected) {
  const root = project(dir);
  assertStaleTarget(root);
  const t0 = new Date().toISOString();
  const current = snapshot(root);
  if (expected !== undefined && expected !== current.fingerprint) return { ...writeKnowledge(root), current: false, baseline: 'source-changed-during-setup' };
  if (!current.inventory.complete) return { ...writeKnowledge(root), current: false, baseline: 'skipped-partial-inventory' };
  if (checkTree(root).issues.some(i => i.severity === 'error')) throw codedError('INVALID_DRAFT', 'Project checks failed; knowledge is not marked current.');
  const graph = writeKnowledge(root);
  if (graph.skipped) return { ...graph, current: false, baseline: 'skipped-pages', skipped: buildKnowledge(root).skipped };
  writeFileSync(safeSnapshotTarget(root, 'refresh.json'), JSON.stringify(current, null, 2) + '\n');
  advanceCompletion(root, 'sourceRefreshed'); // before the irreversible cleanup: a failed stamp leaves a retryable state
  clearStale(root, t0);
  return { ...graph, current: true };
}

/** Record only after approved semantic drafts are applied and checked. Refuse concurrent source edits. */
export function completeRefresh(dir) {
  const root = project(dir), pending = readSnapshot(root, 'refresh.pending.json');
  if (!pending) throw codedError('INVALID_DRAFT', 'Run refresh-plan before rebuilding knowledge.');
  assertStaleTarget(root);
  const t0 = new Date().toISOString();
  const current = snapshot(root);
  if (!current.inventory.complete || pending.fingerprint !== current.fingerprint) throw codedError('INVALID_DRAFT', 'Source changed during refresh; rerun discovery before marking current.');
  if (checkTree(root).issues.some(i => i.severity === 'error')) throw codedError('INVALID_DRAFT', 'Project checks failed; knowledge is not marked current.');
  const target = safeSnapshotTarget(root, 'refresh.json');
  const pendingPath = safeSnapshotTarget(root, 'refresh.pending.json');
  const graph = writeKnowledge(root);
  if (graph.skipped) throw codedError('INVALID_DRAFT', `Knowledge pages were skipped (${graph.skipped}); fix them before marking current.`);
  writeFileSync(target, JSON.stringify(pending, null, 2) + '\n');
  rmSync(pendingPath);
  advanceCompletion(root, 'sourceRefreshed'); // before the irreversible cleanup: a failed stamp leaves a retryable state
  clearStale(root, t0);
  return { ...graph, current: true };
}
