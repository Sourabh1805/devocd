import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { contextFixture } from '../helpers/context-fixture.mjs';
import { validateContext } from '../../scripts/lib/context-schema.mjs';
import { loadContext, publishContext, evidenceStatus, inspectContext, digest } from '../../scripts/lib/context-store.mjs';
import { refreshContext } from '../../scripts/lib/context-refresh.mjs';
import { resolveContext, affectedContext } from '../../scripts/lib/context-resolver.mjs';
import { adaptContext, agentRequest } from '../../scripts/lib/context-adapters.mjs';
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'devocd-context-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, model: contextFixture(root) };
}
const query = { project: 'payments', path: 'infra/production', cloud: 'azure', environment: 'production' };

test('scopes cannot switch inherited dimensions and incompatible queries cannot drop scoped policies', t => {
  const { root, model } = fixture(t);
  for (const dimension of ['cloud', 'environment']) {
    const invalid = structuredClone(model);
    invalid.scopes.push({ id: 'escape', parent: 'payments-azure', project: 'payments', path: 'infra/production/app', [dimension]: dimension === 'cloud' ? 'aws' : 'development' });
    assert.throws(() => validateContext(invalid), { code: 'INVALID_CONTEXT' });
  }
  const result = resolveContext(model, { ...query, environment: 'development' }, evidenceStatus(root, model));
  assert.equal(result.status, 'blocked');
  assert.equal(result.incompatibleDimensions, true);
  assert.throws(() => adaptContext('claude', result), { code: 'CONTEXT_BLOCKED' });
  model.scopes.push({ id: 'payments-dev', parent: 'payments', project: 'payments', path: '.', environment: 'development' });
  assert.equal(resolveContext(model, { ...query, environment: 'development' }, evidenceStatus(root, model)).status, 'blocked');
});

test('schema rejects unknown fields, dangling evidence, cycles and unauthorized exceptions', t => {
  const { model } = fixture(t);
  assert.equal(validateContext(model), model);
  for (const mutate of [m => { m.version = 2; }, m => { m.extra = true; }, m => { m.records[0].evidence = ['missing']; }, m => { m.scopes[0].parent = 'payments'; },
    m => { m.records.find(r => r.id === 'payments-azure-region').policy = { key: 'review', value: 'optional', allowExceptions: false, overrides: ['review'] }; }]) {
    const copy = structuredClone(model); mutate(copy); assert.throws(() => validateContext(copy), { code: 'INVALID_CONTEXT' });
  }
});

test('resolver selects three projects and nested AWS/Azure contexts without cross-project leakage', t => {
  const { root, model } = fixture(t), status = evidenceStatus(root, model);
  for (const project of model.projects) for (const cloud of ['aws', 'azure']) {
    const result = resolveContext(model, { ...query, project: project.id, cloud }, status);
    assert.equal(result.status, 'ready');
    assert.deepEqual(result.policies.sort(), [`${project.id}-${cloud}-region`, 'review'].sort());
    assert.ok(result.records.every(r => r.scope === 'company' || r.id.startsWith(project.id + '-')));
  }
  assert.equal(resolveContext(model, { project: 'payments', path: 'infra/production' }, status).status, 'blocked');
  assert.throws(() => resolveContext(model, { ...query, path: '../identity' }, status));
  assert.equal(resolveContext(model, { ...query, path: 'infra/production-copy' }, status).policies.length, 1);
});

test('conflicts block adapters; exceptions require explicit ancestor permission; inherited dimensions remain active', t => {
  const { root, model } = fixture(t);
  model.scopes.push({ id: 'payments-azure-app', parent: 'payments-azure', project: 'payments', path: 'infra/production/app' });
  model.records.push({ ...structuredClone(model.records.find(r => r.id === 'payments-azure-region')), id: 'different-region', scope: 'payments-azure-app', policy: { key: 'region', value: 'ukwest', allowExceptions: false, overrides: [] } });
  let result = resolveContext(model, { ...query, path: 'infra/production/app' }, evidenceStatus(root, model));
  assert.equal(result.conflicts.length, 1);
  assert.throws(() => adaptContext('codex', result), { code: 'CONTEXT_BLOCKED' });
  model.records.at(-1).policy.overrides = ['payments-azure-region'];
  result = resolveContext(model, { ...query, path: 'infra/production/app' }, evidenceStatus(root, model));
  assert.equal(result.status, 'ready');
  assert.ok(result.policies.includes('review'));
  assert.ok(!result.policies.includes('payments-azure-region'));
});

