# Subflow: worker message protocol

Parent: [Flow: CLI to pool to worker to runner](index.md)
Scope: packages/vitest/src/runtime/workers/init.ts, packages/vitest/src/runtime/workers/init-forks.ts, packages/vitest/src/runtime/worker.ts
Uses: none

How a worker process talks to `PoolRunner` after being forked.

- Entry points: `runtime/workers/init.ts:79` `init(worker)`; `onMessage` at `:95`. Requests carry `__vitest_worker_request__: true` (`:98`); responses carry `__vitest_worker_response__` (`:47`).
- Messages:
  - `start` (`:103`): sets `VITEST_POOL_ID` and `VITEST_WORKER_ID`, inits tracing, creates the runtime RPC and calls `worker.setup`, replies `started` (with an error on failure).
  - `run` (`:147`) and `collect` (`:207`): call `entrypoint.run/collect` (`runtime/worker.ts:85`, `:89`), flush stdio, reply `testfileFinished` with the serialized error and `usedMemory` when `reportMemory`.
  - `stop` (`:271`): awaits the running promise, runs teardown, flushes the compile cache, replies `stopped`, then `worker.teardown()`.
- Forks specifics (`init-forks.ts`): requires `process.send` (`:5-7`). `ERR_IPC_CHANNEL_CLOSED` or `EPIPE` makes the worker exit 1 (`:60-62`). A `disconnect` also exits 1 (`:66-68`). Teardown restores the real `process.exit` (`:49`).
- Pitfalls:
  - A second `run` while one is active returns `testfileFinished` with error "Worker is already running tests" (`:149-156`).
  - `flushStdio` awaits an empty write callback because `thread.terminate()` would otherwise drop buffered output (comment `:56-63`).
  - `Module.flushCompileCache` is read from the default import because a named import fails to link before Node 22.10 (`:5-7`).
  - The RPC is not closed on cleanup; pending calls are rejected with `EnvironmentTeardownError` (`worker.ts:29-38`).
- Tests: `test/e2e/test/pool.test.ts` (stdout/stderr capture), `pool-worker-exit.test.ts` (name only).

Standards: none recorded — add with /devocd:company-policy; route via [PROJECT](../../../PROJECT.md) Links

## Evidence

- packages/vitest/src/runtime/workers/init.ts#L47-317 sha256:73af7e54f59a85ea9843332bdc80d8b1af0ac3a4c4a7792af68e12ac5362c652 2026-11-26
- packages/vitest/src/runtime/workers/init-forks.ts#L1-68 sha256:c4afcde2b4d6dbe6fff7eeb8dc01aac79e0d4e1561fa8ed67451274ef46dbc0b 2026-11-26
- packages/vitest/src/runtime/worker.ts#L14-95 sha256:072264fc58cc9e3f05f11034cb297a57e214c66873d22de48886ae94baa34727 2026-11-26
