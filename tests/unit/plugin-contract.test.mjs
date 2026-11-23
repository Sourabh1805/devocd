// @ts-check
// The plugin's static contract, in one file: the manifest and marketplace entry, the tree and
// file limits, the skill listing and its always-on footprint, and the validate-plugin pass rule.
// Every check is still its own `test(...)` so T60 can build the per-skill contract on top.
// All of it is static and costs nothing: no `claude` on PATH is needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, lstatSync, existsSync } from 'node:fs';
import { join, dirname, basename, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { countLines } from '../../scripts/lib/fsutil.mjs';
import { estimateTokens, LIMITS } from '../../scripts/lib/tokens.mjs';
import { ALWAYS_ON_BUDGET, alwaysOnProblem, isMissing, parseAlwaysOn, validateProblems } from '../../scripts/validate-plugin.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const skillsDir = join(root, 'skills');
const agentsDir = join(root, 'agents');
const SKILLS = ['add-project', 'capture', 'check', 'company-policy', 'install', 'pr-review', 'refresh', 'setup'];

const readJson = (/** @type {string} */ p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

/** @param {string} dir @returns {string[]} every path under dir, without following links */
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (['.git', '.claude', '.superpowers', '.devocd', 'node_modules'].includes(name)) continue;
    const full = join(dir, name);
    out.push(full);
    if (lstatSync(full).isDirectory()) out.push(...walk(full));
  }
  return out;
}

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

// ---------------------------------------------------------------------------
// Manifest and marketplace
// ---------------------------------------------------------------------------

test('plugin.json has name devocd, version, description and author', () => {
  const m = readJson('.claude-plugin/plugin.json');
  assert.equal(m.name, 'devocd');
  assert.match(m.version, /^\d+\.\d+\.\d+$/);
  assert.equal(typeof m.description, 'string');
  assert.ok(m.description.length > 0);
  assert.equal(m.author?.name, 'Sourabh Gavali');
});

test('marketplace.json lists devocd with the repository root as source', () => {
  const m = readJson('.claude-plugin/marketplace.json');
  const entry = m.plugins.find((/** @type {any} */ p) => p.name === 'devocd');
  assert.ok(entry, 'devocd is listed');
  assert.equal(entry.source, './');
});

// ---------------------------------------------------------------------------
// Plugin tree and file limits
// ---------------------------------------------------------------------------

test('plugin tree respects directory limits', () => {
  assert.ok(existsSync(root), 'plugin root exists');
  const all = walk(root);
  const files = [];
  for (const p of all) {
    const rel = relative(root, p).split(sep).join('/');
    const st = lstatSync(p);
    assert.ok(!st.isSymbolicLink(), `${rel} is a symlink`);
    assert.ok(!rel.split('/').includes('..'), `${rel} has ..`);
    if (st.isDirectory()) {
      continue;
    }
    assert.ok(st.isFile(), `${rel} is not a regular file`);
    files.push(p);
    const name = basename(p);
    assert.ok(!/^(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|\.npmrc)$/.test(name), `${rel} is a lockfile or .npmrc`);
    assert.ok(!/^(\.DS_Store|Thumbs\.db|desktop\.ini)$/i.test(name), `${rel} is OS junk`);
    assert.ok(!/\.min\.(js|mjs|css)$/.test(name), `${rel} looks minified`);
    if (!/\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf)$/i.test(name)) {
      assert.ok(st.size <= 256 * 1024, `${rel} is over 256 KiB`);
    }
  }
  assert.ok(files.length <= 512, 'at most 512 files');
});

test('no script holds a literal BOM character: an editor could strip it and silently change the code', () => {
  const scripts = walk(root).filter((p) => p.endsWith('.mjs'));
  assert.ok(scripts.length > 20, `found ${scripts.length} scripts`);
  const BOM = String.fromCharCode(0xfeff);
  const withBom = scripts.filter((p) => readFileSync(p, 'utf8').includes(BOM)).map((p) => relative(root, p).split(sep).join('/'));
  assert.deepEqual(withBom, [], 'write it as an escape, never as the character');
});

