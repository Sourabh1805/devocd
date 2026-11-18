# DevOCD

DevOCD gives coding assistants a reusable map of your projects, company policies,
and approved decisions. It is a Claude Code plugin: set up a parent workspace,
onboard its projects, then retrieve the knowledge relevant to a coding task or PR
instead of loading every document into the conversation.

**Status: pre-v1, suitable for supervised pilot evaluation.** The plugin manifest
is version **0.1.0**. Core workflows are implemented; current end-to-end evidence,
cross-assistant verification, and public-release packaging remain incomplete.
See [the v1 release gates](#position-toward-v1) before relying on it company-wide.

## Installation and first run

### 1. Prepare your machine

Requirements: Claude Code, Node.js **22.13 or later**, and access to this currently
private repository. Git is needed for branch reviews; GitHub CLI (`gh`) and access
to the target repository are needed for GitHub PR reviews. Ordinary project
onboarding does not require Git.

Install Claude Code using its [official setup guide](https://code.claude.com/docs/en/setup)
and sign in when you first run `claude`. Install Node.js separately for DevOCD's
helpers, then confirm both commands work in your terminal:

```text
node --version
claude --version
```

Node must report v22.13.0 or newer. Use a Git credential setup that can read
`Sourabh1805/devocd`; a Claude login alone does not grant private GitHub access.

### 2. Install the plugin from GitHub

Launch `claude`, then enter these **inside Claude Code**, not in PowerShell/Bash:

```text
/plugin marketplace add Sourabh1805/devocd
/plugin install devocd@devocd
```

Choose **user scope** for use across your parent workspace and project folders.
Follow any activation/reload instructions printed by your Claude Code version.
Open `/plugin` to confirm DevOCD is installed and enabled, then type
`/devocd:` to check that its skills appear. See the
[official plugin installation guide](https://code.claude.com/docs/en/discover-plugins)
for installation scopes and host-specific controls.

### Alternative: try a local checkout

Skip the marketplace installation if you want to load the plugin for one session.
Clone it once to a separate tools folder; do not put it among the project folders
you intend to onboard. Example terminal commands on Windows:

```text
git clone https://github.com/Sourabh1805/devocd.git D:/work/DevOCD
```

If that checkout already exists, reuse it. From your project's **parent workspace**,
launch Claude with the absolute plugin path:

```text
claude --plugin-dir "D:/work/DevOCD/plugin"
```

On macOS/Linux, use your checkout's absolute path, such as
`claude --plugin-dir "$HOME/tools/devocd/plugin"`. There is no `npm install` step.
The flag loads the local plugin for that session; use it again for subsequent
local-plugin sessions.

### 3. Set up your workspace

Start the session in the **parent folder containing your projects**, for example
`D:/work/demo/demo1/projects`, then run:

```text
/devocd:setup --all
```

Setup lists eligible immediate subfolders, including non-Git projects. Choose the
projects and integrations, review the company draft, then approve each project
draft. Deeper folders become module knowledge within their project. A personal
workspace can act as the parent; you do not need to invent company policies.

If Claude reports that plugin reference files are outside permitted directories,
grant the reported plugin directory through `/add-dir`, then retry. For the local
checkout above: `/add-dir D:/work/DevOCD/plugin`. Do not bypass denied reads.

### 4. Verify and use it

After setup, open a project session with DevOCD enabled and run:

```text
/devocd:check
```

Confirm that the project has `.devocd/PROJECT.md`, a local startup pointer, and a
freshness baseline, and resolve reported setup errors. For a Git project, review
against an existing base branch (replace `main` if needed); after source changes,
refresh the knowledge:

```text
/devocd:pr-review quick main
/devocd:refresh
```

If skills are missing, check `/plugin` and the session's plugin-loading options.
If cloning or marketplace access fails, verify repository access and Git
authentication. `/devocd:install` configures company data **after** the plugin is
available; it is not a substitute for the installation steps above.

Full setup options, answers files, recovery, and removal are documented in the
[plugin user guide](plugin/README.md).

## All eight skills

These slash commands belong to the Claude Code plugin. They are not automatically
installed as Codex or Antigravity skills.

| Skill | Purpose and behavior |
| --- | --- |
| `/devocd:setup [project-path \| --all] [--yes]` | Coordinates company installation, selected projects, checks and optional assistant integration. Batches questions; keeps one draft approval per unit. `--yes` accepts defaults, not unreviewed writes. |
| `/devocd:install [answers-file]` | Records supplied company/personal-workspace rules and sources, creates parent guidance and company state, and prepares the registry. This configures a workspace; it does not install the plugin itself. |
| `/devocd:add-project <project-path> [answers-file]` | Inventories sources, delegates nested module/flow drafting, proposes review commands, registers the project and records a setup freshness baseline after approval and checks. Also supports reruns. |
| `/devocd:company-policy [topic] <description \| file \| URL>` | Drafts one authoritative policy per topic and routes registered projects to it. Sources require accessible readers/connectors; originals remain untouched. |
| `/devocd:pr-review [quick \| standard \| deep] [base-branch \| PR number or URL]` | Reviews the diff using relevant knowledge, policies, decisions and stack guidance. Quick runs no project checks; standard/deep use approved commands. Remote PR reviews block repository commands. |
| `/devocd:refresh [project-path]` | Compares source snapshots and rebuilds affected pages incrementally where possible, otherwise uses full discovery. Requires approval and preserves durable decisions. |
| `/devocd:check [folder]` | Read-only checks for structure, links, evidence, content, size and repeated context. Reports issues and suggested fixes; does not repair files or prove every claim true. |
| `/devocd:capture [scope-path]` | Proposes an exact README/decision patch and history entry. Writes need explicit approval; later decisions can supersede or retire earlier entries. |

Examples of policy input:

```text
/devocd:company-policy pr style Include context, testing, and rollout notes.
/devocd:company-policy jira style ./docs/jira-template.md
/devocd:company-policy networking ./docs/network-policy.pdf
```

A topic alone prompts for actual rules. A URL is not a guarantee that its contents
are accessible. Inaccessible sources are reported rather than invented.

## How it behaves during work

1. **Discover and draft.** A bounded inventory records source coverage and hashes.
   The knowledge-builder proposes pages with entry points, interfaces, commands,
   extension guidance, pitfalls and runtime flows.
2. **Review and apply.** Full drafts live under `.devocd/draft/`; chat presents a
   summary for approval. The workflow protects local files, creates backups,
   applies supported changes and checks the result.
3. **Retrieve for the task.** Short startup guidance points to the project index.
   Ranked search and `trace` locate relevant pages, parents, policies and freshness.
   The assistant still verifies claims against source before editing.
4. **Notice changes.** Claude hooks can mark cited pages stale after edits. Source
   snapshot checks also detect changes outside Claude, including after Git pulls.
5. **Refresh or capture.** Refresh updates derived knowledge; capture saves approved
   durable decisions. Rescanning source does not erase decision history.

There is no background model or automatic Git-pull daemon. A stale marker signals
that knowledge needs attention; it does not mean refresh has happened.

## Features available now

| Feature | Behavior and boundary |
| --- | --- |
| Workspace discovery | One parent registers multiple Git or non-Git projects. Hidden, dependency/build folders and links are excluded from project discovery. |
| Layered knowledge | Compact entry files lead to nested module/flow pages. Small folders can be folded into an owning module rather than getting a page each. |
| Graph and offline viewer | Local JSON/HTML, scoped views, typed relationships and external references derived from knowledge pages. A discovery snapshot, not live service topology. |
| Ranked search and trace | Task words or source paths lead to relevant pages, parent chains, policy pointers and freshness. No external vector database required. |
| Company policy routing | Policies remain in the parent workspace; projects reference them. Explicit deterministic resolution is an opt-in workflow described below. |
| Context-aware PR review | Reads changed-file knowledge and verifies findings against code. Reports passed, failed, skipped, unavailable and blocked checks; missing evidence is not success. |
| Incremental refresh | Maps source changes to affected pages, with full-rebuild fallback. Concurrent changes or incomplete coverage must not be certified current. |
| Durable decisions | Approved entries and local history survive refresh. Historical text is excluded from normal current-knowledge search. |
| Context and redundancy checks | Estimates launch/page sizes and reports repeated text across layers. Near matches are advisory; estimates are not measured savings. |
| Dependency and artifact detection | Finds repository dependencies and image, S3, registry, Terraform and Helm references with source locations. Levels distinguish declared, built and published configuration evidence, not successful runtime deployment. |
| Personal instruction split | Optionally splits a large top-level team `CLAUDE.md` into local sections and changes its loading exclusion while preserving the team file. Reversible and opt-in. |
| Backup and restore | Supports local recovery, with preservation rules for durable decisions/history. Not an off-machine backup. |
| Claim validation | `claims-check` validates statement categories, authority, scope and evidence. It does not collect history or establish that a statement is true. |

The **opt-in canonical context workflow** adds explicit company/project/cloud/
environment selection, schema validation, immutable generations, atomic activation,
policy-conflict handling, dependency impact and assistant payloads. It coexists
with ordinary Markdown setup; automatic convergence is still planned. See the
[deterministic foundation](docs/deterministic-foundation.md).

### Five agents

Agents propose knowledge or findings; they do not independently grant permissions
or publish changes.

| Agent | Role |
| --- | --- |
| Knowledge Builder | Reads bounded source evidence and drafts module/flow knowledge during onboarding or refresh. |
| Decision Keeper | Compares task evidence with documentation and proposes small durable updates for capture. |
| Mapper — optional | Proposes evidence-backed relationships within supplied scope and budgets. |
| Policy Auditor — optional | Identifies contradictions, missing provenance and stale policy evidence; does not choose a winning policy. |
| Incident Investigator — optional | Follows supplied service/runbook dependencies, separates observations from hypotheses and flags stale evidence. Does not query live infrastructure or remediate incidents. |

### Claude hooks and assistant support

| Delivery | Behavior |
| --- | --- |
| Prompt hook | Adds up to three matching company policy pointers from the local topic index. |
| Edit hook | Journals supported Claude edits and marks pages citing those paths stale. |
| Session-start hook | Emits a short notice when recorded stale pages exist. |
| Stop hook | Optional end-of-response capture reminder. **Off by default**; response completion is not task completion. |
| Path-scoped rule notes | Generated module notes support context delivery when matching source files are opened in Claude Code. |

The first three hooks use `devocdHooks`; capture reminders use `decisionCapture`.
See [hook preferences](plugin/README.md#hooks). Hooks operate locally without model
calls, network access or transcript reading. Drafting and review use the host model.

**Claude Code is the primary integration.** Codex and Antigravity can receive native
startup guidance and a local runtime through `integrate`; preview precedes `--apply`.
They do not receive Claude's plugin commands, agents or hooks. Equivalent end-to-end
behavior is not yet established. See [integration instructions](docs/tool-integrations.md).

## What gets created

Representative layout; optional pages appear only when applicable:

```text
workspace/
  CLAUDE.md                    parent guidance and project routing
  .devocd/
    state.json                 company configuration and project registry
    standards/                 approved policy topics and index
  project/
    CLAUDE.local.md             local startup pointer
    .claude/rules/devocd/       generated path-scoped notes
    .devocd/
      state.json               project configuration
      PROJECT.md               project entry point
      code/                    nested module knowledge
      flows/                   review configuration and runtime flows
      decisions.md             approved durable decisions, when present
      decision-history/        approved capture history
      knowledge.json           generated graph
      knowledge.html           offline viewer
      refresh.json             source freshness baseline
```

Project outputs are normally local and Git-excluded. A new clone or worktree does
not automatically receive them; `git clean -xdf` can delete them and local backups.
Sharing requires an explicit team choice. Assistant integration can edit tracked
instruction files through its opt-in workflow.

## Useful local commands

From this repository root, replacing the project path as needed:

```text
node plugin/scripts/devocd.mjs check "D:/work/demo/demo1/projects/ecommerce-app"
node plugin/scripts/devocd.mjs trace "D:/work/demo/demo1/projects/ecommerce-app" "purchase pricing"
node plugin/scripts/devocd.mjs refresh-status "D:/work/demo/demo1/projects/ecommerce-app"
node plugin/scripts/devocd.mjs detect-dependencies "D:/work/demo/demo1/projects/ecommerce-app"
```

These examples are read-only. Other CLI commands generate graphs, install guidance,
restore backups or publish context and therefore write files. The helper has no npm
dependencies and makes no network calls. Skills may use host web tools/connectors
for supplied sources; PR retrieval uses `gh`.

## Position toward v1

Assessment as of **2026-11-18**: **pre-v1 pilot software, not a validated company-wide
release**. This is an engineering assessment, not a percentage inferred from tasks.

| Release gate | Current position | Evidence needed |
| --- | --- | --- |
| Core workflows | Eight skills and five agents implemented | Current real-project setup, review, refresh and capture trials, including decline/recovery paths |
| Automated checks | Local suite passes; three-OS CI configured | Green checks for the exact release commit; configured CI is not itself a passing result |
| Real workspace validation | Earlier demo/live-test records exist | Re-run the five-project demo with current code; verify coverage, freshness, quality and interactions |
| Policy/context selection | Routing and opt-in canonical resolver implemented | Three repositories, nested AWS/Azure scopes, conflicting policies and a stale runbook; required policies preserved |
| Assistant portability | Guidance adapters implemented | Observe equivalent required-context selection and task completion in at least Claude and Codex |
| Practical value | Some earlier controlled results | Compare plain assistant, concise index and DevOCD on correctness, task success, latency, tool calls and actual tokens/cost |
| Public distribution | Private repo, provisional name, no declared license or final icon | Decide license/branding, verify clean installation, publish release notes and a supported version |

Local verification on November 18, on `feat/learning-fixture` at `989e4ef` plus
these documentation edits: **592 tests passed, 0 failed, 4 skipped, 6 TODO**.
Plugin validation passed at about **189 estimated listing tokens** against a 190
budget; missing license and icon remain explicitly tolerated. PR #36 is still open;
its latest CI jobs did not start because of an account billing/spending-limit
restriction. These local results do not establish a green cross-platform release.

The [recorded live trials](docs/release-readiness.md) ran November 9–10, before much
of the current functionality. They are historical evidence, not certification of
this revision. One install reporting case remained imperfect; an earlier small
routing comparison used more input tokens with DevOCD, not fewer. See
[known limitations](docs/known-limitations.md).

**Not shipped:** `/devocd:learn`, automatic PR/chat-history ingestion, automatic
promotion of learned conventions, and a completed company-wide artifact map. The
claim validator is a foundation, not a learning workflow. The learning evaluation
fixture is under review in [PR #36](https://github.com/Sourabh1805/devocd/pull/36);
future-pipeline TODO cases are not passing behavioral evidence.

Recommended v1 scope: prove setup → retrieve → review → refresh → capture first.
History learning can follow in a later release rather than block a narrowly scoped
v1. Track work in [TASKS.md](docs/TASKS.md) and [the design plan](docs/plan.md).

## Validation and costs

You need Node 22.13 or later. There are no dependencies to install.

Unit tests, which are free and run in CI on Windows, Linux and macOS:

```text
node --test "tests/unit/**/*.test.mjs"
```

Check the plugin's shape (manifest, skills, file sizes, link types) with
`claude plugin validate`, and its always-on token cost with
`claude plugin details` (it fails over 190). Both are local commands with no
model call. The current eight-skill budget is 190 estimated tokens. Without the `claude` CLI on PATH, the check is skipped:

```text
node scripts/validate-plugin.mjs
```

The live suites in `tests/e2e` run real `claude -p` sessions, incur usage charges
and never run in CI. They need Claude Code and a login, and are disabled unless
`DEVOCD_LIVE=1`. Agree on a total budget before running live assistant comparisons.

Each suite stops at a spend cap, by list-price estimate. The default is
$10 per suite. Set `DEVOCD_LIVE_CAP_USD` to change it. Results so far are
in [docs/release-readiness.md](docs/release-readiness.md), and what the
tests do not cover is in [docs/known-limitations.md](docs/known-limitations.md).
The per-suite cap is not a total release-trial budget. The project launch budget
is 2,000 estimated tokens; neither that nor the listing budget guarantees total
conversation usage or billing.

Skills guide model behavior; they are not a security enforcement boundary. Source
hashes show whether evidence changed, not whether an explanation is correct.
Reviews do not deploy, stage, commit, push or post PR comments in their normal
workflow. See [SECURITY.md](SECURITY.md) for the threat model and reporting.

## Layout

```text
.claude-plugin/marketplace.json   the marketplace entry, pointing at plugin/
plugin/                           what ships
  .claude-plugin/plugin.json
  agents/                         builder, decision keeper and three optional investigators
  hooks/hooks.json                policy routing, stale tracking and optional capture reminder
  README.md                       for people who use the plugin
  scripts/devocd.mjs, lib/        the helper: checks, safe edits, review-diff
  skills/{setup,company-policy,install,add-project,pr-review,refresh,check,capture}/
tests/{unit,e2e,fixtures,helpers}/
scripts/validate-plugin.mjs
docs/                             limitations, readiness record, design, research
.github/workflows/ci.yml
```
