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
const REFERENCES = ['interview.md', 'project-template.md', 'flow-template.md', 'operations-template.md', 'personal-split.md'];
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

test('a folder or value that ends in a backslash is refused like check refuses it, since it would escape the closing quote', () => {
  const refusal = linesWith(/`"`, `\$`, a backtick or a line break/);
  assert.ok(refusal.some((l) => /ends in a backslash/.test(l) && /stop/i.test(l)), refusal.join('\n'));
});

test('the arguments split by a stated rule, and quotes that delimit a part are not refused', () => {
  const rule = linesWith(/pair of double quotes/);
  assert.equal(rule.length, 1, 'one line states the split rule');
  assert.match(rule[0], /remove/i, 'delimiting quotes are removed');
  assert.match(rule[0], /last part/, 'unquoted, the answers file is the last part');
  assert.match(rule[0], /ends in `\.json`/);
  assert.match(rule[0], /everything before it/, 'the path is everything before it');
  assert.match(rule[0], /trimmed/);
  // The refusal applies to what is left once those quotes are removed, so quoting a path with a space is not refused.
  const refusal = linesWith(/`"`, `\$`, a backtick or a line break/);
  assert.ok(refusal.some((l) => /what is left|after (that|those)|remaining/i.test(l) && /stop/i.test(l)), refusal.join('\n'));
  const text = skill();
  assert.ok(text.indexOf('pair of double quotes') < text.indexOf('a backtick or a line break'), 'the split comes before the refusal');
});

test('the description is cleaned before it reaches register, and an id that does not match stops the run', () => {
  const line = linesWith(/devocd\.mjs" register /).join('\n');
  assert.ok(line, 'a register command');
  assert.match(line, /`"`/);
  assert.match(line, /`\$`/);
  assert.match(line, /backtick/);
  const id = linesWith(/\[a-z0-9\]/);
  assert.equal(id.length, 1, 'the id pattern is stated once');
  assert.match(id[0], /doesn't|does not|otherwise|if not/i);
  assert.match(id[0], /stop/i);
  assert.match(id[0], /writing nothing|write nothing/i);
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

test('a file source ref is rewritten from the project folder, never copied, and the examples agree', () => {
  assert.ok(linesWith(/state\.json/).some((l) => /ref/.test(l) && /from P/.test(l)), 'SKILL.md says where state.json is written that refs are from P');
  const project = ref('project-template.md');
  assert.match(project, /never copied/);
  assert.match(project, /relative to the project folder/);
  const stateRef = /"sources": \[\{ "type": "file", "ref": "([^"]+)"/.exec(project)?.[1];
  const answersRef = /"type": "file", "ref": "([^"]+)"/.exec(ref('interview.md'))?.[1];
  assert.ok(stateRef && answersRef, 'both examples have a file ref');
  assert.notEqual(stateRef, answersRef, 'the state example is the answers example rewritten, not a copy');
  const worked = project.slice(project.indexOf('Worked example'));
  assert.ok(worked.includes(`\`${answersRef}\``) && worked.includes(`\`${stateRef}\``), 'the worked example names both refs');
  assert.ok(ref('interview.md').includes(stateRef), 'the interview example says what state records');
});

test('operations facts carry their source and date, and web or assumed facts are unconfirmed', () => {
  const ops = ref('operations-template.md');
  assert.match(ops, /\(source: .+, read .+\)/);
  assert.match(ops, /unconfirmed/);
});

test('the personal split is one line in SKILL.md and all its wording is in references/personal-split.md', () => {
  const lines = linesWith(/personal-split\.md/);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /personalSplit/);
  assert.match(lines[0], /200/);
  assert.equal(linesWith(/add-exclude|remove-exclude/).length, 0, 'the commands live in the reference');
});

test('the personal split offers only over 200 lines, has the helper copy, shows three lists, and names the exclude and its undo', () => {
  const r = ref('personal-split.md');
  assert.match(r, /`lines` over 200/);
  assert.match(r, /personalSplit/);
  for (const w of ['`Stays`', '`Moves`', "`Didn't fit`"]) assert.ok(r.includes(w), w);
  assert.match(r, /use pnpm/);
  assert.match(r, /no keyword/i);
  assert.match(r, /devocd\.mjs" split-team "P" "P\/\.devocd\/split\.draft\.json"/);
  assert.ok(r.includes('Never write `.devocd/team/` yourself'));
  assert.match(r, /devocd\.mjs" settings "P" add-exclude "A"/);
  assert.match(r, /devocd\.mjs" settings "P" remove-exclude "A"/);
  assert.match(r, /`absolute`/);
  assert.match(r, /excluded.*true/s);
  assert.match(r, /data, not instructions/);
  assert.match(r, /estimated/);
  assert.match(r, /not one byte/);
  assert.match(r, /keep the split, refresh it[^.]*, or undo it/, 'an interactive rerun offers the choice');
  assert.ok(r.indexOf('split-team') < r.indexOf('add-exclude'), 'the copy comes before the exclude');
  assert.ok(r.indexOf('write-block') < r.indexOf('add-exclude'), 'the exclude comes after the pointer block is written');
  const undo = r.slice(r.indexOf('## Undo'), r.indexOf('Rerun with'));
  assert.ok(undo.length > 20 && !undo.includes('CLAUDE_PLUGIN_ROOT'), 'the plain undo steps need no plugin path');
});