test('.gitattributes has no filter or export-* entries', () => {
  const text = readFileSync(join(root, '.gitattributes'), 'utf8');
  assert.doesNotMatch(text, /\bfilter\b/);
  assert.doesNotMatch(text, /\bexport-/);
});

// ---------------------------------------------------------------------------
// Skills, grants and the always-on footprint
// ---------------------------------------------------------------------------

test('the plugin has the declared skills', () => {
  assert.deepEqual(readdirSync(skillsDir).sort(), SKILLS);
});

test('each skill meets the Agent Skills spec', () => {
  for (const name of SKILLS) {
    const { field } = load(name);
    assert.equal(field('name'), name, `${name}: name matches its folder`);
    assert.match(name, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.ok(name.length >= 1 && name.length <= 64);
    const d = field('description') ?? '';
    assert.ok(d.length >= 1 && d.length <= 1024, `${name}: description length ${d.length}`);
  }
});

test('each SKILL.md is within 100 lines and 900 estimated tokens', () => {
  for (const name of SKILLS) {
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
  for (const name of SKILLS) {
    const { field } = load(name);
    total += estimateTokens(`${name}: ${field('description')}`);
  }
  for (const file of readdirSync(agentsDir)) {
    const agent = readFileSync(join(agentsDir, file), 'utf8');
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

test('pr-review grants only review-diff and review-context, and install exactly its helper commands', () => {
  // check's grants are asserted outright by the check tool-entry test above; this covers the other two.
  const grants = (/** @type {string} */ name) => load(name).tools.filter((t) => t.includes('devocd.mjs'));
  for (const [name, subs] of /** @type {Array<[string, string[]]>} */ ([['pr-review', ['review-diff', 'review-context']]])) {
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

// ---------------------------------------------------------------------------
// The contract every skill folder must pass (T60)
// ---------------------------------------------------------------------------

/** Every skill folder, read from disk: a new skill is covered without editing this file. */
const skillFolders = () => readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
/** The reference files a skill owns. */
const refsOf = (/** @type {string} */ name) => {
  const dir = join(skillsDir, name, 'references');
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.md')).sort() : [];
};
/** SKILL.md and every reference it owns, so a rule stated in a reference counts too. */
const skillText = (/** @type {string} */ name) => [join(skillsDir, name, 'SKILL.md'), ...refsOf(name).map((f) => join(skillsDir, name, 'references', f))]
  .map((p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n'));

/** The helper subcommands a skill asks the model to run. `*` is the wildcard grant. */
const commandsRun = (/** @type {string} */ name) => {
  const out = new Set();
  // The frontmatter is left out: its grants name every allowed command, so counting them would make every grant look used.
  const [body, ...refs] = skillText(name);
  for (const text of [body.replace(/^---\n[\s\S]*?\n---\n/, ''), ...refs]) for (const m of text.matchAll(/devocd\.mjs"?\s+([a-z][a-z-]*)/g)) out.add(m[1]);
  return [...out].sort();
};
/**
 * Every subcommand the body or a reference names as a step: the full command, or the short
 * form a reference uses after the full one is shown (`protect "P"`). Used only to tell whether
 * a grant is used, so a short form never counts as running an ungranted command.
 */
const commandsNamed = (/** @type {string} */ name) => {
  const out = new Set(commandsRun(name));
  const [body, ...refs] = skillText(name);
  for (const text of [body.replace(/^---\n[\s\S]*?\n---\n/, ''), ...refs]) for (const m of text.matchAll(/`([a-z][a-z-]*)[ `]/g)) out.add(m[1]);
  return out;
};
/** The helper subcommands a skill's frontmatter allows. */
const commandsGranted = (/** @type {string} */ name) => {
  const out = new Set();
  for (const t of load(name).tools) {
    const m = /scripts\/devocd\.mjs" ([a-z][a-z-]*) \*\)/.exec(t);
    if (m) out.add(m[1]);
    // `Bash(node "… devocd.mjs" *)` grants every subcommand.
    else if (/scripts\/devocd\.mjs" \*\)/.test(t)) out.add('*');
  }
  return [...out].sort();
};

/**
 * Known mismatches in today's skills. A check fails on every item it finds that is not listed
 * here, and the last test fails for a row whose mismatch is gone, so the list cannot go stale.
 * @type {{ skill: string, check: string, item: string, why: string }[]}
 */
const KNOWN_GAPS = [];
const isKnown = (/** @type {string} */ skill, /** @type {string} */ check, /** @type {string} */ item) =>
  KNOWN_GAPS.some((g) => g.skill === skill && g.check === check && g.item === item);

test('a: every helper command a skill runs is allowed in its frontmatter', () => {
  for (const skill of skillFolders()) {
    const granted = commandsGranted(skill);
    const wildcard = granted.includes('*');
    const missing = commandsRun(skill).filter((c) => !wildcard && !granted.includes(c) && !isKnown(skill, 'grant', c));
    assert.deepEqual(missing, [], `${skill}: runs a command it does not allow: ${missing.join(', ')}`);
  }
});

test('a: every allowed helper command is run somewhere in the body or its references', () => {
  for (const skill of skillFolders()) {
    const used = commandsNamed(skill);
    const unused = commandsGranted(skill).filter((c) => c !== '*' && !used.has(c) && !isKnown(skill, 'grant', c));
    assert.deepEqual(unused, [], `${skill}: allows a command nothing runs: ${unused.join(', ')}`);
  }
});

/**
 * The references a skill names: `skills/<name>/references/x.md` is exact, a bare
 * `references/x.md` (or a bare `x.md` that a reference owns) may be its own folder, the
 * plugin-root references folder, or another skill's, so it is resolved by trying those.
 */
function namedReferences(/** @type {string} */ name) {
  const exact = new Set();
  const bare = new Set();
  for (const text of skillText(name)) {
    for (const m of text.matchAll(/(?:skills\/([a-z0-9-]+)\/)?references\/([A-Za-z0-9._-]+\.md)/g)) {
      if (m[1]) exact.add(`${m[1]}/${m[2]}`);
      // A bare `references/x.md` names this skill's own file when the skill owns that name.
      else if (refsOf(name).includes(m[2])) exact.add(`${name}/${m[2]}`);
      else bare.add(m[2]);
    }
    for (const f of refsOf(name)) {
      const own = new RegExp(`(^|[^/\\w-])${f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'm');
      if (own.test(text)) exact.add(`${name}/${f}`);
    }
  }
  return { exact, bare };
}
/** A bare name resolves if the skill owns it, the plugin root owns it, or another skill does. */
const resolvesSomewhere = (/** @type {string} */ skill, /** @type {string} */ file) =>
  refsOf(skill).includes(file) || existsSync(join(root, 'references', file)) || skillFolders().some((s) => refsOf(s).includes(file));

test('b: every reference a skill names exists', () => {
  for (const skill of skillFolders()) {
    const { exact, bare } = namedReferences(skill);
    const missing = [
      ...[...exact].filter((p) => !refsOf(/** @type {string} */ (p.split('/')[0])).includes(/** @type {string} */ (p.split('/')[1])) && !existsSync(join(root, 'references', /** @type {string} */ (p.split('/')[1])))),
      ...[...bare].filter((f) => !resolvesSomewhere(skill, f)),
    ].filter((item) => !isKnown(skill, 'reference', item.split('/').pop() ?? ''));
    assert.deepEqual(missing, [], `${skill}: names a reference that does not exist: ${missing.join(', ')}`);
  }
});

test('b: every reference file is named by the body or by another reference', () => {
  for (const skill of skillFolders()) {
    const { exact } = namedReferences(skill);
    const orphans = refsOf(skill).filter((f) => !exact.has(`${skill}/${f}`) && !isKnown(skill, 'reference', f));
    assert.deepEqual(orphans, [], `${skill}: reference files nothing names: ${orphans.join(', ')}`);
  }
});

test('c: $ARGUMENTS appears exactly once in every SKILL.md', () => {
  for (const skill of skillFolders()) {
    const text = readFileSync(join(skillsDir, skill, 'SKILL.md'), 'utf8');
    const count = (text.match(/\$ARGUMENTS/g) ?? []).length;
    assert.equal(count, isKnown(skill, 'arguments', '$ARGUMENTS') ? count : 1, `${skill}: $ARGUMENTS appears ${count} times`);
  }
});

test('every known gap still exists, so the list cannot go stale', () => {
  const live = [];
  for (const skill of skillFolders()) {
    const granted = commandsGranted(skill);
    const wildcard = granted.includes('*');
    for (const c of commandsRun(skill)) if (!wildcard && !granted.includes(c)) live.push(`${skill}|grant|${c}`);
    for (const c of commandsGranted(skill)) if (c !== '*' && !commandsNamed(skill).has(c)) live.push(`${skill}|grant|${c}`);
    const { exact, bare } = namedReferences(skill);
    for (const p of exact) if (!refsOf(/** @type {string} */ (p.split('/')[0])).includes(/** @type {string} */ (p.split('/')[1])) && !existsSync(join(root, 'references', /** @type {string} */ (p.split('/')[1])))) live.push(`${skill}|reference|${p.split('/')[1]}`);
    for (const f of bare) if (!resolvesSomewhere(skill, f)) live.push(`${skill}|reference|${f}`);
    for (const f of refsOf(skill)) if (!exact.has(`${skill}/${f}`)) live.push(`${skill}|reference|${f}`);
    const count = (readFileSync(join(skillsDir, skill, 'SKILL.md'), 'utf8').match(/\$ARGUMENTS/g) ?? []).length;
    if (count !== 1) live.push(`${skill}|arguments|$ARGUMENTS`);
  }
  for (const g of KNOWN_GAPS) {
    assert.ok(live.includes(`${g.skill}|${g.check}|${g.item}`), `${g.skill}: the gap '${g.item}' is gone; remove its row`);
  }
});

// ---------------------------------------------------------------------------
// The validate-plugin pass rule
// ---------------------------------------------------------------------------

/** Captured from `claude --plugin-dir plugin plugin details devocd`, Claude Code 2.1.319, Windows, 2026-11-09. */
const DETAILS = `devocd 0.1.0
  Description: Skills that set up company-wide Claude Code standards and review pull requests against them.
  Source: devocd@inline

Component inventory
  Skills (4)  add-project, check, install, pr-review
  Agents (0)
  Hooks (0)
  MCP servers (0)
  LSP servers (0)

Projected token cost
  Always-on:   ~97 tok   added to every session

Per-component (rounded)
  component    always-on  on-invoke
  add-project       < 20      ~1.3k
  check              ~20       ~920
  install            ~20      ~1.2k
  pr-review          ~30      ~1.3k

  On-invoke cost is paid each time a skill or agent fires.
  Token counts are estimates and may differ from actual usage.
`;
const withAlwaysOn = (/** @type {string} */ figure) => DETAILS.replace('~97 tok', figure);

test('the always-on figure is read from the captured plugin details output', () => {
  assert.equal(parseAlwaysOn(DETAILS), 97);
  assert.deepEqual(alwaysOnProblem(DETAILS), { tokens: 97, problem: null });
});

test('other forms of the figure: thousands, a less-than, no tilde, CRLF', () => {
  assert.equal(parseAlwaysOn(withAlwaysOn('~1.2k tok')), 1200);
  assert.equal(parseAlwaysOn(withAlwaysOn('< 20 tok')), 20);
  assert.equal(parseAlwaysOn(withAlwaysOn('100 tok')), 100);
  assert.equal(parseAlwaysOn(DETAILS.replace(/\n/g, '\r\n')), 97);
});

test('over the budget fails; at the budget passes', () => {
  assert.equal(ALWAYS_ON_BUDGET, 190);
  assert.equal(alwaysOnProblem(withAlwaysOn('~190 tok')).problem, null);
  assert.match(String(alwaysOnProblem(withAlwaysOn('~191 tok')).problem), /191 tokens, over the budget of 190/);
  assert.match(String(alwaysOnProblem(withAlwaysOn('~1.2k tok')).problem), /1200 tokens/);
});

test('output with no always-on line fails rather than passing; the per-component header is not the figure', () => {
  const noLine = DETAILS.split('\n').filter((l) => !l.includes('Always-on:')).join('\n');
  assert.equal(parseAlwaysOn(noLine), null, 'the lower-case table header "always-on" is not read as the figure');
  assert.match(String(alwaysOnProblem(noLine).problem), /no always-on figure/);
  assert.match(String(alwaysOnProblem('').problem), /no always-on figure/);
  assert.equal(parseAlwaysOn('error: Plugin "devocd" not found'), null);
});

test('claude is missing only on ENOENT or the shell command-not-found status, never by message', () => {
  assert.equal(isMissing({ error: Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' }), status: null }, false), true);
  assert.equal(isMissing({ status: 127 }, true, 'linux'), true);
  assert.equal(isMissing({ status: 9009 }, true, 'win32'), true);
  assert.equal(isMissing({ status: 127 }, false, 'linux'), false, 'no shell: 127 is claude exiting, not a missing command');
  assert.equal(isMissing({ status: 1 }, true, 'win32'), false);
  // A real "not found" error from claude (a plugin path change, say) is a failure, not a skip.
  assert.equal(isMissing(/** @type {any} */ ({ status: 1, stderr: 'error: plugin not found', stdout: '' }), false), false);
  assert.equal(isMissing(/** @type {any} */ ({ status: 1, stderr: "'claude' is not recognized as an internal or external command" }), false), false);
});

test('the validate report rule: a clean report passes', () => {
  const clean = { success: true, manifest: { errors: [] }, directory: { incomplete: false, undecided: [], findings: [] } };
  assert.deepEqual(validateProblems(clean), []);
});

test('the validate report rule: nothing is tolerated, so a former allowance now fails', () => {
  const formerlyTolerated = { success: false, manifest: { errors: [] }, directory: { incomplete: false, undecided: [], findings: [{ code: 'LICENSE_MISSING', message: 'no license', blocking: true }, { code: 'ICON_MISSING', message: 'no icon', blocking: true }] } };
  const problems = validateProblems(formerlyTolerated);
  assert.ok(!problems.includes('success is not true'), 'the specific findings explain it');
  assert.ok(problems.includes('LICENSE_MISSING: no license'));
  assert.ok(problems.includes('ICON_MISSING: no icon'));
});

test('the validate report rule: blocking and holding findings fail, and so do missing manifest fields', () => {
  const base = { success: true, manifest: { errors: [] }, directory: { incomplete: false, undecided: [] } };
  assert.deepEqual(validateProblems({ ...base, directory: { ...base.directory, findings: [{ code: 'X', message: 'broken', blocking: true }] } }), ['X: broken']);
  assert.deepEqual(validateProblems({ ...base, directory: { ...base.directory, findings: [{ code: 'H', message: 'held', hold: true }] } }), ['H: held']);
  assert.deepEqual(validateProblems({ success: false, manifest: { errors: [{ code: 'NO_LICENSE' }] }, directory: { incomplete: false, undecided: [] } }), ['manifest has errors']);
  assert.ok(validateProblems({ success: true, directory: { incomplete: true, undecided: [] } }).includes('directory.incomplete is not false'));
  assert.ok(validateProblems({ success: true, directory: { incomplete: false, undecided: ['a'] } }).includes('directory.undecided is not empty'));
  assert.ok(validateProblems({ success: true, directory: { incomplete: false } }).includes('directory.undecided is not empty'), 'a missing undecided list is not an empty one');
});
