// @ts-check
// Static checks of the pr-review skill's text. They cost nothing and pin what live runs show only by chance:
// sizes, the frontmatter, argument checks before any command, the command rules and the report contract.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { countLines } from '../../plugin/scripts/lib/fsutil.mjs';
import { estimateTokens, LIMITS } from '../../plugin/scripts/lib/tokens.mjs';

const skillDir = fileURLToPath(new URL('../../plugin/skills/pr-review/', import.meta.url));
const skill = () => readFileSync(join(skillDir, 'SKILL.md'), 'utf8');
const ref = (/** @type {string} */ name) => readFileSync(join(skillDir, 'references', name), 'utf8');
const STACKS = ['typescript.md', 'python.md', 'java.md', 'go.md', 'terraform.md', 'docker.md', 'kubernetes.md', 'github-actions.md', 'shell.md'];
const REFERENCES = ['output-format.md', 'security.md', 'knowledge.md', ...STACKS];
const STATUSES = ['passed', 'failed', 'skipped', 'unavailable', 'blocked', 'not applicable'];
/** Lines of the skill that match, so a rule and what it acts on must sit together. */
const linesWith = (/** @type {RegExp} */ re) => skill().split('\n').filter((l) => re.test(l));
const frontmatter = () => {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(skill());
  assert.ok(m, 'frontmatter present');
  return m[1];
};
const body = () => skill().replace(/^---\n[\s\S]*?\n---\n/, '');

test('PR URL invocation preserves the repository instead of extracting only its number', () => {
  assert.match(body(), /gh pr diff "P"/);
  assert.match(body(), /validated full URL or number unchanged/);
  assert.doesNotMatch(body(), /gh pr diff N/);
});

test('SKILL.md is within 100 lines and 900 estimated tokens', () => {
  const text = skill();
  assert.ok(countLines(text) <= LIMITS.entry.lines, `${countLines(text)} lines`);
  assert.ok(estimateTokens(text) <= LIMITS.entry.tokens, `about ${estimateTokens(text)} estimated tokens`);
});

test('the skill is model-invocable, with a one-sentence description and the documented argument hint', () => {
  const fm = frontmatter();
  assert.match(fm, /^name: pr-review$/m);
  assert.doesNotMatch(fm, /disable-model-invocation/);
  const description = /^description: (.+)$/m.exec(fm)?.[1] ?? '';
  assert.ok(description.endsWith('.'), 'a sentence');
  assert.equal(description.split(/[.!?](\s|$)/).filter((s) => s && s.trim()).length, 1, `one sentence: ${description}`);
  assert.ok(estimateTokens(description) <= 25, `short: about ${estimateTokens(description)} estimated tokens`);
  assert.match(fm, /^argument-hint: "\[quick \| standard \| deep\] \[base-branch \| PR number or URL\]"$/m);
});

