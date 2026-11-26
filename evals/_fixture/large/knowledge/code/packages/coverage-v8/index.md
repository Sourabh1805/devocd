# @vitest/coverage-v8

Parent: [packages](../index.md)
Scope: packages/coverage-v8/**
Uses: none

V8 inspector-based coverage provider. A worker-side module collects raw V8 coverage; the main-side provider converts and reports it.

- Entry points: worker side `src/index.ts:18` (`mod`): `startCoverage` `:26`, `takeCoverage` `:46`, `stopCoverage` `:105`, `getProvider` `:122` (via `load-provider.ts`). Main side `src/provider.ts:45` `V8CoverageProvider`: `initialize` `:49`, `generateCoverage` `:79`, `generateReports` `:149`.
- Public surface: the default export `CoverageProviderModule`. Core calls `startCoverageInsideWorker` (`runBaseTests.ts:36-38`) and `stopCoverageInsideWorker` (`:115`).
- Run/test this part: `pnpm run test:ci:coverage` (documented); `test/coverage-test/test/*.v8.test.ts`.
- Extension points: new filter for ignored scripts means editing `filterResult` (`src/index.ts:128-146`: only `file://`, no `node_modules`, `/@id/@vitest/`, `/@vite/client`).
- Pitfalls:
  - `isolate:false` plus an already-started session means start and stop are skipped (`:27-29`, `:105-108`).
  - `autoAttachSubprocess` sets `NODE_V8_COVERAGE` to a temp dir under `reportsDirectory/.tmp` (`:33-36`).
  - Coverage is skipped on stackblitz (`:47`).
  - Core disables the Node compile cache for non-istanbul providers (`pool.ts:119-122`), because V8 loses source positions otherwise.
- Tests: `test/coverage-test/test/` (about 60 specs; `*.v8.test.ts`, shared specs), names only.

Standards: none recorded — add with /devocd:company-policy; route via [PROJECT](../../../PROJECT.md) Links

## Evidence

- packages/coverage-v8/src/index.ts#L16-146 sha256:962dd882b74eea586f1d3290544eaeffee119e6ac520ea7a0caf025c2f737818 2026-11-26
- packages/coverage-v8/src/provider.ts#L45-186 sha256:f00b50d5e924c4b6eca8ea6c2fdc998a34c920807963a4af32c6cf9004d687da 2026-11-26
- packages/vitest/src/node/pool.ts#L113-122 sha256:73a8b692dc40c7195a366dcbcc55582c8b53039351f7b90d39744b383b7fe5dd 2026-11-26
