---
name: capture
description: Capture decisions.
argument-hint: "[scope-path]"
allowed-tools:
  - Agent(devocd:decision-keeper)
  - Read(${CLAUDE_SKILL_DIR}/**)
---

# Capture knowledge during work

Input: $ARGUMENTS (default: current project).

Use after an approved architectural decision or a task that verified missing or
obsolete README information. Read `references/workflow.md` and follow its full
approval/history contract. No full rescan or refresh is needed for a small capture.

Delegate bounded comparison to `devocd:decision-keeper` with the relevant task
context, owning root and evidence. If delegation is unavailable, disclose it and
perform the same read-only comparison. Do not claim continuous monitoring.

Return silently when nothing durable changed. Otherwise show the exact proposed
patch and history entry, then ask for explicit approval before any write. Never
interpret approval of the underlying architecture as permission to edit docs.
No Write/Edit or shell command is pre-granted by this skill.
