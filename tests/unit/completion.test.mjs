// @ts-check
// T46: history collection, knowledge publication and source refresh complete independently.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { workspace, companyState as defaultCompanyState } from '../helpers/workspace.mjs';
import { refreshStatus, planRefresh, completeRefresh, baselineRefresh } from '../../scripts/lib/refresh.mjs';
import { writeKnowledge } from '../../scripts/lib/knowledge.mjs';
import { applyDraft } from '../../scripts/lib/parent.mjs';
import { stateProblem } from '../../scripts/lib/check.mjs';
import { advanceCompletion, readCompletion } from '../../scripts/lib/completion.mjs';

const NONE = { historyCollected: null, knowledgePublished: null, sourceRefreshed: null };

function fixture(t) {
  return workspace(t, { projects: { api: {
    pages: { 'PROJECT.md': '# API\n', 'pointer.md': 'Start with PROJECT.md' },
    files: {
      'CLAUDE.local.md': '<!-- devocd:begin -->\nStart with PROJECT.md\n<!-- devocd:end -->\n',
      'src/a.js': 'export const a = 1;',
    },
  } } }).project('api');
}

test('a fresh project has reached none of the three completion states', t => {
  const root = fixture(t);
  assert.deepEqual(readCompletion(root), NONE);
  assert.equal(stateProblem(JSON.parse(readFileSync(join(root, '.devocd/state.json'), 'utf8'))), null,
    'a state file without completion still validates');
});

