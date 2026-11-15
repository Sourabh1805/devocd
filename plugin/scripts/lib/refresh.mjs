// @ts-check
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { inventoryKnowledge } from './inventory.mjs';
import { assertSafeTarget, codedError, lstatOrNull, readTextOrNull } from './fsutil.mjs';
import { assertNotTracked, insideWorkTree } from './protect.mjs';
import { checkTree, stateProblem } from './check.mjs';
import { buildKnowledge, writeKnowledge } from './knowledge.mjs';

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
  const generated = p => p === 'CLAUDE.local.md' || p === '.claude/settings.local.json';
  inventory.files = inventory.files.filter(f => !generated(f.path));
  inventory.directories = inventory.directories.filter(p => p !== '.claude');
  inventory.skipped = inventory.skipped.filter(f => !generated(f.path) && f.path !== '.claude' && f.path !== '.devocd');
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

/** Knowledge was just recorded as current, so the edit hook's stale marks no longer apply. */
function clearStale(root) {
  const path = join(root, '.devocd', 'stale.json');
  if (lstatOrNull(path)) { assertSafeTarget(path); rmSync(path, { force: true }); }
}

/** Read-only freshness check; source hashes detect pulls, local edits, additions and deletions. */
export function refreshStatus(dir) {
  const root = project(dir), previous = readSnapshot(root, 'refresh.json'), current = snapshot(root);
  const before = new Map((previous?.inventory.files ?? []).map(f => [f.path, f.sha256 ?? f.reason]));
  const after = new Map(current.inventory.files.map(f => [f.path, f.sha256 ?? f.reason]));
  const changed = [];
  for (const [path, hash] of after) if (!before.has(path) || before.get(path) !== hash) changed.push({ path, kind: before.has(path) ? 'modified' : 'added' });
  for (const path of before.keys()) if (!after.has(path)) changed.push({ path, kind: 'deleted' });
  return { needsRefresh: !previous || !current.inventory.complete || previous.fingerprint !== current.fingerprint,
    reason: !previous ? 'no-baseline' : !current.inventory.complete ? 'incomplete-inventory' : previous.fingerprint !== current.fingerprint ? 'source-changed' : 'current',
    changed: changed.slice(0, 100), totalChanged: changed.length, complete: current.inventory.complete };
}

/** Capture source evidence BEFORE rebuilding knowledge; never marks it current. */
export function planRefresh(dir) {
  const root = project(dir), current = snapshot(root);
  if (!current.inventory.complete) throw codedError('KNOWLEDGE_LIMIT', 'Source inventory is partial; resolve gaps before recording a refresh baseline.');
  writeFileSync(safeSnapshotTarget(root, 'refresh.pending.json'), JSON.stringify(current, null, 2) + '\n');
  return { fingerprint: current.fingerprint, files: current.inventory.files.length };
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
  const current = snapshot(root);
  if (expected !== undefined && expected !== current.fingerprint) return { ...writeKnowledge(root), current: false, baseline: 'source-changed-during-setup' };
  if (!current.inventory.complete) return { ...writeKnowledge(root), current: false, baseline: 'skipped-partial-inventory' };
  if (checkTree(root).issues.some(i => i.severity === 'error')) throw codedError('INVALID_DRAFT', 'Project checks failed; knowledge is not marked current.');
  const graph = writeKnowledge(root);
  if (graph.skipped) return { ...graph, current: false, baseline: 'skipped-pages', skipped: buildKnowledge(root).skipped };
  writeFileSync(safeSnapshotTarget(root, 'refresh.json'), JSON.stringify(current, null, 2) + '\n');
  clearStale(root);
  return { ...graph, current: true };
}

/** Record only after approved semantic drafts are applied and checked. Refuse concurrent source edits. */
export function completeRefresh(dir) {
  const root = project(dir), pending = readSnapshot(root, 'refresh.pending.json');
  if (!pending) throw codedError('INVALID_DRAFT', 'Run refresh-plan before rebuilding knowledge.');
  const current = snapshot(root);
  if (!current.inventory.complete || pending.fingerprint !== current.fingerprint) throw codedError('INVALID_DRAFT', 'Source changed during refresh; rerun discovery before marking current.');
  if (checkTree(root).issues.some(i => i.severity === 'error')) throw codedError('INVALID_DRAFT', 'Project checks failed; knowledge is not marked current.');
  const target = safeSnapshotTarget(root, 'refresh.json');
  const pendingPath = safeSnapshotTarget(root, 'refresh.pending.json');
  const graph = writeKnowledge(root);
  if (graph.skipped) throw codedError('INVALID_DRAFT', `Knowledge pages were skipped (${graph.skipped}); fix them before marking current.`);
  writeFileSync(target, JSON.stringify(pending, null, 2) + '\n');
  rmSync(pendingPath);
  clearStale(root);
  return { ...graph, current: true };
}
