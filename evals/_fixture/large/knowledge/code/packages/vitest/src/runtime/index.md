# vitest runtime (worker side)

Parent: [vitest](../../index.md)
Scope: packages/vitest/src/runtime/**
Uses: none

Code that runs inside each worker: boot protocol, environment setup, module runner, and the collect/run test runner.

- Entry points:
  - `src/runtime/workers/forks.ts:4` calls `workerInit({ runTests: runBaseTests, setup: setupBaseEnvironment })`.
  - `workers/init-forks.ts:32` `workerInit`.
  - `workers/init.ts:79` `init` (message loop, see [worker protocol](../../../../../flows/runtime/run-tests/worker-protocol.md)).
  - `runtime/worker.ts:14` `execute`, exported as `run` (`:85`), `collect` (`:89`), `teardown` (`:93`).
  - `workers/base.ts:88` `setupBaseEnvironment`, `:148` `runBaseTests`.
  - `runtime/runBaseTests.ts:23` `run`.
  - `runtime/runner/run.ts:1054` `startTests` (collect, then `runFiles` `:1020`, then `runTest` `:584`, `runSuite` `:866`).
  - `runtime/runner/suite.ts`: `suite` `:79`, `test` `:102`, `describe` `:158`, `it` `:181`, `createTaskCollector` `:734`.
- Public surface: the `describe`, `test` and `it` API from `runner/suite.ts`, re-exported through the vitest package (re-export path not read). The worker entrypoints are loaded by file path from `dist/workers/*.js`.
- Run/test this part: `pnpm test` (documented; unit project), e2e for pools. Runtime changes need a rebuild first.
- Extension points: a new worker flavour copies `workers/forks.ts` (call `workerInit({ runTests, setup })`) and adds a matching `pools/workers/*Worker.ts` on the node side. Alternative module runner: `config.experimental.viteModuleRunner === false` switches to `NativeModuleRunner` and node loader hooks (`base.ts:42-67`, `:91-100`).
- Pitfalls:
  - `process.exit` is replaced inside tests and throws `process.exit unexpectedly called` (`base.ts:33-38`).
  - With `isolate` on, mocker and evaluated modules are reset per file (`runBaseTests.ts:65-68`); after each file `vi.resetConfig()` and `vi.restoreAllMocks()` run (`:105-108`).
  - Non-isolated workers keep module-level `evaluatedModules` (`base.ts:23`, `:157`) but invalidate the new test files' modules (`:184-190`).
  - Cancellation aborts running tests via `startTests` (`run.ts:1062-1070`).
- Unexplored: `vm/*`, `runVmTests.ts`, `moduleRunner/*` internals, `runners/*`, `benchmark`, `inspector`, `console`, `detect-async-leaks`, `workers/{threads,vm*,native,watchdog}.ts`.
- Tests: `test/unit/test/**` run in-worker; `test/e2e/test/vm-threads.test.ts`, `stacktraces.test.ts` (names only).

Standards: none recorded — add with /devocd:company-policy; route via [PROJECT](../../../../../PROJECT.md) Links

## Evidence

- packages/vitest/src/runtime/worker.ts#L14-95 sha256:072264fc58cc9e3f05f11034cb297a57e214c66873d22de48886ae94baa34727 2026-11-26
- packages/vitest/src/runtime/runBaseTests.ts#L23-118 sha256:b0c6fc7faa1cdb03fd957855887d9dd658272ce018adc4a612223ba04a21fc1e 2026-11-26
- packages/vitest/src/runtime/workers/base.ts#L23-203 sha256:eb3df99f5624a6111c0db60768dd4657296f3d8804bd10516b93e636f46ba129 2026-11-26
- packages/vitest/src/runtime/workers/forks.ts#L4 sha256:aea2266917ffa05c8d2de4bbfc96000ccfdddd928a9463abc1ffa653826ae9f8 2026-11-26
- packages/vitest/src/runtime/workers/init-forks.ts#L32-68 sha256:c4afcde2b4d6dbe6fff7eeb8dc01aac79e0d4e1561fa8ed67451274ef46dbc0b 2026-11-26
- packages/vitest/src/runtime/workers/init.ts#L79 sha256:73af7e54f59a85ea9843332bdc80d8b1af0ac3a4c4a7792af68e12ac5362c652 2026-11-26
- packages/vitest/src/runtime/runner/run.ts#L1020-1100 sha256:1b2d66b7136db6da730152387d73e6f4bbf22969e942dc2c880875b46dffe7e7 2026-11-26
- packages/vitest/src/runtime/runner/suite.ts#L79-181 sha256:41f94b2c9aea4ed463abbae98b7d5aa4b14a21d3931d210b1fa57237974c4cd1 2026-11-26
