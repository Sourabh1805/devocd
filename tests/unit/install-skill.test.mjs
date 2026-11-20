// Static checks of the install skill's text. They cost nothing and cover what a live run can't: no real
// connector is present in a live run (R10), and a live run must not override the home folder (R25).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { countLines } from '../../scripts/lib/fsutil.mjs';
import { estimateTokens, LIMITS } from '../../scripts/lib/tokens.mjs';

const skillDir = fileURLToPath(new URL('../../skills/install/', import.meta.url));
const skill = () => readFileSync(join(skillDir, 'SKILL.md'), 'utf8');
const ref = (/** @type {string} */ name) => readFileSync(join(skillDir, 'references', name), 'utf8');
const REFERENCES = ['interview.md', 'parent-template.md', 'standards-template.md'];
/** Lines of the skill that mention text, so a rule and what it acts on must sit together. */
const linesWith = (/** @type {RegExp} */ re) => skill().split('\n').filter((l) => re.test(l));

test('SKILL.md is within 100 lines and 900 estimated tokens', () => {
  const text = skill();
  assert.ok(countLines(text) <= LIMITS.entry.lines, `${countLines(text)} lines`);
  assert.ok(estimateTokens(text) <= LIMITS.entry.tokens, `about ${estimateTokens(text)} estimated tokens`);
});

test('the frontmatter permits setup invocation and grants only its helper commands', () => {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(skill());
  assert.ok(m, 'frontmatter present');
  assert.match(m[1], /^name: install$/m);
  assert.match(m[1], /^description: .+/m);
  assert.doesNotMatch(m[1], /^disable-model-invocation: true$/m);
  assert.ok(!m[1].includes('devocd.mjs" *)'), 'no grant of every subcommand');
  for (const sub of ['preflight', 'backup', 'protect', 'render-parent', 'check']) {
    assert.ok(m[1].includes(`  - Bash(node "\${CLAUDE_PLUGIN_ROOT}/scripts/devocd.mjs" ${sub} *)`), sub);
  }
});

