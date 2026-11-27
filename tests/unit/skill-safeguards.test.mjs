// T60: only the wording checks that protect the user or their files. One table per skill, one
// test per row, named `<skill>: <rule>`. A row's `match` is the check that used to sit in a
// per-skill test file, kept verbatim; `absent` marks a `doesNotMatch`, and `line` narrows the
// text to the lines a rule governs before matching, because some rules only hold where they sit.
// `match` may be a list: every pattern must match, and with `sameLine` one line must match them
// all, and `from` reads only the text after its first occurrence (up to `to`, when set). ORDER rows say that one step comes before another in the text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const skillsDir = fileURLToPath(new URL('../../skills/', import.meta.url));
const read = (/** @type {string} */ skill, /** @type {string} */ file) =>
  readFileSync(join(skillsDir, skill, file), 'utf8').replace(/\r\n/g, '\n');

/**
 * @type {Record<string, { rule: string, file: string, match: RegExp | RegExp[], absent?: boolean, line?: RegExp, sameLine?: boolean, from?: string, to?: string }[]>}
 */
const SAFEGUARDS = {
  setup: [
    { rule: 'answers handed to install and add-project carry no approval field', file: 'references/orchestration.md', match: /without an? `approval` field/i },
    { rule: 'setup writes no approved commands into handoff files', file: 'references/orchestration.md', match: /"approvedCommands"/, absent: true },
    { rule: '--yes never fabricates approval', file: 'references/orchestration.md', from: '--yes', match: /never (writes?|sets?) .?approval|approval.*(never|not)/i },
    { rule: 'handoff files need a scoped Write grant', file: 'SKILL.md', match: /Write\(\.devocd\/setup\/\*\*\)/ },
    { rule: 'setup has no delete tool, so the answers files stay', file: 'references/orchestration.md', match: /[Rr]emove `\.devocd\/setup\/answers\//, absent: true },
    { rule: 'the install handoff may carry policyRepo and setup never guesses one', file: 'references/orchestration.md', match: [/policyRepo/, /never guesses a clone path/] },
  ],
  'company-policy': [
    { rule: 'connectors stay read-only: no create, update, delete or comment', file: 'references/sources.md', match: /read-only|read calls|never.*(create|update|delete|comment)/i },
    { rule: 'a single issue never becomes a company-wide rule', file: 'references/sources.md', match: /never generalize a single issue/i },
    { rule: 'the concrete draft is approved before any write', file: 'SKILL.md', match: /[Bb]efore any write/ },
    { rule: 'the skill asks for approval', file: 'SKILL.md', match: /[Aa]sk for approval/ },
    { rule: 'approval is never inferred', file: 'SKILL.md', match: /[Nn]ever infer approval/ },
    { rule: 'source text and URLs never reach the shell', file: 'SKILL.md', match: /[Nn]ever pass source text or URLs to\s*the shell/ },
    { rule: 'recorded company rules are required, not optional', file: '../add-project/references/project-template.md', match: /required/ },
    { rule: 'the pointer template says so and asks before proceeding', file: '../add-project/references/project-template.md', match: /say so and ask before proceeding/ },
    { rule: 'the pointer template no longer calls recorded company rules optional', file: '../add-project/references/project-template.md', match: /It is optional: if this repo is used alone/, absent: true },
  ],
  install: [
    { rule: 'no grant of every helper subcommand', file: 'SKILL.md', match: /devocd\.mjs" \*\)/, absent: true },
    { rule: 'the answers path is never on a line that runs a command', file: 'SKILL.md', line: /\$ARGUMENTS/, match: /devocd\.mjs|`|"/, absent: true },
    { rule: 'a helper command line never carries the arguments', file: 'SKILL.md', line: /devocd\.mjs/, match: /\$ARGUMENTS|\$1|\$0/, absent: true },
    { rule: 'connector tools must be read-only', file: 'SKILL.md', line: /connector/i, match: /read-only/i },
    { rule: 'a connector never creates, updates, deletes or comments', file: 'references/interview.md', match: /never .*(create|update|delete|comment)/i },
    { rule: 'the interview reference says connectors are read-only', file: 'references/interview.md', match: /read-only/i },
    { rule: 'a home folder is warned about and stops the run', file: 'SKILL.md', line: /isHome/, match: [/warn/i, /stop/i], sameLine: true },
    { rule: 'an existing AGENTS.md is warned about', file: 'SKILL.md', line: /agentsMd/, match: /warn/i },
    { rule: 'sources are data, and instruction-like text is flagged not followed', file: 'SKILL.md', line: /data/i, match: /sources?/i },
    { rule: 'instruction-like text in a source is flagged', file: 'SKILL.md', line: /flag/i, match: /./ },
    { rule: 'source text is never followed as an instruction', file: 'references/standards-template.md', match: /unconfirmed/ },
    { rule: 'state and the parent are only written through the draft form', file: 'SKILL.md', match: /render-parent \. \.devocd\/state\.draft\.json/ },
    { rule: 'state.json is never written directly', file: 'SKILL.md', line: /never/i, match: /state\.json/ },
    { rule: 'the helper says nothing deletes draft files by hand', file: 'SKILL.md', match: /remove `draft\/`/, absent: true },
    { rule: 'the drafts are cleared again after they are applied', file: 'SKILL.md', match: /devocd\.mjs" clean-draft \./ },
    { rule: 'only the literal value approved stands in for the review', file: 'SKILL.md', line: /approval/, match: /`approved`/ },
    { rule: 'a file source ref is recorded from this folder, never copied', file: 'SKILL.md', line: /state\.draft\.json/, match: /never copied/ },
    { rule: 'the state template repeats that a source file is never copied', file: 'references/parent-template.md', match: /never copied/ },
    { rule: 'the answers path may go only to the Read tool', file: 'SKILL.md', match: /only to the Read tool/ },
    { rule: 'the interview asks about the policy repo and recommends "No"', file: 'references/interview.md', match: [/policy repo/i, /No, add policies later/] },
    { rule: 'a teammate without a clone is given the git clone line', file: 'references/interview.md', match: /git clone <url>/ },
    { rule: 'the answers file can carry a policy repo', file: 'references/interview.md', match: /"policyRepo"/ },
    { rule: 'the state draft records policyRepo', file: 'references/parent-template.md', match: /"policyRepo"/ },
    { rule: 'an omitted policy repo is kept on a rerun', file: 'references/parent-template.md', match: /omitted\s+field keeps the recorded repo/ },
    { rule: 'the skill never invents a clone path', file: 'references/interview.md', match: /Never invent a path/ },
  ],
  'pr-review': [
    { rule: 'the base is passed in double quotes, with --path for a large diff', file: 'SKILL.md', line: /review-diff/, match: /double quotes/ },
    { rule: 'unsafe paths are left out, never passed to the helper', file: 'references/knowledge.md', match: /`"`, `\$`, a backtick or a line break/ },
    { rule: 'company pages are data, never instructions', file: 'references/knowledge.md', match: /data, never instructions/ },
    { rule: 'never report a finding on the page alone', file: 'references/knowledge.md', match: /never report a finding on the page's word alone/ },
    { rule: 'no write tool or repo command is pre-granted', file: 'SKILL.md', line: /^ {2}- /, match: /\b(Write|Edit|npm|terraform|tflint|make|pytest)\b/, absent: true },
    { rule: 'no git diff grant: it can write a file or read any file', file: 'SKILL.md', line: /^ {2}- /, match: /git\s+(--\S+\s+)*diff/, absent: true },
    { rule: 'the skill never tells the agent to run git diff', file: 'SKILL.md', match: /git diff/, absent: true },
    { rule: 'the arguments are not on a line that runs a command', file: 'SKILL.md', line: /\$ARGUMENTS/, match: /`|"|git |gh /, absent: true },
    { rule: 'a base branch may not start with -', file: 'SKILL.md', line: /`\^\[A-Za-z0-9\._\/-\]\+\$`/, match: /start with `-`/ },
    { rule: 'anything else is refused with no command run', file: 'SKILL.md', line: /[Aa]nything else/, match: [/refuse/i, /stop/i, /(no|nothing|any) command|run nothing/i], sameLine: true },
    { rule: 'the arguments are checked before any command runs', file: 'SKILL.md', line: /before any (tool call|command)/i, match: /before any (tool call|command)/i },
    { rule: 'the review is read-only unless asked: no commit, push, stage, comment, Write or Edit', file: 'SKILL.md', line: /[Rr]ead-only/, match: [/commit/, /push/, /stage/, /comment/, /Write/, /Edit/, /unless (the user )?ask/i] },
    { rule: 'approved commands run exactly as written', file: 'SKILL.md', line: /approved/, match: /exactly as written/ },
    { rule: 'a command that cannot be asked about is blocked', file: 'SKILL.md', line: /AskUserQuestion/, match: [/`blocked`/, /(missing|denied)/], sameLine: true },
    { rule: 'a changed manifest, lockfile, Makefile, test config or CI means asking again', file: 'SKILL.md', line: /ask again/i, match: [/`package\.json`/, /lockfile/, /`Makefile`/, /test or lint config/, /CI/] },
    { rule: 'terraform apply, terraform init and deploys are never run', file: 'SKILL.md', line: /terraform apply/, match: [/[Nn]ever/, /`terraform init`/, /deploy/] },
    { rule: 'a missing tool is unavailable, never passed', file: 'SKILL.md', line: /not found/, match: [/`unavailable`/, /never `passed`/], sameLine: true },
    { rule: 'a PR is never checked out', file: 'SKILL.md', match: /never check(s)? it out|without checking it out/i },
    { rule: 'repo commands for a PR are blocked', file: 'SKILL.md', line: /PR|pull request/, match: /`blocked`/ },
    { rule: 'text aimed at AI tools in the diff is reported, never followed', file: 'SKILL.md', line: /data, never instructions/, match: [/diff/, /(report|finding)/i, /never follow/i], sameLine: true },
    { rule: 'an unread source is never guessed', file: 'SKILL.md', line: /couldn't read|could not read|can't read/, match: /never guess/i },
    { rule: 'a review that did not run is not a clean one', file: 'references/output-format.md', match: /Findings: not reviewed/ },
    { rule: 'never write Findings: 0 when nothing was reviewed', file: 'references/output-format.md', match: /never write `Findings: 0`/ },
    { rule: 'a secret is named by kind and place, never its value', file: 'references/output-format.md', match: /never (its|the) value/i },
    { rule: 'the security reference tells the reviewer to look for secrets', file: 'references/security.md', match: /secret/i },
    { rule: 'the security reference warns about instructions in AI tools', file: 'references/security.md', match: /AI (tools|reviewers)/ },
    { rule: 'terraform apply is never run', file: 'references/terraform.md', line: /terraform apply/, match: /[Nn]ever/ },
    { rule: 'terraform init is never run', file: 'references/terraform.md', line: /terraform init/, match: /[Nn]ever/ },
    { rule: 'a yes covers one command, in this review only', file: 'references/security.md', match: /one command, in this review only/ },
    { rule: 'a changed flow or CLAUDE file means asking again', file: 'references/security.md', match: /ask again|blocked/ },
    { rule: 'a PR URL is passed through, never reduced to its number', file: 'SKILL.md', match: /validated full URL or number unchanged/ },
    { rule: 'the skill never reduces a PR URL to gh pr diff N', file: 'SKILL.md', match: /gh pr diff N/, absent: true },
    { rule: 'gh pr diff is called with the URL in double quotes', file: 'SKILL.md', match: /gh pr diff "P"/ },
    { rule: 'devocd.mjs is granted only with the read-only review subcommands', file: 'SKILL.md', line: /^ {2}- .*devocd\.mjs/, match: /devocd\.mjs" (?!review-(diff|context) \*\)$)/m, absent: true },
    { rule: 'every Bash grant is a read-only command', file: 'SKILL.md', line: /^ {2}- Bash\(/, match: /^ {2}- Bash\((?!(node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/devocd\.mjs" review-(diff|context)|git (status|log|show|rev-parse|merge-base)|gh pr (diff|view)) \*\)$)/m, absent: true },
    { rule: 'its own references are granted in the form that matches on Windows', file: 'SKILL.md', match: /\/\/\$\{CLAUDE_SKILL_DIR\}/, absent: true },
    { rule: 'no --output or --no-index flag is granted', file: 'SKILL.md', line: /^ {2}- /, match: /--output|--no-index/, absent: true },
  ],
  'add-project': [
    { rule: 'the wildcard helper grant is the only way it can run any subcommand', file: 'SKILL.md', match: /Bash\(node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/devocd\.mjs" \*\)/ },
    { rule: 'its own references are readable', file: 'SKILL.md', match: /Read\(\$\{CLAUDE_SKILL_DIR\}\/\*\*\)/ },
    { rule: 'the arguments are never on a command line', file: 'SKILL.md', line: /\$ARGUMENTS/, match: /devocd\.mjs|`|"/, absent: true },
    { rule: 'a helper command line never carries the arguments', file: 'SKILL.md', line: /devocd\.mjs/, match: /\$ARGUMENTS|\$\d|\$\{?[A-Z_]*ARG/, absent: true },
    { rule: 'a path with a quote, $, backtick or line break is refused', file: 'SKILL.md', line: /`"`/, match: /stop/i },
    { rule: 'the refusal applies to what is left once delimiting quotes are removed', file: 'SKILL.md', line: /`"`, `\$`, a backtick or a line break/, match: [/what is left|after (that|those)|remaining/i, /stop/i], sameLine: true },
    { rule: 'delimiting quotes are removed, not refused', file: 'SKILL.md', line: /pair of double quotes/, match: /remove/i },
    { rule: 'a folder or value ending in a backslash is refused', file: 'SKILL.md', line: /ends in a backslash/, match: /stop/i },
    { rule: 'paths in commands are double quoted', file: 'SKILL.md', line: /`node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/devocd\.mjs" /, match: /`node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/devocd\.mjs" \S+ (?!")/, absent: true },
    { rule: 'a description with a quote, $ or backtick is cleaned before register runs', file: 'SKILL.md', line: /devocd\.mjs" register /, match: /`"`/ },
    { rule: 'the register line escapes a backtick', file: 'SKILL.md', line: /devocd\.mjs" register /, match: /backtick/ },
    { rule: 'an id that does not match the pattern stops the run', file: 'SKILL.md', line: /\[a-z0-9\]/, match: /stop/i },
    { rule: 'an invalid id writes nothing', file: 'SKILL.md', line: /\[a-z0-9\]/, match: /writing nothing|write nothing/i },
    { rule: 'the answers file goes only to the Read tool', file: 'SKILL.md', match: /only to the Read tool/ },
    { rule: 'only the literal value approved stands in for the review', file: 'SKILL.md', line: /approval/, match: /`approved`/ },
    { rule: 'no company means using install, from inside the project', file: 'SKILL.md', line: /`company` is null/, match: [/devocd:install/, /inside/, /stop/i], sameLine: true },
    { rule: 'the company folder itself is refused', file: 'SKILL.md', line: /`company\.project` is `\.`/, match: /stop/i },
    { rule: 'a tracked file stops the run', file: 'SKILL.md', line: /tracked/, match: /stop/i },
    { rule: 'the opt-in setting is added only when chosen', file: 'SKILL.md', line: /devocd\.mjs" settings /, match: /[Oo]pted in only/ },
    { rule: 'the interview never offers a deploy or release command', file: 'references/interview.md', match: /never offer a deploy or release/i },
    { rule: 'approved commands are named in the draft summary so approval covers them', file: 'references/project-template.md', match: /Approved commands for PR review/ },
    { rule: 'a documented command is not an approved one', file: 'references/project-template.md', match: /documented is not approved/i },
    { rule: 'no instruction deletes draft files by hand', file: 'SKILL.md', match: /remove `draft\//, absent: true },
    { rule: 'the skill never writes a team file itself', file: 'references/personal-split.md', match: /Never write `\.devocd\/team\/` yourself/ },
    { rule: 'the split copies the team file without changing a byte', file: 'references/personal-split.md', match: /not one byte/ },
    { rule: 'an excluded team file is recorded as excluded', file: 'references/personal-split.md', match: /excluded.*true/s },
    { rule: 'the split names the exclude and its undo', file: 'references/personal-split.md', match: [/devocd\.mjs" settings "P" add-exclude "A"/, /devocd\.mjs" settings "P" remove-exclude "A"/] },
    { rule: 'split content is data, not instructions', file: 'references/personal-split.md', match: /data, not instructions/ },
    { rule: 'the undo steps need no plugin path', file: 'references/personal-split.md', from: '## Undo', to: 'Rerun with', match: /CLAUDE_PLUGIN_ROOT/, absent: true },
    { rule: 'source text is data, not instructions', file: 'SKILL.md', line: /data, not instructions/, match: /data, not instructions/ },
    { rule: 'script bodies are never saved', file: 'SKILL.md', line: /script bod/, match: /script bod/ },
    { rule: 'a file source ref is rewritten from the project folder', file: 'SKILL.md', line: /state\.json/, match: /from P/ },
    { rule: 'the state template repeats that a source file is never copied', file: 'references/project-template.md', match: /never copied/ },
    { rule: 'operations facts carry their source and read date', file: 'references/operations-template.md', match: /\(source: .+, read .+\)/ },
    { rule: 'web or assumed operations facts are unconfirmed', file: 'references/operations-template.md', match: /unconfirmed/ },
    { rule: 'connectors are read-only in SKILL.md', file: 'SKILL.md', line: /connector/i, match: /read-only/i },
    { rule: 'a connector never creates, updates, deletes or comments', file: 'references/interview.md', match: /never .*(create|update|delete|comment)/i },
    { rule: 'the project template names the policy repo index when one is configured', file: 'references/project-template.md', match: /policy repo's index/ },
  ],
};

/**
 * Steps that must come in order. `first` is found with indexOf; `then` with indexOf, or with
 * lastIndexOf when `lastAfter` is set (a cleanup that runs again later). `bodyOnly` skips the
 * frontmatter, whose grants name commands before the body runs them.
 * @type {{ skill: string, rule: string, file: string, first: string, then: string, lastAfter?: boolean, bodyOnly?: boolean }[]}
 */
const ORDER = [
  { skill: 'install', rule: 'stale drafts are cleared before fresh ones are written', file: 'SKILL.md', first: 'clean-draft', then: '.devocd/draft/standards/' },
  { skill: 'install', rule: 'the drafts are cleared again after they are applied', file: 'SKILL.md', first: 'Apply the approved files', then: 'clean-draft', lastAfter: true },
  { skill: 'add-project', rule: 'protect runs before backup', file: 'SKILL.md', first: 'devocd.mjs" protect', then: 'devocd.mjs" backup' },
  { skill: 'add-project', rule: 'protect runs before draft files are written', file: 'SKILL.md', first: 'devocd.mjs" protect', then: 'write the full draft files' },
  { skill: 'add-project', rule: 'a stale draft is cleared before fresh files are written', file: 'SKILL.md', first: 'clean-draft', then: 'write the full draft files' },
  { skill: 'add-project', rule: 'the drafts are cleared again after they are applied', file: 'SKILL.md', first: 'Apply the approved', then: 'clean-draft', lastAfter: true },
  { skill: 'add-project', rule: 'the team file is copied before it is excluded', file: 'references/personal-split.md', first: 'split-team', then: 'add-exclude' },
  { skill: 'add-project', rule: 'the pointer block is written before the exclude', file: 'references/personal-split.md', first: 'write-block', then: 'add-exclude' },
  { skill: 'pr-review', rule: 'the argument check comes before the first review-diff', file: 'SKILL.md', first: '`^[A-Za-z0-9._/-]+$`', then: 'review-diff', bodyOnly: true },
  { skill: 'pr-review', rule: 'the argument check comes before the first gh command', file: 'SKILL.md', first: '`^[A-Za-z0-9._/-]+$`', then: '`gh ', bodyOnly: true },
];

for (const [skill, rows] of Object.entries(SAFEGUARDS)) {
  for (const row of rows) {
    test(`${skill}: ${row.rule}`, () => {
      const full = read(skill, row.file);
      const start = row.from ? Math.max(0, full.indexOf(row.from)) : 0;
      const end = row.to ? full.indexOf(row.to, start) : -1;
      const body = full.slice(start, end > start ? end : undefined);
      assert.ok(!row.from || full.includes(row.from), `names ${row.from}`);
      assert.ok(!row.to || end > start, `names ${row.to} after ${row.from ?? 'the start'}`);
      const lines = row.line ? body.split('\n').filter((l) => /** @type {RegExp} */ (row.line).test(l)) : [body];
      assert.ok(lines.length > 0, `no line matches ${row.line}`);
      const patterns = Array.isArray(row.match) ? row.match : [row.match];
      if (row.sameLine) {
        assert.ok(lines.some((l) => patterns.every((re) => re.test(l))), `no single line matches all of ${patterns.join(' ')}:\n${lines.join('\n')}`);
        return;
      }
      const subject = lines.join('\n');
      for (const re of patterns) {
        if (row.absent) assert.doesNotMatch(subject, re);
        else assert.match(subject, re);
      }
    });
  }
}

for (const row of ORDER) {
  test(`${row.skill}: ${row.rule}`, () => {
    const raw = read(row.skill, row.file);
    const body = row.bodyOnly ? raw.replace(/^---\n[\s\S]*?\n---\n/, '') : raw;
    const first = body.indexOf(row.first);
    assert.ok(first >= 0, `names ${row.first}`);
    const then = row.lastAfter ? body.lastIndexOf(row.then) : body.indexOf(row.then);
    assert.ok(then >= 0, `names ${row.then}`);
    assert.ok(first < then, `${row.first} comes before ${row.lastAfter ? 'the last ' : ''}${row.then}`);
  });
}
