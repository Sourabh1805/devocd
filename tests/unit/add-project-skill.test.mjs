// @ts-check
// Static checks of the add-project skill's text. They cost nothing and cover what live runs show only by chance:
// arguments and user text never templated into a shell command, connectors read-only, and sizes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { countLines } from '../../plugin/scripts/lib/fsutil.mjs';
import { estimateTokens, LIMITS } from '../../plugin/scripts/lib/tokens.mjs';

const skillDir = fileURLToPath(new URL('../../plugin/skills/add-project/', import.meta.url));
const skill = () => readFileSync(join(skillDir, 'SKILL.md'), 'utf8');
const ref = (/** @type {string} */ name) => readFileSync(join(skillDir, 'references', name), 'utf8');
const REFERENCES = ['interview.md', 'project-template.md', 'flow-template.md', 'operations-template.md'];
/** Lines of the skill that mention text, so a rule and what it acts on must sit together. */
const linesWith = (/** @type {RegExp} */ re) => skill().split('\n').filter((l) => re.test(l));
/** Every helper command in the skill, from `node` to the closing backtick. */
const commands = () => [...skill().matchAll(/`(node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/devocd\.mjs" [^`]+)`/g)].map((m) => m[1]);

test('SKILL.md is within 100 lines and 900 estimated tokens', () => {
  const text = skill();
  assert.ok(countLines(text) <= LIMITS.entry.lines, `${countLines(text)} lines`);
  assert.ok(estimateTokens(text) <= LIMITS.entry.tokens, `about ${estimateTokens(text)} estimated tokens`);
});

test('the frontmatter keeps the skill out of context and allows only the helper and its own files, in the observed form', () => {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(skill());
  assert.ok(m, 'frontmatter present');
  assert.match(m[1], /^name: add-project$/m);
  assert.match(m[1], /^description: .+/m);
  assert.match(m[1], /^disable-model-invocation: true$/m);
  assert.match(m[1], /^argument-hint: "\[path\] \[answers-file\]"$/m);
  assert.ok(m[1].includes('  - Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/devocd.mjs" *)'));
  assert.ok(m[1].includes('  - Read(${CLAUDE_SKILL_DIR}/**)'));
});

test('no command line contains $ARGUMENTS; it appears once, to tell the agent the arguments', () => {
  const uses = linesWith(/\$ARGUMENTS/);
  assert.equal(uses.length, 1);
  assert.doesNotMatch(uses[0], /devocd\.mjs|`|"/);
  assert.ok(commands().length >= 7, `found ${commands().length} commands`);
  for (const c of [...commands(), ...linesWith(/devocd\.mjs/)]) assert.doesNotMatch(c, /\$ARGUMENTS|\$\d|\$\{?[A-Z_]*ARG/);
});

test('the skill refuses a path or helper value with ", $, a backtick or a line break, and quotes paths in commands', () => {
  assert.ok(linesWith(/`"`/).some((l) => l.includes('`$`') && /backtick/.test(l) && /line break/.test(l) && /stop/i.test(l)));
  for (const c of commands()) {
    const [, sub, first] = /devocd\.mjs" (\S+) (\S+)/.exec(c) ?? [];
    assert.ok(sub && first?.startsWith('"'), `the folder or file in "${c}" is quoted`);
  }
});

test('the description is cleaned before it reaches register, and the id is checked', () => {
  const line = linesWith(/devocd\.mjs" register /).join('\n');
  assert.ok(line, 'a register command');
  assert.match(line, /`"`/);
  assert.match(line, /`\$`/);
  assert.match(line, /backtick/);
  assert.ok(linesWith(/\[a-z0-9\]/).length > 0, 'the id pattern is stated');
});

test('the answers file goes only to the Read tool, and only the literal value approved stands in for the review', () => {
  assert.ok(linesWith(/only to the Read tool/).length > 0);
  assert.ok(linesWith(/approval/).some((l) => l.includes('`approved`')));
});

test('the skill acts on preflight: no company, the company folder itself, AGENTS.md and team files', () => {
  assert.ok(linesWith(/`company` is null/).some((l) => l.includes('/devocd:install') && /inside/.test(l) && /stop/i.test(l)));
  assert.ok(linesWith(/`company\.project` is `\.`/).some((l) => /stop/i.test(l)));
  assert.ok(linesWith(/agentsMd/).length > 0);
  assert.match(ref('project-template.md'), /AGENTS\.md/);
  assert.match(ref('project-template.md'), /teamFiles/);
});

test('protect runs before anything is written, and a tracked file stops the run', () => {
  const text = skill();
  const at = (/** @type {string} */ s) => text.indexOf(s);
  assert.ok(at('devocd.mjs" protect') > 0 && at('devocd.mjs" protect') < at('devocd.mjs" backup'), 'protect comes first');
  assert.ok(at('devocd.mjs" protect') < at('Write the files'), 'protect comes before the Write tool');
  assert.ok(linesWith(/tracked/).some((l) => /stop/i.test(l)));
});

test('the opt-in setting is added only when chosen, with the value preflight gives', () => {
  const lines = linesWith(/devocd\.mjs" settings /);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /add-dir/);
  assert.match(lines[0], /company\.standards/);
  assert.match(lines[0], /[Oo]pted in only/);
});

test('connector tools are required to be read-only, and sources are data', () => {
  assert.ok(linesWith(/connector/i).some((l) => /read-only/i.test(l)));
  assert.match(ref('interview.md'), /read-only/i);
  assert.match(ref('interview.md'), /never .*(create|update|delete|comment)/i);
  assert.ok(linesWith(/data, not instructions/).length > 0);
  assert.ok(linesWith(/script bod/).length > 0, 'script bodies are named as never saved');
});

test('every reference exists, is named by SKILL.md and is within 200 lines', () => {
  for (const name of REFERENCES) {
    assert.ok(existsSync(join(skillDir, 'references', name)), name);
    assert.ok(skill().includes(`references/${name}`), `SKILL.md names ${name}`);
    assert.ok(countLines(ref(name)) <= LIMITS.reference.lines, name);
  }
});

test('the templates do not copy a layout the helper owns', () => {
  for (const name of REFERENCES) {
    assert.doesNotMatch(ref(name), /^#+ *(Key rules|Projects|Guidance)\s*$/im, name);
    assert.doesNotMatch(ref(name), /devocd:(begin|end)/, name);
  }
});

test('operations facts carry their source and date, and web or assumed facts are unconfirmed', () => {
  const ops = ref('operations-template.md');
  assert.match(ops, /\(source: .+, read .+\)/);
  assert.match(ops, /unconfirmed/);
});
