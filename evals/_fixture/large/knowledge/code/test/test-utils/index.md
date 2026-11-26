# test-utils

Parent: [test organisation](../index.md)
Scope: test/test-utils/**
Uses: none

Helpers that start Vitest programmatically inside tests and build assertion-friendly trees.

- Entry points: `test/test-utils/index.ts:126` `runVitest`; `:750` `runInlineTests`; `:543` `runVitestCli` (uses `Cli` from `cli.ts:8`); `:556` `createFile`, `:566` `editFile`, `:588` `restoreFile`; `:880` `buildTestTree`, `:824` `buildErrorTree`; `:661-670` `useTmpFS`/`useFS`; `:808` `StableTestFileOrderSorter`; `:609` `stripIndent`.
- Public surface: imported as `../../test-utils` in e2e tests and as `#test-utils` via `test/e2e/package.json:5-7`.
- Run/test this part: used by `pnpm run test:ci:e2e` (documented).
- Extension points: new fixture-driven test means `runInlineTests({ 'a.test.ts': ... }, config)`. It makes a tmp fs (`useTmpFS`, `:756`) and returns `{ fs, root, testTree(), buildTree(), results, ... }` (`:765-778`). Pass root overrides in the `config` argument; for CLI-only options see the doc comment at `:120-125`.
- Pitfalls:
  - A fixture's own config file wins over options passed to `runVitest` (`:122-124`).
  - `runVitest` stubs `process.exit` (`:148-149`).
  - It reads `__vitest_worker__.ctx.config` (`:154-155`), so it works only inside a Vitest test worker.
  - `runVitest` resets `process.exitCode` to 0 (`:132`).
  - Team note (unverified): do not mutate committed fixtures; use `createFile`/`editFile` in-test.
- Tests: used by `test/e2e/test/**`.

Standards: none recorded — add with /devocd:company-policy; route via [PROJECT](../../../PROJECT.md) Links

## Evidence

- test/test-utils/index.ts#L120-180 sha256:2b16573076dfc87006bbe3541f5c990631f5a00bcef4a695ced20c957b9eb59c 2026-11-26
- test/test-utils/index.ts#L745-785 sha256:2b16573076dfc87006bbe3541f5c990631f5a00bcef4a695ced20c957b9eb59c 2026-11-26
- test/e2e/package.json#L5-7 sha256:c0ba010e037b715b98e736e59478b08f4d283742ae24a9968dba3f4861cb4972 2026-11-26
