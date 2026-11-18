# DevOCD

Give your coding assistant the right project knowledge, company policies, and
approved decisions for the task—without loading every document.

**Claude Code plugin · v0.1.0 · pre-v1 pilot.** Codex and Antigravity have optional
guidance integrations; equivalent behavior across assistants is not yet verified.

## Install and start

Requires **Claude Code**, **Node.js 22.13+**, and access to this private repository.
PR reviews also need Git (branches) or `gh` (GitHub PRs).
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

## Skills

| Command | What it does |
| --- | --- |
| `/devocd:setup [path \| --all]` | Onboard a workspace and its projects; you approve each draft. |
| `/devocd:install` | Record company rules and the project registry (not the plugin install). |
| `/devocd:add-project [path]` | Map one project into module and flow pages. |
| `/devocd:company-policy [topic] <source>` | Turn text, a file or a reachable URL into a shared policy. |
| `/devocd:pr-review [quick \| standard \| deep] [base \| PR]` | Review a change against knowledge and policies; runs only approved checks. |
| `/devocd:refresh [path]` | Rebuild only the pages a source change affected. |
| `/devocd:check [folder]` | Report setup, link, evidence, size and repetition issues; edits nothing. |
| `/devocd:capture [scope]` | Propose a decision update; writes only after approval. |

**Agents** (propose, never publish): Knowledge Builder, Decision Keeper; optional
Mapper, Policy Auditor, Incident Investigator.

**Hooks** (local, no network): policy pointers on prompt, stale marks on edit, a stale
notice at session start (`devocdHooks`); capture reminder on stop, **off by default**
(`decisionCapture`). Module notes load when you open a matching file.
[Hook settings](plugin/README.md#hooks).

**Helper CLI** (`node <plugin>/scripts/devocd.mjs <command>`): `trace` and
`knowledge-search` find the relevant pages; `refresh-status` shows what changed;
`detect-dependencies` lists repo and artifact dependencies; `claims-check` validates
claims; `integrate` adds Codex/Antigravity guidance; `context-*` is the opt-in
canonical model. Run `devocd.mjs` with no arguments for the full list.

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