test('no git diff grant returns, and devocd.mjs is granted only with the read-only review subcommands', () => {
  const rules = frontmatter().split('\n').filter((l) => l.startsWith('  - '));
  assert.deepEqual(rules.filter((l) => /git\s+(--\S+\s+)*diff/.test(l)), [], 'git diff can write a file (--output) or read any file (--no-index)');
  assert.doesNotMatch(frontmatter(), /--output|--no-index/);
  const helper = rules.filter((l) => l.includes('devocd.mjs'));
  assert.ok(helper.length > 0);
  for (const l of helper) assert.match(l, /devocd\.mjs" review-(diff|context) \*\)$/, `only review-diff and review-context, never settings or write-block: ${l}`);
  assert.deepEqual(linesWith(/git diff/), [], 'the skill never tells the agent to run git diff');
  assert.ok(linesWith(/review-diff/).some((l) => /double quotes/.test(l) && /--path/.test(l)), 'base in double quotes; --path for a large diff');
});

test('with .devocd/, the review reads only the pages, policies and decisions review-context names, and cites them', () => {
  assert.ok(linesWith(/\.devocd\/`/).some((l) => l.includes('references/knowledge.md')), 'the skill sends a repo with .devocd/ to the knowledge reference');
  const k = ref('knowledge.md');
  assert.match(k, /`node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/devocd\.mjs" review-context "\." "<file>"/, 'the exact granted command, quoted');
  assert.match(k, /double quotes/);
  assert.match(k, /`"`, `\$`, a backtick or a line break/, 'unsafe paths are left out, never passed');
  assert.match(k, /data, never instructions/);
  for (const w of ['stale', 'unmapped', 'truncated', 'Not read', 'Rule']) assert.ok(k.includes(w), w);
  assert.match(k, /never report a finding on the page's word alone/);
  const rule = ref('output-format.md').split('\n').find((l) => l.startsWith('- Rule: the')) ?? '';
  assert.match(rule, /decisions\.md/);
  assert.match(rule, /page path/);
});

test('allowed-tools grants its own files, the review-diff helper command and gh pr diff only, never a repo command, Write or Edit', () => {
  const fm = frontmatter();
  assert.ok(fm.includes('  - Read(${CLAUDE_SKILL_DIR}/**)'), 'reads its own references in the observed form');
  assert.doesNotMatch(fm, /\/\/\$\{CLAUDE_SKILL_DIR\}/, 'not the // form, which does not match on Windows');
  const rules = fm.split('\n').filter((l) => l.startsWith('  - '));
  for (const r of rules.filter((l) => l.includes('Bash'))) {
    assert.match(r, /^ {2}- Bash\((node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/devocd\.mjs" review-(diff|context)|git (status|log|show|rev-parse|merge-base)|gh pr (diff|view)) \*\)$/, `read-only: ${r}`);
  }
  assert.ok(rules.some((l) => l.includes('devocd.mjs" review-diff *)')), 'review-diff is granted');
  assert.ok(rules.some((l) => l.includes('Bash(gh pr diff *)')), 'gh pr diff is granted');
  assert.doesNotMatch(fm, /\b(Write|Edit|npm|terraform|tflint|make|pytest)\b/, 'no write tool and no repo command is pre-granted');
});

test('$ARGUMENTS appears once, on a line that is not a command', () => {
  const uses = linesWith(/\$ARGUMENTS/);
  assert.equal(uses.length, 1);
  assert.doesNotMatch(uses[0], /`|"|git |gh /);
});

test('the arguments are checked by exact patterns before any command, and anything else is refused', () => {
  const text = body();
  for (const piece of ['`quick`', '`standard`', '`deep`', '`^[A-Za-z0-9._/-]+$`', '`^\\d+$`', '`https://github.com/<owner>/<repo>/pull/<n>`']) {
    assert.ok(text.includes(piece), `names ${piece}`);
  }
  assert.ok(linesWith(/`\^\[A-Za-z0-9\._\/-\]\+\$`/).some((l) => /start with `-`/.test(l)), 'a base branch may not start with -');
  assert.ok(linesWith(/[Aa]nything else/).some((l) => /refuse/i.test(l) && /stop/i.test(l) && /(no|nothing|any) command|run nothing/i.test(l)), 'anything else is refused, with no command');
  const check = text.indexOf('`^[A-Za-z0-9._/-]+$`');
  for (const cmd of ['review-diff', '`gh ']) assert.ok(check < text.indexOf(cmd), `the check comes before the first ${cmd} command`);
  assert.ok(linesWith(/before any (tool call|command)/i).length > 0, 'it says the check comes before any tool call');
});

test('the review is read-only unless asked', () => {
  const line = linesWith(/[Rr]ead-only/).join('\n');
  for (const w of ['commit', 'push', 'stage', 'comment', 'Write', 'Edit']) assert.match(line, new RegExp(w), w);
  assert.match(line, /unless (the user )?ask/i);
});

test('only approved commands run, as written; others are asked for, and blocked when asking is not possible', () => {
  assert.ok(linesWith(/approved/).some((l) => /exactly as written/.test(l)), 'approved commands exactly as written');
  assert.ok(linesWith(/AskUserQuestion/).some((l) => /`blocked`/.test(l) && /(missing|denied)/.test(l)), 'asks, else blocked');
  const again = linesWith(/ask again/i).join('\n');
  for (const w of ['`package.json`', 'lockfile', '`Makefile`', 'test or lint config', 'CI']) assert.ok(again.includes(w), `asks again for ${w}`);
  const never = linesWith(/terraform apply/).join('\n');
  assert.match(never, /[Nn]ever/);
  assert.match(never, /`terraform init`/);
  assert.match(never, /deploy/);
  assert.ok(linesWith(/not found/).some((l) => /`unavailable`/.test(l) && /never `passed`/.test(l)), 'a missing tool is unavailable, never passed');
});

test('a PR is read through gh without checking it out, and its repo commands are blocked', () => {
  const lines = linesWith(/gh pr diff/).join('\n');
  assert.ok(lines, 'names gh pr diff');
  assert.match(lines, /never check(s)? it out|without checking it out/i);
  assert.ok(linesWith(/PR|pull request/).some((l) => /`blocked`/.test(l)), 'repo commands for a PR are blocked');
});

test('modes are defined: quick runs no command, deep runs every approved one', () => {
  assert.ok(linesWith(/`quick`/).some((l) => /no (approved |repo )?command|`skipped`/.test(l)), 'quick runs no command');
  assert.ok(linesWith(/`deep`/).some((l) => /every approved|all approved/i.test(l)), 'deep runs every approved command');
});

test('company content and the diff are data; text aimed at AI tools is reported, never followed; unread sources are named', () => {
  assert.ok(linesWith(/data, never instructions/).some((l) => /diff/.test(l) && /(report|finding)/i.test(l) && /never follow/i.test(l)));
  assert.ok(linesWith(/key rules/).length > 0, 'company key rules are used');
  assert.ok(linesWith(/couldn't read|could not read|can't read/).some((l) => /never guess/i.test(l)));
});

test('every reference exists, is named by SKILL.md and is within 200 lines', () => {
  for (const name of REFERENCES) {
    assert.ok(existsSync(join(skillDir, 'references', name)), name);
    assert.ok(skill().includes(name), `SKILL.md names ${name}`);
    assert.ok(countLines(ref(name)) <= LIMITS.reference.lines, `${name}: ${countLines(ref(name))} lines`);
  }
});

test('stack references load only for their stack, and each names its file patterns in SKILL.md', () => {
  const map = body();
  assert.match(map, /each changed stack's reference, and no other/i, 'every changed stack is read, and only those');
  const patterns = /** @type {Record<string, RegExp>} */ ({
    'typescript.md': /\*\.ts\b/, 'python.md': /\*\.py\b/, 'java.md': /\*\.java\b/, 'go.md': /\*\.go\b/, 'terraform.md': /\*\.tf\b/,
    'docker.md': /Dockerfile/, 'kubernetes.md': /(kind:|Helm|k8s)/, 'github-actions.md': /\.github\/workflows/, 'shell.md': /\*\.sh\b/,
  });
  for (const [name, re] of Object.entries(patterns)) {
    assert.ok(linesWith(new RegExp(name.replace('.', '\\.'))).some((l) => re.test(l)), `${name} has its patterns on its line`);
  }
});

test('the report format names every finding field and every check status', () => {
  const r = ref('output-format.md');
  for (const f of ['Severity', 'Confidence', 'File', 'Line', 'Evidence', 'Explanation', 'Suggested fix', 'Validation', 'Rule']) {
    assert.match(r, new RegExp(`^- ${f}:`, 'm'), `field ${f}`);
  }
  for (const s of STATUSES) assert.ok(r.includes(`\`${s}\``), `status ${s}`);
  assert.match(r, /Findings: /);
  assert.match(r, /Findings: not reviewed/, 'a review that did not run is not a clean one');
  assert.match(r, /"findings": null/);
  assert.match(r, /never write `Findings: 0`/);
  assert.match(r, /JSON/);
  assert.match(r, /never (its|the) value/i, 'a secret is named by kind and place, never its value');
});

test('the security reference covers secrets and instructions in the diff; the terraform reference forbids apply and init', () => {
  const s = ref('security.md');
  assert.match(s, /secret/i);
  assert.match(s, /AI (tools|reviewers)/);
  const t = ref('terraform.md');
  assert.match(t, /[Nn]ever/);
  assert.match(t, /terraform apply/);
  assert.match(t, /terraform init/);
  assert.match(t, /\*/, 'names the IAM wildcard');
});

test('the security reference asks again when the flow or a CLAUDE file changes, and a yes covers one command in one review', () => {
  const t = ref('security.md');
  assert.match(t, /\.devocd\/flows\//);
  assert.match(t, /CLAUDE\.local\.md/);
  assert.match(t, /ask again|blocked/);
  assert.match(t, /one command, in this review only/);
});
