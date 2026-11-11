// Offline simulation only. No model calls, credentials, cloud resources or paid trials.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { contextFixture } from '../tests/helpers/context-fixture.mjs';
import { evidenceStatus, digest } from '../plugin/scripts/lib/context-store.mjs';
import { resolveContext } from '../plugin/scripts/lib/context-resolver.mjs';
import { adaptContext } from '../plugin/scripts/lib/context-adapters.mjs';

const root = mkdtempSync(join(tmpdir(), 'devocd-context-evaluation-'));
try {
  const model = contextFixture(root);
  for (const project of model.projects) {
    const result = spawnSync('git', ['init', '-q', join(root, project.path)], { encoding: 'utf8' });
    if (result.status !== 0) throw Error(result.stderr || 'Cannot create isolated fixture repository.');
  }
  const runs = [];
  for (const host of ['claude', 'codex']) {
    for (const project of model.projects) for (const cloud of ['aws', 'azure']) {
      const started = performance.now();
      const query = { project: project.id, path: 'infra/production', cloud, environment: 'production' };
      const resolved = resolveContext(model, query, evidenceStatus(root, model));
      const payload = adaptContext(host, resolved);
      const expected = [`${project.id}-${cloud}-region`, 'review'].sort();
      runs.push({ host, scenario: `${project.id}-${cloud}`, expectedPolicies: expected, selectedPolicies: payload.policyIds,
        correctContextSelection: JSON.stringify([...payload.policyIds].sort()) === JSON.stringify(expected),
        policyPreservation: payload.policyIds.includes('review'), expectedStatus: 'ready', actualStatus: resolved.status,
        latencyMs: Math.round((performance.now() - started) * 100) / 100, estimatedPayloadTokens: payload.estimatedTokens,
        assistantTaskSuccess: null, usdCost: null, costReason: 'offline; no assistant invoked' });
    }
    const conflict = structuredClone(model);
    conflict.records.push({ ...structuredClone(model.records[0]), id: 'conflicting-review', scope: 'payments', policy: { key: 'review', value: 'optional', allowExceptions: false, overrides: [] } });
    const query = { project: 'payments', path: 'infra/production', cloud: 'azure', environment: 'production' };
    const blocked = resolveContext(conflict, query, evidenceStatus(root, conflict));
    runs.push({ host, scenario: 'conflicting-policy', expectedStatus: 'blocked', actualStatus: blocked.status, assistantTaskSuccess: null, usdCost: null });
    writeFileSync(join(root, 'payments/runbook.md'), 'An outdated recovery path was replaced.');
    const stale = resolveContext(model, query, evidenceStatus(root, model));
    runs.push({ host, scenario: 'stale-runbook', expectedStatus: 'blocked', actualStatus: stale.status, assistantTaskSuccess: null, usdCost: null });
    writeFileSync(join(root, 'payments/runbook.md'), 'Restart payments after approval.');
  }
  const pass = runs.every(r => r.expectedStatus === r.actualStatus && r.correctContextSelection !== false && r.policyPreservation !== false);
  console.log(JSON.stringify({ mode: 'offline', fixtureHash: digest(JSON.stringify(model)), repositories: 3, adapterHosts: ['claude', 'codex'],
    deterministicChecksPass: pass, liveReleaseGatePassed: false, liveTrials: 'not run; spending budget not authorized', runs }, null, 2));
  if (!pass) process.exitCode = 1;
} finally { rmSync(root, { recursive: true, force: true }); }
