# @vitest/snapshot

Parent: [packages](../index.md)
Scope: packages/snapshot/**
Uses: none

Snapshot matching, state, inline/raw/file snapshot support and update writing (ported from Jest, `src/port/`).

- Entry points: `src/client.ts:84` `SnapshotClient`: `setup` `:89`, `match` `:123`, `matchDomain` `:220`, `pollMatchDomain` `:274`, `assertRaw` `:366`, `finish` `:96`. `src/manager.ts:4` `SnapshotManager` (summary via `emptySummary` `:39` and `addSnapshotResult` `:61`). `src/update.ts:25` `saveSnapshotUpdates`.
- Public surface: those classes. The environment is resolved in the worker (`packages/vitest/src/runtime/runBaseTests.ts:39-46`, `resolveSnapshotEnvironment`) and can be customised via `snapshotEnvironment`.
- Run/test this part: `pnpm test` (documented); `pnpm run test:ci:e2e` for the e2e `snapshots` project.
- Extension points: new snapshot style (like the domain, domain-poll and raw variants) means a method on `SnapshotClient` plus a port file in `src/port/`, and an `expect` matcher on the vitest side. Custom storage means a `SnapshotEnvironment` (`src/environment.ts`, unread).
- Pitfalls: per-file state lives in `SnapshotClient` (`getSnapshotState` `:113`); call `clear` (`:391`) between runs. Core calls `this.snapshot.clear()` before each run (`core.ts:1072`).
- Tests: `test/unit/test/snapshot*.test.ts`, `test/e2e/snapshots/` (separate project, `groupOrder: 1`, `test/e2e/vitest.config.ts:72-80`).

Standards: none recorded — add with /devocd:company-policy; route via [PROJECT](../../../PROJECT.md) Links

## Evidence

- packages/snapshot/src/client.ts#L84-391 sha256:8b014b3bfa62127f2c0f36ba538dfcf2e2795dac2c6ed8caf8efb200639b18c4 2026-11-26
- packages/snapshot/src/manager.ts#L4-61 sha256:7bb4bca9a1bac7baa09f00a73bcb72c9a79e43ba703afb8f3cd864f806545c6f 2026-11-26
- packages/snapshot/src/update.ts#L25 sha256:637ee8f5f66df8806205c3f9d74fd7ea09aabb4e6124c1c9867704fec2e75037 2026-11-26
- test/e2e/vitest.config.ts#L72-80 sha256:4e5047326c80b4b42d0dbf466e53decbfcfab02cb0b4c448a68104e279447dec 2026-11-26