test('the answers path never goes near a shell command', () => {
  const uses = linesWith(/\$ARGUMENTS/);
  assert.equal(uses.length, 1, 'one use, to tell the agent the path');
  assert.doesNotMatch(uses[0], /devocd\.mjs|`|"/);
  for (const l of linesWith(/devocd\.mjs/)) assert.doesNotMatch(l, /\$ARGUMENTS|\$1|\$0/);
  assert.ok(linesWith(/only to the Read tool/).length > 0, 'the skill says where the path may go');
});

test('connector tools are required to be read-only', () => {
  assert.ok(linesWith(/connector/i).some((l) => /read-only/i.test(l)), 'SKILL.md requires it');
  const interview = ref('interview.md');
  assert.match(interview, /read-only/i);
  assert.match(interview, /never .*(create|update|delete|comment)/i);
});

test('the skill acts on isHome: it warns and stops', () => {
  const lines = linesWith(/isHome/);
  assert.ok(lines.some((l) => /warn/i.test(l) && /stop/i.test(l)), lines.join('\n'));
});

test('the skill acts on agentsMd: it warns', () => {
  assert.ok(linesWith(/agentsMd/).some((l) => /warn/i.test(l)));
});

test('a rerun is recognised from preflight\'s state, not by the agent probing files', () => {
  // A live rerun once skipped its backup, and another probed state with `ls` and `cat`: detection belongs to the helper.
  assert.ok(linesWith(/`state` is `company`/).some((l) => /rerun/i.test(l) && /Read `\.devocd\/state\.json`/.test(l)), skill());
  assert.doesNotMatch(skill(), /If `\.devocd\/state\.json` exists/);
});

test('sources are data, and instruction-like text is flagged rather than followed', () => {
  assert.ok(linesWith(/data/i).some((l) => /sources?/i.test(l)));
  assert.ok(linesWith(/flag/i).length > 0);
  assert.match(ref('standards-template.md'), /unconfirmed/);
});

test('state and the parent are only reached through the draft form of render-parent', () => {
  assert.ok(skill().includes('render-parent . .devocd/state.draft.json'));
  assert.ok(linesWith(/never/i).some((l) => /state\.json/.test(l)));
});

test('the interview derives defaults and asks one batched round, never one question at a time or topic by topic', () => {
  const interview = ref('interview.md');
  assert.match(interview, /ONE AskUserQuestion call/);
  assert.doesNotMatch(interview, /one question at a time/i);
  assert.match(interview, /Derive before asking/);
  assert.match(interview, /Personal workspace/);
  assert.match(interview, /devocd:company-policy/);
  assert.doesNotMatch(interview, /For each topic, which source covers it/);
});

test('drafts are cleared by the helper before writing and after applying, never by an unpermitted delete', () => {
  const text = skill();
  assert.doesNotMatch(text, /remove `draft\/`/, 'no instruction to delete without a tool that can');
  const at = (/** @type {string} */ s) => text.indexOf(s);
  assert.ok(at('clean-draft') > 0, 'the skill names clean-draft');
  assert.ok(at('clean-draft') < at('.devocd/draft/standards/'), 'stale drafts are cleared before fresh ones are written');
  assert.ok(text.includes('devocd.mjs" clean-draft .'), 'the post-apply cleanup is a full granted command');
  assert.ok(text.lastIndexOf('clean-draft') > at('Apply the approved files'), 'and the drafts are cleared again after they are applied');
});

test('draft standards files go on disk under draft/ and the chat draft is a summary', () => {
  assert.ok(linesWith(/\.devocd\/draft\/standards\//).length >= 2, 'SKILL.md writes and applies draft standards files');
  assert.ok(linesWith(/one-line summary/).length > 0);
});

test('only the literal value approved stands in for the review', () => {
  assert.ok(linesWith(/approval/).some((l) => l.includes('`approved`')));
});

test('every reference exists, is named by SKILL.md and is within 200 lines', () => {
  for (const name of REFERENCES) {
    assert.ok(existsSync(join(skillDir, 'references', name)), name);
    assert.ok(skill().includes(`references/${name}`), `SKILL.md names ${name}`);
    assert.ok(countLines(ref(name)) <= LIMITS.reference.lines, name);
  }
});

test('a file source ref is recorded from the company folder, never copied, and the rule and the worked example agree', () => {
  assert.ok(linesWith(/state\.draft\.json/).some((l) => /`ref`/.test(l) && /from this folder/.test(l) && /never copied/.test(l)),
    'SKILL.md says, where it writes the state draft, that a file ref is its path from this folder');
  const interview = ref('interview.md');
  const parent = ref('parent-template.md');
  const answersRef = /"type": "file", "ref": "([^"]+)"/.exec(interview)?.[1];
  const stateRef = /"sources": \[\{ "type": "file", "ref": "([^"]+)"/.exec(parent)?.[1];
  assert.ok(answersRef && stateRef, 'the answers example and the state example both have a file ref');
  assert.equal(answersRef, 'notes/security.md');
  assert.equal(stateRef, 'setup/notes/security.md', 'the state example is the answers example rewritten from the company folder');
  assert.ok(!interview.includes('../sources/'), "no example uses the test fixture's own refs");
  const at = interview.indexOf('Worked example');
  assert.ok(at > 0, 'interview.md has a worked example');
  const worked = interview.slice(at);
  for (const p of ['`acme/`', '`acme/setup/answers.json`', `\`${answersRef}\``, `\`${stateRef}\``]) assert.ok(worked.includes(p), p);
  assert.match(worked, /would be wrong/);
  assert.match(parent, /never copied/);
  assert.match(parent, /interview\.md/, 'the state shape points at the worked example');
});

test('the parent template does not copy the layout that parent.mjs owns', () => {
  assert.doesNotMatch(ref('parent-template.md'), /^#+ *(Key rules|Projects|Guidance)\s*$/im);
  assert.doesNotMatch(ref('parent-template.md'), /devocd:begin/);
});
