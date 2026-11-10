# Draft and apply a company standard

## Authoritative topic

Choose a lowercase hyphenated slug of at most 64 characters, never a supplied
path. Examples: `pr-description`, `jira-style`, `networking`. Reuse a matching
existing file. Write `.devocd/standards/<slug>.md` in company C.

Read supplied sources using `sources.md` before drafting. Record purpose, when to apply it, concise rules, an optional reusable template,
and source/date. Attribute user requirements to the conversation and today's
date. Clearly distinguish proposed defaults from supplied policy until approved.
Do not invent Jira fields, network ranges, reviewers or compliance requirements.
For networking, clarify whether this means infrastructure or professional
networking if the description does not establish the meaning.

Aim for 500 estimated tokens, maximum 200 lines. Split genuinely longer topics
into meaningful linked child pages under `standards/<slug>/`; keep the topic file
as the entry point. Preserve exceptions, examples and evidence needed for accuracy.
Never copy full standards into startup files or project indexes.

## Task routing

Maintain `.devocd/standards/index.md` as a compact task-to-file list using relative
Markdown links. Preserve unrelated entries. Example:

```markdown
# Company standards

- Create or edit a PR title/body: [PR description](pr-description.md).
- Create or edit a Jira ticket: [Jira style](jira-style.md).
- Design or review network infrastructure: [Networking](networking.md).
```

Match triggers to the actual approved scope. Avoid vague triggers such as "all
work". If the index exceeds 200 lines, split topic groups into linked subindexes.
Consumers load only the matching standard. If none matches, use ordinary project
instructions; do not invent a company rule. This skill creates guidance, not PRs,
Jira tickets, infrastructure changes or an enforcement hook.

For each registered project, resolve its path under C and verify its own project
state points back to C. Skip missing, linked, outside-company or mismatched paths
and report them. Read PROJECT.md and pointer.md; preserve unrelated content.
Ensure PROJECT has one compact routing entry with the company-relative path:

`Before task work, read <company-relative>/.devocd/standards/index.md if present;
load only the matching standard. Explicit project exceptions apply within their
stated scope; surface conflicts before proceeding.`

Keep external company paths as backticked text, not graph links escaping the
project. Add a short pointer instruction to consult PROJECT's company standards
route before task work. Existing suitable routes need no edit. Do not copy topic
lists into each project: future topics become discoverable through the index.
Preserve project exceptions; ask about ambiguous precedence instead of guessing.
Never overwrite team CLAUDE.md or AGENTS.md. Do not auto-import standards with @.

## Approved writes

Use the existing commands with literal resolved C and P paths, one call at a time.
Before any write, verify target folders and files are regular, not links; the
approved changes must stay in the selected company and its registered projects.
For C and every changed P, run `protect` and then `backup`. A protection failure
stops that target before editing. Non-Git folders are supported; do not initialize
Git. Retain the backup paths in the report.

1. Write the approved topic and index under C's `.devocd/standards/`.
2. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/devocd.mjs" render-parent "C"`.
   This refreshes standard routing from existing state; do not rewrite state or
   key rules to add one line per standard.
3. Write only approved PROJECT.md and pointer.md changes for each changed P.
   Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/devocd.mjs" write-block "P/CLAUDE.local.md" "P/.devocd/pointer.md"`.
4. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/devocd.mjs" check "C" --json`
   and the same for each changed P. Fix errors introduced by this change within
   approved scope; otherwise report failure. Existing limits remain in force.
5. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/devocd.mjs" knowledge "C"`
   and the same for each changed P after checks pass.

Stop on helper failure, recording completed and outstanding writes; this multi-file
workflow is not atomic. Never claim a partial migration updated every project.
Reruns preserve unrelated standards, custom project notes and explicit exceptions.
If permissions prevent reading company standards from a project, explain the
existing opt-in additionalDirectories setup; do not silently broaden permissions.
