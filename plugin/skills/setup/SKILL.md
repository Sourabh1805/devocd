---
name: setup
description: Onboard.
argument-hint: "[project-path | --all] [--yes]"
allowed-tools:
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/devocd.mjs" discover-projects *)
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/devocd.mjs" integrate *)
  - Skill(devocd:install)
  - Skill(devocd:add-project)
  - Skill(devocd:check)
  - Read(${CLAUDE_PLUGIN_ROOT}/skills/**)
---

# Set up DevOCD

Input: $ARGUMENTS

Coordinate the existing skills; do not duplicate their file-writing procedures.
Run from the intended company folder. With no path or `--all`, run
`node "${CLAUDE_PLUGIN_ROOT}/scripts/devocd.mjs" discover-projects .`.
Then follow `references/orchestration.md`: one upfront AskUserQuestion round
(projects, folder kind, integration, mode), answers handoff files, one approval
question per unit; `--yes` is defined there and never fabricates approval.
Immediate subfolders are candidates, including non-Git folders; deeper folders
remain module knowledge, not automatically separate projects. A supplied path
selects one project. No candidates: explain and stop without writing.
A personal workspace can serve as the company folder;
record only supplied standards, never invent company policies.

Establish the current folder and selected project with read-only tools before
invoking a skill. Inside a project whose company is not set up: say first setup
starts from the intended parent workspace, `/devocd:setup <project-path>` there.
Never put company rules in the home folder, move projects, initialize Git, or
change the working folder.

1. Read the company `.devocd/state.json` if present. If missing, invoke
   `devocd:install` with the handoff answers file. Existing valid company state is
   reused; invalid state must be reported, not overwritten. Respect the install
   draft and approval workflow. Stop if it fails or remains unapproved.
2. For each selected project sequentially, invoke `devocd:add-project` with its
   path and, in Fast mode, its handoff answers file. Its knowledge-builder creates
   the nested module and runtime flow drafts. Follow its argument rules, source
   handling, approval, backups and checks. Do not grant commands yourself.
3. Invoke `devocd:check` on the company and each selected project. Report completed,
   failed and skipped projects separately. Preserve existing registrations on rerun.
   Never run source commands merely to discover a project. Report failures and
   incomplete discovery honestly; never report setup complete while checks fail.

Read `../add-project/references/knowledge-contract.md` for layered writing and
retrieval. Keep startup files to rules and routing; details belong in linked pages.
Report estimated startup tokens and the PROJECT.md and offline graph paths;
never promise measured savings from estimates.

Ordinary project folders need no Git repository or remote. The helper skips Git
exclusions outside repositories; branch/PR review still needs Git. If Git is
initialized later, rerun add-project before staging to protect generated files.

Claude receives its local pointer. If the upfront round chose Codex/Antigravity,
follow `references/integrations.md` to preview and install approved native startup blocks.
Preserve existing instructions. Report installed files separately from live host
verification; never claim a tool loaded them without observing it.

This coordinator is interactive. Unattended setup uses the install and
add-project answers-file interfaces separately; never fabricate approval.
If Skill invocation is unavailable, report that and the two commands
instead of claiming they ran.
