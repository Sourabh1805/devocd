// Static checks across every skill: the Agent Skills spec, size, who may invoke a skill, the always-on listing
// and how widely each skill may call the helper. They cost nothing and need no `claude` on PATH.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { countLines } from '../../scripts/lib/fsutil.mjs';
import { estimateTokens, LIMITS } from '../../scripts/lib/tokens.mjs';

const skillsDir = fileURLToPath(new URL('../../skills/', import.meta.url));
const NAMES = ['add-project', 'capture', 'check', 'company-policy', 'install', 'pr-review', 'refresh', 'setup'];

/** @param {string} name */
function load(name) {
  const text = readFileSync(join(skillsDir, name, 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n');
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  assert.ok(m, `${name}: frontmatter`);
  const fm = m[1];
  const field = (/** @type {string} */ k) => new RegExp(`^${k}: (.*)$`, 'm').exec(fm)?.[1]?.trim().replace(/^"(.*)"$/, '$1');
  const tools = fm.split('\n').filter((l) => l.startsWith('  - ')).map((l) => l.slice(4));
  return { text, fm, field, tools };
}

test('the plugin has the declared skills', () => {
  assert.deepEqual(readdirSync(skillsDir).sort(), NAMES);
});

test('each skill meets the Agent Skills spec', () => {
  for (const name of NAMES) {
    const { field } = load(name);
    assert.equal(field('name'), name, `${name}: name matches its folder`);
    assert.match(name, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.ok(name.length >= 1 && name.length <= 64);
    const d = field('description') ?? '';
    assert.ok(d.length >= 1 && d.length <= 1024, `${name}: description length ${d.length}`);
  }
});

test('each SKILL.md is within 100 lines and 900 estimated tokens', () => {
  for (const name of NAMES) {
    const { text } = load(name);
    assert.ok(countLines(text) <= LIMITS.entry.lines, `${name}: ${countLines(text)} lines`);
    assert.ok(estimateTokens(text) <= LIMITS.entry.tokens, `${name}: about ${estimateTokens(text)} estimated tokens`);
  }
});

test('every skill invoked by setup permits model invocation', () => {
  const targets = load('setup').tools.filter(t => t.startsWith('Skill(devocd:')).map(t => t.slice('Skill(devocd:'.length, -1));
  assert.deepEqual(targets.sort(), ['add-project', 'check', 'install']);
  for (const name of targets) {
    assert.doesNotMatch(load(name).fm, /^disable-model-invocation: true$/m, name);
  }
  assert.doesNotMatch(load('pr-review').fm, /disable-model-invocation/);
});

test('the always-on listing stays within the shared estimated token budget', () => {
  // `claude plugin details` counts every skill, the ones with disable-model-invocation too (about 119 before the
  // descriptions were trimmed), and not argument-hint. Include the builder's description too.
  let total = 0;
  for (const name of NAMES) {
    const { field } = load(name);
    total += estimateTokens(`${name}: ${field('description')}`);
  }
  for (const file of readdirSync(join(skillsDir, '../agents'))) {
    const agent = readFileSync(join(skillsDir, '../agents', file), 'utf8');
    total += estimateTokens(file.replace(/\.md$/, '') + ': ' + /^description: (.+)$/m.exec(agent)[1]);
  }
  assert.ok(total <= LIMITS.footprintTokens, `about ${total} estimated tokens`);
});

test('pr-review still says when to use it', () => {
  assert.match(load('pr-review').field('description') ?? '', /^Use when asked to review/);
});

test('check has exactly one tool entry, and it is the check subcommand', () => {
  assert.deepEqual(load('check').tools, ['Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/devocd.mjs" check *)']);
});

test('check grants only check, pr-review only review-diff and review-context, and install exactly its helper commands', () => {
  const grants = (/** @type {string} */ name) => load(name).tools.filter((t) => t.includes('devocd.mjs'));
  for (const [name, subs] of /** @type {Array<[string, string[]]>} */ ([['check', ['check']], ['pr-review', ['review-diff', 'review-context']]])) {
    assert.deepEqual(grants(name), subs.map((s) => `Bash(node "\${CLAUDE_PLUGIN_ROOT}/scripts/devocd.mjs" ${s} *)`), name);
  }
  // install never runs write-block, settings, register, split-team, restore or review-diff, so it is not granted them.
  // clean-draft is the only way to clear .devocd/draft/, because skills have no delete tool.
  const INSTALL = ['preflight', 'backup', 'protect', 'render-parent', 'check', 'knowledge', 'clean-draft'];
  const { tools, text, fm } = load('install');
  assert.deepEqual(tools, [...INSTALL.map((s) => `Bash(node "\${CLAUDE_PLUGIN_ROOT}/scripts/devocd.mjs" ${s} *)`), 'Read(${CLAUDE_SKILL_DIR}/**)']);
  const body = text.slice(fm.length);
  const used = new Set([...body.matchAll(/devocd\.mjs" ([a-z-]+)/g)].map((m) => m[1]));
  assert.deepEqual([...used].sort(), [...INSTALL].sort(), 'the grants are exactly the subcommands the body runs');
});

test('check refuses unsafe folders before any command, never writes, and labels tokens estimated', () => {
  const { text, tools } = load('check');
  assert.match(text, /holds `"`, `\$`, a backtick or a line break, starts with `-` or ends in a backslash, say so and stop, with no command run/);
  assert.match(text, /check "F" --json/);
  assert.deepEqual(tools.filter((t) => /^(Write|Edit)\b/.test(t)), []);
  assert.match(text, /Never use Write or Edit/);
  assert.match(text, /every token figure "estimated"/);
  assert.match(text, /Never repeat, quote or paraphrase the value/);
  for (const rule of ['budget/lines', 'budget/tokens', 'ref/broken', 'ref/escape', 'import/present', 'secret/found', 'block/malformed', 'state/invalid', 'team-file/changed', 'launch/over-target', 'source/unconfirmed']) {
    assert.ok(text.includes(`\`${rule}\``), rule);
  }
});
