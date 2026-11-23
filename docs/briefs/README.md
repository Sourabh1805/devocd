# Worker briefs

The architect (controller) writes these; a worker (DeepSeek, Codex, Antigravity) executes
exactly one at a time. Process: [AGENTS.md, Contributor workflow](../../AGENTS.md#contributor-workflow).
Order and file ownership: [QUEUE.md](QUEUE.md).

## How to run a brief

Tell the worker: **"Do `docs/briefs/<ID>.md`."** Nothing else is needed; the brief carries the
goal, the facts, the files it owns, the steps, the tests and the done-when.

## Rules for every brief

1. Read `AGENTS.md` and `docs/repo-memory.md` before the first change.
2. Branch from current `main` with the branch name the brief gives. One brief = one PR.
3. Touch only the files the brief owns. If the work needs another file, stop and report
   `NEEDS_CONTEXT` instead of editing it.
4. Tests first: write or change the tests, show they fail on the old code, then change the code.
   Never delete or weaken an existing assertion unless the brief says so.
5. Run `npm test` and `node scripts/validate-plugin.mjs`. Both must pass.
6. Tick the task in `docs/TASKS.md` with the PR link, in the same PR.
7. Open the PR (never merge it). The description has, in this order:
   - **Status:** exactly one of `DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, `BLOCKED`.
   - **What changed**, briefly.
   - **Interpretations:** every place you had to choose, and what you chose.
   - **Validation:** the two command results, plus anything the brief asks you to measure.
   - **Concerns** (only with `DONE_WITH_CONCERNS`).
8. `NEEDS_CONTEXT` or `BLOCKED`: open a draft PR or report back; do not guess.

## What happens next

The controller reviews the PR (`/code-review --fix`), at most three fix rounds, then one
round with a stronger reviewer; the user merges. Then the next brief in the queue starts.
