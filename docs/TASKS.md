# DevOCD task list

One task = one pull request. Mark a task done by changing `[ ]` to `[x]`, and put a
name after **assignee** when you hand it out. The full reasoning behind each phase
lives in [plan.md](plan.md) — section names below match its headings.

Start at **Road to v1** below: it is the ordered plan of record for the first release.
Everything under "Done" is merged; "Earlier stages" keeps the history and detail.

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
- [ ] **T55 — One directory walker.** `fsutil.walk(root, { skipDirs, maxEntries, maxBytes })`,
  never following links, replaces the 8 hand-written walkers. **Needs:** none.
  **assignee:** —
- [ ] **T56 — CLI command table.** Each command declared once (name, arguments,
  read-only, handler); argument checks and usage are generated; a test checks skill
  grants only name read-only commands where required. **Needs:** none. **assignee:** —
- [ ] **T57 — `check` as rule modules.** One runner over state, links, budget, secrets,
  content and repetition modules; identical output. **Needs:** T54. **assignee:** —
- [ ] **T16 — Listing diet.** Merge the three optional investigators into one agent with
  a mode, freeing listing budget for `/devocd:learn`. **Needs:** none. **assignee:** —
- [ ] **T59 — Docs cleanup.** Archive `master-prompt.md` and the superseded plan phases
  under `docs/archive/`; fold `guide.md` into the READMEs. **Needs:** none.
  **assignee:** —

### M1b — Test diet: fewer, faster, stronger tests

Target: about 350 tests, unit suite under 20 s, test code no larger than plugin code,
with no loss of protection (B5 proves it).

- [ ] **T60 — One contract test per skill.** Frontmatter, grants equal the commands the
  body runs, token budget, referenced files exist, `$ARGUMENTS` once. The wording
  assertions go; behaviour is proven by live runs and evals. **Needs:** none.
  **assignee:** —
- [ ] **T61 — Table tests.** Near-identical cases (parent-draft refusals, split, protect,
  settings, CLI exit codes) become one table each. **Needs:** T62. **assignee:** —
- [ ] **T62 — One fixture builder.** `tests/helpers/workspace.mjs` builds company,
  projects, pages and memory with auto-cleanup; replaces 28 local temp-dir fixtures
  and the overlapping helpers. **Needs:** none. **assignee:** —
- [ ] **T63 — Fast tests.** Slow CLI-spawning matrices call the library; one CLI smoke
  test per command keeps exit codes covered. **Needs:** T56. **assignee:** —
- [ ] **T64 — Coverage gate and test rules.** Line coverage of `scripts/lib` at least
  85% in CI; a small mutation spot-check for claims, redundancy, refresh and trace;
  testing rules written into `AGENTS.md` (behaviour at module boundaries, one test
  per rule, tables for variants, never pin prose). **Needs:** T60–T63. **assignee:** —

### M2 — Feature-complete: one pipeline, learning included

- [ ] **T22 — Canonical model compiled from the Markdown graph.** Module, flow,
  policy and decision records, scopes and evidence generated from pages; published
  through the existing atomic store after the same approval; no hand-written JSON.
  The `context-*` system stops being parallel. **Needs:** T54, T57. **assignee:** —
- [ ] **T48 — One evidence model.** The canonical model accepts PR and session evidence
  beside file + hash; Markdown evidence lines are generated from it. **Needs:** T22.
  **assignee:** —
- [ ] **T21 — Decisions in the graph.** Decision entries become records with
  supersedes/retires links, so retrieval returns only current decisions.
  **Needs:** T22. **assignee:** —
- [ ] **T46 — Separate completion states.** `historyCollected`, `knowledgePublished`,
  `sourceRefreshed`; only the snapshot refresh sets the last. **Needs:** none.
  **assignee:** —
- [ ] **T47 — Claim origin and independence.** Assistant text stays a hypothesis;
  copies count once. **Needs:** none. **assignee:** —
- [ ] **T49 — `/devocd:learn` from PR history.** Last month of merged PRs, repetition
  skipped, claims drafted, approved into the canonical model; never a policy, never
  a refresh. All T45 fixture cases pass (no `todo` left). **Needs:** T16, T46, T47,
  T48. **assignee:** —