test('publication previews without writes, retains old generation on injected failures and rejects stale bases', t => {
  const { root, model } = fixture(t);
  assert.equal(publishContext(root, model).applied, false);
  assert.equal(existsSync(join(root, '.devocd/context-current.json')), false);
  const first = publishContext(root, model, { apply: true });
  model.records[0].title = 'Updated review policy';
  for (const step of ['before-stage', 'after-stage', 'before-activate']) {
    assert.throws(() => publishContext(root, model, { apply: true, expectedGeneration: first.generation, fault: at => { if (at === step) throw Error('injected interruption'); } }));
    assert.equal(loadContext(root).generation, first.generation);
  }
  assert.throws(() => publishContext(root, model, { apply: true }), { code: 'CONTEXT_CONFLICT' });
  const second = publishContext(root, model, { apply: true, expectedGeneration: first.generation });
  assert.equal(loadContext(root).generation, second.generation);
  assert.ok(existsSync(join(root, '.devocd/generations', first.generation, 'context.json')));
});

test('stale runbooks block affected context and propagate to services without touching unrelated projects', t => {
  const { root, model } = fixture(t);
  writeFileSync(join(root, 'payments/runbook.md'), 'Changed recovery procedure.');
  const status = evidenceStatus(root, model), impact = affectedContext(model, status);
  assert.deepEqual(impact.affectedRecords, ['payments-runbook', 'payments-service']);
  assert.equal(resolveContext(model, query, status).status, 'blocked');
  assert.equal(resolveContext(model, { ...query, project: 'portal' }, status).status, 'ready');
  assert.throws(() => publishContext(root, model, { apply: true }), { code: 'STALE_CONTEXT' });
});

test('new unmapped source requires discovery and publication catches changes during staging', t => {
  const { root, model } = fixture(t);
  const first = publishContext(root, model, { apply: true });
  writeFileSync(join(root, 'payments/new-service.txt'), 'new dependency');
  const inspection = inspectContext(root, loadContext(root));
  assert.deepEqual(inspection.discoveryProjects, ['payments']);
  assert.equal(resolveContext(model, query, inspection.evidence).status, 'blocked');
  assert.equal(resolveContext(model, { ...query, project: 'identity' }, inspection.evidence).status, 'ready');
  assert.throws(() => publishContext(root, model, { apply: true, expectedGeneration: first.generation, fault: step => {
    if (step === 'after-stage') writeFileSync(join(root, 'portal/unexpected.txt'), 'concurrent source');
  } }), { code: 'STALE_CONTEXT' });
  assert.equal(loadContext(root).generation, first.generation);
});

test('incremental refresh preserves unrelated records and updates only reviewed affected content', t => {
  const { root, model } = fixture(t);
  const first = publishContext(root, model, { apply: true });
  writeFileSync(join(root, 'payments/runbook.md'), 'New approved recovery steps.');
  const draft = structuredClone(model);
  draft.evidence.find(e => e.id === 'payments-runbook-source').sha256 = digest('New approved recovery steps.');
  draft.records.find(r => r.id === 'payments-runbook').body = 'New approved recovery steps.';
  const bad = structuredClone(draft);
  bad.records.find(r => r.id === 'identity-service').body = 'Unrelated edit';
  assert.throws(() => refreshContext(root, bad, { apply: true, expectedGeneration: first.generation }), { code: 'INVALID_CONTEXT' });
  for (const mutate of [
    m => { m.relationships.find(e => e.id === 'identity-docs').from = 'payments-service'; },
    m => { m.records.find(r => r.id === 'payments-service').scope = 'identity'; },
    m => { m.records.find(r => r.id === 'payments-service').evidence.push('company-policy'); m.evidence.find(e => e.id === 'company-policy').path = 'payments/service.txt'; m.evidence.find(e => e.id === 'company-policy').sha256 = digest('payments'); },
  ]) {
    const altered = structuredClone(draft); mutate(altered);
    assert.throws(() => refreshContext(root, altered, { expectedGeneration: first.generation }), { code: 'INVALID_CONTEXT' });
  }
  assert.equal(loadContext(root).generation, first.generation);
  const result = refreshContext(root, draft, { apply: true, expectedGeneration: first.generation });
  assert.deepEqual(result.changes.records, ['payments-runbook']);
  assert.deepEqual(loadContext(root).model.records.filter(r => r.id.startsWith('identity-')), model.records.filter(r => r.id.startsWith('identity-')));
});

