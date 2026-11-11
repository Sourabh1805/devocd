import { loadContext, inspectContext, publishContext } from './context-store.mjs';
import { validateContext } from './context-schema.mjs';
import { affectedContext } from './context-resolver.mjs';
import { codedError } from './fsutil.mjs';

/** Only affected records/edges/evidence may differ. Full restructuring uses context-publish. */
export function refreshContext(root, draft, options = {}) {
  validateContext(draft);
  const snapshot = loadContext(root), inspection = inspectContext(root, snapshot);
  if (!inspection.complete) throw codedError('STALE_CONTEXT', 'Resolve incomplete inventory before refreshing.');
  const original = snapshot.model;
  for (const field of ['version', 'company', 'projects', 'scopes']) if (JSON.stringify(draft[field]) !== JSON.stringify(original[field])) throw codedError('INVALID_CONTEXT', 'Incremental refresh cannot change model identity or scope; review a full publication.');
  const impact = affectedContext(original, inspection.evidence);
  const affected = new Set(impact.affectedRecords);
  const discovery = new Set(inspection.discoveryProjects);
  const scopes = new Map(original.scopes.map(s => [s.id, s]));
  const originalRecords = new Map(original.records.map(r => [r.id, r]));
  for (const r of draft.records) {
    const before = originalRecords.get(r.id);
    if (before && (before.scope !== r.scope || before.kind !== r.kind)) throw codedError('INVALID_CONTEXT', 'Incremental refresh cannot move or reclassify existing records.');
  }
  for (const r of [...original.records, ...draft.records]) if (discovery.has(scopes.get(r.scope)?.project)) affected.add(r.id);
  const evidence = new Set(impact.changedEvidence);
  const originalEvidence = new Set(original.evidence.map(e => e.id));
  for (const r of draft.records) if (affected.has(r.id)) for (const id of r.evidence) if (!originalEvidence.has(id)) evidence.add(id);
  // Existing graph determines eligibility; proposed endpoints cannot authorize unrelated edits.
  const originalEdges = new Set(original.relationships.map(e => e.id));
  const relationships = new Set(original.relationships.filter(e => affected.has(e.from) || affected.has(e.to) || e.evidence.some(id => evidence.has(id))).map(e => e.id));
  for (const edge of draft.relationships) if (!originalEdges.has(edge.id) && (affected.has(edge.from) || affected.has(edge.to))) relationships.add(edge.id);
  for (const edge of draft.relationships) if (relationships.has(edge.id)) for (const id of edge.evidence) if (!originalEvidence.has(id)) evidence.add(id);
  const changes = {};
  for (const [field, allowed] of [['records', affected], ['evidence', evidence], ['relationships', relationships]]) {
    const before = new Map(original[field].map(v => [v.id, v]));
    const after = new Map(draft[field].map(v => [v.id, v]));
    changes[field] = [];
    for (const id of new Set([...before.keys(), ...after.keys()])) if (JSON.stringify(before.get(id)) !== JSON.stringify(after.get(id))) {
      if (!allowed.has(id)) throw codedError('INVALID_CONTEXT', `Incremental refresh changes unaffected ${field}: ${id}.`);
      changes[field].push(id);
    }
  }
  return { ...publishContext(root, draft, options), changes, affectedRecords: [...affected].sort() };
}
