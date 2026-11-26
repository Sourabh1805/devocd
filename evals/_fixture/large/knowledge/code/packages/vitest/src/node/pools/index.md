# vitest pools

Parent: [vitest node side](../index.md)
Scope: packages/vitest/src/node/pool.ts, packages/vitest/src/node/pools/**
Uses: none

Schedules spec files onto worker processes or threads and relays RPC between the main process and workers.

- Entry points:
  - `src/node/pool.ts:44` `createPool(ctx)` returns a `ProcessPool` (`runTests`, `collectTests`, `close`).
  - `pool.ts:58` `executeTests` groups specs and builds `PoolTask`s.
  - `src/node/pools/pool.ts:32` class `Pool`: `run` `:57`, `schedule` `:73`, `cancel` `:212`, `close` `:242`.
  - `pools/poolRunner.ts:49` class `PoolRunner` (state machine IDLE to STOPPED, `:21`).
  - `pools/rpc.ts:35` `createMethodsRPC` (module `fetch` `:93`, `fetchWarmModules` `:96`).
  - `pools/workers/forksWorker.ts:16` `ForksPoolWorker`.
  - `pools/browser.ts:41` `createBrowserPool`.
- Public surface: `ProcessPool`, `getFilePoolName` (`pool.ts:37`: browser enabled gives `'browser'`, otherwise `config.pool`), `PoolRunner` and `ForksPoolWorker` (marked `@experimental`; `ForksPoolWorker` is imported from `vitest/node` in `test/e2e/test/pool.test.ts:5`). Consumed by `Vitest.runFiles` (`core.ts:1067`).
- Run/test this part: `pnpm run test:ci:e2e` (documented); focused file `test/e2e/test/pool.test.ts`.
- Extension points:
  - Custom pool: `Pool.getPoolRunner` builds `new PoolRunner(options, customPool.createPoolWorker(options))` (`pools/pool.ts:286`); the interface is in `pools/types.ts` (`createPoolWorker` at `:13`). Fixtures: `test/e2e/fixtures/custom-pool*`, test `test/e2e/test/custom-pool.test.ts`.
  - New built-in worker kind: add `pools/workers/<kind>Worker.ts` and a branch in `Pool` (imports at `pools/pool.ts:8-12`: forks, threads, typecheck, vmForks, vmThreads) plus a `runtime/workers/<kind>.ts` entry.
- Pitfalls:
  - Workers start from `resolve(distPath, 'workers/forks.js')` (`forksWorker.ts:40`), so runtime changes need a rebuild.
  - Worker start timeout 90s (`pools/pool.ts:14`); `PoolRunner` start and stop timeouts are 60s each (`poolRunner.ts:45-46`).
  - Specs in one group share `maxWorkers`; two projects with the same `sequence.groupOrder` but different `maxWorkers` throw (`pool.ts:389-395`).
  - Non-isolated single-worker projects batch files into one run request, except vmThreads and vmForks (`pool.ts:402-417`).
  - The V8 compile cache is disabled for non-istanbul coverage providers (`pool.ts:119-122`).
  - Only `--cpu-prof`, `--heap-prof` and `--diagnostic-dir` of the parent's `execArgv` are forwarded (`pool.ts:228-233`).
  - Env vars `TEST`, `VITEST`, `VITEST_MODE` and `NODE_ENV` are set for workers (`pool.ts:244-250`).
  - Second Ctrl+C forces a kill (`pools/pool.ts:213-215`).
  - vm pools get a memory limit via `getMemoryLimit` (`pool.ts:287`).
- Unexplored: `threadsWorker`, `vmForksWorker`, `vmThreadsWorker`, `typecheckWorker`, `watchdog`, most of `pools/browser.ts` (signatures only).
- Tests: `test/e2e/test/pool.test.ts` (read, first 50 lines), `pool-worker-exit.test.ts`, `workers-option.test.ts`, `vm-threads.test.ts` (names only).

Standards: none recorded — add with /devocd:company-policy; route via [PROJECT](../../../../../../PROJECT.md) Links

## Evidence

- packages/vitest/src/node/pool.ts#L37-440 sha256:73a8b692dc40c7195a366dcbcc55582c8b53039351f7b90d39744b383b7fe5dd 2026-11-26
- packages/vitest/src/node/pools/pool.ts#L1-215 sha256:af7d18c096fa6027a5dbd56ae7ccc854fc16309fe4e5439843dbb2dddaeb2e2b 2026-11-26
- packages/vitest/src/node/pools/poolRunner.ts#L1-140 sha256:32c1ccbca232e23b408022fed4beff7eef7a63d60ae060c61970d4253eba40cd 2026-11-26
- packages/vitest/src/node/pools/rpc.ts#L1-120 sha256:e99973eff78c7fe555f8fb4c672a21b95843d6818d328c0a619704f71631c211 2026-11-26
- packages/vitest/src/node/pools/workers/forksWorker.ts#L1-70 sha256:a80135b51ff4887c2711f9f938d8f2828c0e9c07bb21f553c67216cccb9b58d4 2026-11-26
- packages/vitest/src/node/pools/browser.ts#L41 sha256:cc66c110fb90d57ef2c147d1f143e4cefb5f4c586ebefdb13f683617a6c1bd16 2026-11-26
- test/e2e/test/pool.test.ts#L1-50 sha256:865d5656b12f13bdb2187e32c5b08b91f4995b68c9d31699a608639c4e6c1ee7 2026-11-26
