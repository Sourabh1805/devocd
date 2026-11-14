# Decision capture reliability review

Reviewed 2026-11-14 for PR #14. This is a focused review of capture, retrieval,
restore and integration boundaries, not certification of every DevOCD feature.

## Comparable approaches

| Source reviewed | Useful principle | DevOCD choice |
| --- | --- | --- |
| [brain.md bootstrap](https://github.com/mindmuxai/brain.md/blob/main/skills/brain-bootstrap/SKILL.md) and [ingestion](https://github.com/mindmuxai/brain.md/blob/main/skills/brain-ingest/SKILL.md) | Retain decisions and rationale; compare existing knowledge before adding | Classify durable decisions separately from derived facts and provisional findings; propose small approved edits |
| [brain.md CLI](https://github.com/mindmuxai/brain.md/blob/main/skills/brain-page/bin/brain.mjs) | Controlled publication and per-page history | Keep explicit history and validation; do not claim the current multi-file workflow is atomic |
| [Cline Memory Bank](https://docs.cline.bot/best-practices/memory-bank) | Plain Markdown gives persistent project context | Keep task-scoped reading and avoid creating its full file hierarchy or reviewing all docs per capture |
| [Claude Code memory](https://code.claude.com/docs/en/memory) | Persistent memory must be discoverable in later sessions | Add pre-edit decision routing, bounded lookup and explicit scope selection |
| [Cursor rules](https://cursor.com/docs/rules) | Scoped reusable context | Keep company and project ownership distinct; do not turn an exception into company policy |

These are document/source comparisons, not installed product benchmarks. Cursor's
old memories documentation currently redirects to its docs home, so no current
behavior is inferred from the old approval description. No external code copied.

## Findings addressed

- macOS `/var` aliases incorrectly suppressed the hook. Canonicalize host cwd;
  continue refusing linked knowledge paths. Test both alias and rejection cases.
- Older backup restore could overwrite newer decisions. Preserve existing durable
  files and recover missing ones with exclusive creation; retain regular restore
  for derived knowledge. Regression tests cover both cases and linked targets.
- Archived before/after text could rank as current task guidance. Exclude the
  history subtree from default graph, search and routing without deleting it.
- Capture routing did not ensure later tasks consulted the saved decisions. Add
  pre-edit routing with explicit supersession/retirement handling.
- Company install could re-enable an opted-out hook. Preserve the existing setting
  in the deterministic draft application, with rerun regression coverage.
- UTF-8 characters split across stdin chunks could corrupt hook input. Decode the
  stream as UTF-8 before accumulating bounded JSON.

## Accuracy boundaries

Passing tests proves checked behavior, not truth of AI-authored claims. Evidence,
explicit approval, duplicate checks and conflict handling remain necessary. The
read-only sub-agent cannot grant permission to write. Durable constraints do not
expire when code hashes change; provisional findings do not become accepted rules.

The current writer is an instructed agent using normal host permissions. History
is saved before edits, but this is not an atomic transaction across README and
decisions. Concurrent changes after the final reread and interrupted writes remain
possible; partial completion must be reported. A future common publication API
needs its own approval binding, locking, recovery and migration design rather
than an untested second writer added during a CI repair.

No live model-driven approval/application trial or exhaustive competing-product
benchmark was performed. Unit/CLI tests and three-platform CI cover deterministic
paths; workflow text tests cannot prove that a model follows every instruction.

## PR 1: immediate Stop-reminder repair (2026-11-14)

Focused review covered fail-closed state validation, registered project/company
inheritance, explicit override precedence, recursion suppression, canonical cwd
and executable paths, and refusal of linked knowledge. No journal hooks, retrieval
changes, cloud storage or publication changes are included. Explicit capture keeps
its documentation approval and append-only history workflow.

Verification: the full local unit suite passed (352 passed, one existing Windows
file-symlink permission skip); the plugin validator passed with only the existing
LICENSE_MISSING and ICON_MISSING allowances. The installed default workspace gate
replayed ten ordinary Stop payloads through separate hook subprocesses and received
zero stdout each time. This is deterministic hook-event replay, not an actual live
ten-conversation-turn trial. A live trial and T13-dependent journal gating remain
outstanding. Project setup preference preservation is an agent workflow contract;
company installation preservation is also covered by executable regression tests.
