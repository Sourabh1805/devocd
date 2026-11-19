# Version 1 launch assessment

Assessed 18 November 2026 against local baseline `0416819` and the root-layout
migration. Estimates assume one full-time developer, a frozen scope, access to
representative projects and a separately agreed budget for paid live trials.
They are planning ranges, not a measured delivery forecast.

## Estimate and scope

**Focused Claude Code v1: 2–4 working weeks.** Keep the eight existing skills,
policy pointers, project knowledge, search/trace, incremental refresh, PR review,
and explicit approved decision capture. Keep automatic capture reminders off by
default and canonical context opt-in. Describe Codex/Antigravity integrations as
guidance adapters unless their behavior is independently verified.

**A v1 that includes trustworthy PR-history learning and canonical convergence:
6–10 working weeks.** This requires the additional T46–T51 dependency chain,
evidence integration, retrieval evaluation and live verification. Company artifact
maps and chat/memory ingestion (T52/T53) should remain later work. Finishing every
unchecked roadmap item is a larger scope and is not covered by these estimates.

## Current evidence

Migration checks on 18 November: unit suite **592 passed, 0 failed, 4 skipped,
6 TODO (602 total)**. Local Claude plugin validation passed at approximately
**189 always-on tokens against a 190-token budget**, tolerating only the missing
license and icon. No paid live trials or remote CI run were performed here.

- Eight skills, five agents, hooks, local CLI/runtime, manifests and a three-OS CI
  workflow exist. The manifest still declares version 0.1.0.
- Historical live results on 9–10 November include add-project 34/34 and PR review
  46/46 on repeated runs; install was 21/22. These are synthetic Windows/Sonnet
  trials and predate later functionality. See [release evidence](release-readiness.md).
- The known install failure is incomplete listing of 40 rules in the assistant's
  reply; the helper prints all rules and no files are written. Resolve or explicitly
  accept/document this before release.
- Current roadmap items T1/T2 still call for fresh manual and live trials. The
  historical CI claim does not establish that today's root migration passes CI.
- No LICENSE or icon is shipped. Validation currently tolerates both omissions.
- Savings are unproven: historical routing trials used more input tokens than the
  baseline. Do not market estimated context size as measured cost savings.
- `/devocd:learn` is absent; learning tests contain intentional TODOs. A passing
  deterministic suite cannot establish live assistant behavior or feature completeness.

## Critical path for focused v1

| Work | Effort estimate | Exit evidence |
| --- | --- | --- |
| Root-layout migration, installation and packaging checks | 1–2 days | Unit suite, plugin validation, clean-install/upgrade smoke test and three-OS CI |
| Correctness hardening | 3–5 days | Review T20 capture history ordering, T25 inventory bounds, T26 detectors, T27 stale cross-project links, T29 glob consistency; fix or explicitly narrow supported scope |
| Current live and real-project trials (T1/T2) | 3–5 days | Fresh setup, rerun, refresh after edits, policy delivery, review, capture approval/decline and recovery on representative projects |
| Release packaging and claim verification | 2–3 days | Owner-selected license, icon, current limitations, measured footprint/cost, version and release notes |
| Regression fixes and contingency | 1–5 days | Retest failures and final release-candidate sign-off |

Total: approximately 10–20 working days. Trial failures, unavailable testers or a
wider support promise can extend it. Paid trials were not run for this assessment.

## Repository layout

Inspired by [obra/superpowers](https://github.com/obra/superpowers), retaining
DevOCD's own runtime and agent components:

```text
devocd/
  .claude-plugin/   # plugin.json and marketplace.json (source ./)
  .github/          # CI
  agents/           # agent definitions
  bin/              # devocd and Windows launcher
  hooks/            # hook registration
  skills/           # each skill's SKILL.md and references
  references/       # shared context contract
  scripts/          # CLI, hooks, validation and evaluation
    lib/            # deterministic runtime modules
  docs/             # guide, architecture, plans and release evidence
  tests/            # unit, e2e, helpers and fixtures
  README.md
  SECURITY.md
  package.json
```

Local loading now uses `claude --plugin-dir /absolute/path/devocd`; the detailed
guide moved from `plugin/README.md` to `docs/archive/guide.md`. Marketplace identity stays
`devocd@devocd`, with source changed to `./`. Existing manually configured local
paths ending in `/plugin` must be updated. Do not copy host adapters from another
repository merely to imply support that has not been tested.

The current backlog remains in [TASKS.md](TASKS.md). This document proposes the
release boundary; it does not mark unfinished work done or bump the version.
