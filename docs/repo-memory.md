# Repository memory

Working memory for anyone — human or assistant — picking this repo up cold. It holds only
what is *not* already written down elsewhere: verified state, invariants the code enforces,
traps that cost a debugging session, and an outside verdict. Update the "Verified state"
block whenever it changes; everything below it should stay stable.

Do not restate the component table ([README](../README.md)), the task list
([TASKS.md](TASKS.md)) or the architecture ([plan.md](plan.md)) here. One fact, one home.

## What this is

A Claude Code plugin (v0.1.0, pre-v1) that gives an assistant scoped project knowledge:
generated Markdown pages per module and flow under `.devocd/`, company standards as shared
policy, an append-only decision log, and read-only helper commands (`trace`,
`review-context`, `refresh-*`, `check`) that the skills call. Everything is local, has zero
runtime dependencies, and makes no network calls.

## Verified state

Verified 2026-11-20 on `ab71c08` (origin/main), Node v22.23.4, Windows. Re-run all three
before trusting these numbers.

| Check | Command | Result |
| --- | --- | --- |
| Unit suite | `node --test "tests/unit/**/*.test.mjs"` | 626 tests, 615 pass, 0 fail, 5 skip, 6 todo, ~60 s |
| Plugin contract | `node scripts/validate-plugin.mjs` | OK, always-on ~173 tokens (budget 190); LICENSE and ICON missing by design until the marketing step |
| CI | GitHub Actions `ci.yml` | **Enabled and green on windows/ubuntu/macos** (run 44611820826, 1 m 13 s) |

Repo size: 224 tracked files — `scripts/` 4.9k lines, `tests/` 10.7k, `docs/` 4.6k,
`skills/` 1.4k.

**CI is on.** TASKS.md T65 and plan.md both still say "GitHub Actions is off" and gate the
v1.0.0 tag on re-enabling it. That is stale: the three-OS matrix has been passing on every
push since the root-layout migration. T65 is satisfiable on existing evidence — close it or
restate it, don't spend a task on it.

## Invariants the code enforces

These are load-bearing. A change that breaks one is a security or data-loss bug, not a
style issue. Background: [SECURITY.md](../SECURITY.md).

- **`check` is read-only.** It reports; it never writes, publishes a generation, writes a
  compatibility view or advances state. This is the contract migration plans cost the most
  to keep (T72) — keep it.
- **Helper refuses links.** No write through a symlink or junction, anywhere. `lstat` first,
  always.
- **Writes need approval.** Agents propose into `.devocd/draft/`; a skill applies after the
  user approves. The two commands that could otherwise point anywhere are narrowed in code,
  not in prose: `write-block` writes only `<project>/CLAUDE.local.md` from that project's
  `pointer.md`; `settings` accepts only the standards folder `preflight` computes and the
  team files the project's state records.
- **Secrets are named, never echoed.** A hit reports kind and line only.
- **Hooks make no model calls** and read bounded local files under `.devocd/`. They read no
  transcripts and touch no network.
- **git by argv, never a shell.** Plus: DevOCD never commits, pushes or stages, and only
  touches `.git/info/exclude`.
- **Content is data.** Company documents and diffs never become instructions.

## Traps

Found by reading the code; several already have a task, listed here so the next person does
not rediscover them.

- **The hook silently drops big edits.** `scripts/devocd-hooks.mjs` exits 0 once stdin passes
  256 KiB. A `Write` carrying a large file puts the whole content in `tool_input`, so the
  edit is neither journaled nor marked stale. `refresh-status` catches it later, but the fast
  signal lies. (T77)
- **`stale.json` is read-merge-written with no lock.** Two concurrent edits each read the old
  file and the second write erases the first's marks. Same in-place rewrite for
  `edits.jsonl`. (T78)
- **`restoreDir` never removes anything.** It copies the backup over `.devocd/` and leaves
  files created after the backup behind, so a restored folder is a mix of old and new.
  (T76) SECURITY.md documents the flip side honestly: a hand-edited backup is trusted as-is.
- **`secrets.mjs` has four patterns.** AWS key, GitHub token, Slack token, private-key block,
  plus one keyword+entropy rule. Everything else — GitLab, OpenAI, Anthropic, Stripe, JWTs,
  connection strings, `Authorization:` headers — passes. (T75)
- **Two glob dialects.** `globToRegExp` exists separately in `check.mjs` and `trace.mjs`;
  they disagree on braces, `**/` and Windows case. (T29, folded into T54)