test('a process interrupted before activation leaves the old snapshot and a visible recovery lock', t => {
  const { root, model } = fixture(t);
  const first = publishContext(root, model, { apply: true });
  model.records[0].title = 'Reviewed update';
  const moduleUrl = new URL('../../scripts/lib/context-store.mjs', import.meta.url).href;
  const program = `import { publishContext } from ${JSON.stringify(moduleUrl)}; publishContext(${JSON.stringify(root)}, ${JSON.stringify(model)}, {apply:true,expectedGeneration:${JSON.stringify(first.generation)},fault:step=>{if(step==='before-activate')process.exit(77)}});`;
  const interrupted = spawnSync(process.execPath, ['--input-type=module', '-e', program], { encoding: 'utf8' });
  assert.equal(interrupted.status, 77, interrupted.stderr);
  assert.equal(loadContext(root).generation, first.generation);
  assert.ok(JSON.parse(readFileSync(join(root, '.devocd/context.lock'), 'utf8')).pid);
  assert.throws(() => publishContext(root, model, { apply: true, expectedGeneration: first.generation }), { code: 'CONTEXT_LOCKED' });
});

test('publication refuses linked evidence and active locks, and detects tampered generations', t => {
  const { root, model } = fixture(t), other = fixture(t);
  symlinkSync(other.root, join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  const bad = structuredClone(model); bad.projects[0].path = 'linked';
  assert.throws(() => publishContext(root, bad, { apply: true }), { code: 'BAD_TARGET' });
  writeFileSync(join(root, '.devocd/context.lock'), 'interrupted');
  assert.throws(() => publishContext(root, model, { apply: true }), { code: 'CONTEXT_LOCKED' });
  rmSync(join(root, '.devocd/context.lock'));
  const result = publishContext(root, model, { apply: true });
  writeFileSync(join(root, '.devocd/generations', result.generation, 'context.json'), '{}');
  assert.throws(() => loadContext(root), { code: 'INVALID_CONTEXT' });
});

for (const [host, entry] of [['claude', 'CLAUDE.local.md'], ['codex', 'AGENTS.md'], ['antigravity', 'GEMINI.md']]) test(`${host} adapter preserves policies, fails on budget instead of truncating and grants no permissions`, t => {
  const { root, model } = fixture(t);
  const resolved = resolveContext(model, query, evidenceStatus(root, model));
  const adapter = adaptContext(host, resolved);
  assert.equal(adapter.entryFile, entry);
  assert.deepEqual(adapter.policyIds, resolved.policies);
  assert.deepEqual(adapter.permissions, []);
  assert.match(adapter.text, /required/);
  assert.throws(() => adaptContext(host, resolved, 1), { code: 'CONTEXT_BUDGET' });
  assert.equal(existsSync(join(root, entry)), false);
});

test('CLI publishes, resolves and provides optional agent requests without executing an agent', t => {
  const { root, model } = fixture(t);
  writeFileSync(join(root, 'draft.json'), JSON.stringify(model));
  writeFileSync(join(root, 'query.json'), JSON.stringify(query));
  const cli = fileURLToPath(new URL('../../scripts/devocd.mjs', import.meta.url));
  const run = (...args) => { const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr); return JSON.parse(result.stdout); };
  run('context-publish', root, 'draft.json', 'none', '--apply');
  assert.equal(run('context-resolve', root, 'query.json', 'codex').host, 'codex');
  const request = run('context-agent', root, 'query.json', 'policy-auditor');
  assert.equal(request.writes, false); assert.equal(request.maxFiles, 20);
  assert.throws(() => agentRequest('unknown', {}));
  assert.deepEqual(run('context-impact', root).affectedRecords, []);
});
