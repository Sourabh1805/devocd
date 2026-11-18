import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, unlinkSync, openSync, closeSync, fsyncSync, mkdirSync, lstatSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { codedError, checkTarget, lstatOrNull } from './fsutil.mjs';
import { insideWorkTree, assertNotTracked } from './protect.mjs';
import { relativePath, validateContext } from './context-schema.mjs';
import { scanSecrets } from './secrets.mjs';
import { inventoryKnowledge } from './inventory.mjs';

export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
// Walk from the supplied root; do not follow project/evidence symlinks or junctions.
export function contextPath(root, path, directory = false) {
  if (!relativePath(path)) throw codedError('BAD_TARGET', 'Invalid relative context path.');
  let current = resolve(root);
  const parts = path === '.' ? [] : path.split('/');
  for (const [i, part] of [null, ...parts].entries()) {
    if (part !== null) current = join(current, part);
    const stat = lstatSync(current);
    if (stat.isSymbolicLink() || ((i < parts.length || directory) ? !stat.isDirectory() : !stat.isFile())) throw codedError('BAD_TARGET', 'Context paths must be real files and folders.');
  }
  return current;
}
export function evidenceStatus(root, model) {
  return model.evidence.map(e => {
    const project = e.project === null ? '.' : model.projects.find(p => p.id === e.project).path;
    try {
      const base = contextPath(root, project, true);
      const file = contextPath(base, e.path);
      if (lstatSync(file).size > 4 * 1024 * 1024) return { id: e.id, status: 'oversized' };
      return { id: e.id, status: digest(readFileSync(file)) === e.sha256 ? 'current' : 'changed' };
    } catch (error) {
      return { id: e.id, status: error.code === 'ENOENT' ? 'missing' : 'unreadable' };
    }
  });
}
function readJson(path) {
  if (lstatSync(path).size > 8 * 1024 * 1024) throw codedError('INVALID_CONTEXT', 'Context exceeds 8 MiB.');
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(path)));
}
export function readContextDraft(root, path) {
  return validateContext(readJson(contextPath(root, path)));
}
export function readContextQuery(root, path) { return readJson(contextPath(root, path)); }
export function loadContext(root) {
  const pointer = readJson(contextPath(root, '.devocd/context-current.json'));
  if (!/^[a-f0-9]{64}$/.test(pointer.generation ?? '')) throw codedError('INVALID_CONTEXT', 'Invalid active generation.');
  const path = contextPath(root, `.devocd/generations/${pointer.generation}/context.json`);
  if (lstatSync(path).size > 8 * 1024 * 1024) throw codedError('INVALID_CONTEXT', 'Generation exceeds 8 MiB.');
  const bytes = readFileSync(path);
  if (bytes.length > 8 * 1024 * 1024 || digest(bytes) !== pointer.generation) throw codedError('INVALID_CONTEXT', 'Generation integrity failed.');
  const bundle = JSON.parse(bytes.toString('utf8'));
  if (bundle.version !== 1 || !Array.isArray(bundle.inventories)) throw codedError('INVALID_CONTEXT', 'Invalid generation bundle.');
  return { generation: pointer.generation, model: validateContext(bundle.model), inventories: bundle.inventories };
}
function sourceInventories(root, model) {
  return model.projects.map(project => {
    const inventory = inventoryKnowledge(contextPath(root, project.path, true));
    if (!inventory.complete) throw codedError('STALE_CONTEXT', 'Project inventory is incomplete.');
    return { project: project.id, files: inventory.files.filter(f => !['CLAUDE.local.md', '.claude/settings.local.json'].includes(f.path)), skipped: inventory.skipped };
  });
}
/** No baseline is advanced here. Unknown files cause broad project rediscovery. */
export function inspectContext(root, snapshot) {
  const evidence = evidenceStatus(root, snapshot.model), changedFiles = [], unknownProjects = new Set();
  let inventories;
  try { inventories = sourceInventories(root, snapshot.model); }
  catch (error) {
    return { evidence: evidence.map(e => ({ ...e, status: e.status === 'current' ? 'inventory-incomplete' : e.status })), changedFiles: [], discoveryProjects: snapshot.model.projects.map(p => p.id), complete: false };
  }
  for (const current of inventories) {
    const prior = snapshot.inventories.find(i => i.project === current.project);
    const before = new Map((prior?.files ?? []).map(f => [f.path, f.sha256]));
    const after = new Map(current.files.map(f => [f.path, f.sha256]));
    for (const path of new Set([...before.keys(), ...after.keys()])) if (before.get(path) !== after.get(path)) {
      changedFiles.push({ project: current.project, path, kind: !before.has(path) ? 'added' : !after.has(path) ? 'deleted' : 'changed' });
      if (!snapshot.model.evidence.some(e => e.project === current.project && e.path === path)) unknownProjects.add(current.project);
    }
    if (!prior || JSON.stringify(prior.skipped) !== JSON.stringify(current.skipped)) unknownProjects.add(current.project);
  }
  for (const e of evidence) if (unknownProjects.has(snapshot.model.evidence.find(source => source.id === e.id).project)) e.status = 'discovery-required';
  return { evidence, changedFiles, discoveryProjects: [...unknownProjects].sort(), complete: true };
}
/** Immutable snapshot + atomic pointer replacement. No model calls, no inferred approval.
 * The caller must explicitly pass apply; expectedGeneration guards concurrent edits.
 */
