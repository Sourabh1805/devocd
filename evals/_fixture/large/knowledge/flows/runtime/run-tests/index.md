# Flow: CLI to pool to worker to runner

Parent: [PROJECT](../../../PROJECT.md)
Scope: packages/vitest/src/node/cli/**, packages/vitest/src/node/core.ts, packages/vitest/src/node/pool.ts, packages/vitest/src/node/pools/**, packages/vitest/src/runtime/**
Uses: none

Descriptive map of `vitest run` with the default forks pool. Not the PR-review policy. Subflow: [worker protocol](worker-protocol.md).

1. `packages/vitest/src/node/cli.ts:3` `createCLI().parse()`. `cli/cac.ts:74` registers commands; the `run` handler (`:268`) calls `start` (`:302`), which imports `./cli-api` lazily (`:304`).
2. `cli/cli-api.ts:97` `startVitest` runs `prepareVitest` (`:223`; core is built in `create.ts:25-55`), checks coverage package install (`:123-133`), then `ctx.start(cliFilters)` (`:167`).
3. `core.ts:860` `Vitest.start`: coverage init, `specifications.getRelevantTestSpecifications` (`:883`), shard (`:900`), `runFiles` (`:927`).
4. `core.ts:1050` `runFiles`: creates the pool once (`:1066-1068`), global setup (`:1080`), sequencer sort, `pool.runTests(sorted, invalidates)` (`:1092-1093`), cache update, coverage report in `finally` (`:1105-1110`).
5. `node/pool.ts:44` `createPool` to `executeTests` (`:58`): groups specs (`groupSpecs` `:311`), builds `PoolTask` per spec group with env, `execArgv`, `isolate`, `memoryLimit` (`:140-163`); browser specs go to `createBrowserPool` (`:189-191`); each group calls `pool.setMaxWorkers` then `pool.run` (`:170-178`).
6. `pools/pool.ts:57` `Pool.run` queues; `schedule` (`:73`) gets a `PoolRunner`, starts it, then `runner.request(method, task.context)` (`:154`) and waits for `testfileFinished` (`:102-114`). A non-isolated runner may be reused for the next queued task (`:166-175`); otherwise it stops (`:177-199`).
7. Worker: `pools/workers/forksWorker.ts:40` forks `dist/workers/forks.js`. That is `runtime/workers/forks.ts:4`, `init-forks.ts:32`, `init.ts:79`. See [worker protocol](worker-protocol.md).
8. `runtime/worker.ts:14` `execute` calls `worker.runTests(state)`, then `workers/base.ts:148` `runBaseTests`, then `runtime/runBaseTests.ts:23` `run`, then `runtime/runner/run.ts:1054` `startTests`.
9. Back-channel: `PoolRunner` creates a birpc channel with `createMethodsRPC` (`poolRunner.ts:109-114`, `pools/rpc.ts:35`); workers fetch modules through `fetch` (`rpc.ts:93`). Results land in `state` and `TestRun` (`test-run.ts:44`, `:164`) and reach reporters.

- Pitfalls: errors from tasks are aggregated into one `AggregateError` (`pool.ts:199-208`) and recorded as `Unhandled Error` (`core.ts:1094-1096`). Cancellation rejects with `'Cancelled'`, which is handled specially (`pool.ts:181-183`).
- Not traced: vm pools, threads, typecheck pool, browser pool internals, reporter dispatch.
- Tests: `test/e2e/test/pool.test.ts`, `cancel-run.test.ts`, `custom-pool.test.ts`, `pool-worker-exit.test.ts` (last three by name only).
- Pages that own the code: [node](../../../code/packages/vitest/src/node/index.md), [pools](../../../code/packages/vitest/src/node/pools/index.md), [runtime](../../../code/packages/vitest/src/runtime/index.md).

Standards: none recorded — add with /devocd:company-policy; route via [PROJECT](../../../PROJECT.md) Links

## Evidence

- packages/vitest/src/node/cli.ts#L3 sha256:fe67160cdcfba453ec32f603b75aa8e434365660aa79258c5bc4912f04a6ed7a 2026-11-26
- packages/vitest/src/node/cli/cac.ts#L268-322 sha256:0db6d70b0f592c6b29f9249c2b60ff876c0743272779ddba7be947273cf253b1 2026-11-26
- packages/vitest/src/node/cli/cli-api.ts#L97-179 sha256:6f24c8e41f1987da01f275843fb72aa5af8096602717479577f400211c457021 2026-11-26
- packages/vitest/src/node/core.ts#L860-1117 sha256:95534441cc276bd427a5d59e008def1e1695625796661f82771df6226f457730 2026-11-26
- packages/vitest/src/node/pool.ts#L44-223 sha256:73a8b692dc40c7195a366dcbcc55582c8b53039351f7b90d39744b383b7fe5dd 2026-11-26
- packages/vitest/src/node/pools/pool.ts#L57-210 sha256:af7d18c096fa6027a5dbd56ae7ccc854fc16309fe4e5439843dbb2dddaeb2e2b 2026-11-26
- packages/vitest/src/node/pools/poolRunner.ts#L109-126 sha256:32c1ccbca232e23b408022fed4beff7eef7a63d60ae060c61970d4253eba40cd 2026-11-26
- packages/vitest/src/node/pools/rpc.ts#L35-94 sha256:e99973eff78c7fe555f8fb4c672a21b95843d6818d328c0a619704f71631c211 2026-11-26
- packages/vitest/src/runtime/runBaseTests.ts#L23-118 sha256:b0c6fc7faa1cdb03fd957855887d9dd658272ce018adc4a612223ba04a21fc1e 2026-11-26
- packages/vitest/src/runtime/runner/run.ts#L1054-1100 sha256:1b2d66b7136db6da730152387d73e6f4bbf22969e942dc2c880875b46dffe7e7 2026-11-26