- [ ] **T50 — Retrieval answers a task.** `trace` and `review-context` resolve through
  the canonical model: files that matter, binding rules vs suggestions, conflicts,
  what cannot be established, evidence to open next; pr-review uses it.
  **Needs:** T22, T21. **assignee:** —
- [ ] **T11b — No prompts for read-only commands.** Setup offers one opt-in.
  **Needs:** T56. **assignee:** —
- [ ] **T27 — Stale cross-project links on rerun.** **Needs:** none. **assignee:** —

### M3 — Release candidate: every gate passes

- [ ] **T65 — CI green on three OSes.** Fix GitHub Actions billing; the release commit
  is green on Windows, Linux and macOS. **Needs:** none. **assignee:** —
- [ ] **T66 — Live run on the demo workspace.** Replaces T1 and T2: fresh
  `/devocd:setup --all` on the five-project demo with current code, about 7
  interactions, all projects current, learn, review, refresh, capture approve and
  decline; live suite within an agreed budget. **Needs:** M2. **assignee:** —
- [ ] **T51 — Measure minimum context.** Three real tasks, plain assistant vs DevOCD:
  correctness, tool calls, real tokens. Gate: DevOCD at least as correct.
  **Needs:** T50. **assignee:** —
- [ ] **T67 — Clean install.** Marketplace install on fresh Windows and macOS profiles,
  no checkout, setup works. **Needs:** M2. **assignee:** —
- [ ] **T68 — Pilot.** Tag `v1.0.0-rc.1`; one or two people use it for a week; every
  issue fixed or documented. **Needs:** T65, T66, T51, T67. **assignee:** —

### M4 — Launch v1.0.0

- [ ] **T28 — License, icon and final name.** **Needs:** none. **assignee:** —
- [ ] **T69 — Release.** `plugin.json` 1.0.0, CHANGELOG, release notes, tag, GitHub
  release, marketplace entry. **Needs:** T68, T28. **assignee:** —
- [ ] **T70 — Final docs.** README quick start, known limitations, security notes
  match the release. **Needs:** T68. **assignee:** —

### Order and hand-out

- **Now, in parallel:** T54, T55, T56, T16, T59, T60, T62, T46, T47, T27, T28, T65.
- **Then:** T57, T61, T63, T11b → T64 → T22 → T48, T21 → T49, T50 → T51, T66, T67 →
  T68 → T69, T70.
- **Good for Codex (mechanical, clear done-tests):** T55, T59, T61, T62, T63, T69.
- **Keep with the architect (shapes the design):** T54, T56, T57, T60, T22, T50.

### After v1 (deferred)

T4b cached index, T5 company graph, T8 retrieval eval set (folded into T51 for v1),
T10 viewer, T14b journal-gated reminders, T18 parallel builder, T20 capture approval
check, T23 structured policies, T25 inventory polish, T26 detector polish, T43
(covered by this section), T52 artifact map, T53 chats and memory as question sources.

## Earlier stages (history and detail)

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
- [x] **T6 — Content checks.** `check` gains rules for required sections, the `Standards:`
  line, parseable evidence, per-page staleness and well-formed `decisions.md` entries.
  Warnings first, so existing installs do not start failing. **Needs:** T3.
  **assignee:** — Done: page header/sections/standards/evidence warnings, per-page evidence/stale, decisions.md format, links and cycles.

### Stage 2 — Retrieval that works with natural wording

