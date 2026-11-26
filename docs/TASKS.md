# DevOCD task list

One task = one pull request. Mark a task done by changing `[ ]` to `[x]`, and put a
name after **assignee** when you hand it out. The full reasoning behind each phase
lives in [plan.md](plan.md) — section names below match its headings.

Start at **Quality first** below: it is the current priority. **Road to v1** after it remains the full plan of record.
Everything under "Done" is merged; "Earlier stages" keeps the history and detail.

## Done (merged to main)

- [x] **Phase 0 — Rename `company-standards` → `company-policy`.** Skill name and docs
  only; the `.devocd/standards/` data layout is unchanged. → [plan.md Phase 0](archive/plan-history.md#phase-0--rename-company-standards--company-policy)
- [x] **Phase 1 — Batch the add-project interview.** Derived defaults (id, description,
  commands via the new read-only `detect-commands` helper), ONE AskUserQuestion round,
  full draft files on disk under `.devocd/draft/` with a short summary in chat.
  → [plan.md Phase 1](archive/plan-history.md#phase-1--add-project-derived-defaults--one-batched-question-round)
- [x] **Phase 2 — Batch the install interview + personal-workspace fast path.** The six
  per-topic source questions are gone; a personal workspace is one 3-question call plus
  one approval. → [plan.md Phase 2](archive/plan-history.md#phase-2--install-personal-workspace-fast-path--one-batched-round)
- [x] **Phase 3 — Setup orchestration + `--yes`.** One upfront round (projects, folder
  kind, integration, mode), answers handoff files, one draft approval per unit: ~7
  interactions for 5 projects instead of ~30+. `--yes` never fabricates approval.
  → [plan.md Phase 3](archive/plan-history.md#phase-3--setup-coordinator-one-upfront-round-answers-handoff---yes)
- [x] **Phase 4 — Fix setup→freshness.** Logs/lockfiles/assets are classified
  `irrelevant-bulk` instead of poisoning completeness; notebooks are read by cell
  source (outputs ignored, secrets in outputs still withheld); new `refresh-baseline`
  records freshness at setup so a fresh, unchanged project reports `current`.
  → [plan.md Phase 4](archive/plan-history.md#phase-4--fix-setupfreshness-as-one-workflow-external-reviews-priority-1-verified)
- [x] **Phase 5 — Developer-grade pages, backtracking, dependencies, decisions.** Module
  pages require entry points / public surface / run-test / extension recipes / pitfalls
  plus a `Standards:` backtrack line to company policies; PROJECT.md links the company
  parent, splits documented vs approved commands, and gains Dependencies (new
  `detect-dependencies` helper: git deps, workspaces, submodules, nested repos) and
  thematic pages (`cicd.md`, `guides/`, `history.md`); durable `decisions.md` separates
  constraints from derived facts (idea from mindmuxai/brain.md).
  → [plan.md Phase 5](archive/plan-history.md#phase-5--developer-grade-knowledge-output)
- [x] **Phase 6 — Company-policy pillar tests + required pointer.** Static and live
  checks for ingestion; pointers now treat recorded company rules as required, never
  optional. → [plan.md Phase 6](archive/plan-history.md#phase-6--company-policy-pillar-polish)
- [x] **Review fix pass.** Fresh-context review found 0 critical / 5 important findings;
  all fixed with failing-test-first proof (company-link path off-by-one, baseline
  TOCTOU fingerprint guard, approved-command visibility, leftover `draft/` hygiene,
  setup grants, notebook-output secrets).

- [x] **Second review fixes (3 findings on PR #13).** First-time setup can now record its
  freshness baseline (onboarding's own `.devocd/` entry no longer shifts the discovery
  fingerprint; tested on a genuinely fresh plain and git project); distinct nested
  repositories with the same folder name are each reported by path; the required
  `draft/` cleanup now has a permitted, tightly scoped `clean-draft` helper (never
  through a link, never tracked files) run before drafting and after applying, which
  also stops a stale draft from an earlier rejected run being applied.
- [x] **Decision capture (PR #14).** `/devocd:capture` skill, read-only `decision-keeper`
  agent, Stop-hook reminder, append-only `decisions.md` with `decision-history/`.
  Follow-ups are T14 and T20 below.

## Quality first — the current priority (2026-11-20)

**Optimize what exists; add no features.** Every change in this section must show an eval
improvement against the plain assistant and never lower correctness. Record actual
eval cost and tool calls; there is no fixed spending ceiling in this plan.
Reasoning: [plan.md, Quality first](plan.md#quality-first-2026-11-20).

**Paused until Phase 5 decides:** M2 (T71 folds into T95; T22, T23, T72, T48, T21, T50)
and `/devocd:learn` (T49). Their entries below stay as written.
**Absorbed:** T91 → T94; T51 → T94 re-run at the end; T60b model-only rows and T90 →
Phase 4; T81 → L1, T82 → L2 (entries below). Bug fixes T74–T78 and cleanup (T54, T56,
T87, T89) continue unchanged.

### Phase 1 — Measure first

- [x] **T93 — (M) Eval suite.** An `evals/` suite for `claude plugin eval` (Claude Code
  2.1.325+): five lookup tasks and two review tasks on medium real repositories, plus
  safeguard cases (no write without approval, read-only review, declined capture writes
  nothing). Graders are rules first, a model judge only where needed. Record actual
  spend; no mandatory `--max-cost-usd` setting. Safeguard cases grant the tools needed
  to exercise the forbidden action, so permission denial cannot masquerade as obedience.
  **Needs:** none. **assignee:** — PR [#64](https://github.com/Sourabh1805/devocd/pull/64).
- [x] **T94 — (S) Baseline with and without DevOCD.** Run T93 with its no-plugin arm (3
  runs per case) and record correctness, cost and tool calls in
  `docs/release-readiness.md`. Replaces T91; repeated at the end of Phase 3 as T51.
  **Needs:** T93. **assignee:** controller. Result 2026-11-25: code questions no gain;
  team decisions 8/15 with DevOCD, 15/15 with the same decisions in CLAUDE.md, 0/15 without.
  [release-readiness.md](release-readiness.md#t94--baseline-with-and-without-devocd-2026-11-25).
- [x] **T94b — (M) Baseline on a large repository.** The T94 comparison on one large public
  repository (2,000–8,000 files): a pinned fixture, a knowledge snapshot, 8 code and 5 team
  tasks in three arms, a summary tool, and the report in a fixed format. Spend cap $60.
  **Needs:** T94 cases. **assignee:** DeepSeek. Brief: [T94b](briefs/T94b.md).
  Result 2026-11-26 on vitest-dev/vitest: code questions no gain (plain 22/24, devocd 19/24);
  team decisions 10/15 with DevOCD, 14/15 with the same decisions in CLAUDE.md, 3/15 without;
  $15.30 total spend.
  [release-readiness.md](release-readiness.md#t94b--large-repository-2026-11-26).
  PR [#89](https://github.com/Sourabh1805/devocd/pull/89).

### Phase 2 — What goes into the pages

- [ ] **T95 — (M) Evidence anchored to code.** Cite a path plus a symbol or line range and
  hash the resolved span, with dependency/scope fallback where a claim cannot be
  isolated safely. Missing or ambiguous anchors are unknown, never current; preserve
  discovery for added files and changed dependencies. Tests include line shifts,
  renamed symbols, new files and unchanged spans with changed dependencies. One definition used by inventory, freshness and refresh
  (absorbs T71). **Needs:** T94.
  **assignee:** —
- [ ] **T96 — (M) Observed, inferred, assumed, open.** Pages separate cited facts,
  reasoned inferences, assumptions and open questions; assumptions are never written as
  facts and the draft summary lists them for confirmation. **Needs:** T94.
  **assignee:** —
- [x] **T97 — (S) Rule notes built for the edit.** The note that loads when a file opens
  carries that scope's top pitfalls and test command, not a summary. **Needs:** T94.
  **assignee:** DeepSeek. Brief: [docs/briefs/T97.md](briefs/T97.md).
  PR [#69](https://github.com/Sourabh1805/devocd/pull/69).
- [x] **T98 — (S) Page usefulness check.** `check` warns when a module page has no entry
  point, no covering test or no recipe or pitfall. **Needs:** none. **assignee:** —

### Phase 3 — A quality loop for building and refreshing pages

- **L1 = T81** (sequential controller, ledger, resume) and **L2 = T82** (fresh-context
  review, 3 + 1 retry rule, parked units block dependent publication), listed under M2
  below, are built here on the merged T79 classifier and T80 worker contract.
- [x] **T99 — (S) Verification gate.** add-project and refresh report done only after
  `check` and the evidence checks pass, and show their output. **Needs:** none.
  **assignee:** DeepSeek. Brief: [docs/briefs/T99.md](briefs/T99.md).
  PR [#68](https://github.com/Sourabh1805/devocd/pull/68).
- [ ] **T100 — (S) Play it back.** Before drafting, setup and add-project send one message:
  what was understood and which assumptions it rests on; the user confirms once.
  **Needs:** T96. **assignee:** —
- [ ] **T101 — (M) Claim-level refresh.** Refresh re-checks only the claims whose anchored
  evidence or dependencies changed; preserve scope/unmapped-file discovery for new
  evidence. Keep untouched claims only when their evidence coverage is still valid.
  **Needs:** T95, T81. **assignee:** —

- [ ] **T104 — (M) One instruction structure and dispatch map.** Apply the skill and
  agent outlines in [plan.md, Runtime instruction structure](plan.md#runtime-instruction-structure)
  to setup, add-project, refresh, company-policy, capture, check and pr-review. Wire
  shared controller/dispatch/retry/resume references into the entry skills; reuse
  brief/proposal/review contracts. Every step names its executor, inputs, tools,
  output and next gate. No worker delegates or writes. Cover each dispatch route,
  unavailable-agent refusal and forbidden transition with behavioral tests/evals;
  keep the listing footprint within its existing budget. **Needs:** T81, T82, T93.
  **assignee:** —

### Phase 4 — Skills proven by evals, not wording

- [ ] **T102 — (M) Skill changes test-first.** Every skill change adds an eval case that
  fails before the change and passes after it; the remaining wording assertions and the
  model-only T60b rows move to evals; the live e2e suites shrink into the eval set
  (absorbs T90). **Needs:** T93. **assignee:** —

### Phase 5 — Decide with the numbers

- [ ] **T103 — (S) Go or cut.** Re-run T94 on the improved loop. A clear win on medium or
  large repositories restarts `/devocd:learn` on the decoupled design (claims into
  Markdown pages, M2 optional); no win cuts M2 and ships v1 on the improved core loop.
  Recorded in `docs/plan.md`. **Needs:** Phases 1–4. **assignee:** —

<a id="road-to-v1-checklist"></a>
## Road to v1 — the ordered checklist (2026-11-18)

This section is the plan of record. Older stages below stay as history and detail;
where they disagree, this section wins. Reasoning: [plan.md, Road to v1](plan.md#road-to-v1-2026-11-18).

**v1.0 means:** a team installs the plugin from the marketplace, onboards a workspace
in about 7 interactions, and on real tasks the assistant picks the right files,
policies and decisions, reviews PRs with citations, refreshes after changes, captures
decisions and learns from merged PR history. All through one pipeline: authored
Markdown and learned claims compile into one canonical model that retrieval reads.
Proven by green CI on three OSes, a live demo run, a measured comparison with the
plain assistant, a clean install and a one-week pilot.

Audit at `d4fcb70`: 5,210 lines of plugin code against 7,571 lines of unit tests (578
tests, ~49 s); 198 assertions pin skill wording; duplicated helpers (2 glob
translators, 2 fence masks, 4 frontmatter parsers, 8 directory walkers, 2
sanitizers); two knowledge systems; listing budget 189/190.

### M1 — Clean code: one copy of everything

- [ ] **T54 — Shared text toolkit.** `scripts/lib/text.mjs`: fence masking, frontmatter,
  glob → RegExp (cached), real dates, sanitizing. Every copy in check, trace,
  redundancy, block, deps, parent and artifacts is replaced; behaviour unchanged.
  Replaces T29. **Needs:** none. **assignee:** —
- [x] **T55 — One directory walker.** `fsutil.walk(root, { skipDir, maxDepth, maxEntries,
  maxBytes, includeDirs })` centralizes recursive traversal; `walkFiles` is a thin
  wrapper. Compatibility options preserve caller ordering and skipped/error policies;
  only single-level reads remain outside fsutil. Existing tests unchanged; 608 pass,
  5 skip, 6 TODO; local plugin validation passes. **Needs:** none. **assignee:** Codex.
  Implementation: [PR #42](https://github.com/Sourabh1805/devocd/pull/42) (open; not merged).
- [ ] **T56 — CLI command table.** Each command declared once (name, arguments,
  read-only, handler); argument checks and usage are generated; a test checks skill
  grants only name read-only commands where required. **Needs:** none. **assignee:** —
- [ ] **T57 — `check` as rule modules.** One runner over state, links, budget, secrets,
  content and repetition modules; identical output. **Needs:** T54. **assignee:** —
- [x] **T16 — Listing diet.** Merge the three optional investigator agents into one with
  a mode argument, freeing listing budget for `/devocd:learn`; add `when_to_use` only
  where it helps, targeting 160 or less. **Needs:** none. **assignee:** —
  PR [#44](https://github.com/Sourabh1805/devocd/pull/44).
- [x] **T59 — Docs cleanup.** Archive `master-prompt.md` and the superseded plan phases
  under `docs/archive/`; fold `guide.md` into the READMEs. **Needs:** none.
  **assignee:** — PR [#43](https://github.com/Sourabh1805/devocd/pull/43).

#### M1 additions (2026-11-19): correctness, contracts, cleanup

Detail and tests for each: [plan.md, Hooks, safety, orchestration and cleanup](plan.md#hooks-safety-orchestration-and-cleanup-2026-11-19).

- [x] **T77 — (M) Large edits are still tracked.** The edit hook reads stdin with a
  structure-aware streaming JSON reader, keeps only the event, tool and file path, and
  never mistakes text inside file content for metadata; if the path cannot be
  established it records an `untracked` notice instead of staying silent.
  **Needs:** T105. **assignee:** DeepSeek. Brief: [docs/briefs/T77.md](briefs/T77.md)
  (branch `brief/T77`). PR [#80](https://github.com/Sourabh1805/devocd/pull/80).
- [ ] **T78 — (M) Concurrent edits never lose a stale mark.** One file per mark
  (temp + rename) under `.devocd/stale.d/`; only refresh compacts, under a lock, and
  deletes exactly the files it read; edits during refresh stay stale; the journal uses
  the same segments. **Needs:** none. **assignee:** —
- [x] **T76 — (S) Restore matches the backup exactly.** Back up the current state first;
  remove files under `.devocd/` that are not in the backup (except backups, drafts,
  journal and newer durable decisions); `--dry-run` lists changes; links refused.
  **Needs:** none. **assignee:** DeepSeek. Brief: [docs/briefs/T76.md](briefs/T76.md).
  PR [#67](https://github.com/Sourabh1805/devocd/pull/67).
- [x] **T75 — (M) Secret scanner coverage.** Provider patterns (GitLab, OpenAI,
  Anthropic, Google, Stripe, Slack webhooks, SendGrid, Twilio, npm, PyPI, Azure,
  connection strings, JWT, URL credentials, auth headers, PGP, Docker auth) with a
  false-positive guard (hashes, SHAs, UUIDs, placeholders); one scanner for every
  caller; values never echoed. **Needs:** none. **assignee:** DeepSeek. Brief: [docs/briefs/T75.md](briefs/T75.md).
  PR [#65](https://github.com/Sourabh1805/devocd/pull/65).
- [x] **T74 — (S) Prompt hook gate, once per session.** Hooks make no model calls; the
  cost is injected text. Inject nothing without a task signal, give each policy
  pointer once per session, and `hook-stats` shows what was injected.
  **Needs:** T77. **assignee:** DeepSeek. Brief: [docs/briefs/T74.md](briefs/T74.md)
  (branch `brief/T74`). Five prompts on one topic now add one pointer (107 bytes) instead of five (535). PR [#81](https://github.com/Sourabh1805/devocd/pull/81).
- [x] **T79 — (S) Task classifier.** Deterministic classes (deterministic, light,
  standard, heavy) decided before dispatch; risk overrides size; classes resolve to
  explicit model names and the model used is recorded.
  **Needs:** none. **assignee:** —
  PR [#50](https://github.com/Sourabh1805/devocd/pull/50).
- [x] **T80 — (M) Worker contract.** Workers stay read-only and return a structured
  proposal with one status (DONE, DONE_WITH_CONCERNS, NEEDS_CONTEXT, BLOCKED); a Node
  validator checks schema, permitted paths and evidence before anything is persisted.
  DONE means ready for validation, never approved.
  **Needs:** T79. **assignee:** —
  PR [#57](https://github.com/Sourabh1805/devocd/pull/57).
- [x] **T85 — (S) Contributor workflow in AGENTS.md.** Architect as controller, Codex and
  Antigravity as workers with briefs, status and local test results on every PR, one
  code review per PR with at most 3 fix rounds, one heavy review per milestone,
  TASKS.md as the ledger. Separate from the plugin's runtime workflow.
  **Needs:** none. **assignee:** —
  PR [#53](https://github.com/Sourabh1805/devocd/pull/53).
- [x] **T86 — (S) Dead code sweep.** Delete `scripts/evaluate-context.mjs`; un-export
  symbols used only in their own module; remove functions with no caller. Each item
  proven unused in the PR; coverage must not drop. Settle `// @ts-check` in the same
  pass: about 30 files assert a check that never runs, so either add `tsc --noEmit` to
  validation or drop the annotations. **Needs:** none. **assignee:** —
  PR [#56](https://github.com/Sourabh1805/devocd/pull/56).
- [ ] **T87 — (S) Unused CLI commands.** Remove `knowledge-scope`; fold
  `knowledge-route` into `knowledge-search` unless a skill needs it. **Needs:** T56.
  **assignee:** —

### M1b — Test diet: fewer, faster, stronger tests

Aim: faster, clearer tests with no loss of protection. Test count and suite time are
observations, not targets. **Rule: replace before delete.** A test that guards a
safeguard (approval before writes, decision history preserved, symlinks refused,
freshness never advanced by a failed or declined step, read-only reviews) is removed
only after an equivalent behavioural check exists and fails without the safeguard.

- [x] **T60 — One contract test per skill, safeguards kept.** Contract checks:
  frontmatter, grants equal the commands the body runs, token budget, referenced files
  exist, `$ARGUMENTS` once. Wording assertions are sorted in two: **style** ones are
  deleted; **safeguard** ones move into one table per skill (`safeguards: [rule, where]`)
  and stay until T60b replaces each with a behavioural check. **Needs:** none.
  **assignee:** DeepSeek. Brief: [docs/briefs/T60.md](briefs/T60.md).
  PR [#73](https://github.com/Sourabh1805/devocd/pull/73).
- [ ] **T60b — Behavioural checks for skill safeguards.** For each safeguard row: a
  deterministic helper test where code enforces it (draft apply, clean-draft, backup,
  protect, refresh-complete), or a recorded scenario in the live suite where only the
  model enforces it. Each new check is shown failing without the safeguard; only then
  is its wording row removed. Deterministic checks can land in M1b; model-only rows
  need T66. **Needs:** T60, T66 (for model-only rows).
  **assignee:** —
- [x] **T61 — Table tests.** Near-identical cases (parent-draft refusals, split, protect,
  settings, CLI exit codes) become one table each. Unblocked 2026-11-23: T72 is paused, and
  it runs after T63 (shared files). **Needs:** T63. **assignee:** DeepSeek. Brief:
  [docs/briefs/T61.md](briefs/T61.md). PR [#71](https://github.com/Sourabh1805/devocd/pull/71).
- [x] **T62 — One fixture builder.** `tests/helpers/workspace.mjs` builds company,
  projects, pages and memory with auto-cleanup; replaces 28 local temp-dir fixtures
  and the overlapping helpers. **Needs:** none. **assignee:** —
  **PR:** [#45](https://github.com/Sourabh1805/devocd/pull/45).
- [x] **T63 — Fast tests.** Slow CLI-spawning matrices call the library; one CLI smoke
  test per command keeps exit codes covered. Unblocked 2026-11-23: T72 is paused.
  **Needs:** none. **assignee:** DeepSeek. Brief: [docs/briefs/T63.md](briefs/T63.md).
  PR [#70](https://github.com/Sourabh1805/devocd/pull/70).
- [x] **T64 — Coverage gate and test rules.** A coverage number of `scripts/lib` that counts
  CLI child processes and is checked against single-file runs (the built-in whole-suite figure
  read 66.7% here on 2026-11-23; cause not established); a gate at the measured total, 85% the target; reported locally and
  on Ubuntu CI (it cannot see skill instructions, so it never replaces T60b); testing rules
  written into `AGENTS.md` (behaviour at module boundaries, one test per rule, tables for
  variants, never pin prose). **Needs:** T60. **assignee:** DeepSeek. Brief:
  [docs/briefs/T64.md](briefs/T64.md). Gate at **98%** (measured 98.66% of 5084 lines,
  child processes included). PR [#75](https://github.com/Sourabh1805/devocd/pull/75).
- [x] **T64b — Mutation spot-check.** Break one rule each in claims, redundancy, refresh and
  trace; the suite must fail each time. **Needs:** T64. **assignee:** DeepSeek. Brief:
  [docs/briefs/T64b.md](briefs/T64b.md). `npm run mutants`: 12 mutants, all killed (3 by
  tests added here), 0 equivalent. PR [#77](https://github.com/Sourabh1805/devocd/pull/77).

- [x] **T88 — (S) One plugin contract test file.** Merge `plugin-shape`, `footprint` and
  `validate-plugin` tests into `plugin-contract.test.mjs`; same checks, no duplicates.
  **Needs:** T60. **assignee:** —
  PR [#54](https://github.com/Sourabh1805/devocd/pull/54).
- [x] **T105 — (S) Hook timing test without random failures.** The median of 21 runs per
  handler stays under 50 ms; the test skips itself under coverage instead of the coverage tool
  skipping it by name. **Needs:** T64. **assignee:** DeepSeek. Brief:
  [docs/briefs/T105.md](briefs/T105.md). PR [#79](https://github.com/Sourabh1805/devocd/pull/79).
- [x] **T106 — (M) Commits credited to the right account.** 10 ledger commits from
  2026-11-20 use `sourabh@users.noreply.github.com`, which GitHub credits to the stranger
  whose login is `sourabh`. CI rejects such identities; a verified history rewrite is
  prepared for the owner to push, then `evals/_fixture/PIN` follows the new hash.
  **Needs:** none. **assignee:** DeepSeek. Brief: [docs/briefs/T106.md](briefs/T106.md).
  PR [#83](https://github.com/Sourabh1805/devocd/pull/83). The rewrite was redone from current
  GitHub, verified and force-pushed on 2026-11-24 (main `4052306` → `8c7dfe7`); `evals/_fixture/PIN`
  moved from `6b5d6d9` to `022cbcb` in PR #84.
- [x] **T107 — (S) CI runs once per PR.** `push` runs only on `main`; PR branches are
  tested by `pull_request` alone, so each job no longer runs twice. **Needs:** none.
  **assignee:** — PR [#85](https://github.com/Sourabh1805/devocd/pull/85).
- [ ] **T89 — (S) Remove duplicate CLI tests.** Where a library test covers the
  behaviour, the CLI test keeps only argument parsing and exit codes, in one table.
  **Needs:** T56, T63. **assignee:** —
- [x] **T92 — (S) De-duplicate task numbers.** The 13 IDs listed twice keep their Road to
  v1 entry, with the Earlier-stages detail merged into it and each removed entry left as a
  pointer; no task text or status lost. **Needs:** none. **assignee:** —
- [x] **T98 — (S) Page usefulness check.** `check` warns `page/not-actionable` when a
  module or flow page has its sections but nothing a task can start from: no `file:line`
  entry point, no test file named, or no non-empty recipe or pitfall. One issue per page
  listing every reason, never the page text; a section that is absent stays
  `page/section-missing`. **Needs:** none. **assignee:** —
  PR [#63](https://github.com/Sourabh1805/devocd/pull/63).
  PR [#58](https://github.com/Sourabh1805/devocd/pull/58).

### M2 — Feature-complete: one pipeline, learning included

Sizes: S about a day, M two to four days, L a week or more. **Cut line if M2 runs
late, in this order:** drop T23 (standards stay cited guidance), then T11b and T27,
then fold T21 into T50. Learning (T49) and the one pipeline (T22, T72) stay.

**Gate (2026-11-20):** T91 measures the pipeline shipped today against the plain
assistant before T22 starts. M2 is the largest block here and the only measurement that
exists points the wrong way (1.5 to 2 times the baseline's input tokens, no correctness
gain on small projects), so the decision to rewrite retrieval is taken on a fresh
number rather than on the architecture being attractive.

- [ ] **T91 — (S) Baseline before M2: today's pipeline against the plain assistant.**
  The T51 method, run on current code: three real tasks, plain assistant vs DevOCD as
  shipped, correctness, tool calls and reported input and output tokens, under one
  agreed live-trial budget. Reuses the `tests/e2e/routing.test.mjs` harness rather than
  building a second one. Records the table in `docs/release-readiness.md` and states
  plainly whether M2 proceeds, runs its cut line first, or stops. T51 repeats this after
  T50 so the two readings are comparable. **Needs:** an agreed live-trial budget.
  **assignee:** — First reading, on a real 20-file project for $1.37:
  [release-readiness.md, real-project trial](release-readiness.md#real-project-trial-does-the-shipped-pipeline-help-2026-11-20).
  It does not close this task; it used a scratch runner and one run per cell.
- [ ] **T71 — (M) Shared evidence semantics.** One definition of a file's evidence hash
  and size limit, used by inventory, page freshness, refresh and canonical
  publication. Today inventory hashes notebook cell sources while publication hashes
  the raw file, and their size limits differ. Tests: an unchanged notebook stays
  current through publish and refresh; a changed cell source goes stale; an oversized
  file is treated the same everywhere. **Needs:** T54. **assignee:** —
- [ ] **T22 — (L) Canonical model compiled from the Markdown graph.** Module, flow and
  decision records, scopes, evidence and `depends-on` generated from pages; published
  through the existing atomic store after the same single approval; no hand-written
  JSON. The notebook hash and size-limit mismatch between inventory and evidence is
  fixed first (T71). **Policies:** an ordinary standards page compiles to a cited
  `guidance` record (new kind: shown and cited, never machine-enforced). A page becomes
  an authoritative `policy` record only through T23's explicit header approved in the
  company-policy draft; nothing invents keys, values, exceptions or override targets.
  **Needs:** T4, T5, T54, T71. **assignee:** —
- [ ] **T23 — (M) Explicit policy header (moved into v1, minimal).** An optional header in a
  standards page (`Policy-Key`, `Value`, `Allow-Exceptions`, `Overrides`) that
  company-policy drafts and the user approves; only then does T22 emit a `policy`
  record with conflict handling, and `trace` and the prompt hook use the resolver.
  Pages without it stay guidance. **Needs:** T22. **assignee:** —
- [ ] **T72 — (L) Switch every consumer and migrate installs.** Every reader of knowledge
  uses the canonical model or a compatibility view generated from it: the prompt hook
  (standards index), the edit and session hooks (`sources.json`, `stale.json`), rule
  stubs, `knowledge.json`/`knowledge.html`, `check`, `refresh`, `trace`,
  `review-context`. `check` stays read-only: on a legacy install it reports
  `migration required` and suggests an approved refresh; it never publishes a
  generation, writes compatibility views, or advances state. Existing installs
  upgrade only through an explicitly approved refresh or migration workflow
  (compile from current pages, keep decisions and history). Tests: `check` on a
  pre-v1 install leaves all files and state unchanged, declined migration writes
  nothing, approved upgrade succeeds, publication interrupted at each step then
  recovered, rollback to the previous generation. Done when no consumer builds the
  graph from Markdown except the compiler and the hook latency test (each handler
  under 50 ms) still passes. **Needs:** T22, T23, T21, T48. **assignee:** —
- [ ] **T48 — (M) One evidence model.** The canonical model accepts PR and session evidence
  beside file + hash (merged, reverted, rejected); Markdown evidence lines are generated
  from it, not a second trust system. **Needs:** T22, T44. **assignee:** —
- [ ] **T21 — (S) Decisions in the graph.** Parse `decisions.md` entries into decision
  records with `supersedes`/`retires` links and scope, so retrieval returns only current
  decisions for a path. **Needs:** T4, T22. **assignee:** —
- [x] **T46 — (S) Separate completion states.** State records `historyCollected`,
  `knowledgePublished` and `sourceRefreshed` separately; only the snapshot refresh sets
  `sourceRefreshed`; history never narrows the refresh set; a failed or declined step
  advances nothing; an interrupted publish recovers or rolls back. **Needs:** T44.
  **assignee:** — PR [#51](https://github.com/Sourabh1805/devocd/pull/51).
- [x] **T47 — (S) Claim origin and independence.** Assistant text is origin `assistant`
  and can only become a `hypothesis` or an open question; copies of one statement count
  as one source. Fixture case 4 passes. **Needs:** T44, T45. **assignee:** — PR [#52](https://github.com/Sourabh1805/devocd/pull/52).
- [ ] **T49 — (L) `/devocd:learn` from PR history.** Reads the last month of merged PRs,
  skips bots, lockfile bumps and repeated directions, and drafts claims in the T44 shape;
  handles reverted PRs and rejected review suggestions; approved into the canonical
  model, never a policy, never a refresh. All T45 fixture cases pass (no `todo` left).
  **Needs:** T16, T45, T46, T47, T48. **assignee:** —
- [ ] **T50 — (L) Retrieval answers a task.** `trace` and `review-context` answer "for this
  change" through the canonical model: files that matter, binding rules vs suggestions,
  conflicting claims, what cannot be established, and the evidence to open next; claims
  filtered by path and environment; pr-review uses it. Golden queries as unit fixtures
  (expected pages, rules and decisions per task) keep retrieval quality from regressing.
  **Needs:** T22, T21, T44, T72. **assignee:** —
- [ ] **T11b — (S) No prompts for read-only commands.** Setup offers one opt-in that adds
  permission rules for the read-only subcommands to `.claude/settings.local.json`.
  **Needs:** T11, T56. **assignee:** —
- [x] **T27 — (S) Stale cross-project links on rerun.** Revisit cross-project links on a
  rerun so a project onboarded before its dependency gets linked. **Needs:** none.
  **assignee:** — PR [#55](https://github.com/Sourabh1805/devocd/pull/55).

- [ ] **T81 — (M) Sequential controller, ledger and resume.** `scripts/lib/orchestrate.mjs`:
  a unit state machine (planned → dispatched → proposed → validated → reviewed →
  approved → published, plus parked and blocked) persisted in `.devocd/runs/`; resume
  only when input fingerprints match. Shares completion semantics with T46; define a
  future T72 adapter without requiring canonical publication now. Implement the
  dispatch and transition contract in plan.md. **Quality first Phase 3.** **Needs:** T80, T94. **assignee:** —
- [ ] **T82 — (M) Independent review and the retry rule.** A fresh-context review of
  every validated proposal; at most 3 correction rounds, then 1 round one class up,
  then parked. Parked units stay incomplete, block dependent publication and never
  advance the refresh baseline; a required final review that is skipped stays a
  visible, blocking gate. Review uses a fresh invocation, never the author context.
  **Quality first Phase 3.** **Needs:** T81. **assignee:** —

### M2c — Company policy repo (design approved 2026-11-25)

One person owns company-wide policy in a git repo; each teammate's DevOCD reads it
from their own clone instead of keeping copies under `.devocd/standards/`. Design:
[2026-11-25-policy-repo-design.md](superpowers/specs/2026-11-25-policy-repo-design.md)
(PR [#86](https://github.com/Sourabh1805/devocd/pull/86)).

- [x] **T108 — (M) Policy repo config and preflight.** `policyRepo {path, remote, index,
  builtAt}` in company state, validated by `check`; `preflight` reports its status
  (ok, missing, not-a-clone, wrong-remote, moved) from read-only local git probes;
  `settings add-dir` also accepts the clone root. Brief: [T108](briefs/T108.md).
  **Needs:** T74 on `main`. **assignee:** DeepSeek
  PR [#87](https://github.com/Sourabh1805/devocd/pull/87).
- [ ] **T109 — (S) Install and setup ask for the policy repo.** One interview question
  (recommended: "No, add policies later"); a teammate without a clone gets the
  `git clone` line. **Needs:** T108. **assignee:** —
- [ ] **T110 — (S) Hook and startup text read the repo index.** `onPrompt` reads the
  index from the clone, links contained to the clone root after resolving links; one
  "policy repo not found" line per session; parent and project routes name the repo.
  **Needs:** T108, T74. **assignee:** —
- [ ] **T111 — (M) Graph and trace point at repo files.** `policy:<repo path>` nodes with
  sha256 and commit; `governed-by` edges through the index's topic slugs; refresh
  records `builtAt`; the graph never writes into the repo. **Needs:** T108. **assignee:** —
- [ ] **T112 — (M) `check` policy-repo rules.** missing, wrong-remote, version, changed
  (governed pages marked stale), missing-target, unused (`policyUnusedDays`, default
  90), duplicate. **Needs:** T111. **assignee:** —
- [ ] **T113 — (M, heavy) Policy changes as a pull request.** Repo mode of
  company-policy: show the diff, approve, clean-clone check, branch
  `devocd/policy-<slug>-<yyyymmdd>`, commit with the repo's own git config, secret scan,
  push that branch only, `gh pr create`; without `gh` the branch stays local and the
  body is printed. Never the default branch, never merge. **Needs:** T110.
  **assignee:** controller
- [ ] **T114 — (S) Move local standards into the repo.** One PR adding the existing
  `.devocd/standards/` files and an index; switch over after it is merged and pulled;
  the local folder is backed up and removed with approval. **Needs:** T113. **assignee:** —

### M3 — Release candidate: every gate passes

- [x] **T65 — CI green on three OSes.** GitHub Actions is running again and green on
  Windows, Ubuntu and macOS (run 44611820826 on `ab71c08`, 2026-11-20). The release
  commit must still be green before the tag (T69). PR
  [#47](https://github.com/Sourabh1805/devocd/pull/47).
- [ ] **T66 — Live run on the demo workspace.** Replaces T1 and T2: fresh
  `/devocd:setup --all` on the five-project demo with current code, about 7
  interactions, all projects current, review, refresh, capture approve and
  decline. After T103, run the shipped core; add learn/canonical scenarios only if
  that branch is selected and implemented. **Needs:** T103. **assignee:** —
- [ ] **T51 — Measure minimum context for correct behaviour.** Three real tasks, plain
  assistant vs DevOCD before dedupe and after: correctness, tool calls, real tokens used,
  replacing fixed weights. Replaces T24 and T40. Gate: DevOCD at least as correct.
  Re-run T94 after Phase 3 and carry the result into T103. **Needs:** T94, Phase 3. **assignee:** —
- [ ] **T67 — Clean install.** Marketplace install on fresh Windows and macOS profiles,
  no checkout, setup works for the T103-selected scope. **Needs:** T103. **assignee:** —
- [ ] **T73 — Security review.** The selected release workflows and hooks against
  SECURITY.md: PR text and review comments as untrusted data (prompt-injection
  fixtures that tell the assistant to approve, write or publish), `gh` token never
  echoed or stored, publication paths refuse links and escapes, secrets never
  reach claims. Review the shipped core after T103; include learn/canonical publication
  only if selected and implemented. Findings fixed or documented. **Needs:** T103. **assignee:** —
- [ ] **T90 — (M) Live suite consolidation.** The 7 e2e suites become the scenarios T66
  needs, with one harness and recorded actual spend; overlapping scenarios are dropped;
  model-only safeguard scenarios from T60b live here. **Needs:** T66 scope agreed.
  **assignee:** —
- [ ] **T68 — Pilot.** Tag `v1.0.0-rc.1`; one or two people use it for a week; every
  issue fixed or documented. **Needs:** T66, T51, T67, T73, T60b. **assignee:** —

### M4 — Launch v1.0.0

- [x] **T28 — License and icon.** **Needs:** none. **assignee:** —
  PR [#49](https://github.com/Sourabh1805/devocd/pull/49).
- [ ] **T28b — Final plugin name.** Decide the name before release; a later rename breaks
  installs and the marketplace entry. **Needs:** none. **assignee:** —
- [ ] **T69 — Release.** `plugin.json` 1.0.0, CHANGELOG, release notes, tag, GitHub
  release, marketplace entry. **Needs:** T68, T28, T28b, T65. **assignee:** —
- [ ] **T70 — Final docs.** README quick start, known limitations, security notes
  match the release. **Needs:** T68. **assignee:** —

### Order and hand-out

The Quality first phases override the historical sequence below. Paused M2 work is
not dispatched until T103 selects it; T81/T82 are the explicit Phase 3 exceptions.

- **Now, in parallel:** T54, T56, T16, T60, T62, T46, T47, T27, T28, T77, T78, T76, T75,
  T74, T86.
- **Contracts and cleanup:** T87 and T89 after T56 (T89 also after T63); T88 with T60;
  T90 with T66; T92 done 2026-11-20.
- **Then:** T91 → T57, T11b, T71 → T64 (with deterministic T60b checks) → T22 → T23, T48,
  T21 → T72 → T61, T63, T49, T50 → T73, T51, T66, T67 → T60b (model-only rows) →
  T68 → T69, T70.
- **Policy repo (M2c):** T108 → T109 and T111 → T110 → T112 → T113 → T114.
- **Good for Codex (mechanical, clear done-tests):** T55, T59, T61, T62, T63, T69.
- **Keep with the architect (shapes the design):** T54, T56, T57, T60, T71, T22, T23,
  T72, T50, T73.

### After v1 (deferred)

**Worker tiers:** T79, T80 and T85 are merged. T81/T82 are now scheduled in
Quality first Phase 3, with T104 connecting the entry skills to their shared contracts.
Parallel builders (T18) remain deferred until the sequential controller, review and
resume path are proven. Existing classifier/proposal helpers are not a running controller.

T4b cached index, T5 company graph, T8 retrieval eval set (folded into T51 for v1),
T10 viewer, T14b journal-gated reminders, T18 parallel builder, T20 capture approval
check, T25 inventory polish, T26 detector polish, T43
(covered by this section), T52 artifact map, T53 chats and memory as question sources.

## Earlier stages (history and detail)

### Stage 0 — Prove what is merged (no dependencies, start now)

→ [plan.md, Roadmap v2](archive/plan-history.md#roadmap-v2-2026-11-14-from-main-dca7e06)

- [ ] **T1 — Manual e2e on the demo workspace.** Fresh `/devocd:setup --all` in the
  demo workspace: count interactions (about 7), check `refresh-status` is current for
  all five projects, judge page quality, try capture approve and decline, count Stop-hook
  firings over ten turns, and measure baseline launch tokens. Output is a results note.
  **Needs:** none. **assignee:** —
- [ ] **T2 — Live e2e suite.** Run `DEVOCD_LIVE=1 node --test tests/e2e/`, then fix or
  record whatever fails. **Needs:** none. **assignee:** —

### Stage 1 — One index: make the graph carry meaning

→ [plan.md, Roadmap v2](archive/plan-history.md#roadmap-v2-2026-11-14-from-main-dca7e06)

- [x] **T3 — Structured page header.** Add fixed, parseable `Scope:`, `Standards:`,
  `Uses:` and `Evidence:` lines to every module and flow page, with a parser and tests.
  Old pages still parse, with empty fields. Done: format, parser (`pagemeta.mjs`) and
  contract; helpers start consuming it in T4/T6. **Needs:** none. **assignee:** —
- [x] **T4a — Typed graph nodes and edges.** The index is built from the T3
  headers: nodes get a kind and scope paths, edges are typed (parent, links,
  governed-by, uses, depends-on, evidence), and links leaving `.devocd/` are kept as
  external references. A bad file is skipped with a warning, and queries reuse the saved
  index when page hashes match. Done: kinds, typed edges (parent, links, governed-by),
  external refs, evidence map, bad files skipped. **Needs:** T3. **assignee:** —
- [ ] **T4b — Cached index for queries.** Queries read the saved index when page hashes
  match instead of rebuilding on every call. **Needs:** T4a. **assignee:** —
- [ ] **T5 — Company graph.** Add project nodes, policy nodes and `depends-on` edges from
  the dependency detector, with cross-project links resolved through the registry.
  **Needs:** T4. **assignee:** —
- [x] **T6 — Content checks.** `check` gains rules for required sections, the `Standards:`
  line, parseable evidence, per-page staleness and well-formed `decisions.md` entries.
  Warnings first, so existing installs do not start failing. **Needs:** T3.
  **assignee:** — Done: page header/sections/standards/evidence warnings, per-page evidence/stale, decisions.md format, links and cycles.

### Stage 2 — Retrieval that works with natural wording

→ [plan.md, Roadmap v2](archive/plan-history.md#roadmap-v2-2026-11-14-from-main-dca7e06)

- [x] **T7 — Ranked search.** Strip punctuation and stop words, apply light stemming, match
  on any term and rank by field weight with a neighbour boost and a best-line snippet.
  One search module serves both the CLI and the viewer. **Needs:** T4. **assignee:** — Done: shared ranked search (stop words, stemming, field weights, idf, neighbour boost, snippets) used by CLI, route, trace and viewer.
- [ ] **T8 — Retrieval evaluation set.** Golden queries with expected top-3 pages (start
  with "why are END events ignored", "can moving a folder lose state", "why do normal
  discounts fail") as a unit fixture, so search quality cannot regress. **Needs:** T7.
  **assignee:** —
- [x] **T9 — `trace` command.** `trace <source-path | words>` returns the leaf page, the
  parent chain, governing policy files, relevant decisions, per-page freshness and the
  next hop. **Needs:** T4. **assignee:** — Done: `devocd trace` (path and words modes, chain, policies, per-page freshness; returns the decisions page as a pointer; per-path relevant decisions come with T21); canonical resolver integration comes with T22.
- [ ] **T10 — Viewer upgrade.** Show edge types and node kinds, freshness badges and a
  hierarchical layout, and drop the 60-node cap by paging through scopes.
  **Needs:** T4, T7. **assignee:** —

### Stage 3 — Delivery at the moment of need (the leaf-first stage)

→ [plan.md, Roadmap v2](archive/plan-history.md#roadmap-v2-2026-11-14-from-main-dca7e06)

- [x] **T11 — `bin/devocd` launcher.** A bare `devocd` command (with a Windows `.cmd`) so
  the main session can run `devocd trace …`. Setup offers one opt-in to allow the
  read-only subcommands, and the pointer and docs switch to the bare command.
  Done: launcher and tests. The settings opt-in for read-only subcommands is split out as T11b.
  **Needs:** none. **assignee:** —
- **T11b** — moved up: the task itself is in [Road to v1](#road-to-v1-checklist), M2.
- [x] **T12 — Path-scoped rule stubs.** Compile writes a short rule file per module page
  that loads only when a matching source file is touched, holding purpose, entry point,
  pitfalls, governing policies and a stale marker. The folder is git-excluded. First
  confirm the loading behaviour; if it fails, fall back to the T13 hook. **Needs:** T4.
  **assignee:** — Done: generated path-scoped notes (verified live: load only on matching file reads, git-excluded).
- [x] **T13 — Hooks that replace routing text.** A prompt hook injects only matching
  policy pointers, an edit hook journals touched paths and marks citing pages stale, and
  a session-start hook says one line only if stale pages exist. All are fast, read
  bounded local state and can be opted out per scope. **Needs:** T4, T9. **assignee:** — Done: prompt policy pointers, edit journal with stale marking, session-start stale notice; opt-out devocdHooks.
- [x] **T14a — Immediate capture repair (PR 1).** Automatic Stop reminders default
  off; tri-state preferences inherit only through validated project/company
  registration. Canonical plugin entry guard, malformed/linked-state refusal and
  ten-event subprocess replay covered. Stop means end of response, not task completion.
  Explicit capture and approval/history remain available. No T13 dependency.
- [ ] **T14b — Journal-gated reminders.** Fire only when the T13 journal shows edits
  in scope since the last nudge. **Needs:** T13. **assignee:** —
  A live ten-conversation-turn trial remains outstanding; deterministic hook-event
  replay is not a live trial.
- [x] **T15 — Slim the always-on files.** The parent keeps the name, hard prohibitions and
  two pointers; the pointer shrinks to three lines or fewer. Routing lines move to rule
  stubs and `trace` output, with lower writing targets and a near-cap parent test.
  **Needs:** T11, T12, T13. **assignee:** — Done: parent guidance 5→3 lines, pointer 10→4 bullets, trace flags canonical context; routing moved to rule notes, trace and hooks.
- **T16** — moved up: the task itself is in [Road to v1](#road-to-v1-checklist), M1.

### Stage 4 — Refresh proportional to change

→ [plan.md, Roadmap v2](archive/plan-history.md#roadmap-v2-2026-11-14-from-main-dca7e06)

- [x] **T17 — Incremental refresh.** `refresh-plan` uses the evidence map to list the
  affected pages and their dependents, the builder rewrites only those, and the baseline
  records per-page status. A change touching no cited file needs discovery only for new
  files. **Needs:** T4, T6. **assignee:** — Done: refresh-plan impact analysis (cited, in-scope, unmapped, parents) and an incremental builder path; full rebuild only when needed.
- [ ] **T18 — Parallel builder.** add-project fans out one builder per top-level subtree
  and merges the drafts; setup builds projects in parallel but keeps approvals
  sequential. Refresh and add-project run as forked subagents. **Needs:** T3.
  **assignee:** —

### Stage 5 — Smarter skills on top of the index

→ [plan.md, Roadmap v2](archive/plan-history.md#roadmap-v2-2026-11-14-from-main-dca7e06)

- [x] **T19 — pr-review uses the index.** For changed files, `trace` supplies governing
  policies, decisions and module pitfalls, and findings cite the rule and the page.
  **Needs:** T9, T11. **assignee:** —
- [ ] **T20 — Capture approval check.** A read-only helper verifies the history record
  exists before the README edit, since auto mode may show no permission prompt.
  **Needs:** none. **assignee:** —
- **T21** — moved up: the task itself is in [Road to v1](#road-to-v1-checklist), M2.

### Stage 6 — Converge with the canonical model

→ [plan.md, Roadmap v2](archive/plan-history.md#roadmap-v2-2026-11-14-from-main-dca7e06)

- **T22** — moved up: the task itself is in [Road to v1](#road-to-v1-checklist), M2.
- **T23** — moved up: the task itself is in [Road to v1](#road-to-v1-checklist), M2.

### Stage 7 — Measure, polish, release

→ [plan.md, Roadmap v2](archive/plan-history.md#roadmap-v2-2026-11-14-from-main-dca7e06)

- [ ] **T24 — Measure.** Compare launch tokens before and after Stage 3, and run three real
  tasks on plain assistant vs short index vs full DevOCD. **Needs:** T15.
  **assignee:** —
- [ ] **T25 — Inventory polish.** Count notebook bytes toward the 16 MiB budget, treat
  `.out`/`.dat`/`.map` as bulk, and make the fingerprint printed by `knowledge-inventory`
  match what it shows. **Needs:** none. **assignee:** —
- [ ] **T26 — Detector polish.** Handle the bun lockfile, tolerate EACCES, anchor the TOML
  regex, support PEP 621 and go.mod git requires, and add a walk-cap marker.
  **Needs:** none. **assignee:** —
- **T27** — moved up: the task itself is in [Road to v1](#road-to-v1-checklist), M2.
- **T28** — moved up: the task itself is in [Road to v1](#road-to-v1-checklist), M4.
- [ ] **T29 — One glob dialect.** `trace.mjs` and `check.mjs` each translate globs
  differently (braces, `**/`, Windows case); share one helper and test both callers.
  **Needs:** none. **assignee:** —

### Stage 8 — Learn from history and map artifact dependencies

→ [plan.md, Stage 8](archive/plan-history.md#stage-8--learn-from-history-and-artifact-map-2026-11-17).
After a trust review (2026-11-17) the open Stage 8 tasks are **replaced by Stage 9**:
collecting history is easy; deciding what it proves, where it applies and when to stop
trusting it comes first.

- [x] **T30 — Artifact detector.** Images, S3, registries, Terraform/Helm sources with
  `file:line`; credentials stripped. PR [#30](https://github.com/Sourabh1805/devocd/pull/30).
- [ ] ~~T31 — Artifacts page and company artifact map.~~ Reduced → **T52**.
- [ ] ~~T32 — History evidence lines.~~ Replaced → **T48** (one evidence model).
- [ ] ~~T33 — `history-prs` helper.~~ Folded into **T49**.
- [ ] ~~T34 — `history-chats` helper.~~ Postponed → **T53**.
- [ ] ~~T35 — `/devocd:learn` skill.~~ Narrowed → **T49** (PR history only).
- [ ] ~~T36 — pr-review uses the conventions.~~ Replaced → **T50**.
- [ ] ~~T37 — Live learn run.~~ Part of **T49** and **T51**.

### Stage 8b — Work with Claude Code memory; no repeated text across layers

→ [plan.md, Stage 8b](archive/plan-history.md#stage-8b--addendum-2026-11-17-work-with-claude-codes-own-memory-and-no-repeated-text-across-layers)

Each fact has one home: personal preferences in Claude Code auto memory, shared project
facts in `.devocd/`, team instructions in the team's `CLAUDE.md`, company policy in
`standards/`. Every other layer links or cites it.

- [x] **T38 — Layered redundancy check.** `context/repeated` across team files, auto
  memory, parent, standards, pointer, pages and decisions; names the keeping layer.
  PR [#32](https://github.com/Sourabh1805/devocd/pull/32).
- [ ] ~~T39 — Use Claude Code memory instead of duplicating it.~~ Postponed → **T53**.
- [ ] ~~T40 — Measure the savings.~~ Replaced → **T51**.

### Stage 9 — Trustworthy learning (from the 2026-11-17 trust review)

→ [plan.md, Stage 9](archive/plan-history.md#stage-9--trustworthy-learning-2026-11-17)

**First: fix what is merged**

- [x] **T41 — Redundancy check: estimates and scope words.** The message says
  "estimated weight", not tokens saved; a near match that differs in a scope word
  (production/development, an environment, a region, must/should) is skipped or
  information only. Test: "Production deployments require approval" vs "Development
  deployments require approval" is not a repeat. **Needs:** none. **assignee:** —
  PR [#34](https://github.com/Sourabh1805/devocd/pull/34).
- [x] **T42 — Artifact levels.** Each artifact gets `level: declared | built | published`
  (a local `docker build -t` is `built`, a CI push or upload is `published`), keeping
  registry, account and environment when visible. Test: two similar image names in
  different accounts or environments stay different. **Needs:** none. **assignee:** —
  PR [#33](https://github.com/Sourabh1805/devocd/pull/33).
- [ ] **T43 — Rewrite Stage 8/8b in plan.md.** Re-scope around Stage 9; remove the
  "learn records a refresh baseline" step; mark chat/memory ingestion, convention
  promotion and the artifact map postponed. **Needs:** none. **assignee:** —

**Second: the contract before more learning code**

- [x] **T44 — Claim record.** One small shape for every learned statement: category
  (`source-fact`, `practice`, `decision`, `policy`, `hypothesis`), authority (who can make
  it binding), scope (project, paths, environment), evidence (file + hash, `PR #n` with
  merged/reverted state, session), origin (human, team, assistant), status (proposed,
  accepted, superseded, rejected), and as-of: "recorded reason then" vs "current code
  still follows it". Deterministic validator; approving a summary never makes a policy.
  **Needs:** none. **assignee:** —
  PR [#35](https://github.com/Sourabh1805/devocd/pull/35).
- [x] **T45 — Learning evaluation fixture.** A fixture repo and fake PR history with
  expected results for: an accepted decision and a rejected suggestion; a reverted PR; a
  practice that conflicts with company policy; an assistant guess repeated in three places
  (one guess, not three sources); an unrelated source change that must stay stale; two
  similar artifact names in different environments. Learning tests are `todo` until `learnFromHistory` (T49) exists, then run for real.
  **Needs:** T44. **assignee:** —
  PR [#36](https://github.com/Sourabh1805/devocd/pull/36).
- **T46** — moved up: the task itself is in [Road to v1](#road-to-v1-checklist), M2.
- **T47** — moved up: the task itself is in [Road to v1](#road-to-v1-checklist), M2.
- **T48** — moved up: the task itself is in [Road to v1](#road-to-v1-checklist), M2.

**Third: the narrow learning workflow**

- **T49** — moved up: the task itself is in [Road to v1](#road-to-v1-checklist), M2.
- **T50** — moved up: the task itself is in [Road to v1](#road-to-v1-checklist), M2.
- **T51** — moved up: the task itself is in [Road to v1](#road-to-v1-checklist), M3.

**Later, only after T49–T51 work**

- [ ] **T52 — Company artifact map with candidate links.** A producer→consumer link is
  `candidate` unless both sides are `published`/consumed in the same registry, account and
  environment (`verified-by-config`). Fixture environment case passes. **Needs:** T42,
  T49. **assignee:** —
- [ ] **T53 — Chats and memory as question sources.** Transcripts and auto memory yield
  open questions and hypotheses, never decisions; a promoted memory fact tells the user
  to delete the memory file and its `MEMORY.md` line; DevOCD never writes memory files.
  **Needs:** T47, T49. **assignee:** —

### Risks

- Hooks run on every prompt and edit, so they must stay fast and read only the saved index.
- Rule stubs add `.claude/rules/devocd/` to user projects: local-excluded, never tracked.
- Structured headers only work if the builder writes them consistently; T6 enforces it.
- Delivery relies on Claude Code features; Codex/Antigravity gain only `trace` and search.
