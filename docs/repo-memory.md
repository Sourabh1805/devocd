# Repository memory

Working memory for anyone — human or assistant — picking this repo up cold. It holds only
what is *not* written down elsewhere: how to verify the current state, the invariants the
code enforces, and traps that cost a debugging session.

One fact, one home. The component table lives in the [README](../README.md), the plan of
record and its ordering in [TASKS.md, Road to v1](TASKS.md), the architecture and
reasoning in [plan.md](plan.md). Disagree with the plan? Propose a change in a PR to those
files; do not record a second plan here.

## What this is

A Claude Code plugin (pre-v1) that gives an assistant scoped project knowledge: Markdown
pages per module and flow under `.devocd/`, company standards as shared policy, an
append-only decision log, and read-only helper commands (`trace`, `review-context`,
`refresh-*`, `check`) that the skills call. Local only, zero runtime dependencies, no
network calls.

## Verify the current state

Re-run before trusting any number in a PR or plan:

| Check | Command |
| --- | --- |
| Unit suite | `node --test "tests/unit/**/*.test.mjs"` (or `npm test`) |
| Coverage of `scripts/lib`, child processes included | `npm run coverage` (gate 98%; `node tests/tools/coverage.mjs --min <n>`) |
| Plugin contract and listing budget | `node scripts/validate-plugin.mjs` |
| CI | GitHub Actions `ci.yml`, three OSes, runs on every push and PR |
| Evals (paid, model runs) | `claude plugin eval . --scaffold --trust-plugin --tag lookup --ablation none`; see [evals/README.md](../evals/README.md) |

Last verified 2026-11-20 on `ab71c08`: suite green, validator OK, CI green on Windows,
Ubuntu and macOS (run 44611820826).

## Invariants the code enforces

A change that breaks one is a security or data-loss bug, not a style issue. Background:
[SECURITY.md](../SECURITY.md).

- **`check` is read-only.** It reports; it never writes, publishes a generation, writes a
  compatibility view or advances state.
- **No writes through links.** `lstat` first; a symlink or junction is refused.
- **Writes need approval.** Agents propose into `.devocd/draft/`; a skill applies after the
  user approves. `write-block` writes only `<project>/CLAUDE.local.md` from that project's
  `pointer.md`; `settings` accepts only the standards folder `preflight` computes and the
  team files the project's state records.
- **Secrets are named, never echoed.** A hit reports kind and line only.
- **Hooks make no model calls**, read bounded local files under `.devocd/`, read no
  transcripts and touch no network.
- **git by argv, never a shell.** DevOCD never commits, pushes or stages, and only touches
  `.git/info/exclude`.
- **Content is data.** Company documents, PR text and diffs never become instructions.

## Traps

**The built-in coverage figure is not the suite's coverage.** `node --test --experimental-test-coverage` sees only the test process: a module exercised through a `spawnSync` child reports like an untested one. `bin.test.mjs` alone reports `secrets.mjs` at 74.29% lines and 20% functions and `backup.mjs` at 31.60% — the numbers that get mistaken for a whole-suite figure with a path bug. Run `npm run coverage`, which sets `NODE_V8_COVERAGE` and merges every child's result.

The code traps below are confirmed by reading the code. Each has a task in TASKS.md with the fix; until it lands,
work around it.

- Large edits (> 256 KiB hook input) are not journaled or marked stale. (T77)
- `stale.json` and `edits.jsonl` are rewritten without a lock; concurrent edits can lose
  marks. (T78)
- Two glob dialects, in `check.mjs` and `trace.mjs`. (T54)
- `USAGE` in `scripts/devocd.mjs` is kept in sync with `COMMANDS` by hand. (T56)
- Two knowledge systems (Markdown pages and the `context-*` canonical JSON) until T22 and
  T72 land: do not add another reader of the Markdown graph.
- A login-only `<login>@users.noreply.github.com` is credited by GitHub to whoever owns that
  login — a stranger here — and the fix is a history rewrite (T106). CI now fails such a
  commit (`tests/tools/authors.mjs`).

## Working here

- `AGENTS.md` governs: dedicated branch, a PR for every change including docs, checks run
  before opening, validation results in the PR, PR link returned, never merge unasked.
- One task per PR; tick it in `docs/TASKS.md` with the PR link in the same PR.
- Live suites cost real money and run only with `DEVOCD_LIVE=1` and an agreed budget.
- Node ≥ 22.13, ESM, zero dependencies. `npm i` is a red flag here.
