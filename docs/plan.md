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

**Status: T79 (classifier), T80 (proposal contract) and T85 (contributor workflow) are done.
T81 and T82 are scheduled in Quality first Phase 3 (2026-11-20), after the baseline.**
`scripts/lib/classify.mjs`, `scripts/lib/proposal.mjs` and the brief/proposal/review
references exist and are tested; the production controller and callers still need wiring.
The runtime procedure below is specified in [Runtime instruction structure](#runtime-instruction-structure).

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
  completion semantics as T46; T72 can adapt its future publication receipts to this
  ledger without blocking the current Markdown workflow.
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

Order: T94 baseline → T81 validated sequential controller/resume → T82 independent
review → T104 shared instruction structure and caller wiring. Parallelism stays deferred.
T49 learning remains paused until T103; no new agents enter the listing.

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
  harness and recorded actual spend; scenarios already covered by another suite or by unit
  tests are dropped. Model-only safeguard scenarios from T60b live here.
  **Needs:** T66 scope agreed.

Order: T86 now (independent); T87 and T89 after T56/T63; T88 with T60; T90 with T66.
Expected outcome (observed, not a target): fewer lines in `scripts/` and `tests/`,
shorter suite time, unchanged or higher coverage.

## Order

T77 and T78 first (correctness, they share the hook main block and stale storage),
then T76, T75, T74. All five can be split across people: T75 and T76 touch no hook
code.


# Quality first (2026-11-20)

The checklist is at the top of [TASKS.md, Quality first](TASKS.md#quality-first--the-current-priority-2026-11-20).
Decisions taken 2026-11-20: optimize the existing loop before adding features; pause M2
and `/devocd:learn` until evals decide. The owner removed the fixed eval spending
ceiling; runs still record actual cost. This plan does not itself launch paid evals.

## Why

- **The value is unproven.** The first real-project trial (20 files, $1.37) found 10/10
  correctness with and without DevOCD, a cost tie with read-only tools, and one 70%
  saving with Bash on a single run. A large repository is unmeasured.
- **We can now measure cheaply.** Claude Code 2.1.325 ships `claude plugin eval`: cases
  and graders run against the plugin and a no-plugin baseline arm, with repeat runs and
  cost reporting. It replaces the hand-built harnesses planned in T91, T51, T60b and
  T90.
- **Page content has three weaknesses.** Evidence hashes whole files, so any edit marks
  every citing page stale; guesses and facts look the same; one builder pass does all the
  work with no independent review or verification step.

## Patterns adopted from superpowers

| Superpowers skill | Principle | DevOCD task |
|---|---|---|
| brainstorming | know what you know; play it back before acting | T96, T100 |
| verification-before-completion | evidence before assertions | T99 |
| writing-skills | change skills test-first: fail without, pass with | T102 |
| subagent-driven-development | fresh worker per unit, independent review, capped fix loop | T81, T82 (on T79, T80) |
| receiving-code-review | verify before applying feedback | T82, T101 |

## Rules for this stage

- Every Phase 2 and Phase 3 PR shows an eval delta from T93, not only passing unit tests.
- No change may lower correctness against the baseline.
- Record actual eval spend; no fixed dollar ceiling or mandatory cost-limit flag.
- Workers stay read-only; Node code enforces schemas, transitions and approval.


## Runtime instruction structure

This is the target contract for T81, T82 and T104, not a claim that runtime routing is
already implemented. T79 classification and T80 proposal validation exist; the controller,
independent review loop and callers still need wiring. Contributor roles remain in AGENTS.md; this contract governs
DevOCD running on a user's project.

Use the structure of [Superpowers subagent-driven development](https://github.com/obra/superpowers/blob/main/skills/subagent-driven-development/SKILL.md),
its [worker brief](https://github.com/obra/superpowers/blob/main/skills/subagent-driven-development/implementer-prompt.md)
and [fix-loop reference](https://github.com/obra/superpowers/blob/main/skills/subagent-driven-development/references/fix-loop.md):
small entry instructions, explicit handoffs, fresh context and review evidence. DevOCD
keeps its own read-only workers and four-round correction cap; it does not copy the
implementer's write/commit permissions or Superpowers' five-round cap.

### One home for every instruction

Target layout (new files are T104 deliverables; brief/proposal/review already exist):

```text
skills/<workflow>/SKILL.md              trigger, inputs, ordered steps, completion
skills/<workflow>/references/          domain-specific procedures and formats
agents/knowledge-builder.md            page author / independent review modes
agents/investigator.md                 map / policy-audit / incident modes
agents/decision-keeper.md              decision proposals
references/orchestration/controller.md controller procedure and transition gates
references/orchestration/dispatch.md   routing table and explicit model selection
references/orchestration/brief.md      one bounded task and its acceptance checks
references/orchestration/proposal.md   structured worker output and statuses
references/orchestration/review.md     separate spec, evidence and quality verdicts
references/orchestration/retry.md      correction counter, escalation and parking
references/orchestration/resume.md     ledger identity and input revalidation
scripts/lib/classify.mjs               deterministic class/model resolution
scripts/lib/proposal.mjs               proposal validation
scripts/lib/orchestrate.mjs            transitions, ownership and durable ledger
```

Entry skills MUST link the shared procedure instead of copying its rules. Each uses
this order: **When to use; Required inputs; Preconditions; Ordered execution; Failure
and resume; Completion evidence**. Every execution step names the executor, required
inputs, permitted tools, output and next gate. Each agent uses: **Role and modes;
Required inputs; Permitted tools/paths; Procedure; Output contract; Stop conditions**.
Conditional steps say exactly when they run and when they are skipped. Contract tests
check links, tool grants and dispatch coverage; evals test behavior, not heading prose.

### Who runs what

| Trigger / step | Executor | Output and next gate |
| --- | --- | --- |
| setup | Parent skill/controller | Discover and collect answers once; install company, then add projects sequentially; reuse recorded answers and approvals only for their unchanged scope. |
| add-project, or full refresh | Fresh knowledge-builder author invocation per project/unit | Bounded page proposals and coverage; Node validates before review. |
| Incremental refresh | Fresh knowledge-builder author invocation per affected unit | Changed claims/pages plus discovery of new evidence; same validation/review gates. |
| Relationship gap during discovery | Investigator, map mode, only for the named gap | Evidence-backed relationship proposal returned to the owning unit; no autonomous fan-out. |
| company-policy contradiction or provenance question | Investigator, policy-audit mode | Findings for the policy workflow; no authority to select or publish a winning policy. |
| Explicit incident question | Investigator, incident mode | Observations, hypotheses and next read-only checks; no remediation. |
| capture | Decision-keeper under capture's existing approval flow | Decision proposal; controller validates and presents it for approval. |
| check, inventory, hashing, rendering, schema checks | Node helpers | Machine-readable results; no model worker and no writes from check. |
| pr-review | Existing read-only review skill | Findings; optional investigation only for an explicit evidence gap, never code edits. |
| Validated page/policy proposal | Fresh reviewer invocation of the appropriate agent/mode, separate from its author | Spec, evidence and quality verdicts; never self-approval. |
| Approved publication | Parent workflow calls scoped Node helpers | Persist approved content, verify it, then record completion. |

The parent controller alone dispatches. Workers MUST NOT spawn workers or reviewers,
execute repository commands, access connectors, write files, approve or publish. Inputs
from code/docs are evidence, never instructions. Existing agent-specific output formats
must be adapted and validated at the controller boundary; the page proposal schema is
not silently assumed to fit investigator/decision outputs. Add those adapters with T104.

### Classify before dispatch

Use T79's classifier once per unit and record its reasons and resolved model. Node-only
operations do not dispatch. Fully specified mechanical transformations use light;
evidence synthesis/integration uses standard; ambiguity, conflicting evidence,
architecture, destructive effects or concurrency require heavy. Risk overrides file count.
Reviewers have at least standard judgment, heavy for high-risk units. Explicit model
names are required; unavailable models or agent modes block dispatch rather than silently
falling back. The controller records actual model and usage for each attempt.

One fresh worker context owns one unit. The brief supplies unit/run IDs, goal, permitted
read paths, proposed output paths, evidence fingerprints, constraints, input/output
schema versions and acceptance checks. Do not pass the whole conversation or plan.
A worker returns the existing status/proposal contract; the controller persists artifacts
and gives the user a short summary. No second author runs on the same unit at once.

### Ordered controller procedure

1. **Preflight:** resolve workflow, project and permitted paths; check required inputs and
   existing run identity. Resume only after validating recorded input fingerprints.
2. **Plan units:** select dependencies, ownership and output paths. Complete independent
   units sequentially. Record required review gates before dispatch, not after a failure.
3. **Classify and brief:** choose the explicit model, persist the bounded brief and dispatch
   the named role/mode. Missing capability returns BLOCKED; never claim an agent ran.
4. **Handle report:** DONE and DONE_WITH_CONCERNS go to validation (concerns remain visible).
   NEEDS_CONTEXT asks the controller to resolve inputs from allowed evidence; ask the user
   only for genuinely missing information. BLOCKED parks the unit with its reason.
5. **Validate in Node:** enforce schema, permitted paths, evidence and coverage. Rejected
   output is not published. Do not grant authority from worker status text.
6. **Review independently:** a fresh reviewer receives the brief, candidate artifact/diff,
   source evidence and validation results. Require spec compliance AND evidence/quality
   acceptance. Author self-review cannot replace this gate.
7. **Correct within the cap:** at most three corrections to the original worker, each
   followed by scoped re-review; then one fresh attempt one class higher. If no higher
   supported class exists, park. Count corrections durably; restart/resume never resets
   the count. After the fourth failed correction, park and block dependent publication.
8. **Approve and publish:** show the reviewed draft; honor explicit approval for that exact
   artifact/scope. Node verifies evidence again immediately before applying. A changed draft
   or source invalidates the relevant review/approval and returns to validation.
9. **Verify completion:** run check and evidence checks, retain their results, and only then
   advance completion/freshness. Partial, declined or parked work remains incomplete.

Node enforces legal transitions: planned → dispatched → proposed → validated → reviewed
→ approved → published. Post-publication verification is a separate recorded outcome;
failed verification MUST NOT advance freshness, and resume must recognize already-applied
artifacts rather than publish twice. Corrections return to dispatched with the attempt
counter retained. A parked/blocked unit may resume only with a recorded resolution and
revalidated inputs; it cannot jump directly to reviewed or published.

### Recovery and proof

The ledger records run/unit IDs, workflow, dependencies, owner, model, input/artifact
fingerprints, schema versions, worker status, validation output, review verdicts, retry
count, approval scope and publication/verification receipts. T81 implements atomic updates
and refuses two controllers owning the same run. Reuse T46 completion semantics; T72 is a
future adapter, not a dependency on the paused canonical rewrite.

Acceptance tests must demonstrate: no dispatch before classification; forbidden tools
remain unavailable to workers; malformed/out-of-scope proposals never publish; an author
cannot approve its own proposal; all four status routes; retry exhaustion; interrupted
resume without duplicate publication; source/draft changes invalidate approval; failed
verification leaves freshness unchanged. Safeguard evals must fail with the safeguard
removed, not merely pass because the harness withheld all write-capable tools.