export function publishContext(root, model, { apply = false, expectedGeneration = null, fault = () => {} } = {}) {
  validateContext(model);
  const inventories = sourceInventories(root, model);
  const bytes = JSON.stringify({ version: 1, model, inventories }, null, 2) + '\n';
  if (Buffer.byteLength(bytes) > 8 * 1024 * 1024 || scanSecrets(bytes).length) throw codedError('INVALID_CONTEXT', 'Context is oversized or contains likely secrets.');
  for (const project of model.projects) contextPath(root, project.path, true);
  const status = evidenceStatus(root, model);
  if (status.some(e => e.status !== 'current')) throw codedError('STALE_CONTEXT', 'Draft evidence is stale or unreadable.');
  const generation = digest(bytes);
  const pointer = join(resolve(root), '.devocd/context-current.json');
  checkTarget(pointer);
  const current = lstatOrNull(pointer) ? loadContext(root).generation : null;
  if (current !== expectedGeneration) throw codedError('CONTEXT_CONFLICT', 'Active generation changed; review the new base.');
  if (!apply) return { applied: false, generation, previous: current, records: model.records.length, evidence: status };
  const base = join(resolve(root), '.devocd');
  if (insideWorkTree(root)) assertNotTracked(root, ['.devocd']);
  const lock = join(base, 'context.lock'), target = join(base, 'generations', generation, 'context.json');
  checkTarget(lock); checkTarget(target);
  mkdirSync(base, { recursive: true });
  let lockFd;
  try { lockFd = openSync(lock, 'wx'); } catch (error) { if (error.code === 'EEXIST') throw codedError('CONTEXT_LOCKED', 'Another publication is active or interrupted; inspect context.lock before recovery.'); throw error; }
  const temporary = join(base, `context-${randomUUID()}.tmp`);
  const staged = join(base, `snapshot-${randomUUID()}.tmp`);
  try {
    writeFileSync(lockFd, JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString(), expectedGeneration }) + '\n');
    fsyncSync(lockFd);
    const now = lstatOrNull(pointer) ? loadContext(root).generation : null;
    if (now !== expectedGeneration) throw codedError('CONTEXT_CONFLICT', 'Active generation changed.');
    fault('before-stage');
    mkdirSync(join(base, 'generations', generation), { recursive: true });
    if (!lstatOrNull(target)) {
      const fd = openSync(staged, 'wx');
      try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
      renameSync(staged, target);
    }
    if (digest(readFileSync(target)) !== generation) throw codedError('INVALID_CONTEXT', 'Staged generation integrity failed.');
    fault('after-stage');
    if (evidenceStatus(root, model).some(e => e.status !== 'current')) throw codedError('STALE_CONTEXT', 'Source changed while staging.');
    if (JSON.stringify(sourceInventories(root, model)) !== JSON.stringify(inventories)) throw codedError('STALE_CONTEXT', 'Project inventory changed while staging.');
    const fd = openSync(temporary, 'wx');
    try { writeFileSync(fd, JSON.stringify({ generation, previous: now }) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
    fault('before-activate');
    renameSync(temporary, pointer);
    return { applied: true, generation, previous: now, records: model.records.length };
  } finally {
    if (lstatOrNull(temporary)) unlinkSync(temporary);
    if (lstatOrNull(staged)) unlinkSync(staged);
    closeSync(lockFd); unlinkSync(lock);
  }
}
