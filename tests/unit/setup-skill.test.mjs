// Static checks of the setup coordinator's text: one upfront question round, answers handoff
// to install/add-project, and a --yes mode that never fabricates approval.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { countLines } from '../../scripts/lib/fsutil.mjs';
import { estimateTokens, LIMITS } from '../../scripts/lib/tokens.mjs';

const skillDir = fileURLToPath(new URL('../../skills/setup/', import.meta.url));
const skill = () => readFileSync(join(skillDir, 'SKILL.md'), 'utf8');
const ref = (/** @type {string} */ name) => readFileSync(join(skillDir, 'references', name), 'utf8');

test('SKILL.md stays within 100 lines and 900 estimated tokens and names its references', () => {
  const text = skill();
  assert.ok(countLines(text) <= LIMITS.entry.lines, `${countLines(text)} lines`);
  assert.ok(estimateTokens(text) <= LIMITS.entry.tokens, `about ${estimateTokens(text)} estimated tokens`);
  assert.ok(text.includes('references/orchestration.md'));
  assert.ok(text.includes('references/integrations.md'));
});

test('setup asks one upfront round and hands pre-filled answers to install and add-project', () => {
  const o = ref('orchestration.md');
  assert.match(o, /ONE AskUserQuestion call/);
  assert.match(o, /\.devocd\/setup\/answers\//);
  assert.match(o, /without an? `approval` field/i);
  assert.ok(countLines(o) <= LIMITS.reference.lines);
});

test('setup never grants commands itself: Fast mode defers to the draft where names are listed', () => {
  const o = ref('orchestration.md');
  assert.match(o, /useSuggestedCommands/);
  assert.doesNotMatch(o, /"approvedCommands"/, 'setup writes no approved commands into handoff files');
});

test('--yes accepts derived defaults but never fabricates approval', () => {
  const o = ref('orchestration.md');
  assert.match(o, /`--yes`/);
  assert.match(o, /never|not/i);
  const yes = o.slice(o.indexOf('--yes'));
  assert.match(yes, /never (writes?|sets?) .?approval|approval.*(never|not)/i);
});

test('setup is granted what orchestration asks of it, and deletes nothing', () => {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(skill());
  assert.ok(m);
  assert.ok(m[1].includes('Write(.devocd/setup/**)'), 'handoff files need a scoped Write grant');
  assert.ok(m[1].includes('devocd.mjs" refresh-status *)'), 'rerun checks need refresh-status');
  const o = ref('orchestration.md');
  assert.doesNotMatch(o, /[Rr]emove `\.devocd\/setup\/answers\//, 'setup has no delete tool; the files stay');
});

test('the integration choice moved into the upfront round; integrations.md keeps only the mechanics', () => {
  assert.doesNotMatch(ref('integrations.md'), /ask which tools/i);
  assert.match(ref('orchestration.md'), /integration/i);
});
