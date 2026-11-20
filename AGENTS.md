# Repository workflow

- For every repository change, create or update a pull request, including documentation-only changes.
- Work on a dedicated branch and run the checks appropriate to the change before opening the PR.
- Include the validation results and any outstanding limitations in the PR description.
- Return the PR link to the user. Do not merge unless the user requests it.
- Read [docs/repo-memory.md](docs/repo-memory.md) before your first change: how to verify
  the current state, the invariants the code enforces, and the known traps.

# Contributor workflow

How DevOCD itself gets built. This is the team's process, not the plugin's runtime workflow:
`.devocd/` pages, agents and skills orchestrate *other* projects' knowledge and say nothing
about who writes this repository.

## Roles

- **Architect — controller.** Owns the plan and the ledger, writes the briefs, reviews every
  PR, decides when a milestone closes. Work that shapes the design stays with the architect.
- **Codex and Antigravity — workers.** Take one unit at a time, and only as a brief.
- The unit owns its files. No two workers write the same files at once.

## A unit of work

- A unit starts from a **brief**: goal, the files it owns, done-when, and rules — what not to
  touch and how to commit. No brief, no work.
- A worker ends with exactly one status:
  - `DONE` — finished, checks run. Ready for review, never approved.
  - `DONE_WITH_CONCERNS` — finished, but say what looks wrong in the brief or the code.
  - `NEEDS_CONTEXT` — a fact only the controller has is missing.
  - `BLOCKED` — it cannot finish as briefed; say why.
- The PR description carries that status and the local test results, per the repository
  workflow above. Only `DONE` and `DONE_WITH_CONCERNS` need a ready PR; report
  `NEEDS_CONTEXT` and `BLOCKED` to the controller directly (or in a draft PR).
- The controller reviews and approves; merging still follows the repository workflow: never
  merge unless the user requests it.

## Review

- One task review per PR: `/code-review --fix` where available, or the same review done by
  a fresh reviewer in any tool.
- At most three fix rounds at the task's size, then one round with a stronger reviewer or
  model than the author used. Still failing: park the work, report it, do not merge it.
- One heavy review per milestone: a whole-branch review before the milestone closes.

## The ledger

`docs/TASKS.md` is the record of what is planned, in progress and done. Ticking a task and
adding its PR link happen in the same PR as the work.
