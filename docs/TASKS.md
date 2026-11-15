# DevOCD task list

One task = one pull request. Mark a task done by changing `[ ]` to `[x]`, and put a
name after **assignee** when you hand it out. The full reasoning behind each phase
lives in [plan.md](plan.md) — section names below match its headings.

Status today: everything under "Done" is merged to main — PR
[#13](https://github.com/Sourabh1805/devocd/pull/13) and PR
[#14](https://github.com/Sourabh1805/devocd/pull/14). Tasks under "Next" are not
started. The full reasoning is in plan.md under "Roadmap v2".

## Done (merged to main)

- [x] **Phase 0 — Rename `company-standards` → `company-policy`.** Skill name and docs
  only; the `.devocd/standards/` data layout is unchanged. → [plan.md Phase 0](plan.md#phase-0--rename-company-standards--company-policy)
- [x] **Phase 1 — Batch the add-project interview.** Derived defaults (id, description,
  commands via the new read-only `detect-commands` helper), ONE AskUserQuestion round,
  full draft files on disk under `.devocd/draft/` with a short summary in chat.
  → [plan.md Phase 1](plan.md#phase-1--add-project-derived-defaults--one-batched-question-round)
- [x] **Phase 2 — Batch the install interview + personal-workspace fast path.** The six
  per-topic source questions are gone; a personal workspace is one 3-question call plus
  one approval. → [plan.md Phase 2](plan.md#phase-2--install-personal-workspace-fast-path--one-batched-round)
- [x] **Phase 3 — Setup orchestration + `--yes`.** One upfront round (projects, folder
  kind, integration, mode), answers handoff files, one draft approval per unit: ~7
  interactions for 5 projects instead of ~30+. `--yes` never fabricates approval.
  → [plan.md Phase 3](plan.md#phase-3--setup-coordinator-one-upfront-round-answers-handoff---yes)
- [x] **Phase 4 — Fix setup→freshness.** Logs/lockfiles/assets are classified
  `irrelevant-bulk` instead of poisoning completeness; notebooks are read by cell
  source (outputs ignored, secrets in outputs still withheld); new `refresh-baseline`
  records freshness at setup so a fresh, unchanged project reports `current`.
  → [plan.md Phase 4](plan.md#phase-4--fix-setupfreshness-as-one-workflow-external-reviews-priority-1-verified)
- [x] **Phase 5 — Developer-grade pages, backtracking, dependencies, decisions.** Module
  pages require entry points / public surface / run-test / extension recipes / pitfalls
  plus a `Standards:` backtrack line to company policies; PROJECT.md links the company
  parent, splits documented vs approved commands, and gains Dependencies (new
  `detect-dependencies` helper: git deps, workspaces, submodules, nested repos) and
  thematic pages (`cicd.md`, `guides/`, `history.md`); durable `decisions.md` separates
  constraints from derived facts (idea from mindmuxai/brain.md).
  → [plan.md Phase 5](plan.md#phase-5--developer-grade-knowledge-output)
- [x] **Phase 6 — Company-policy pillar tests + required pointer.** Static and live
  checks for ingestion; pointers now treat recorded company rules as required, never
  optional. → [plan.md Phase 6](plan.md#phase-6--company-policy-pillar-polish)
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

## Next — pick and assign

### Stage 0 — Prove what is merged (no dependencies, start now)

→ [plan.md, Roadmap v2](plan.md#roadmap-v2-2026-11-14-from-main-dca7e06)

- [ ] **T1 — Manual e2e on the demo workspace.** Fresh `/devocd:setup --all` in the
  demo workspace: count interactions (about 7), check `refresh-status` is current for
  all five projects, judge page quality, try capture approve and decline, count Stop-hook
  firings over ten turns, and measure baseline launch tokens. Output is a results note.
  **Needs:** none. **assignee:** —
- [ ] **T2 — Live e2e suite.** Run `DEVOCD_LIVE=1 node --test tests/e2e/`, then fix or
  record whatever fails. **Needs:** none. **assignee:** —

### Stage 1 — One index: make the graph carry meaning

→ [plan.md, Roadmap v2](plan.md#roadmap-v2-2026-11-14-from-main-dca7e06)

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
- [ ] **T6 — Content checks.** `check` gains rules for required sections, the `Standards:`
  line, parseable evidence, per-page staleness and well-formed `decisions.md` entries.
  Warnings first, so existing installs do not start failing. **Needs:** T3.
  **assignee:** —

### Stage 2 — Retrieval that works with natural wording

→ [plan.md, Roadmap v2](plan.md#roadmap-v2-2026-11-14-from-main-dca7e06)

- [ ] **T7 — Ranked search.** Strip punctuation and stop words, apply light stemming, match
  on any term and rank by field weight with a neighbour boost and a best-line snippet.
  One search module serves both the CLI and the viewer. **Needs:** T4. **assignee:** —
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

→ [plan.md, Roadmap v2](plan.md#roadmap-v2-2026-11-14-from-main-dca7e06)

- [x] **T11 — `bin/devocd` launcher.** A bare `devocd` command (with a Windows `.cmd`) so
  the main session can run `devocd trace …`. Setup offers one opt-in to allow the
  read-only subcommands, and the pointer and docs switch to the bare command.
  Done: launcher and tests. The settings opt-in for read-only subcommands is split out as T11b.
  **Needs:** none. **assignee:** —
- [ ] **T11b — Allow read-only `devocd` subcommands without prompts.** Setup offers one
  opt-in that adds permission rules for the read-only subcommands to
  `.claude/settings.local.json`. **Needs:** T11. **assignee:** —
- [ ] **T12 — Path-scoped rule stubs.** Compile writes a short rule file per module page
  that loads only when a matching source file is touched, holding purpose, entry point,
  pitfalls, governing policies and a stale marker. The folder is git-excluded. First
  confirm the loading behaviour; if it fails, fall back to the T13 hook. **Needs:** T4.
  **assignee:** —
- [ ] **T13 — Hooks that replace routing text.** A prompt hook injects only matching
  policy pointers, an edit hook journals touched paths and marks citing pages stale, and
  a session-start hook says one line only if stale pages exist. All are fast, read
  bounded local state and can be opted out per scope. **Needs:** T4, T9. **assignee:** —
- [x] **T14a — Immediate capture repair (PR 1).** Automatic Stop reminders default
  off; tri-state preferences inherit only through validated project/company
  registration. Canonical plugin entry guard, malformed/linked-state refusal and
  ten-event subprocess replay covered. Stop means end of response, not task completion.
  Explicit capture and approval/history remain available. No T13 dependency.
- [ ] **T14b — Journal-gated reminders.** Fire only when the T13 journal shows edits
  in scope since the last nudge. **Needs:** T13. **assignee:** —
  A live ten-conversation-turn trial remains outstanding; deterministic hook-event
  replay is not a live trial.
- [ ] **T15 — Slim the always-on files.** The parent keeps the name, hard prohibitions and
  two pointers; the pointer shrinks to three lines or fewer. Routing lines move to rule
  stubs and `trace` output, with lower writing targets and a near-cap parent test.
  **Needs:** T11, T12, T13. **assignee:** —
- [ ] **T16 — Listing diet.** Merge the three optional investigator agents into one with a
  mode argument and add `when_to_use` only where it helps, targeting 160 or less.
  **Needs:** none. **assignee:** —

### Stage 4 — Refresh proportional to change

→ [plan.md, Roadmap v2](plan.md#roadmap-v2-2026-11-14-from-main-dca7e06)

- [ ] **T17 — Incremental refresh.** `refresh-plan` uses the evidence map to list the
  affected pages and their dependents, the builder rewrites only those, and the baseline
  records per-page status. A change touching no cited file needs discovery only for new
  files. **Needs:** T4, T6. **assignee:** —
- [ ] **T18 — Parallel builder.** add-project fans out one builder per top-level subtree
  and merges the drafts; setup builds projects in parallel but keeps approvals
  sequential. Refresh and add-project run as forked subagents. **Needs:** T3.
  **assignee:** —

### Stage 5 — Smarter skills on top of the index

→ [plan.md, Roadmap v2](plan.md#roadmap-v2-2026-11-14-from-main-dca7e06)

- [ ] **T19 — pr-review uses the index.** For changed files, `trace` supplies governing
  policies, decisions and module pitfalls, and findings cite the rule and the page.
  **Needs:** T9, T11. **assignee:** —
- [ ] **T20 — Capture approval check.** A read-only helper verifies the history record
  exists before the README edit, since auto mode may show no permission prompt.
  **Needs:** none. **assignee:** —
- [ ] **T21 — Decisions in the graph.** Parse `decisions.md` entries into decision nodes
  with `supersedes`/`retires` edges and scope, so trace returns only current decisions
  for a path. **Needs:** T4. **assignee:** —

### Stage 6 — Converge with the canonical model

→ [plan.md, Roadmap v2](plan.md#roadmap-v2-2026-11-14-from-main-dca7e06)

- [ ] **T22 — Generate the canonical model from the index.** Build module and flow
  records, evidence and `depends-on` from the index and publish through the existing
  atomic store after the same single approval, with no hand-written JSON. First fix the
  notebook hash and size-limit mismatches between inventory and evidence.
  **Needs:** T4, T5. **assignee:** —
- [ ] **T23 — Structured policies.** An optional key/value/exceptions header in standards
  files turns them into canonical policy records with conflict detection, and `trace` and
  the prompt hook then use the resolver. **Needs:** T22. **assignee:** —

### Stage 7 — Measure, polish, release

→ [plan.md, Roadmap v2](plan.md#roadmap-v2-2026-11-14-from-main-dca7e06)

- [ ] **T24 — Measure.** Compare launch tokens before and after Stage 3, and run three real
  tasks on plain assistant vs short index vs full DevOCD. **Needs:** T15.
  **assignee:** —
- [ ] **T25 — Inventory polish.** Count notebook bytes toward the 16 MiB budget, treat
  `.out`/`.dat`/`.map` as bulk, and make the fingerprint printed by `knowledge-inventory`
  match what it shows. **Needs:** none. **assignee:** —
- [ ] **T26 — Detector polish.** Handle the bun lockfile, tolerate EACCES, anchor the TOML
  regex, support PEP 621 and go.mod git requires, and add a walk-cap marker.
  **Needs:** none. **assignee:** —
- [ ] **T27 — Stale cross-project links on rerun.** Revisit cross-project links on a rerun
  so a project onboarded before its dependency gets linked. **Needs:** none.
  **assignee:** —
- [ ] **T28 — LICENSE and icon.** Pick a license and a plugin icon. **Needs:** none.
  **assignee:** —
- [ ] **T29 — One glob dialect.** `trace.mjs` and `check.mjs` each translate globs
  differently (braces, `**/`, Windows case); share one helper and test both callers.
  **Needs:** none. **assignee:** —

### What can be worked on in parallel

- Now, independent: T1, T2, T11, T16, T20, T25, T26, T28.
- After T3: T4, T6, T18. After T4: T5, T7, T9, T12, T21. Then Stage 3 in order.

### Risks

- Hooks run on every prompt and edit, so they must stay fast and read only the saved index.
- Rule stubs add `.claude/rules/devocd/` to user projects: local-excluded, never tracked.
- Structured headers only work if the builder writes them consistently; T6 enforces it.
- Delivery relies on Claude Code features; Codex/Antigravity gain only `trace` and search.