→ [plan.md, Roadmap v2](plan.md#roadmap-v2-2026-11-14-from-main-dca7e06)

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

→ [plan.md, Roadmap v2](plan.md#roadmap-v2-2026-11-14-from-main-dca7e06)

- [x] **T11 — `bin/devocd` launcher.** A bare `devocd` command (with a Windows `.cmd`) so
  the main session can run `devocd trace …`. Setup offers one opt-in to allow the
  read-only subcommands, and the pointer and docs switch to the bare command.
  Done: launcher and tests. The settings opt-in for read-only subcommands is split out as T11b.
  **Needs:** none. **assignee:** —
- [ ] **T11b — Allow read-only `devocd` subcommands without prompts.** Setup offers one
  opt-in that adds permission rules for the read-only subcommands to
  `.claude/settings.local.json`. **Needs:** T11. **assignee:** —
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
- [ ] **T16 — Listing diet.** Merge the three optional investigator agents into one with a
  mode argument and add `when_to_use` only where it helps, targeting 160 or less.
  **Needs:** none. **assignee:** —

### Stage 4 — Refresh proportional to change

→ [plan.md, Roadmap v2](plan.md#roadmap-v2-2026-11-14-from-main-dca7e06)

- [x] **T17 — Incremental refresh.** `refresh-plan` uses the evidence map to list the
  affected pages and their dependents, the builder rewrites only those, and the baseline
  records per-page status. A change touching no cited file needs discovery only for new
  files. **Needs:** T4, T6. **assignee:** — Done: refresh-plan impact analysis (cited, in-scope, unmapped, parents) and an incremental builder path; full rebuild only when needed.
- [ ] **T18 — Parallel builder.** add-project fans out one builder per top-level subtree
  and merges the drafts; setup builds projects in parallel but keeps approvals
  sequential. Refresh and add-project run as forked subagents. **Needs:** T3.
  **assignee:** —

### Stage 5 — Smarter skills on top of the index

→ [plan.md, Roadmap v2](plan.md#roadmap-v2-2026-11-14-from-main-dca7e06)

- [x] **T19 — pr-review uses the index.** For changed files, `trace` supplies governing
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

### Stage 8 — Learn from history and map artifact dependencies

→ [plan.md, Stage 8](plan.md#stage-8--learn-from-history-and-artifact-map-2026-11-17).
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

→ [plan.md, Stage 8b](plan.md#stage-8b--addendum-2026-11-17-work-with-claude-codes-own-memory-and-no-repeated-text-across-layers)

Each fact has one home: personal preferences in Claude Code auto memory, shared project
facts in `.devocd/`, team instructions in the team's `CLAUDE.md`, company policy in
`standards/`. Every other layer links or cites it.

- [x] **T38 — Layered redundancy check.** `context/repeated` across team files, auto
  memory, parent, standards, pointer, pages and decisions; names the keeping layer.
  PR [#32](https://github.com/Sourabh1805/devocd/pull/32).
- [ ] ~~T39 — Use Claude Code memory instead of duplicating it.~~ Postponed → **T53**.
- [ ] ~~T40 — Measure the savings.~~ Replaced → **T51**.

### Stage 9 — Trustworthy learning (from the 2026-11-17 trust review)

→ [plan.md, Stage 9](plan.md#stage-9--trustworthy-learning-2026-11-17)

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
- [ ] **T46 — Refresh coverage stays separate.** State records `historyCollected`,
  `knowledgePublished` and `sourceRefreshed` separately; only the snapshot refresh sets
  `sourceRefreshed`; history never narrows the refresh set; a failed or declined step
  advances nothing; an interrupted publish recovers or rolls back. **Needs:** T44.
  **assignee:** —
- [ ] **T47 — Claim origin and independence.** Assistant text is origin `assistant` and
  can only become a `hypothesis` or an open question; copies of one statement count as one
  source. Fixture case 4 passes. **Needs:** T44, T45. **assignee:** —
- [ ] **T48 — One evidence model.** The canonical model accepts PR and session evidence
  beside file + hash (merged, reverted, rejected); Markdown evidence lines are generated
  from it, not a second trust system. **Needs:** T44. **assignee:** —

**Third: the narrow learning workflow**

- [ ] **T49 — Learn from PR history only.** `/devocd:learn` reads the last month of
  merged PRs, skips bots, lockfile bumps and repeated directions, and drafts claims in the
  T44 shape; handles reverted PRs and rejected review suggestions; never creates a policy;
  never touches the refresh baseline. Fixture cases 1–3 pass. **Needs:** T45, T46, T47,
  T48. **assignee:** —
- [ ] **T50 — Retrieval answers a task.** `trace` and `review-context` answer "for this
  change": files that matter, binding rules vs suggestions, conflicting claims, what
  cannot be established, and the evidence to open next; claims filtered by path and
  environment; pr-review uses it. **Needs:** T44. **assignee:** —
- [ ] **T51 — Measure minimum context for correct behaviour.** The same three tasks on
  the plain assistant, DevOCD before dedupe and after: correctness, tool calls and real
  tokens used, replacing fixed weights. Replaces T24 and T40. **Needs:** T50.
  **assignee:** —

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
