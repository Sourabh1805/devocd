// Canonical context model. Markdown is a view, never an implicit policy authority.
import { codedError } from './fsutil.mjs';

export const CONTEXT_VERSION = 1;
const fail = message => { throw codedError('INVALID_CONTEXT', message); };
const id = value => typeof value === 'string' && /^[a-z0-9][a-z0-9._-]{0,99}$/.test(value);
export const relativePath = value => typeof value === 'string' && value.length <= 500 &&
  (value === '.' || /^(?!\/)(?!.*(?:^|\/)\.\.?($|\/))[A-Za-z0-9_ ./-]+$/.test(value) && !value.endsWith('/') && !value.includes('//') && value.split('/').every(p => !/[. ]$/.test(p)));
function keys(value, required, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Expected an object.');
  if (required.some(k => !Object.hasOwn(value, k)) || Object.keys(value).some(k => ![...required, ...optional].includes(k))) fail(`Expected fields: ${required.join(', ')}.`);
}
function list(value, max = 10000) { if (!Array.isArray(value) || value.length > max) fail('Invalid or oversized list.'); }
function text(value, max = 4000) { if (typeof value !== 'string' || !value.trim() || value.length > max) fail('Invalid or oversized text.'); }
export function validateContext(model) {
  keys(model, ['version', 'company', 'projects', 'scopes', 'evidence', 'records', 'relationships']);
  if (model.version !== CONTEXT_VERSION || !id(model.company)) fail('Unsupported version or company ID.');
  for (const name of ['projects', 'scopes', 'evidence', 'records', 'relationships']) list(model[name]);
  const index = (items, label) => {
    const map = new Map();
    for (const item of items) { if (!item || !id(item.id) || map.has(item.id)) fail(`Invalid or duplicate ${label} ID.`); map.set(item.id, item); }
    return map;
  };
  const projects = index(model.projects, 'project'), scopes = index(model.scopes, 'scope');
  const evidence = index(model.evidence, 'evidence'), records = index(model.records, 'record');
  index(model.relationships, 'relationship');
  for (const p of model.projects) {
    keys(p, ['id', 'path']);
    if (!relativePath(p.path) || p.path === '.' || p.path.split('/').some(s => s.startsWith('.'))) fail('Projects require visible company-relative folders.');
  }
  if (new Set(model.projects.map(p => p.path.toLowerCase())).size !== model.projects.length) fail('Duplicate project paths.');
  for (const s of model.scopes) {
    keys(s, ['id', 'parent', 'project', 'path'], ['cloud', 'environment']);
    if (!relativePath(s.path) || (s.project !== null && !projects.has(s.project))) fail('Invalid scope location.');
    if (s.cloud !== undefined && !['aws', 'azure', 'gcp'].includes(s.cloud)) fail('Invalid cloud.');
    if (s.environment !== undefined && !id(s.environment)) fail('Invalid environment.');
    if (s.parent === null) {
      if (s.project !== null || s.path !== '.' || s.cloud || s.environment) fail('Root scope must be company-wide.');
    } else {
      const parent = scopes.get(s.parent);
      if (!parent || parent.id === s.id || (parent.project !== null && parent.project !== s.project)) fail('Invalid scope parent.');
      if (parent.project === s.project && parent.path !== '.' && s.path !== parent.path && !s.path.startsWith(parent.path + '/')) fail('Scope escapes its parent.');
      if (s.project === null && (s.path !== '.' || s.cloud || s.environment)) fail('Company scope cannot select a project path or cloud.');
    }
    const seen = new Set([s.id]);
    for (let next = scopes.get(s.parent); next; next = scopes.get(next.parent)) {
      if (seen.has(next.id)) fail('Scope cycle.');
      seen.add(next.id);
      for (const dimension of ['cloud', 'environment']) if (s[dimension] !== undefined && next[dimension] !== undefined && s[dimension] !== next[dimension]) fail('Scope cannot change an inherited cloud or environment.');
    }
  }
  if (model.scopes.filter(s => s.parent === null).length !== 1) fail('Exactly one company root scope is required.');
  for (const e of model.evidence) {
    keys(e, ['id', 'project', 'path', 'sha256']);
    if ((e.project !== null && !projects.has(e.project)) || !relativePath(e.path) || e.path === '.' || !/^[a-f0-9]{64}$/.test(e.sha256)) fail('Invalid evidence reference.');
    if (e.path.split('/').some(part => /^(?:\.git|\.devocd|\.ssh|\.aws|\.azure|\.gnupg|\.env(?:\..*)?|credentials(?:\..*)?|id_rsa|id_ed25519|\.npmrc|\.netrc)$|\.(?:pem|key|p12|pfx)$/i.test(part))) fail('Private or generated paths cannot be source evidence.');
  }
  const refs = values => { list(values, 100); if (!values.length || new Set(values).size !== values.length || values.some(v => !evidence.has(v))) fail('Evidence IDs must exist and be unique.'); };
  for (const r of model.records) {
    keys(r, ['id', 'kind', 'scope', 'title', 'body', 'evidence'], ['policy']);
    if (!['policy', 'service', 'runbook', 'module', 'flow'].includes(r.kind) || !scopes.has(r.scope)) fail('Invalid record kind or scope.');
    text(r.title, 120); text(r.body); refs(r.evidence);
    if (r.kind === 'policy') {
      keys(r.policy, ['key', 'value', 'allowExceptions', 'overrides']);
      if (!id(r.policy.key) || typeof r.policy.allowExceptions !== 'boolean') fail('Invalid policy.');
      text(r.policy.value, 500); list(r.policy.overrides, 100);
      for (const target of r.policy.overrides) {
        const prior = records.get(target);
        if (!prior || prior.kind !== 'policy' || prior.policy?.key !== r.policy.key || prior.policy?.allowExceptions !== true) fail('Exception must target a policy that explicitly permits exceptions.');
        const ancestors = new Set();
        for (let s = scopes.get(scopes.get(r.scope).parent); s; s = scopes.get(s.parent)) ancestors.add(s.id);
        if (!ancestors.has(prior.scope)) fail('Exception must be strictly below the policy it overrides.');
      }
    } else if (r.policy !== undefined) fail('Only policy records may carry policy rules.');
  }
  for (const edge of model.relationships) {
    keys(edge, ['id', 'from', 'to', 'kind', 'evidence']);
    if (!records.has(edge.from) || !records.has(edge.to) || edge.from === edge.to || !['depends-on', 'documented-by', 'calls', 'owns'].includes(edge.kind)) fail('Invalid relationship.');
    refs(edge.evidence);
  }
  return model;
}
