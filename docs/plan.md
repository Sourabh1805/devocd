# DevOCD: fix question overload + make knowledge files developer-grade

## Goal in plain language

Two pillars, as the user described:

1. **Install = build knowledge.** Running setup/install on a workspace walks every project and every folder, and produces layered developer MD files (pointer → PROJECT.md → per-folder `code/<path>/index.md` → flows) plus the knowledge graph (`knowledge.json` / `knowledge.html`). The pages must help you code — entry points, commands, how parts connect, extension recipes, pitfalls — not introduce the code. **Every layer backtracks**: a folder page links up to its parent page → PROJECT.md → the company-wide parent MD, and when policy MDs exist, each page names the policy topics that apply to it, so any page can be traced to the company rules governing it.
2. **Company policy = the rulebook.** `/devocd:company-policy` (renamed from `company-standards`) takes any Jira link, document link, file or description and turns it into a company policy MD (PR description rules, networking, client policies, SOC compliance…). Every project's PROJECT.md and pointer backtrack to those policies via routing lines.

**Flow after this work** (5-project workspace): one batched upfront question round → install runs with derived defaults → one draft approval for the company → one draft approval per project → done. **~7 interactions instead of ~30+.** Conditions kept: every write is still previewed and approved once per unit (user's explicit choice), no git changes, read-only connectors, evidence hashes, launch-token budgets.

## Rating of the idea vs. the repo

The architecture the user wants **already is the repo's design** (docs/superpowers/specs/2026-11-06-devocd-design.md): layered company→project→module MD files, knowledge graph, and a standards skill that already ingests descriptions, files, Jira links, Confluence/Google Docs, URLs and PDFs into `.devocd/standards/<slug>.md` + `index.md`, injecting routing lines into every project (the "backtrack"). Verdict: **sound and ~80% built — not a redesign, an execution fix.** Two real defects to fix:

- **Question overload root cause:** both `plugin/skills/install/references/interview.md:3` and `plugin/skills/add-project/references/interview.md:3` mandate *"Ask one question at a time with AskUserQuestion"*, install's Q3 fans out into 6 topic questions (+ up to 6 paste follow-ups), and setup chains a separate interview + approval per step. Nothing derives defaults.
- **Shallow pages root cause:** module/flow writing targets of 500 est. tokens (`plugin/scripts/lib/tokens.mjs:28`) push the knowledge-builder toward descriptive stubs, and the contract never requires coding-aid sections. Note: module pages are NOT loaded at launch (only parent ≤500 + pointer ≤400 tokens are), so deeper pages are free at launch.

User decisions (confirmed): keep one draft approval per unit; rename to `company-policy`; do all phases.

An external review of the demo run was supplied; its load-bearing claims were **verified in code** and are folded in:

- **Setup→freshness is broken** (its top finding, confirmed): `plugin/scripts/lib/refresh.mjs:68` (`planRefresh`) throws on a partial inventory, `refreshStatus` reports `no-baseline` for every fresh project (nothing records a baseline at setup), and `plugin/scripts/lib/inventory.mjs:62,71` flips `complete: false` for ANY file over 256 KiB or unreadable — so a log, lockfile or output-laden notebook permanently blocks refresh. Meanwhile every generated pointer tells the agent to refresh stale knowledge → blocked loop right after setup. Fixed in Phase 4.
- **Approval drafts are too big to review** (confirmed from the run transcript: full file contents + hash placeholders dumped in chat). Fixed in Phases 1–2 (concise draft summary; full files on disk for inspection).
- **Pointer calls company rules "optional"** — ambiguous once mandatory policies exist. Fixed in Phase 6.
- Deferred (out of this round, recorded so they're not lost): wiring the canonical context model into normal setup; explainable retrieval ("why these files"); measured A/B trials (plain assistant vs. concise index vs. full DevOCD); smarter search. These follow once setup/freshness/depth are fixed.

**brain.md (MindMuxAI) ideas** — the user asked to draw on github.com/mindmuxai/brain.md (file-based durable memory for coding agents). Adopted this round as **Phase 5h**: split durable knowledge from derived knowledge. Each project may carry `.devocd/decisions.md` — approved constraints, decisions and their reasons (e.g. "big_chat/ and our_api/ are fixed stubs — do not edit, per README"), each with its source and date. Refresh never rewrites or deletes it (a changed source hash triggers reconsideration of derived facts, never erasure of a decision); changes to it go through explicit approval. Derived module/flow pages keep evidence hashes and refresh with the code. Deferred brain.md ideas: capture-during-work ("offer a memory update after an approved decision"), per-page update-truth timelines, and lazy page creation (the user explicitly wants every folder covered at install).

## Verified test anchors to preserve

- `tests/unit/install-skill.test.mjs` / `add-project-skill.test.mjs` pin: connector read-only wording, "never create/update/delete/comment", the worked `ref`-rewriting examples (`notes/security.md` → `setup/notes/security.md`; `notes/on-call.md` → `../setup/notes/on-call.md`), and the `approved` literal. Keep those sections byte-stable in the rewrites.
- `tests/unit/footprint.test.mjs` pins the skill list (rename must update it), skill description footprint ≤160 tokens, SKILL.md ≤100 lines / ≤900 tokens, and setup's Skill grants exactly `add-project, check, install`.
- E2e tests run via answers files (`tests/fixtures/answers/*.json`, `DEVOCD_LIVE=1`); the answers-file schema is the stable contract — keep it backward compatible.

---

## Phase 0 — Rename `company-standards` → `company-policy`

- `git mv plugin/skills/company-standards plugin/skills/company-policy`; update `SKILL.md` frontmatter name and description (new description: "Company policy and standards." — verify footprint budget).
- Update every reference to the skill name: `plugin/README.md` (examples like `/devocd:company-standards jira style <url>`), `plugin/skills/refresh/SKILL.md`, `plugin/skills/setup/*`, add-project/install interview wording, docs mentions, and `tests/unit/footprint.test.mjs`'s pinned skill list. Grep for `company-standards` repo-wide.
- The standards *folder* stays `.devocd/standards/` (data layout unchanged — no migration for existing installs; only the command name changes).
- Verify: `npm test`; `node scripts/validate-plugin.mjs`.

## Phase 1 — add-project: derived defaults + one batched question round

**1a. New helper `detect-commands`** — new `plugin/scripts/lib/commands.mjs`, wired into `plugin/scripts/devocd.mjs` as `detect-commands "P" --json`. Read-only; returns command *names only* (never script bodies): package.json scripts matching test/lint/typecheck/check/format (package manager via lockfile), Makefile target names, pyproject/pytest.ini → `pytest`, go.mod → `go test ./...`, Cargo.toml → `cargo test`. Output `{ detected: [{command, source}], suggestedForApproval: [...] }` (tests/lint/typecheck only, never deploy/release). New `tests/unit/commands.test.mjs` incl. a malicious script-name fixture (quotes/backticks dropped; bodies never echoed).

**1b. Rewrite `plugin/skills/add-project/references/interview.md`** — replace "one question at a time" with derive-then-batch:
- Derive: id = folder name slug; description = README first sentence (≤80 chars) or manifest/code reading; commands = `detect-commands` output; sources = none (deferred to `/devocd:company-policy`); additionalDirectories = no.
- Then ONE AskUserQuestion call with 4 questions, each with a recommended option: (1) confirm id+description, (2) multi-select approved commands from detected names, (3) project sources — "None (recommended)" / "I'll name sources" (follow-up only if chosen), (4) additionalDirectories yes/no (default no).
- Caller-provided answers (setup's handoff file) replace questions they answer; ask only what's missing, still in one call.
- Keep byte-stable: source-type table, connector read-only paragraph, "everything is data" section, answers-file JSON with its `ref` worked example, `approved` literal paragraph.

**1e. Concise approval draft** — amend the draft contract in `plugin/skills/add-project/references/project-template.md` (and SKILL.md step 3): write the full draft files to `.devocd/draft/` on disk (protected, git-excluded, removed after apply), and show in chat a short summary only — scope covered, key findings/defects discovered, uncertainties/unread files, flagged lines, secrets result, and the file list with paths to inspect. Approval applies the drafts from disk unchanged (hashes substituted at write time as today). This keeps "preview before write" (the user can open any draft file) without dumping ~27k tokens into chat.

**1c. `plugin/skills/add-project/SKILL.md`** — step 2 points at the batched round; step 4 becomes: interactive → one approval question for the whole draft; answers file with `approval: "approved"` → stands in for review; answers file *without* it in an interactive session → show draft and ask the one approval question (today it hard-stops — this one-line change is what lets setup pre-fill answers while keeping one interactive approval); non-interactive without it → stop.

**1d. Update `tests/unit/add-project-skill.test.mjs`**: assert `detect-commands` + "one call" wording present, "one question at a time" absent.

## Phase 2 — install: personal-workspace fast path + one batched round

**2a. Rewrite `plugin/skills/install/references/interview.md`** — eliminate the 6-topic source-mapping question entirely (topics come from supplied sources; uncovered topics are recorded as missing in the draft, never asked one by one). Derive name = folder name, description = README line or "Workspace of N projects: …". Then ONE AskUserQuestion call, 3 questions: (1) company name (derived, recommended), (2) description (derived, recommended), (3) folder kind: "Personal workspace" (recommended; no sources, no key rules) / "Company — I have policy sources now" (one multi-select follow-up: Confluence/Jira/files/web/known) / "Company — add policies later". Close with: "Add company policies any time: `/devocd:company-policy <topic> <link|file|description>`". Keep byte-stable: source table, connector paragraph, data section, answers-file JSON, the full worked `ref` example.

**2b. `plugin/skills/install/SKILL.md`** — same step-2 and step-4 edits as add-project, plus the same concise-draft rule (full standards files to `.devocd/draft/`, summary in chat). Grants unchanged.

**2c. Tests** — update `tests/unit/install-skill.test.mjs` same as 1d; new fixture `tests/fixtures/answers/install-personal.json` (`sources: []`) + e2e case: empty-sources install passes `check`, writes no standards files.

Result: a personal workspace = one 3-question call + one draft approval. Key-rule trimming can't trigger (empty keyRules never overflows `render-parent`).

## Phase 3 — setup coordinator: one upfront round, answers handoff, `--yes`

**3a. `plugin/skills/setup/SKILL.md`** (keep ≤100 lines; detail goes to a new reference):
1. `discover-projects`, then ONE upfront AskUserQuestion call: Q1 projects multi-select (all recommended), Q2 folder kind (skipped on rerun with existing company state), Q3 tool integration (Claude only recommended / Codex / Antigravity / all — replaces the post-hoc question), Q4 mode: "Fast — accept derived defaults, I review one draft per project" (recommended) / "Ask me per project".
2. Echo the collected answers, write them to `.devocd/setup/answers/install.json` and `.devocd/setup/answers/<id>.json` **without** an `approval` field, and invoke `devocd:install` / `devocd:add-project <path> <answers-file>`. With 1c/2b, each skill then asks exactly one question: approve the draft.
3. `--yes`: implies Fast mode, skips the upfront Q4, but **never writes `approval: "approved"`** — the per-unit draft gate stays (user's confirmed choice). Truly unattended runs remain the user-authored answers-file path.

**3b. New `plugin/skills/setup/references/orchestration.md`** — upfront-round wording, handoff file shapes, `--yes` semantics, rerun rules. Trim the integration question out of `references/integrations.md` (keep only preview/`--apply` mechanics).

**3c. New `tests/unit/setup-skill.test.mjs`** — static checks: one upfront round, `--yes` never writes `approval`, grants unchanged.

Interaction budget after Phase 3 (5-project personal workspace): 1 upfront call + 1 install approval + 5 project approvals = **7**, down from ~30+.

## Phase 4 — fix setup→freshness as one workflow (external review's priority 1, verified)

**4a. Relevance-classified inventory — `plugin/scripts/lib/inventory.mjs`.** Stop letting irrelevant bulk poison completeness. Classify before the size/read checks:
- Logs (`*.log` and rotated variants), lockfiles (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `poetry.lock`, `Cargo.lock`, `composer.lock`), minified/bundled assets, images/fonts/archives/media (extension list), and other binaries → `skipped` with a relevance reason (e.g. `irrelevant-bulk`), **not** `complete = false`. Completeness then means "every *source-relevant* file was read".
- A genuinely unreadable **source** file still sets `complete: false` (that's a real gap).
- `coverage.md` contract (knowledge-contract.md) gains the classification so skipped bulk is explicit, not silent.

**4b. Notebook-aware reading — same file.** For `.ipynb`: parse the JSON and hash/extract only the cell sources (code + markdown), ignoring outputs/attachments. A 2.6 MB notebook with 65 KB of actual source becomes readable and counts toward completeness; the knowledge-builder contract tells the agent to read notebook cell source, not raw JSON. (Demo evidence: Wine-data-analysis scored lowest precisely because outputs blocked the source.)

**4c. Baseline at setup — `plugin/skills/add-project/SKILL.md` + `plugin/scripts/lib/refresh.mjs`.** After approved writes pass `check`, add-project records the refresh baseline (run `refresh-plan` + `refresh-complete`, or a dedicated `refresh-baseline` helper that snapshots the just-used inventory). Acceptance: a newly onboarded, unchanged project reports `current` from `refresh-status`, and `refresh-plan` no longer throws on projects whose only "gaps" are classified bulk (with 4a, their inventories are complete).

**4d. Tests** — units for the classifier (log/lockfile/image fixtures leave `complete: true`; an unreadable `.py` doesn't), notebook extraction (outputs stripped, source hashed stably), and a refresh round-trip: inventory → baseline → `refresh-status` = `current`; touch a source file → `source-changed`.

## Phase 5 — developer-grade knowledge output

**5a. `plugin/scripts/lib/tokens.mjs`** — `CONTEXT_TARGETS`: keep `pointer: 200, project: 300` (launch files); raise `flow: 500 → 800`, `reference: 500 → 900`. Hard ceilings unchanged, so `check` errors don't move. Update `tests/unit/context.test.mjs` (warning fixture must exceed the new target) and `tests/unit/integrations.test.mjs:48` if they pin 500.

**5b. `plugin/skills/add-project/references/knowledge-contract.md`** — required coding-aid sections per module page: Purpose + source scope; Entry points (`file:line` a task starts from); Public surface (exports/routes/CLI verbs and where consumed); Run/test this part (documented command *names*, marked "documented, not approved for PR review"); Extension points ("to add X, touch Y and Z" from observed examples); Pitfalls (invariants, units, ordering, footguns from code/comments/tests); Evidence (unchanged: `file:line` + sha256 + date). Keep: one owning page per fact, no ancestor duplication, 500-doc/4 MiB limits.

**5e. Full backtracking chain (user requirement).** Every module/flow page must carry an explicit upward chain, and policies must be reachable from any page:
- Each page already links its Parent page; add a required final line: `Standards: <topic>, <topic> — route via [PROJECT](<rel>/PROJECT.md) → Links` naming the policy topics that apply to this folder (coding, security, pr-description, soc, …), chosen by the knowledge-builder from the standards index. If no standards exist yet, the line reads `Standards: none recorded — add with /devocd:company-policy`.
- PROJECT.md's `## Links` section becomes a real link to the company parent MD and the standards `index.md` (not backticked text), so the chain is folder page → parent pages → PROJECT.md → company parent → policy MDs. Constraint: `check`'s `ref/escape` rule flags links leaving the project — verify whether `../<companyRel>` links from PROJECT.md are allowed (company folder is an ancestor); if `ref/escape` rejects them, keep the company hop as a documented path with the escape exemption added for the recorded `companyRel` target only (change in `plugin/scripts/lib/check.mjs`, with a unit test).
- `plugin/skills/company-policy/references/workflow.md`: when a new policy topic is added, the routing update extends beyond PROJECT.md/pointer — regenerate the standards `index.md` task-trigger list so existing module pages' `Standards:` lines resolve through it (module pages themselves are not rewritten per policy; they name topics, the index routes topics to files — keeps policy additions O(1) instead of touching every page).
- Knowledge graph: **correction (2026-11-14):** this is not true today. Links that leave a project's `.devocd/` (to the company file or another project) are dropped when the graph is built, so the backtrack chain is not in the graph. Roadmap v2 task T4 fixes it.

**5f. Cross-project / git-based dependencies (user requirement).** Projects import each other not only file-wise but via git and package mechanisms; the knowledge must record these:
- New read-only helper `detect-dependencies` (in `plugin/scripts/lib/deps.mjs`, wired into `devocd.mjs`): parses `.gitmodules` (submodules), nested repos the inventory already flags (`nested-repository` skips — today silently dropped), and manifest-declared remote deps: `package.json` git/`workspace:`/`file:` deps, `requirements.txt`/`pyproject.toml` `git+` URLs, `go.mod` module requires + `replace` directives, `Cargo.toml` `git =` deps, `composer.json` VCS repos. Output: `{ name, kind: submodule|nested-repo|git-dep|workspace|registry, ref/url (sanitized), path? }`. Names and refs only — never clone, fetch or execute.
- PROJECT.md gains a `## Dependencies` section: each cross-repo dependency with its kind and ref. When a dependency matches another project registered in the company `state.json` registry (match by git remote URL or path), the line links to **that project's** PROJECT.md *via the company registry* — honoring the design rule "an agent never reads files from an unrelated project": the link is routed through the company parent, loaded only when a task actually needs the dependency, never preloaded.
- Company-level graph: `knowledge` at company scope adds `depends-on` edges between registered projects so the workspace graph shows which project imports which.
- knowledge-contract.md: module pages that import a cross-repo dependency name it (`Uses: <dep> — see PROJECT.md Dependencies`), keeping one owning fact location (the PROJECT section).
- Tests: unit fixtures per manifest kind (incl. a malicious URL with shell metacharacters — must be sanitized to text, never passed to a shell), a nested-repo fixture, and an e2e assertion that two demo projects with a git dep between them get the cross-link + company graph edge.

**5g. Thematic project pages (user requirement).** Beyond `code/` and `flows/`, PROJECT.md routes to thematic pages when the repo has the material (never invented, same evidence rules):
- `cicd.md` — pipelines and release process, detected from `.github/workflows/*`, `.gitlab-ci.yml`, `Jenkinsfile`, `azure-pipelines.yml`, Dockerfiles/compose: what each pipeline does, triggers, and which commands it runs (names only).
- `guides/` — a page per substantial user/developer guide found in `docs/`, `README` sections, `CONTRIBUTING.md`, linked (not copied) with a one-line summary each.
- `history.md` — optional and light: notable milestones from a CHANGELOG or release tags only; never a retelling of git log (git history already records itself).
PROJECT.md gains these under `## Parts of the code` / a short `## Project pages` list only when the pages exist. knowledge-contract.md records the rule: thematic pages follow the same evidence, budget and backtrack (`Standards:`) rules as module pages.

**5c. `plugin/agents/knowledge-builder.md`** — add one paragraph: a page must let a developer start coding (entry point, call path, covering test, extension recipe); a page that only paraphrases folder names fails the contract. All safety rules kept.

**5d. `plugin/skills/add-project/references/project-template.md`** — module-page example gains the new sections; PROJECT.md Commands section splits **Documented commands** (all `detect-commands` names) from **Approved for PR review** (only `state.json.approvedCommands`), with "documented is not approved" sentence — preserves the e2e assertion that `flows/pr-review.md` lists only approved commands.

## Phase 6 — company-policy pillar polish

- Backtracking already works (`references/workflow.md`: topic file → index.md routing → per-project PROJECT.md + pointer lines + render-parent). No structural change.
- **Required-policy pointer wording** (`project-template.md` pointer bullets): replace "It is optional: if this repo is used alone, carry on without it" with: when the project's state records a company (`companyRel`), company rules are **required** — if the parent file or standards are unavailable in the session, say so and ask before proceeding, never silently continue. Only a project with no registered company carries on alone.
- New `tests/unit/company-policy-skill.test.mjs`: static checks — read-only connector rule, draft-approval gate wording, no source text to shell; plus the pointer-template "required, never silently optional" wording.
- One `DEVOCD_LIVE`-gated e2e case: ingest a fixture Markdown "policy" into a topic and assert `standards/<slug>.md`, `index.md` routing, and a project routing line appear. Connector (Jira) ingestion stays documented-but-untested (no connector in CI); no new infra.

## Sequencing and verification

| PR | Phase | Verify |
|---|---|---|
| 1 | Phase 0 rename | `npm test`; `node scripts/validate-plugin.mjs`; grep `company-standards` → 0 hits outside docs history |
| 2 | Phase 1 | `npm test`; `DEVOCD_LIVE=1 node --test tests/e2e/add-project.test.mjs` |
| 3 | Phase 2 | `npm test`; `DEVOCD_LIVE=1 node --test tests/e2e/install.test.mjs` |
| 4 | Phase 3 | `npm test`; **manual e2e**: fresh `/devocd:setup --all` in `D:\work\demo\demo1\projects` — count interactions (target 7 for 5 projects); then a `--yes` run |
| 5 | Phase 4 | `npm test` (new inventory/refresh/notebook units); manual: on the demo workspace, `refresh-status` reports `current` for all 5 fresh projects (incl. Integration-demo with its log and Wine with its notebooks) |
| 6 | Phase 5 | `npm test`; manual add-project rerun on one demo project — inspect `code/*/index.md` for entry-points/run-test/extension/pitfalls sections, the `Standards:` backtrack line on every page, a real company-parent link in PROJECT.md Links, a `## Dependencies` section listing git/submodule/workspace imports with cross-project links, and real Commands in PROJECT.md; `check` passes (no `ref/broken`/`ref/escape` errors) |
| 7 | Phase 6 | `npm test` (footprint); live policy-ingestion e2e case |

Safety invariants untouched: one draft approval per write unit, `approved` literal as the only review stand-in, no git changes, read-only connectors, evidence/hash rules, launch budgets (parent 500 / pointer 400 / 2000 total). Canonical context-model files (`context-*.mjs`) untouched.


---

# Roadmap v2 (2026-11-14, from main dca7e06)

Everything above is the history of PR #13. What follows is the plan for all next
steps. Task numbers (T1-T28) match [TASKS.md](TASKS.md).


### Context

Main holds PR #13 (streamlined setup, freshness, developer-grade pages) and PR #14
(decision capture). No PRs are open. The user asked for an architect-level plan of
all next steps: include the knowledge graph, consider every feature, add or fix
whatever makes the assistant smarter, and use agents, subagents, hooks and skills
where they earn their place. Target behaviour: **leaf-first** — read the page
closest to the task, backtrack to parents, company policy or a skill only when
needed, with almost nothing loaded on every session.

Three read-only explorations of main and a check of the Claude Code docs produced
the findings this plan is built on.

#### What is wrong today (verified in code)

1. **Three systems that never connect.** The Markdown graph (`knowledge.mjs`), the
   canonical context model (`context-*.mjs`, with real policy conflict handling and
   incremental refresh) and the freshness snapshot (`refresh.mjs`) share no ids and
   no evidence. The strongest one is never on the default path, and nothing authors
   its input: an agent would have to hand-write the JSON.
2. **The graph is thin.** Nodes are whole Markdown files; edges are untyped links.
   `Standards:` lines, `Uses:` lines, Dependencies and Evidence are raw text nobody
   parses. Links leaving a project's `.devocd/` are silently dropped, so the
   backtrack chain to company policy and the cross-project links are **not in the
   graph** (docs/plan.md currently claims they are).
3. **Search is literal.** Every query word must appear as a substring; no stemming,
   stop words or ranking. The whole graph is rebuilt on every query, and one bad
   file breaks all search.
4. **Nothing uses the graph at task time.** No skill or agent runs the lookup
   commands. The pointer names commands the main session cannot run, because
   `${CLAUDE_PLUGIN_ROOT}` does not exist in the session's Bash.
5. **Refresh is all-or-nothing.** No mapping from a changed source file to the
   pages citing it; any change re-runs the whole project through the builder.
6. **Nothing validates content.** `check` is structural only: no required sections,
   no evidence parsing, no per-page staleness, no `decisions.md` format.
7. **Too much is always on, and the Stop hook costs a turn.** Parent file up to 500
   tokens (5 routing lines), pointer 10 bullets, listing 189 of 190, plus a Stop
   hook whose output continues the conversation after every turn.
8. **pr-review ignores the graph, decisions and the resolver.**
9. **Unproven.** No live end-to-end run of setup, capture or the e2e suite on main.

### Claude Code mechanisms this plan uses (confirmed in docs)

| Mechanism | What it gives | Used for |
|---|---|---|
| `.claude/rules/*.md` with `paths:` | Loads only when Claude reads/edits a matching file | Leaf-first delivery of each module page's essentials |
| Plugin `bin/` | Executables on the session PATH as bare commands | A runnable `devocd` command at task time |
| `UserPromptSubmit` hook | Context alongside the prompt, no extra turn | Policy by task type |
| `PostToolUse` hook (`Edit\|Write`) | Runs after an edit | Mark affected pages stale; record that work happened |
| `SessionStart` hook | Context before the first prompt | One line only when something is stale |
| Skill `` !`command` `` injection, `context: fork` | Inline helper output; run heavy skills in a subagent | pr-review, refresh |
| Parallel subagents (cap 20) | Fan-out | Builder per subtree / per project |
| Agent teams | Experimental, off by default | Not relied on |

### Target architecture

**One source, one compiled index, delivery at the moment of need.**

```
pages (.devocd/**/*.md, authored by builder, approved by user)
   │  structured header on every page: scope paths, Standards, Uses, Evidence
   ▼
compile (deterministic helper, no model)
   ├─ index.json      typed nodes + typed edges + evidence map (source file → pages)
   ├─ .claude/rules/devocd/*.md   one path-scoped stub per module page (git-excluded)
   ├─ knowledge.html  viewer over the same index
   └─ canonical model generated from the index (later stage)
   ▼
delivery
   ├─ editing src/billing/x.ts  → its rule stub loads natively (leaf)
   ├─ `devocd trace <path|words>` → leaf, parent chain, policies, freshness (backtrack)
   ├─ prompt mentions PR/Jira/deploy → hook injects the matching policy pointer
   └─ edit happens → hook marks citing pages stale; next session says so in one line
```

Two escalation rules stay explicit: **code knowledge escalates on need**; **company
policy escalates on task type or file path**, because an agent cannot know a rule it
has not read exists.

Always-on budget after the work: parent about 100 tokens, pointer about 60, listing
160 or less, no per-turn injection unless something matched.

### Task list (each = one PR; "needs" = must land first)

#### Stage 0 — Prove what is merged (no dependencies, start now)

- **T1 Manual e2e on the demo workspace.** Fresh `/devocd:setup --all` in
  `D:\work\demo\demo1\projects`: interaction count (about 7), `refresh-status`
  current for all five, page quality, capture approve and decline, Stop-hook firings
  over ten turns, and baseline launch tokens per project. Output: results note.
- **T2 Live e2e suite.** `DEVOCD_LIVE=1 node --test tests/e2e/`; fix or record.

#### Stage 1 — One index: make the graph carry meaning

- **T3 Structured page header.** Fixed, parseable lines on every module/flow page:
  `Scope:` source globs, `Standards:`, `Uses:`, `Evidence:` (`path#Lx-y sha256 date`).
  Update `knowledge-contract.md`, `project-template.md`, `knowledge-builder.md`. New
  `plugin/scripts/lib/pagemeta.mjs` parser with tests. Old pages still parse (fields
  empty).
- **T4 Index v3 with typed nodes and edges.** `knowledge.mjs` builds from T3: node
  `kind` (module, flow, policy, decision, thematic, generated), scope paths, summary,
  headings, tokens; edges typed `parent`, `links`, `governed-by`, `uses`,
  `depends-on`, `evidence`. Links leaving `.devocd/` are kept as external references
  instead of dropped. A bad file is skipped with a warning, not fatal. Queries read
  the saved index when page hashes match instead of rebuilding. Needs T3.
- **T5 Company graph.** Project nodes, policy nodes and `depends-on` edges from
  `detect-dependencies`; cross-project links resolved through the registry. Needs T4.
- **T6 Content checks.** New `check` rules: required sections present, `Standards:`
  line present, evidence parses, cited hash differs from current inventory
  (`evidence/stale`, per page), `decisions.md` entries well-formed (id, date,
  supersedes/retires targets exist, no cycles). Warnings first, so existing installs
  do not start failing. Needs T3.

#### Stage 2 — Retrieval that works with natural wording

- **T7 Ranked search.** Strip punctuation, drop stop words, light stemming, OR
  matching with field-weighted ranking (title, headings, path, summary, body),
  neighbour boost, generated pages down-weighted, best-line snippet. One search
  module shared by CLI and viewer. Needs T4.
- **T8 Retrieval evaluation set.** Golden queries with expected top-3 pages (start
  with "why are END events ignored", "can moving a folder lose state", "why do normal
  discounts fail") as a unit fixture, so search quality cannot regress. Needs T7.
- **T9 `trace` command.** `trace <source-path | words>`: leaf page, parent chain
  (ids, titles, tokens, no bodies), governing policy files, relevant decisions,
  per-page freshness, next hop. Uses T4 edges and the resolver when a canonical
  model exists. Needs T4.
- **T10 Viewer upgrade.** Edge types and node kinds as colour/shape, freshness
  badges, hierarchical layout, no 60-node cap by scope paging. Needs T4, T7.

#### Stage 3 — Delivery at the moment of need (the leaf-first stage)

- **T11 `bin/devocd` launcher.** `plugin/bin/devocd` plus `devocd.cmd`, so the main
  session runs `devocd trace …` as a bare command. Setup offers one opt-in to allow
  the read-only subcommands in `.claude/settings.local.json` (existing `settings`
  helper). Pointer and docs switch to the bare command.
- **T12 Path-scoped rule stubs.** Compile writes `.claude/rules/devocd/<scope>.md`
  per module page with `paths:` from `Scope:` and a body of ten lines or fewer:
  purpose, entry point, top pitfalls, governing policies, relevant decisions, link to
  the full page, stale marker. `protect` git-excludes the folder and refuses if it is
  tracked. First step of the PR: confirm subfolders and local-excluded rule files
  load as documented; if not, fall back to T13's hook. Needs T4.
- **T13 Hooks that replace routing text.** In `plugin/hooks/hooks.json`:
  `UserPromptSubmit` → match prompt against standards-index triggers, inject only
  matching policy pointers; `PostToolUse` on `Edit|Write` → append the touched path
  to a local journal and mark citing pages stale (no model cost); `SessionStart` →
  one line only if stale pages exist. All read bounded local state, under 100 ms,
  opt-out per scope with inheritance. Needs T4, T9.
- **T14a Immediate capture repair (implemented in PR 1).** Default-off Stop reminders,
  validated registered-company tri-state inheritance, canonical entry guard and
  ten-event subprocess replay. Stop is end of response, not task completion.
  No T13 dependency; explicit capture retains approval/history. Live ten-turn trial
  remains outstanding.
- **T14b Journal-gated reminders (pending).** Only remind after edits in scope since
  the last nudge. Needs T13; no journal infrastructure is added by T14a.
- **T15 Slim the always-on files.** Parent: name, hard prohibitions, two pointers.
  Pointer: three lines or fewer. Routing lines move to rule stubs and `trace` output.
  Lower writing targets in `tokens.mjs`; hard limits unchanged; near-cap parent
  fixture test. Needs T11, T12, T13.
- **T16 Listing diet.** Merge the three optional investigator agents into one with a
  mode argument; add `when_to_use` only where it helps; target 160 or less.

#### Stage 4 — Refresh proportional to change

- **T17 Incremental refresh.** `refresh-plan` uses the evidence map to list affected
  pages (and pages depending on them); the builder rewrites only those; baseline
  records per-page status. A change touching no cited file needs discovery only for
  new files. Needs T4, T6.
- **T18 Parallel builder.** add-project fans out one builder per top-level subtree
  in parallel and merges drafts; setup builds projects in parallel and keeps
  approvals sequential. Refresh and add-project run as forked subagents so the main
  conversation stays small. Needs T3.

#### Stage 5 — Smarter skills on top of the index

- **T19 pr-review uses the index.** For changed files: `trace` gives governing
  policies, decisions and module pitfalls; findings cite the rule and the page.
  Skill body inlines helper output at load. Needs T9, T11.
- **T20 Capture approval check.** Read-only helper verifies the history record
  exists before the README edit, since auto mode may show no permission prompt.
- **T21 Decisions in the graph.** Parse `decisions.md` entries into decision nodes
  with `supersedes`/`retires` edges and scope, so trace returns only current
  decisions for a path. Needs T4.

#### Stage 6 — Converge with the canonical model

- **T22 Generate the canonical model from the index.** Module/flow records from
  pages, evidence from the evidence map, `depends-on` from T5; publish through the
  existing atomic store after the same single approval. No hand-written JSON.
  Fix the notebook hash mismatch and the size-limit mismatch between inventory and
  evidence first. Needs T4, T5.
- **T23 Structured policies.** Optional key/value/exceptions header in standards
  files so policies become canonical policy records with conflict detection; `trace`
  and the prompt hook then use the resolver. Needs T22.

#### Stage 7 — Measure, polish, release

- **T24 Measure.** Launch tokens before/after Stage 3; three real tasks on plain
  assistant vs short index vs full DevOCD. Needs T15.
- **T25 Inventory polish.** Notebook bytes toward the 16 MiB budget; `.out`/`.dat`/
  `.map` as bulk; fingerprint printed by `knowledge-inventory` matches what it shows.
- **T26 Detector polish.** bun lockfile; tolerate EACCES; anchor the TOML regex;
  PEP 621 and go.mod git requires; walk-cap marker.
- **T27 Stale cross-project links on rerun.**
- **T28 LICENSE and icon.**

#### What can run in parallel (for handing out)

- Now, independent: T1, T2, T11, T16, T20, T25, T26, T28.
- After T3: T4, T6, T18. After T4: T5, T7, T9, T12, T21. Then Stage 3 in order.

#### Risks to state up front

- Hooks run on every prompt and edit: they must stay fast and read only the saved
  index; T4's cached index is a precondition.
- Rule stubs are a new file location in user projects (`.claude/rules/devocd/`):
  local-excluded, never tracked, removable by deleting the folder.
- Structured headers only work if the builder writes them consistently; T6 enforces.
- Everything here is delivery by Claude Code features; Codex/Antigravity keep the
  `TOOLS.md` path and gain only `trace` and better search.

