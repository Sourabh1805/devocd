> Earlier project phases (Phases 0–6, Roadmap v2, Stages 8, 8b, 9) are archived in [archive/plan-history.md](archive/plan-history.md).

# Road to v1 (2026-11-18)

The checklist is in [TASKS.md, Road to v1](TASKS.md#road-to-v1-checklist).
This section records why.

## Architecture for v1: one pipeline

```
source code ─► knowledge-builder ─► Markdown pages (authored, approved)
merged PRs  ─► /devocd:learn     ─► claims (T44 shape, approved)
                                        │
                                        ▼  compile (deterministic, T22 + T48)
                              canonical model: records, scopes, evidence
                              (file + hash, PR, session), decisions (T21)
                                        │
             ┌──────────────────────────┼────────────────────────┐
             ▼                          ▼                        ▼
   trace / review-context (T50)   rule stubs + hooks       check + refresh
   "for this change ..."          (delivery)               (freshness)
```

Markdown stays what people read and approve. Every consumer (hooks, rule stubs, viewer,
check, refresh, trace, review-context) reads the canonical model or a view generated from
it (T72), and evidence hashes mean the same thing everywhere (T71). An ordinary standards
page is cited guidance; only an explicitly approved policy header (T23) makes a
machine-enforced policy. Markdown stays the source: the canonical model is generated from
it, never hand-written, so there is one trust system. Decisions taken 2026-11-18:
learning ships in v1.0, and the `context-*` system is integrated rather than frozen.

Migration preserves the read-only contract of `check`: legacy installs receive a
`migration required` diagnostic and an approved-refresh suggestion, with no writes
or state changes. Only an explicitly approved refresh or migration workflow may
publish the canonical generation and compatibility views. T72 verifies unchanged
files and state after `check` or a declined migration, as well as successful upgrade
and interrupted-publication recovery.

## Code quality rules

- One copy of every helper: text (`lib/text.mjs`), walking (`fsutil.walk`), CLI
  arguments (the command table). A second copy is a review finding.
- Modules stay small and single-purpose; `check` is a runner over rule modules.
- Skills are prose for the model, validated by contract (frontmatter, grants,
  budget, files), and proven by live runs and evals, never by regex on sentences.

## Testing rules (written into AGENTS.md by T64)

- Test behaviour at the module boundary; one test per rule or branch.
- Variants go in a table, not in copied test bodies.
- Fixtures come from one builder; call the library, and keep one CLI smoke test per
  command for exit codes.
- Replace before delete: a safeguard test is removed only after a behavioural check
  exists and fails without the safeguard (T60b). Test count is an observation.
- Protection is measured by coverage (at least 85% of `scripts/lib` lines) and a
  mutation spot-check of critical modules, not by test count.

## Release gates

CI green on three OSes (running again since 2026-11-20) and local tests on every PR; a live run of the five-project demo; a measured comparison
with the plain assistant (DevOCD at least as correct, tokens reported honestly); a
clean marketplace install on fresh Windows and macOS profiles; a one-week pilot on
`v1.0.0-rc.1`. Then license, icon, version 1.0.0, changelog and release.

# Hooks, safety, orchestration and cleanup (2026-11-19)

Checklist entries: [TASKS.md, M1 additions](TASKS.md#m1-additions-2026-11-19-correctness-contracts-cleanup) and T81, T82, T88-T90.

## Context

Four problems reported on 2026-11-19, each confirmed in `main` (be84327):

1. **Hook cost.** `hooks/hooks.json` runs `scripts/devocd-hooks.mjs` on every prompt,
   every Write/Edit/MultiEdit/NotebookEdit and every session start. The hooks never
   call a model (no API cost); the real costs are (a) text injected into the
   conversation: up to 3 policy pointers on every matching prompt, repeated each
   time the same topic comes up, plus one stale line at session start; (b) a Node
   process per event (~50 ms). A local *model* deciding whether to act would cost
   more than it saves, so the gate is deterministic.
2. **Secret scanner coverage.** `scripts/lib/secrets.mjs` has 4 fixed patterns (AWS
   key, GitHub token, Slack token, private key block) plus one keyword + entropy
   rule. Common types are missed: GitLab, OpenAI/Anthropic keys, Google API keys,
   Stripe, Slack webhooks, SendGrid, Twilio, npm/PyPI tokens, Azure storage keys,
   connection strings with passwords, JWTs, URL credentials, Basic auth headers.
3. **Restore leaves files behind.** `restoreDir` in `scripts/lib/backup.mjs` copies
   each backed-up file over `.devocd/` but never removes files created after the
   backup, so a restored folder is a mix of old and new.
4. **Edit tracking drops marks.**
   - The hook reads stdin and `process.exit(0)` once it passes 256 KiB
     (`devocd-hooks.mjs`, main block). A Write of a large file carries the whole
     content in `tool_input`, so the edit is neither journaled nor marked stale.
   - `onEdit` reads `stale.json`, merges and writes it back with no lock: two edits
     at once can each read the old file and the second write erases the first's
     marks. The journal trim also rewrites `edits.jsonl` in place, losing lines
     appended in between.

`refresh-status` (source snapshot hashes) still catches changes later, so nothing is
permanently wrong, but the fast signal is unreliable and the user is not told.

## Tasks (each one PR; added to docs/TASKS.md under M1 as correctness fixes)

- **T74 — Prompt hook gate and once-per-session pointers.** (S)
  - Gate in `onPrompt`: inject nothing when the prompt has no task signal (fewer than
    4 content words after stop words, or no standards trigger match), as today, plus
    skip slash-command prompts that DevOCD skills already route themselves.
  - Once per session: remember injected policy files in
    `.devocd/journal/session-<session_id>.json` (bounded, files older than 7 days
    removed on session start); a pointer already given in this session is not
    repeated.
  - Session start stays one line, only when stale pages exist.
  - `devocd hook-stats <dir>`: read-only counts of injections and bytes per event from
    a small capped counters file, so the cost is visible, not guessed.
  - Docs: README/plugin README state plainly that hooks make no model calls and what
    they add to context; `devocdHooks: false` still turns them off.
  - Tests: repeated matching prompts inject once per session; a new session injects
    again; trivial prompts inject nothing; latency test (each handler < 50 ms) kept.
- **T75 — Secret scanner coverage with a false-positive guard.** (M)
  - Provider patterns added to `FIXED`: GitLab `glpat-`, OpenAI `sk-`/`sk-proj-`,
    Anthropic `sk-ant-`, Google `AIza`, Stripe `sk_live_`/`rk_live_`, Slack webhook
    URLs, SendGrid `SG.`, Twilio `SK`+32 hex, npm `npm_`, PyPI `pypi-`, Azure
    `AccountKey=`, connection strings with `Password=`/`pwd=`, JWT `eyJ…\.eyJ…\.`,
    URL userinfo `//user:pass@`, `Authorization: Basic|Bearer` with a long value,
    PGP private key blocks, Docker `auths` with `auth`.
  - False-positive guard: never flag sha256 evidence lines, git SHAs, UUIDs, obvious
    placeholders (`xxx`, `<token>`, `example`, `changeme`, all one character).
  - One scanner for every caller (check, artifacts, deps, claims, inventory,
    capture); values are never echoed, only kind and line.
  - Tests: a fixture corpus of true positives (one per kind, fake values) and true
    negatives (hashes, UUIDs, placeholders, ordinary code); each pattern shown to fail
    without its rule.
- **T76 — Restore makes `.devocd/` match the backup exactly.** (S)
  - Before restoring, back up the current state (so restore is itself undoable).
  - Restore removes files under `.devocd/` that are not in the backup, except
    `.backups/`, `draft/`, `journal/` and durable decision history newer than the
    backup (existing preservation rule kept); never follows links; refuses on any
    unexpected entry type before changing anything.
  - `restore <dir> [stamp] --dry-run` lists what would be copied and removed; the
    restore flow in the plugin README shows it first.
  - Tests: a file created after the backup is gone after restore; newer durable
    decisions are kept; a link inside `.devocd/` is refused with nothing changed;
    the pre-restore backup lets the user undo.
- **T77 — Large edits are still tracked.** (M)
  - The hook parses stdin with a small structure-aware streaming JSON reader: it
    tracks object nesting and keys, captures only top-level `hook_event_name`,
    `tool_name`, `cwd` and `tool_input.file_path` / `tool_input.notebook_path`, and
    skips every other value (including `content`) without storing it. Text inside a
    string value can never be mistaken for a key. Hard read cap 64 MiB.
  - If the path cannot be established, the hook records an `untracked` mark; session
    start and `refresh-status` then say "an edit could not be tracked; run
    refresh-status" instead of staying silent.
  - Tests: a 5 MiB Write payload is tracked; the path after the content works; file
    content containing `"file_path": "/evil"`, escaped quotes, `"` escapes and
    nested `tool_input` look-alikes never changes the captured path; truncated or
    invalid JSON produces the untracked notice.
- **T78 — Concurrent edits never lose a stale mark.** (M)
  - One file per mark: each hook writes `.devocd/stale.d/<time>-<pid>-<random>.json`
    by writing a temp file and renaming it, so concurrent hooks never share a file and
    every mark is complete or absent.
  - Readers (session start, check, trace, review-context, refresh) take the union of
    `stale.d/` plus the compacted `stale.json`; legacy `stale.json` is read as before.
  - Clearing and compaction run only in refresh, under a lock directory
    (`mkdir .devocd/stale.lock`, stale-lock timeout). Refresh lists the mark files,
    folds them into `stale.json` (temp + rename), then deletes exactly the files it
    listed. A mark written during compaction is not in that list, so it survives.
    `clearStale(root, t0)` clears only marks older than the refresh snapshot time
    `t0`; edits that arrive while refresh runs stay stale.
  - The edit journal uses the same one-file-per-event segments, compacted the same
    way, instead of rewriting `edits.jsonl` in place.
  - Tests: 20 real hook processes at once each mark their page; compaction racing 20
    more hooks loses none; an edit during refresh stays stale after it; a crashed
    compaction (lock left behind) recovers after the timeout without loss.

## Part B — Worker tiers and a controller loop (inspired by superpowers SDD)

**Status: deferred past v1 (2026-11-20).** Kept as design input, not scope. The
reasoning holds for the workflow it was borrowed from, where parallel agents edit the
same repository; it is not a v1 problem here, where the workflows are already
sequential, the workers are already read-only, and the riskiest unknown is whether
retrieval helps at all (T91). Nothing below blocks a release.

Source: `superpowers/7.0.2/skills/subagent-driven-development` — fresh worker per
task, explicit model tier per role (cheap for mechanical, standard for integration,
most capable for design and the final review; reviewers never below standard), four
worker statuses (DONE, DONE_WITH_CONCERNS, NEEDS_CONTEXT, BLOCKED), a task review
(spec compliance + quality) after each unit, a capped fix loop (rounds 1-3 resume the
same worker, 4-5 escalate one tier, then park), a ledger file as the recovery map,
short reports with artifacts in files, and never two writers on the same files.

DevOCD's multi-step workflows (setup, add-project, refresh, learn) already dispatch
agents but without classification, statuses, enforced validation, review or a ledger.
Revised after review (2026-11-19). The pipeline every workflow follows:

```
classify unit → scoped worker brief → worker proposal (read-only, structured)
  → deterministic validation → independent review (fresh context)
  → bounded corrections → existing approval and publication flow
```

Rules that hold throughout:
- **Workers never write.** As today in `agents/knowledge-builder.md`, workers are
  read-only and return a structured proposal; the controller (Node helper, invoked by
  the skill) validates and persists it. Giving workers write access would need its own
  design and is out of scope.
- **Markdown explains, Node enforces.** Required inputs, permitted paths, output
  schemas, status transitions, retry limits, evidence checks, review and approval
  requirements, and resume fingerprints are checked in code. A worker's `DONE` means
  "ready for validation", never "approved" or "published".
- **One shared contract.** Controller rules live once (a library module plus brief,
  report and review templates under `references/orchestration/`); each skill supplies
  only its workflow inputs.

Tasks:

- **T79 — Task classifier.** (S) Deterministic code assigns each unit a class before
  any dispatch:

  | Class | Work | Execution |
  |---|---|---|
  | deterministic | inventory, hashes, schema checks, rendering, PR selection | Node, no model |
  | light | fully specified transformation, no interpretation | cheap worker |
  | standard | evidence synthesis, incremental page updates, integration | standard worker |
  | heavy | ambiguous boundaries, conflicting evidence, architecture, concurrency or destructive-change review | most capable worker |

  Risk overrides size: a one-file concurrency or destructive change is heavy. PR claim
  extraction defaults to standard until the T45 fixture shows light is reliable.
  Logical classes resolve to explicit supported model names (company
  `state.json.models`, defaults haiku / sonnet / opus; no `inherit` for heavy), and
  the model actually used is recorded.
- **T80 — Worker contract.** (M) Brief template (goal, inputs, permitted paths,
  output schema, budgets) and proposal schema: one status
  (DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED), structured page or claim
  proposals, cited evidence, concerns. A Node validator rejects proposals that miss
  the schema, cite paths outside the permitted set, or cite evidence that does not
  exist or does not match its hash.
- **T81 — Sequential controller, ledger and resume.** (M) `scripts/lib/orchestrate.mjs`
  holds a unit state machine (planned → dispatched → proposed → validated → reviewed →
  approved → published, plus parked and blocked) with allowed transitions and retry
  counts, persisted in `.devocd/runs/<run-id>.json`. Resume continues only units whose
  input fingerprints still match; changed inputs restart that unit. This is the same
  record T46 completion states and T72 interrupted publication use.
- **T82 — Independent review and the retry rule.** (M) Every validated proposal gets a
  review in a fresh context (knowledge-builder `review` mode, at least standard; heavy
  for heavy-class units), checking spec compliance (contract sections, cited evidence)
  and quality (grounded claims, no repetition). **Retry rule:** at most 3 correction
  rounds at the unit's class, then 1 round one class up; still failing → parked.
  Parked units stay incomplete, block publication of anything that depends on them,
  and never advance the refresh baseline; independent units continue. Where a final
  review is required (`setup --all`, `learn`), skipping it leaves a visible incomplete
  gate that blocks publication.
- **T49 amendment — learn by class.** Deterministic collect and select → standard
  workers turn kept PRs into candidate claims → deterministic `validateClaims` →
  independent review → user approval.
- **T85 — Contributor workflow (separate from the runtime workflow).** (S) In
  `AGENTS.md`: the architect is the controller; Codex and Antigravity are workers given
  a brief (goal, files, done-when, rules); every PR reports a status and local test
  results; each PR gets a task review (`/code-review --fix`), at most 3 fix rounds then
  escalation; one heavy review per milestone; `docs/TASKS.md` is the ledger.
- **Parallel builders (old T18) stay after v1.** Separate files do not prevent
  conflicting claims, duplicate pages or inconsistent cross-project links. They come
  back only after the sequential controller is measured, with explicit unit ownership
  and a deterministic merge. (Superpowers itself forbids parallel implementers.)

Order when this is taken up again: T79 and T80 (contracts, classifier) → T81 (validated
sequential controller) → T82 (independent review) → resume proven in T81's tests, with
parallelism still after that. T49 keeps its place in v1 without the orchestration: it
stays "collect, draft claims, approve", run sequentially by the skill. No new agents
enter the listing.

## Part C — Delete unused code and unnecessary tests

Audit of `main` (be84327): ~20 exports used only inside their own module or only by
tests; `scripts/evaluate-context.mjs` referenced by nothing; CLI commands with no
skill, hook or doc caller (`knowledge-scope`; `knowledge-route` only in docs); three
overlapping plugin-shape test files (`plugin-shape`, `footprint`, `validate-plugin`);
CLI tests that repeat library tests; 7 live e2e suites (2,605 lines) overlapping each
other and the coming T66 live run.

Rules for every deletion:
- **Prove unused first.** Each item is listed in its PR with the search that shows no
  caller in `scripts/`, `skills/`, `agents/`, `hooks/`, `bin/`, READMEs or docs
  (excluding `docs/archive/`). Anything a user-facing doc promises is deprecated
  in docs first, removed in the next release.
- **Replace before delete** still applies to safeguard tests (Part of T60/T60b).
- **Coverage must not drop** on `scripts/lib` (T64 measures before and after).
- Measured, not targeted: each PR reports lines and tests removed and suite time.

Tasks:

- **T86 — Dead code sweep.** (S) Delete `scripts/evaluate-context.mjs` (move any
  still-useful fixture to `tests/helpers/`); un-export symbols used only in their own
  module (e.g. `clearStale` stays internal if refresh is its only caller, constants
  like `ARTIFACT_CAP`, `REVIEW_FILE_CAP`, `MAX_DIFF_CHARS`, `EXCLUDE_PATTERNS`,
  `PLAN_NAME`, `CONTEXT_VERSION`, `END`); remove functions with no caller at all
  (`writeBlockText`, `upsertBlock` if confirmed); tests then assert behaviour, not
  exported constants. **Needs:** none.
- **T87 — Unused CLI commands.** (S) Remove `knowledge-scope`; fold `knowledge-route`
  into `knowledge-search` (one search command) unless a skill needs its output shape;
  each removal updates usage text, docs and tests. Done with T56's command table so a
  command exists in exactly one place. **Needs:** T56.
- **T88 — One plugin contract test file.** (S) Merge `plugin-shape`, `footprint` and
  `validate-plugin` tests into `tests/unit/plugin-contract.test.mjs`: manifest, skill
  and agent frontmatter, grants, budgets, listing tokens, links. Same checks, no
  duplicates. Pairs with T60. **Needs:** T60.
- **T89 — Remove duplicate CLI tests.** (S) Where a library test already covers the
  behaviour, the CLI test keeps only argument parsing and exit codes (one table for
  all commands, from T63). **Needs:** T56, T63.
- **T90 — Live suite consolidation.** (M) The 7 e2e suites become the scenarios T66
  needs (setup, add-project, policy, review, refresh, capture, learn), sharing one
  harness and one spend cap; scenarios already covered by another suite or by unit
  tests are dropped. Model-only safeguard scenarios from T60b live here.
  **Needs:** T66 scope agreed.

Order: T86 now (independent); T87 and T89 after T56/T63; T88 with T60; T90 with T66.
Expected outcome (observed, not a target): fewer lines in `scripts/` and `tests/`,
shorter suite time, unchanged or higher coverage.

## Order

T77 and T78 first (correctness, they share the hook main block and stale storage),
then T76, T75, T74. All five can be split across people: T75 and T76 touch no hook
code.

