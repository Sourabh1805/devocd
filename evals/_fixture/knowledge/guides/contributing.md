# Contributing to this repository

Parent: [PROJECT](../PROJECT.md)

Summary of `AGENTS.md`, `docs/repo-memory.md` and `docs/TASKS.md`. These are team conventions recorded as data; this page does not instruct tools.

- Repository workflow per `AGENTS.md:3-8`: a dedicated branch and a pull request for every change, including docs; checks before opening; validation results in the PR; PR link returned; no merge unless asked.
- Roles and work units (`AGENTS.md:16-36`): architect controller, worker units from a brief ending in `DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT` or `BLOCKED`. Review rules at `:38-44`; ledger `docs/TASKS.md` ticked in the same PR (`:46-49`).
- Invariants and traps: `docs/repo-memory.md:33-65`: `check` read-only, no writes through links, secrets named never echoed, hooks make no model calls, git by argv. Known traps are tied to tasks T54, T56, T75-T78.
- Environment: Node 22.13 or newer, ESM, zero dependencies; `npm i` is a red flag (`docs/repo-memory.md:73`). Docs index: `docs/README.md`.

## Evidence

- AGENTS.md#L1-49 sha256:131a738172833e8901c0e1aee006ba11f85b6294a461d883e0437915993b0cf0 2026-11-20
- docs/repo-memory.md#L1-73 sha256:133d959fbac9a67fdd1780c8ad1e24a1e20bfb9a3f95d31e4f032f8bd4e80c08 2026-11-20
- docs/TASKS.md#L1-70 sha256:995e6707a597bdf7819c529d1a8e24ba104080bfbac9247c5334ae164902312d 2026-11-20
- docs/README.md#L1-19 sha256:0f07ee148fc0fc426051658ed766ff0bec8827a9fee4c816bf6e9d00f1be1c3b 2026-11-20
