import { validateContext, relativePath } from './context-schema.mjs';
import { codedError } from './fsutil.mjs';

/** Pure selection: path + explicit dimensions, no model-ranked policy selection. */
export function resolveContext(model, query, evidence = []) {
  validateContext(model);
  if (!query || !model.projects.some(p => p.id === query.project) || !relativePath(query.path) ||
      Object.keys(query).some(k => !['project', 'path', 'cloud', 'environment'].includes(k)) ||
      (query.cloud !== undefined && !['aws', 'azure', 'gcp'].includes(query.cloud)) ||
      (query.environment !== undefined && typeof query.environment !== 'string')) throw codedError('INVALID_CONTEXT', 'Provide a known project and relative task path, with optional cloud/environment.');
  const byId = new Map(model.scopes.map(s => [s.id, s]));
  const effective = scope => {
    const chain = [];
    for (let s = scope; s; s = byId.get(s.parent)) chain.unshift(s);
    return Object.assign({}, ...chain.map(s => ({ ...(s.cloud ? { cloud: s.cloud } : {}), ...(s.environment ? { environment: s.environment } : {}) })));
  };
  const candidates = model.scopes.filter(s => s.project === null || (s.project === query.project && (s.path === '.' || query.path === s.path || query.path.startsWith(s.path + '/'))));
  const missing = new Set();
  const selected = candidates.filter(s => {
    const attrs = effective(s);
    for (const key of ['cloud', 'environment']) {
      if (attrs[key] && query[key] === undefined) { missing.add(key); return false; }
      if (attrs[key] && attrs[key] !== query[key]) return false;
    }
    return true;
  });
  const ids = new Set(selected.map(s => s.id));
  // A broad matching scope cannot hide a deeper incompatible restriction.
  const incompatibleDimensions = ['cloud', 'environment'].some(dimension => {
    const relevant = candidates.filter(s => effective(s)[dimension] !== undefined);
    if (!relevant.length) return false;
    const deepest = Math.max(...relevant.map(s => s.path === '.' ? 0 : s.path.split('/').length));
    return !selected.some(s => effective(s)[dimension] !== undefined && (s.path === '.' ? 0 : s.path.split('/').length) === deepest);
  });
  const records = model.records.filter(r => ids.has(r.scope)).sort((a, b) => a.id.localeCompare(b.id, 'en'));
  const policies = records.filter(r => r.kind === 'policy');
  const superseded = new Set(policies.flatMap(r => r.policy.overrides));
  const effectivePolicies = policies.filter(r => !superseded.has(r.id));
  const conflicts = [];
  for (const key of new Set(effectivePolicies.map(r => r.policy.key))) {
    const entries = effectivePolicies.filter(r => r.policy.key === key);
    if (new Set(entries.map(r => r.policy.value)).size > 1) conflicts.push({ key, records: entries.map(r => r.id) });
  }
  const status = new Map(evidence.map(e => [e.id, e.status]));
  const completeEvidence = model.evidence.map(e => ({ id: e.id, status: status.get(e.id) ?? 'unknown' }));
  const affected = new Set(affectedContext(model, completeEvidence).affectedRecords);
  const stale = records.filter(r => affected.has(r.id)).map(r => r.id);
  const recordIds = new Set(records.map(r => r.id));
  const relationships = model.relationships.filter(e => recordIds.has(e.from) && recordIds.has(e.to));
  const staleRelationships = relationships.filter(e => e.evidence.some(id => status.get(id) !== 'current')).map(e => e.id);
  return { version: 1, query, status: incompatibleDimensions || missing.size || conflicts.length || stale.length || staleRelationships.length ? 'blocked' : 'ready',
    incompatibleDimensions,
    missingDimensions: [...missing].sort(), scopes: [...ids].sort(), records, policies: effectivePolicies.map(r => r.id),
    supersededPolicies: [...superseded].sort(), conflicts, stale, staleRelationships, relationships };
}

/** Follow reverse dependencies, including cycles, without changing or approving records. */
export function affectedContext(model, evidence) {
  validateContext(model);
  const changed = new Set(evidence.filter(e => e.status !== 'current').map(e => e.id));
  const affected = new Set(model.records.filter(r => r.evidence.some(e => changed.has(e))).map(r => r.id));
  for (const edge of model.relationships) if (edge.evidence.some(e => changed.has(e))) { affected.add(edge.from); affected.add(edge.to); }
  let grew = true;
  while (grew) {
    grew = false;
    for (const edge of model.relationships) if (affected.has(edge.to) && !affected.has(edge.from)) { affected.add(edge.from); grew = true; }
  }
  return { changedEvidence: [...changed].sort(), affectedRecords: [...affected].sort(), unaffectedRecords: model.records.filter(r => !affected.has(r.id)).map(r => r.id).sort(),
    discoveryRequired: true, note: 'Evidence closure covers declared dependencies only. Inventory changes require discovery before accepting new relationships.' };
}
