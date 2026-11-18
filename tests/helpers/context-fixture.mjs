import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { digest } from '../../scripts/lib/context-store.mjs';

// Three independent project roots; cloud scopes share a nested path to require explicit context.
export function contextFixture(root) {
  const model = { version: 1, company: 'example', projects: ['payments', 'identity', 'portal'].map(id => ({ id, path: id })),
    scopes: [{ id: 'company', parent: null, project: null, path: '.' }], evidence: [], records: [], relationships: [] };
  mkdirSync(join(root, '.devocd'), { recursive: true });
  writeFileSync(join(root, 'policy.md'), 'Production changes need review.');
  model.evidence.push({ id: 'company-policy', project: null, path: 'policy.md', sha256: digest('Production changes need review.') });
  model.records.push({ id: 'review', kind: 'policy', scope: 'company', title: 'Review', body: 'Production changes need review.', evidence: ['company-policy'], policy: { key: 'review', value: 'required', allowExceptions: false, overrides: [] } });
  for (const p of model.projects) {
    mkdirSync(join(root, p.path, 'infra/production'), { recursive: true });
    writeFileSync(join(root, p.path, 'service.txt'), p.id);
    writeFileSync(join(root, p.path, 'runbook.md'), `Restart ${p.id} after approval.`);
    model.scopes.push({ id: p.id, parent: 'company', project: p.id, path: '.' });
    for (const cloud of ['aws', 'azure']) model.scopes.push({ id: `${p.id}-${cloud}`, parent: p.id, project: p.id, path: 'infra/production', cloud, environment: 'production' });
    for (const [suffix, path, content] of [['source', 'service.txt', p.id], ['runbook-source', 'runbook.md', `Restart ${p.id} after approval.`]]) model.evidence.push({ id: `${p.id}-${suffix}`, project: p.id, path, sha256: digest(content) });
    model.records.push({ id: `${p.id}-service`, kind: 'service', scope: p.id, title: p.id, body: 'Service entry', evidence: [`${p.id}-source`] });
    model.records.push({ id: `${p.id}-runbook`, kind: 'runbook', scope: p.id, title: 'Recovery', body: `Restart ${p.id} after approval.`, evidence: [`${p.id}-runbook-source`] });
    model.relationships.push({ id: `${p.id}-docs`, from: `${p.id}-service`, to: `${p.id}-runbook`, kind: 'documented-by', evidence: [`${p.id}-runbook-source`] });
    for (const cloud of ['aws', 'azure']) model.records.push({ id: `${p.id}-${cloud}-region`, kind: 'policy', scope: `${p.id}-${cloud}`, title: 'Region', body: 'Approved region', evidence: ['company-policy'], policy: { key: 'region', value: cloud === 'aws' ? 'eu-west-2' : 'uksouth', allowExceptions: true, overrides: [] } });
  }
  return model;
}