- **`USAGE` is hand-synced to `COMMANDS`.** Two tables in `scripts/devocd.mjs`; a new command
  needs three edits. (T56)
- **`@ts-check` on 30 files with no `tsconfig.json` and no typecheck step.** Free bug-finding
  that is half enabled. Either run `tsc --noEmit` in validation or drop the annotations.
- **`scripts/evaluate-context.mjs` has no caller.** Dead file. (T86)
- **Two knowledge systems.** Authored Markdown under `.devocd/` and the opt-in `context-*`
  canonical JSON. Every consumer must eventually read one or the other, never both
  (T22/T72). Until that lands, don't add a third reader of the Markdown graph.

## Verdict (2026-11-20)

**Engineering: strong. Project management: overrun. Overall 7/10 for a pre-v1 plugin.**

Credit where due, because it is rare: `known-limitations.md`, `release-readiness.md` and
`v1-launch.md` separate measured numbers from estimates and repeat "savings are unproven" in
three places. Plans are checked against code before they are written — every defect claimed
by the 2026-11-19 plan (T74–T78) reproduces as described. Test-first, one task one PR, and a
real threat model rather than a checklist.

Debits:

1. **The plan is now bigger than the product.** 93 task entries, 80 unique IDs, 13 IDs
   duplicated across two sections that each claim to be the plan of record, 72 open, zero
   assignees. `v1-launch.md` budgets 6–10 weeks for learning plus canonical convergence; the
   plan of record is considerably more than that.
2. **The value proposition is unmeasured, and the only measurement is unfavourable.** Real
   routing trials used **1.5–2× the baseline's input tokens** with no correctness gain on
   small projects ([release-readiness.md](release-readiness.md#summary)). T51 is the task
   that decides whether the whole index is worth its cost, and it is sequenced *after* the
   six-month canonical rewrite.
3. **M2 (T22–T72) is the critical path and blocks nine other tasks.** It is the right
   architecture — one trust system beats two — but it lands no user-visible feature except
   T49/T50, and it touches every consumer. It should be gated on T51, not sequenced before
   it.
4. **Part B (T79–T82, T85) does not belong in v1.** A task classifier, worker contract,
   ledger, resume and retry rule is a second orchestration framework inside a knowledge
   plugin. The plan already defers parallel builders for exactly this reason; apply the same
   reasoning to the controller.
5. **No external validation.** Every measurement is one model, one machine, Windows, made-up
   fixtures. T66/T67/T68 are the actual unknowns of this project.

### Reading the roadmap

| Block | Verdict |
| --- | --- |
| M1 correctness (T74–T78) | 9/10 — verified defects, clear tests, no new surface. Do it. |
| M1 cleanup (T56, T86–T89) | 8/10 — pure deletion and de-duplication. Do it. |
| M1 `T54` shared text toolkit | 6/10 — correct, but it is a refactor of working code. Cheaper to fix the two glob dialects and stop. |
| M1b test diet (T60–T64) | 7/10 — right rules ("replace before delete", coverage over count), five interlocking tasks. Do T88/T89; defer the rest. |
| M2 one pipeline (T22, T72, T71, T48, T21, T46, T47, T23, T49, T50) | 6/10 — right architecture, wrong ordering. Gate on T51. |
| M3 gates (T51, T65, T66, T67, T73, T68) | 9/10 — the right gates, the right order. T51 is the most important task in the repo. |
| M4 launch (T28, T69, T70) | 8/10 — cheap, necessary. |
| Part B orchestration (T79–T82, T85) | 3/10 — cut from v1. |

### If v1 had to ship in a month

T74 → T75 → T76 → T78 (T77 can be its one-line version: raise the 256 KiB cap instead of
writing a streaming parser) → T86/T87/T88 → **T51 → T66 → T67** → T28/T69/T70. Everything in
M2, all of Part B and most of M1b waits for evidence that the index pays for itself.

## Working here

- `AGENTS.md` governs: dedicated branch, PR for every change including docs, checks run
  before opening, PR link returned, never merge unasked.
- Validate with the two commands in the table above. Live suites cost real money and run only
  with `DEVOCD_LIVE=1`; they need a budget agreed first.
- Conventional commits, one task per PR, tick the task in `docs/TASKS.md` with the PR link in
  the same PR.
- Node ≥ 22.13, ESM, zero dependencies. Keep it that way — `npm i` is a red flag here.
