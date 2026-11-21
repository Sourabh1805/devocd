# hooks

Parent: [scripts](index.md)
Scope: scripts/devocd-hooks.mjs, scripts/capture-hook.mjs, hooks/**
Uses: none

Four Claude Code hooks that read small local files under `.devocd/`: policy pointers, edit journal with stale marks, staleness notice, optional capture reminder.

- Entry points: `scripts/devocd-hooks.mjs:59` (`onPrompt`), `:101` (`onEdit`), `:148` (`onSessionStart`), dispatcher `:160`; `scripts/capture-hook.mjs:6` (`captureCheckpoint`). Registered in `hooks/hooks.json:1-33`: `UserPromptSubmit`, `PostToolUse` (matcher `Write|Edit|MultiEdit|NotebookEdit`), `SessionStart`, `Stop`, each 5 s timeout.
- Public surface: JSON on stdout (`hookSpecificOutput.additionalContext`). Writes only `journal/edits.jsonl` and `stale.json` in the edited file's own scope; `stale.json` is cleared by [Refresh](../../flows/runtime/refresh/index.md).
- Run/test this part: `npm test` (documented, not approved for PR review); covering test `tests/unit/hooks.test.mjs` (read: scope inheritance, state validation, hook cases; 22 tests)
- To add a hook event: add a case to `dispatch` (`devocd-hooks.mjs:160`) and an entry in `hooks/hooks.json`. To add a setting: `preference(scope, key, default)` (`scope.mjs:70`) plus a type check in `stateProblem`.
- Pitfalls:
  - Hooks default on; `devocdHooks: false` in project or company state disables them (`devocd-hooks.mjs:47`); the Stop reminder defaults off and needs `decisionCapture: true` (`capture-hook.mjs:9`), skipped when `stop_hook_active` is not `false` (`:7`).
  - Policy matching reads the company `standards/index.md` (max 64 KiB), needs bullets shaped `- trigger: [text](file.md)`, at most 3 matches; generic verbs like "create" and "edit" are ignored (`:32`, `:79-90`).
  - Input above 256 KiB is dropped without journaling or marking stale (`:175`; `docs/repo-memory.md:57`). Journal rotates past 1000 lines to the newest 500 (`:12-13`, `:127-130`). No lock, so concurrent edits can lose marks (`docs/repo-memory.md:58`).
  - `findScope` stops at the nearest `.devocd`, or at a `.git` without one; the edit hook uses the edited file's scope, not the session's (`devocd-hooks.mjs:106-110`).
  - Malformed input is swallowed; hooks never block work (`:179`).

Standards: none recorded — add with /devocd:company-policy

## Evidence

- scripts/devocd-hooks.mjs#L1-180 sha256:91beccf0f6d7d0d48eea608b1e5e0d688d8c99fd4288a57b615288f1c7e06226 2026-11-20
- scripts/capture-hook.mjs#L1-25 sha256:a7183860dbfbb14f3c1e65f532f9e1febe5ac0d74c3040e13dc064e3e6e129ad 2026-11-20
- hooks/hooks.json#L1-33 sha256:bdec82c5e8da094efa33034a37a4d9edd78af839bcd7d2047bcc3ac2a3cde9e0 2026-11-20
- scripts/lib/scope.mjs#L28-74 sha256:7490a533a03ab2d1a93721844703c429803ce54f57bf837b17a4c009292f7490 2026-11-20
- tests/unit/hooks.test.mjs#L1-50 sha256:21a36b8c00350684918e033a1a9a37ca4199a007fb9f9788598c6e23064a15d7 2026-11-20
- docs/repo-memory.md#L52-65 sha256:133d959fbac9a67fdd1780c8ad1e24a1e20bfb9a3f95d31e4f032f8bd4e80c08 2026-11-20
