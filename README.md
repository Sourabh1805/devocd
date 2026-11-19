# DevOCD

**Claude Code plugin · v0.1.0 · pre-v1**

Scoped project context, company policies, dependency graphs, PR review, and decision history.

## Install and start

Requires: Claude Code · Node.js ≥22.13 · private-repo access.
Reviews: Git / GitHub CLI (`gh`).

Inside Claude Code; select **user scope**:

```text
/plugin marketplace add Sourabh1805/devocd
/plugin install devocd@devocd
```

From the parent workspace: `/devocd:setup --all` → approve drafts.
From a project: `/devocd:check`. Non-Git projects supported.

Local alternative: `claude --plugin-dir "/absolute/path/devocd"`.
Blocked plugin reads: `/add-dir /absolute/path/devocd`.
Confirm installation with `/plugin`. Disable with `/plugin disable devocd@devocd`.
Settings: `.devocd/state.json` accepts `devocdHooks: false` to disable hooks and `decisionCapture: true` to enable capture reminders.
Backups: `node scripts/devocd.mjs backup <folder>` saves up to 5 rolling snapshots under `.devocd/.backups/`; `restore <folder> <stamp>` recovers them.

## Components

Repository layout follows [Superpowers](https://github.com/obra/superpowers):
plugin metadata in `.claude-plugin/`, with `skills/`, `agents/`, `hooks/`,
`scripts/`, `bin/` and `references/` at the root; `docs/` and `tests/` hold
documentation and verification. See the [v1 launch assessment](docs/v1-launch.md).

| Type | Component | Function |
| --- | --- | --- |
| Skill | `/devocd:setup` | Workspace onboarding |
| Skill | `/devocd:install` | Company configuration + registry |
| Skill | `/devocd:add-project` | Module/flow discovery + baseline |
| Skill | `/devocd:company-policy` | Text/file/URL → shared policy |
| Skill | `/devocd:pr-review` | Context-aware review; approved checks |
| Skill | `/devocd:refresh` | Incremental refresh; full-rebuild fallback |
| Skill | `/devocd:check` | Read-only validation |
| Skill | `/devocd:capture` | Approved decision/doc updates |
| Agent | Knowledge Builder | Source → knowledge drafts |
| Agent | Decision Keeper | Durable update proposals |
| Optional agent | Mapper | Relationship proposals |
| Optional agent | Policy Auditor | Conflicts + stale evidence |
| Optional agent | Incident Investigator | Service/runbook tracing |
| Hook | UserPromptSubmit | Policy pointers |
| Hook | PostToolUse | Edit journal + stale markers |
| Hook | SessionStart | Staleness notice |
| Hook | Stop | Capture reminder; default **off** |
| Delivery | Path-scoped rules | Module context on file access |
| CLI | `trace`, `knowledge-*` | Retrieval + graph/viewer |
| CLI | `detect-*`, `review-*`, `refresh-status` | Discovery + review context + freshness |
| CLI | `integrate` | Codex/Antigravity guidance |
| CLI | `claims-check`, `context-*` | Claim validation + opt-in canonical context |
| Support | Backup/restore; instruction split | Local recovery + context sizing |

CLI: `node <plugin>/scripts/devocd.mjs <command>`.
Hooks run locally with zero network calls and read no transcripts.
Workflows draft changes under `.devocd/draft/`; writes require approval.
`/devocd:capture` writes approved decisions to `decisions.md` and records hunks under `.devocd/decision-history/`.
Large `CLAUDE.md` files (>200 lines) can be split into personal and team instructions.

## Boundaries

- Output: `.devocd/` + startup pointers; local, normally Git-excluded.
- Agents propose; writes require workflow approval. No background model.
- Team sharing: `.devocd/` is local; share policies by committing `.devocd/standards/` or running `/devocd:company-policy`.
- Single checkout: each project folder maps one checkout; links and junction parents are refused.
- Network: helper scripts make no network calls; all operations run locally.
- Codex/Antigravity: guidance adapters, not Claude skills/hooks; parity unverified.
- Hashes detect changes, not truth. Token savings unproven.
- Pending: `/devocd:learn`, history ingestion, company artifact map.
- v1 gates: real-project trials, cross-platform CI, policy/assistant validation, cost measurements, licensing.

## Validate

```text
node --test "tests/unit/**/*.test.mjs"
node scripts/validate-plugin.mjs
```

Live trials: paid, opt-in (`DEVOCD_LIVE=1`); budget approval required.

[Docs](docs/README.md) · [Archive Guide](docs/archive/guide.md) · [Integrations](docs/tool-integrations.md) ·
[Architecture](docs/deterministic-foundation.md) · [Roadmap](docs/TASKS.md) ·
[Evidence](docs/release-readiness.md) · [Limits](docs/known-limitations.md) · [Security](SECURITY.md)
