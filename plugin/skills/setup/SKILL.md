---
name: setup
description: Onboard.
argument-hint: "[project-path | --all]"
allowed-tools:
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/devocd.mjs" discover-projects *)
  - Skill(devocd:install)
  - Skill(devocd:add-project)
  - Skill(devocd:check)
  - Read(${CLAUDE_PLUGIN_ROOT}/skills/**)
---

# Set up DevOCD

Project path: $ARGUMENTS

Coordinate the existing skills; do not duplicate their file-writing procedures.
Run from the intended company folder. With no path or `--all`, run
`node "${CLAUDE_PLUGIN_ROOT}/scripts/devocd.mjs" discover-projects .`.
Show candidates and exclusions; let the user confirm which folders are projects.
Immediate subfolders are candidates, including non-Git folders; deeper folders
remain module knowledge, not automatically separate projects. A supplied path
selects one project. No candidates: explain and stop without writing.
A personal workspace can serve as the company folder;
record only supplied standards, never invent company policies.

Before invoking a skill, establish the current folder and selected project with
read-only tools. If the session is inside the project and its company is not set
up, explain that first setup must start from its intended parent workspace and
give `/devocd:setup <project-path>` there. Do not put company rules in the user's
home folder, move projects, initialize Git, or change the shell's working folder.

1. Read the company `.devocd/state.json` if present. If missing, invoke
   `devocd:install` in this company session. Existing valid company state is reused;
   invalid state must be reported, not overwritten. Respect the install draft and
   approval workflow. Stop if it fails or remains unapproved.
2. For each selected project sequentially, invoke `devocd:add-project` with its path. Its knowledge-builder
   creates the nested module and runtime flow drafts. Follow its argument rules,
   source handling, approval, backups and checks. Do not grant commands yourself.
3. Invoke `devocd:check` on the company and each selected project. Report completed,
   failed and skipped projects separately. Preserve existing registrations on rerun.
   Never run source commands merely to discover a project. Report failures and incomplete
   discovery honestly; do not report setup complete while required checks fail.

Read `../add-project/references/knowledge-contract.md` for layered writing and
retrieval. Keep startup files to rules and routing; details belong in linked pages.
Report estimated startup tokens and the paths to PROJECT.md and the offline graph.
Do not promise measured token savings from estimated budgets.

Ordinary project folders need no Git repository or remote. The helper skips Git
exclusions outside repositories; branch/PR review still needs Git. If Git is
initialized later, rerun add-project before staging to protect generated files.

Claude receives the existing local pointer. For Codex or another coding tool,
provide the explicit instruction: "Start at <project>/.devocd/PROJECT.md; load only
task-relevant pages and verify cited source before edits." Do not claim automatic
cross-tool setup, overwrite AGENTS.md, or invent an Antigravity configuration path.
Installing tool-specific startup integrations is a separate, verified operation.

This coordinator is interactive. For unattended setup, use the existing install
and add-project answers-file interfaces separately; never fabricate approval.
If Skill invocation is unavailable, report the limitation and the two existing
commands instead of claiming they ran.
