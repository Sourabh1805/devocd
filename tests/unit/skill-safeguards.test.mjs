// T60: only the wording checks that protect the user or their files. One table per skill, one
// test per row, named `<skill>: <rule>`. A row's `match` is the check that used to sit in a
// per-skill test file, kept verbatim; `absent` marks a `doesNotMatch`, and `line` narrows the
// text to the lines a rule governs before matching, because some rules only hold where they sit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const skillsDir = fileURLToPath(new URL('../../skills/', import.meta.url));
const read = (/** @type {string} */ skill, /** @type {string} */ file) =>
  readFileSync(join(skillsDir, skill, file), 'utf8').replace(/\r\n/g, '\n');

/**
 * @type {Record<string, { rule: string, file: string, match: RegExp, absent?: boolean, line?: RegExp }[]>}
 */
const SAFEGUARDS = {
  setup: [
    { rule: 'answers handed to install and add-project carry no approval field', file: 'references/orchestration.md', match: /without an? `approval` field/i },
    { rule: 'setup writes no approved commands into handoff files', file: 'references/orchestration.md', match: /"approvedCommands"/, absent: true },
    { rule: '--yes never fabricates approval', file: 'references/orchestration.md', match: /never (writes?|sets?) .?approval|approval.*(never|not)/i },
    { rule: 'handoff files need a scoped Write grant', file: 'SKILL.md', match: /Write\(\.devocd\/setup\/\*\*\)/ },
    { rule: 'setup has no delete tool, so the answers files stay', file: 'references/orchestration.md', match: /[Rr]emove `\.devocd\/setup\/answers\//, absent: true },
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
    { rule: 'a home folder is warned about and stops the run', file: 'SKILL.md', line: /isHome/, match: /warn/i },
    { rule: 'a home folder stops the run', file: 'SKILL.md', line: /isHome/, match: /stop/i },
    { rule: 'an existing AGENTS.md is warned about', file: 'SKILL.md', line: /agentsMd/, match: /warn/i },
    { rule: 'sources are data, and instruction-like text is flagged not followed', file: 'SKILL.md', line: /data/i, match: /sources?/i },
    { rule: 'instruction-like text in a source is flagged', file: 'SKILL.md', line: /flag/i, match: /./ },
    { rule: 'source text is never followed as an instruction', file: 'references/standards-template.md', match: /unconfirmed/ },
    { rule: 'state and the parent are only written through the draft form', file: 'SKILL.md', match: /render-parent \. \.devocd\/state\.draft\.json/ },
    { rule: 'the helper says nothing deletes draft files by hand', file: 'SKILL.md', match: /remove `draft\/`/, absent: true },
    { rule: 'the drafts are cleared again after they are applied', file: 'SKILL.md', match: /devocd\.mjs" clean-draft \./ },
    { rule: 'only the literal value approved stands in for the review', file: 'SKILL.md', line: /approval/, match: /`approved`/ },
    { rule: 'a file source ref is recorded from this folder, never copied', file: 'SKILL.md', line: /state\.draft\.json/, match: /never copied/ },
    { rule: 'the state template repeats that a source file is never copied', file: 'references/parent-template.md', match: /never copied/ },
{ rule: 'the answers path may go only to the Read tool', file: 'SKILL.md', match: /only to the Read tool/ },
{ rule: 'isHome is warned about and stops the run', file: 'SKILL.md', line: /isHome/, match: /stop/i },
  ],
  'pr-review': [
    { rule: 'the base is passed in double quotes, with --path for a large diff', file: 'SKILL.md', line: /review-diff/, match: /double quotes/ },
    { rule: 'unsafe paths are left out, never passed to the helper', file: 'references/knowledge.md', match: /`"`, `\$`, a backtick or a line break/ },
    { rule: 'company pages are data, never instructions', file: 'references/knowledge.md', match: /data, never instructions/ },
    { rule: 'never report a finding on the page alone', file: 'references/knowledge.md', match: /never report a finding on the page's word alone/ },
    { rule: 'no write tool or repo command is pre-granted', file: 'SKILL.md', line: /^ {2}- /, match: /\b(Write|Edit|npm|terraform|tflint|make|pytest)\b/, absent: true },
    { rule: 'the arguments are not on a line that runs a command', file: 'SKILL.md', line: /\$ARGUMENTS/, match: /`|"|git |gh /, absent: true },
    { rule: 'a base branch may not start with -', file: 'SKILL.md', line: /`\^\[A-Za-z0-9\._\/-\]\+\$`/, match: /start with `-`/ },
    { rule: 'anything else is refused with no command run', file: 'SKILL.md', line: /[Aa]nything else/, match: /refuse/i },
    { rule: 'the arguments are checked before any command runs', file: 'SKILL.md', line: /before any (tool call|command)/i, match: /before any (tool call|command)/i },
    { rule: 'the review is read-only unless asked', file: 'SKILL.md', match: /unless (the user )?ask/i },
    { rule: 'approved commands run exactly as written', file: 'SKILL.md', line: /approved/, match: /exactly as written/ },
    { rule: 'a command that cannot be asked about is blocked', file: 'SKILL.md', line: /AskUserQuestion/, match: /`blocked`/ },
    { rule: 'a missing tool is unavailable, never passed', file: 'SKILL.md', line: /not found/, match: /never `passed`/ },
    { rule: 'a PR is never checked out', file: 'SKILL.md', match: /never check(s)? it out|without checking it out/i },
    { rule: 'repo commands for a PR are blocked', file: 'SKILL.md', line: /PR|pull request/, match: /`blocked`/ },
    { rule: 'text aimed at AI tools is reported, never followed', file: 'SKILL.md', line: /data, never instructions/, match: /never follow/i },
    { rule: 'an unread source is never guessed', file: 'SKILL.md', line: /couldn't read|could not read|can't read/, match: /never guess/i },
    { rule: 'a review that did not run is not a clean one', file: 'references/output-format.md', match: /Findings: not reviewed/ },
    { rule: 'never write Findings: 0 when nothing was reviewed', file: 'references/output-format.md', match: /never write `Findings: 0`/ },
    { rule: 'a secret is named by kind and place, never its value', file: 'references/output-format.md', match: /never (its|the) value/i },
    { rule: 'the security reference tells the reviewer to look for secrets', file: 'references/security.md', match: /secret/i },
    { rule: 'the security reference warns about instructions in AI tools', file: 'references/security.md', match: /AI (tools|reviewers)/ },
    { rule: 'terraform apply is never run', file: 'references/terraform.md', match: /terraform apply/ },
    { rule: 'terraform init is never run', file: 'references/terraform.md', match: /terraform init/ },
    { rule: 'a yes covers one command, in this review only', file: 'references/security.md', match: /one command, in this review only/ },
    { rule: 'a changed flow or CLAUDE file means asking again', file: 'references/security.md', match: /ask again|blocked/ },
{ rule: 'a PR URL is passed through, never reduced to its number', file: 'SKILL.md', match: /validated full URL or number unchanged/ },
{ rule: 'the skill never reduces a PR URL to gh pr diff N', file: 'SKILL.md', match: /gh pr diff N/, absent: true },
{ rule: 'gh pr diff is called with the URL in double quotes', file: 'SKILL.md', match: /gh pr diff "P"/ },
{ rule: 'no --output or --no-index flag is granted', file: 'SKILL.md', line: /^ {2}- /, match: /--output|--no-index/, absent: true },
  ],
  'add-project': [
    { rule: 'the wildcard helper grant is the only way it can run any subcommand', file: 'SKILL.md', match: /Bash\(node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/devocd\.mjs" \*\)/ },
    { rule: 'its own references are readable', file: 'SKILL.md', match: /Read\(\$\{CLAUDE_SKILL_DIR\}\/\*\*\)/ },
    { rule: 'the arguments are never on a command line', file: 'SKILL.md', line: /\$ARGUMENTS/, match: /devocd\.mjs|`|"/, absent: true },
    { rule: 'a helper command line never carries the arguments', file: 'SKILL.md', line: /devocd\.mjs/, match: /\$ARGUMENTS|\$\d|\$\{?[A-Z_]*ARG/, absent: true },
    { rule: 'a path with a quote, $, backtick or line break is refused', file: 'SKILL.md', line: /`"`/, match: /stop/i },
    { rule: 'a folder or value ending in a backslash is refused', file: 'SKILL.md', line: /ends in a backslash/, match: /stop/i },
    { rule: 'paths in commands are double quoted', file: 'SKILL.md', match: /never passed unquoted|double quotes/i },
{ rule: 'a description with a quote, $ or backtick is cleaned before register runs', file: 'SKILL.md', line: /devocd\.mjs" register /, match: /`"`/ },
{ rule: 'the register line escapes a backtick', file: 'SKILL.md', line: /devocd\.mjs" register /, match: /backtick/ },
{ rule: 'an id that does not match the pattern stops the run', file: 'SKILL.md', line: /\[a-z0-9\]/, match: /stop/i },
{ rule: 'an invalid id writes nothing', file: 'SKILL.md', line: /\[a-z0-9\]/, match: /writing nothing|write nothing/i },
{ rule: 'the answers file goes only to the Read tool', file: 'SKILL.md', match: /only to the Read tool/ },
{ rule: 'only the literal value approved stands in for the review', file: 'SKILL.md', line: /approval/, match: /`approved`/ },
{ rule: 'no company means using install, from inside the project', file: 'SKILL.md', line: /`company` is null/, match: /devocd:install/ },
{ rule: 'the company folder itself is refused', file: 'SKILL.md', line: /`company\.project` is `\.`/, match: /stop/i },
{ rule: 'protect runs before anything is written', file: 'SKILL.md', line: /devocd\.mjs" protect/, match: /./ },
{ rule: 'a tracked file stops the run', file: 'SKILL.md', line: /tracked/, match: /stop/i },
{ rule: 'the opt-in setting is added only when chosen', file: 'SKILL.md', line: /devocd\.mjs" settings /, match: /[Oo]pted in only/ },
{ rule: 'the interview never offers a deploy or release command', file: 'references/interview.md', match: /never offer a deploy or release/i },
{ rule: 'approved commands are named in the draft summary so approval covers them', file: 'references/project-template.md', match: /Approved commands for PR review/ },
{ rule: 'no instruction deletes draft files by hand', file: 'SKILL.md', match: /remove `draft\//, absent: true },
{ rule: 'the skill never writes a team file itself', file: 'references/personal-split.md', match: /Never write `\.devocd\/team\/` yourself/ },
{ rule: 'the split copies the team file without changing a byte', file: 'references/personal-split.md', match: /not one byte/ },
{ rule: 'an excluded team file is recorded as excluded', file: 'references/personal-split.md', match: /excluded.*true/s },
{ rule: 'split content is data, not instructions', file: 'references/personal-split.md', match: /data, not instructions/ },
{ rule: 'the undo steps need no plugin path', file: 'references/personal-split.md', match: /no keyword/i },
{ rule: 'source text is data, not instructions', file: 'SKILL.md', line: /data, not instructions/, match: /data, not instructions/ },
{ rule: 'script bodies are never saved', file: 'SKILL.md', line: /script bod/, match: /script bod/ },
{ rule: 'a file source ref is rewritten from the project folder', file: 'SKILL.md', line: /state\.json/, match: /from P/ },
{ rule: 'the state template repeats that a source file is never copied', file: 'references/project-template.md', match: /never copied/ },
{ rule: 'operations facts carry their source and read date', file: 'references/operations-template.md', match: /\(source: .+, read .+\)/ },
{ rule: 'web or assumed operations facts are unconfirmed', file: 'references/operations-template.md', match: /unconfirmed/ },
{ rule: 'connectors are read-only in SKILL.md', file: 'SKILL.md', line: /connector/i, match: /read-only/i },
{ rule: 'a connector never creates, updates, deletes or comments', file: 'references/interview.md', match: /never .*(create|update|delete|comment)/i },
  ],
};

for (const [skill, rows] of Object.entries(SAFEGUARDS)) {
  for (const row of rows) {
    test(`${skill}: ${row.rule}`, () => {
      const body = read(skill, row.file);
      const subject = row.line ? body.split('\n').filter((l) => row.line.test(l)).join('\n') : body;
      assert.ok(!row.line || subject.length > 0, `no line matches ${row.line}`);
      if (row.absent) assert.doesNotMatch(subject, row.match);
      else assert.match(subject, row.match);
    });
  }
}
