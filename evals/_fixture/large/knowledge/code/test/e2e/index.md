# test/e2e

Parent: [test organisation](../index.md)
Scope: test/e2e/**
Uses: none

End-to-end suite: each test starts a Vitest instance (via [test-utils](../test-utils/index.md)) against fixtures.

- Entry points: `test/e2e/vitest.config.ts:20` config with 3 projects: `main` (`:38`), `snapshots` (`:72`), `serial` (`:83`). Test files `test/e2e/test/**` (`config/`, `watch/`, `reporters/`); fixtures `test/e2e/fixtures/*`; types `test/e2e/dts/*`. Example: `test/e2e/test/pool.test.ts:8`.
- Run/test this part: `pnpm run test:ci:e2e` (documented), or `pnpm test <file>` inside `test/e2e` (documented in package script `test`).
- Extension points:
  - New e2e: add `test/e2e/test/<name>.test.ts` that calls `runVitest`/`runInlineTests`, with fixtures under `fixtures/<name>`.
  - Tests that need git-tracked files (`--changed`) must be listed in `serialTests` (`vitest.config.ts:13-18`).
  - Watch tests live in `test/watch/`, config tests in `test/config/` (`test/README.md:13-15`).
- Pitfalls:
  - `main` runs `isolate:false`, `fileParallelism:true`, `maxWorkers` from `VITEST_E2E_MAX_WORKERS` or 2 (`:42-48`).
  - `groupOrder` 0, 1, 2 for main, snapshots, serial (`:66-93`).
  - Test timeout is 120s on Windows and 60s otherwise (`:6`).
  - The console line "watcher is ready" is dropped by `onConsoleLog` (`:31-35`).
  - Typecheck runs only on three `*.test-d.ts` files (`:57-63`).
- Tests: this layer; devDependencies include browser-playwright, browser-preview, coverage-v8, ui, mocker, utils (`package.json:27-34`).

Standards: none recorded — add with /devocd:company-policy; route via [PROJECT](../../../PROJECT.md) Links

## Evidence

- test/e2e/vitest.config.ts#L1-103 sha256:4e5047326c80b4b42d0dbf466e53decbfcfab02cb0b4c448a68104e279447dec 2026-11-26
- test/e2e/package.json#L1-59 sha256:c0ba010e037b715b98e736e59478b08f4d283742ae24a9968dba3f4861cb4972 2026-11-26
- test/e2e/test/pool.test.ts#L1-50 sha256:865d5656b12f13bdb2187e32c5b08b91f4995b68c9d31699a608639c4e6c1ee7 2026-11-26
- test/README.md#L9-15 sha256:2424422fce0f4f2477dfbe027511c543caf0dcad690eb7b7a1e445ba62e2d6a4 2026-11-26