test('baselineRefresh sets sourceRefreshed and leaves the other two null', t => {
  const root = fixture(t);
  assert.equal(baselineRefresh(root).current, true);
  const completion = readCompletion(root);
  assert.match(completion.sourceRefreshed ?? '', /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(completion.historyCollected, null);
  assert.equal(completion.knowledgePublished, null);
});

test('planRefresh, refreshStatus and a failed baseline never set sourceRefreshed', t => {
  const root = fixture(t);
  refreshStatus(root);
  planRefresh(root);
  assert.equal(readCompletion(root).sourceRefreshed, null);
  const r = baselineRefresh(root, '0'.repeat(64));
  assert.equal(r.current, false);
  assert.equal(readCompletion(root).sourceRefreshed, null);
});

test('completeRefresh sets sourceRefreshed; a source change afterwards leaves it unchanged', t => {
  const root = fixture(t);
  planRefresh(root);
  assert.equal(readCompletion(root).sourceRefreshed, null);
  completeRefresh(root);
  const at = readCompletion(root).sourceRefreshed;
  assert.match(at ?? '', /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(readCompletion(root).knowledgePublished, null);

  planRefresh(root);
  writeFileSync(join(root, 'src/a.js'), 'changed during refresh');
  assert.throws(() => completeRefresh(root), /Source changed during refresh/);
  assert.equal(readCompletion(root).sourceRefreshed, at);
});

test('an approved draft apply sets knowledgePublished; a failed apply leaves it unchanged', t => {
  const { company } = workspace(t, { company: {} });
  writeFileSync(join(company, 'state.draft.json'), JSON.stringify(defaultCompanyState({ name: 'Co' })));
  applyDraft(company, join(company, 'state.draft.json'));
  const applied = readCompletion(company);
  assert.match(applied.knowledgePublished ?? '', /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(applied.historyCollected, null);
  assert.equal(applied.sourceRefreshed, null);

  writeFileSync(join(company, 'bad.draft.json'), '{"kind":"company"}');
  assert.throws(() => applyDraft(company, join(company, 'bad.draft.json')), { code: 'INVALID_DRAFT' });
  assert.deepEqual(readCompletion(company), applied);
});

test('historyCollected advances alone and never narrows the refresh set', t => {
  const root = fixture(t);
  const before = { status: refreshStatus(root), plan: planRefresh(root) };
  const at = '2026-01-02T03:04:05.000Z';
  assert.deepEqual(advanceCompletion(root, 'historyCollected', at), { ...NONE, historyCollected: at });
  assert.deepEqual(readCompletion(root), { ...NONE, historyCollected: at });
  assert.deepEqual({ status: refreshStatus(root), plan: planRefresh(root) }, before);
  assert.throws(() => advanceCompletion(root, /** @type {any} */ ('unknown')), /unknown completion step/);
  assert.deepEqual(readCompletion(root), { ...NONE, historyCollected: at }, 'a rejected step changes nothing');
});

test('a state file without completion reads as all-null, and a malformed completion is rejected', t => {
  const root = fixture(t);
  const state = JSON.parse(readFileSync(join(root, '.devocd/state.json'), 'utf8'));
  assert.deepEqual(readCompletion(root), NONE);
  assert.equal(stateProblem({ ...state, completion: { ...NONE, sourceRefreshed: '2026-01-02T03:04:05.000Z' } }), null);
  assert.match(stateProblem({ ...state, completion: { ...NONE, historyCollected: 1 } }), /completion\.historyCollected/);
  assert.match(stateProblem({ ...state, completion: { ...NONE, extra: null } }), /completion has unknown keys/);
  assert.match(stateProblem({ ...state, completion: { historyCollected: null } }), /completion\.knowledgePublished/);
});

test('an interrupted knowledge publish leaves .devocd and completion unchanged', t => {
  const root = fixture(t);
  assert.equal(baselineRefresh(root).current, true);
  const names = ['knowledge.json', 'knowledge.html', 'sources.json'];
  const before = names.map(name => readFileSync(join(root, '.devocd', name)));
  const completion = readCompletion(root);
  writeFileSync(join(root, '.devocd/PROJECT.md'), '# API\n\nchanged after the last publish\n');

  const fault = (/** @type {string} */ step) => { if (step === 'before-rename') throw new Error('injected interruption'); };
  assert.throws(() => writeKnowledge(root, { fault }), /injected interruption/);
  assert.deepEqual(names.map(name => readFileSync(join(root, '.devocd', name))), before, 'nothing was published');
  assert.deepEqual(readCompletion(root), completion);
  assert.deepEqual(readdirSync(join(root, '.devocd')).filter(name => name.endsWith('.tmp')), [], 'staged files were removed');

  // Interrupted after the first rename: the files already replaced are put back.
  const after = (/** @type {string} */ step) => { if (step === 'after-rename') throw new Error('injected interruption'); };
  assert.throws(() => writeKnowledge(root, { fault: after }), /injected interruption/);
  assert.deepEqual(names.map(name => readFileSync(join(root, '.devocd', name))), before, 'the previous set was restored');
  assert.deepEqual(readCompletion(root), completion);
});

test('applying a draft keeps the other completion steps already recorded', t => {
  const { company } = workspace(t, { company: {} });
  advanceCompletion(company, 'historyCollected', '2026-01-01T00:00:00.000Z');
  advanceCompletion(company, 'sourceRefreshed', '2026-01-02T00:00:00.000Z');
  writeFileSync(join(company, 'state.draft.json'), JSON.stringify(defaultCompanyState({ name: 'Co' })));
  applyDraft(company, join(company, 'state.draft.json'));
  const after = readCompletion(company);
  assert.equal(after.historyCollected, '2026-01-01T00:00:00.000Z');
  assert.equal(after.sourceRefreshed, '2026-01-02T00:00:00.000Z');
  assert.match(after.knowledgePublished ?? '', /^\d{4}-\d{2}-\d{2}T/);
});

test('a non-ISO completion string is rejected', t => {
  const root = fixture(t);
  const state = JSON.parse(readFileSync(join(root, '.devocd/state.json'), 'utf8'));
  state.completion = { historyCollected: '1', knowledgePublished: null, sourceRefreshed: null };
  assert.match(stateProblem(state) ?? '', /ISO-8601/);
});
