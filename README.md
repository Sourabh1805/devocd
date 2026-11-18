# DevOCD

Give your coding assistant the right project knowledge, company policies, and
approved decisions for the task—without loading every document.

**Claude Code plugin · v0.1.0 · pre-v1 pilot.** Codex and Antigravity have optional
guidance integrations; equivalent behavior across assistants is not yet verified.

## Install and start

Requires **Claude Code**, **Node.js 22.13+**, and access to this private repository.
Install and sign in to Claude Code using its
[setup guide](https://code.claude.com/docs/en/setup).

Inside Claude Code, install at **user scope** for use across projects:

```text
/plugin marketplace add Sourabh1805/devocd
/plugin install devocd@devocd
```

Follow any reload instructions, then confirm DevOCD is enabled in `/plugin`.
Start a session in the **parent folder containing your projects** and run:

```text
/devocd:setup --all
```

Choose projects, review the drafts, and approve each setup. Git and non-Git folders
work. In a project session, run `/devocd:check` to verify setup.

**Local checkout alternative:** launch
`claude --plugin-dir "D:/work/DevOCD/plugin"` from your parent workspace.
If plugin reference reads are blocked, use
`/add-dir D:/work/DevOCD/plugin` for that checkout and retry.
See the [detailed installation guide](plugin/README.md#install).

## Skills, agents, hooks, and features

| Type | Name / command | What it does |
| --- | --- | --- |
| Skill | `/devocd:setup [path \| --all]` | Onboards a workspace and its projects, with draft approval. |
| Skill | `/devocd:install` | Sets up company rules, sources, and the project registry—not the plugin itself. |
| Skill | `/devocd:add-project [path]` | Maps a project into nested module/flow pages and records source freshness. |
| Skill | `/devocd:company-policy [topic] <source>` | Turns a description, document, or accessible URL into shared policy guidance. |
| Skill | `/devocd:pr-review [quick \| standard \| deep] [base \| PR]` | Reviews changes against project knowledge and policies; runs only permitted checks. |
| Skill | `/devocd:refresh [path]` | Rebuilds affected knowledge after source changes, preserving decisions. |
| Skill | `/devocd:check [folder]` | Reports setup, evidence, link, size, and redundancy issues without editing. |
| Skill | `/devocd:capture [scope]` | Proposes approved decision/documentation updates and preserves history. |
| Agent | Knowledge Builder | Reads bounded source evidence and drafts project knowledge. |
| Agent | Decision Keeper | Proposes small durable documentation updates from task evidence. |
| Optional agent | Mapper | Proposes evidence-backed relationships. |
| Optional agent | Policy Auditor | Identifies contradictions and stale policy evidence. |
| Optional agent | Incident Investigator | Follows service/runbook dependencies; does not remediate incidents. |
| Hook | UserPromptSubmit | Adds matching company policy pointers. |
| Hook | PostToolUse | Journals supported edits and marks citing pages stale. |
| Hook | SessionStart | Reports recorded stale knowledge. |
| Hook | Stop | Offers an end-of-response capture reminder; **off by default**. |
| Delivery | Path-scoped rule notes | Supplies relevant module guidance when matching files are opened in Claude. |
| CLI | `trace`, `knowledge-route`, `knowledge-search` | Finds task-relevant pages, parents, policy pointers, and freshness. |
| CLI | `knowledge`, `knowledge-scope` | Generates a local graph/offline viewer and reads scoped subgraphs. |
| CLI | `discover-projects`, `detect-commands` | Lists project candidates and documented command names without running them. |
| CLI | `detect-dependencies` | Finds repo dependencies and artifact references, with source locations and evidence levels. |
| CLI | `review-context`, `review-diff` | Supplies changed-file knowledge and local Git diffs for review. |
| CLI | `refresh-status` | Checks source changes since the saved baseline. |
| CLI | `integrate` | Previews/installs Codex or Antigravity guidance; does not install Claude skills or hooks there. |
| CLI | `claims-check` | Validates structured claims; does not establish their truth or learn from history. |
| Opt-in foundation | `context-*` commands | Resolves scoped policies, publishes immutable generations, and tracks evidence impact. |
| Local support | Backup/restore and personal instruction split | Supports recovery and optional splitting of large team instructions. |

Slash commands belong to Claude Code. CLI names above are helper commands:
`node <plugin>/scripts/devocd.mjs <command> ...`.
The first three hooks use `devocdHooks`; the Stop reminder uses `decisionCapture`.
See [hook settings](plugin/README.md#hooks).

## What to expect

**Setup → approve → retrieve → work → refresh or capture.** Small startup pointers
lead to `.devocd/PROJECT.md`, nested knowledge, policies, and decision history.
Agents propose; approved workflows apply changes. There is no background model.

Generated project knowledge is normally local and Git-excluded: a new clone does
not receive it, and `git clean -xdf` can remove it and local backups. Source hashes
detect change, not whether an explanation is correct. Model work costs tokens;
savings are not guaranteed.

## Before v1

Core workflows exist. Release still needs current real-project trials, green
cross-platform checks, policy-preservation tests across assistants, measured
task results/costs, and final licensing/packaging.

**Not shipped:** `/devocd:learn`, automatic PR/chat-history ingestion, and a completed
company artifact map. Claim validation and evaluation fixtures are foundations only.

[User guide](plugin/README.md) · [Integrations](docs/tool-integrations.md) ·
[Canonical context](docs/deterministic-foundation.md) ·
[Roadmap](docs/TASKS.md) · [Trial evidence](docs/release-readiness.md) ·
[Limitations](docs/known-limitations.md) · [Security](SECURITY.md)

## Development

No npm dependencies to install:

```text
node --test "tests/unit/**/*.test.mjs"
node scripts/validate-plugin.mjs
```

Live suites require `DEVOCD_LIVE=1` and incur model charges. Agree on a total budget
before running them; the default $10 cap is **per suite**, not per release trial.
