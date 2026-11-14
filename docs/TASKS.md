# DevOCD task list

One task = one pull request. Mark a task done by changing `[ ]` to `[x]`, and put a
name after **assignee** when you hand it out. The full reasoning behind each phase
lives in [plan.md](plan.md) — section names below match its headings.

Status today: everything in "Done" is on PR [#13](https://github.com/Sourabh1805/devocd/pull/13)
(`feat/streamlined-setup` → `main`), 322 unit tests passing. Tasks under "Next" are
not started.

## Done (PR [#13](https://github.com/Sourabh1805/devocd/pull/13))

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

## Next — pick and assign

### Validation (do these first)

- [ ] **Task 1 — Manual e2e on the demo workspace.** Fresh `/devocd:setup --all` in
  `D:\work\demo\demo1\projects`: count interactions (target ~7 for 5 projects), check
  `refresh-status` says `current` for all five (including Integration-demo with its
  log and Wine with its notebooks), open a few `code/*/index.md` pages and judge them
  as coding aids, follow a `Standards:` line up to the company file.
  **assignee:** — → verification table in [plan.md](plan.md#sequencing-and-verification)
- [ ] **Task 2 — Run the live e2e suite.** `DEVOCD_LIVE=1 node --test tests/e2e/`,
  including the new personal-install and company-policy ingestion cases. Spend-capped,
  never in CI. **assignee:** —

### Features

- [ ] **Task 3 — Connect the canonical context model to normal setup.** A normal setup
  should produce a validated generation (`context-publish`) and use the resolver for
  later tasks; today the strongest architecture is opt-in only. (External review
  priority 3.) **assignee:** —
- [ ] **Task 4 — Make task lookup explain its choices.** One small result showing the
  selected files, applicable policies, freshness and missing evidence. (Review
  priority 4.) **assignee:** —
- [ ] **Task 5 — Measure three real tasks against baselines.** "Why are END events
  ignored", "can moving a folder lose state", "why do normal discounts fail" — plain
  assistant vs concise index vs full DevOCD; compare correctness, policy preservation,
  effort, latency, cost. (Review priority 6.) **assignee:** —
- [ ] **Task 6 — brain.md-style decision capture during work.** After an approved
  architectural decision, offer a small `decisions.md` update instead of a rescan;
  explicit approval, history kept. → [plan.md, brain.md ideas](plan.md#rating-of-the-idea-vs-the-repo)
  **assignee:** —
- [ ] **Task 7 — Company-graph depends-on edges.** Workspace-level graph shows which
  project imports which, built from the per-project Dependencies data. **assignee:** —
- [ ] **Task 8 — Smarter knowledge search.** Natural task wording should rank the right
  page first (literal all-terms search misses questions like "why are END events
  ignored"). **assignee:** —

### Polish (deferred review minors)

- [ ] **Task 9 — Inventory polish.** Count notebook raw bytes toward the 16 MiB budget;
  reconsider `.out`/`.dat`/`.map` in the bulk list; upgrade note for pre-branch
  baselines (one-time spurious `source-changed`). **assignee:** —
- [ ] **Task 10 — Detector polish.** bun.lockb command suggestions; tolerate EACCES per
  manifest; anchor the TOML dependency regex to dependency sections; detect PEP 621
  arrays and go.mod git requires; truncation marker for the 5000-entry walk cap.
  **assignee:** —
- [ ] **Task 11 — Refresh stale cross-project links on rerun.** In sequential setup,
  project A onboarded before B never links B; a rerun pass should revisit Dependencies
  links. **assignee:** —

### Release

- [ ] **Task 12 — Marketing step: LICENSE + icon.** The two validator findings tolerated
  until release; pick a license and a plugin icon. **assignee:** —
