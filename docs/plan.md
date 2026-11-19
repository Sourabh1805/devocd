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

Local tests on every PR (CI skipped for now, re-enabled before the tag); a live run of the five-project demo; a measured comparison
with the plain assistant (DevOCD at least as correct, tokens reported honestly); a
clean marketplace install on fresh Windows and macOS profiles; a one-week pilot on
`v1.0.0-rc.1`. Then license, icon, version 1.0.0, changelog and release.
