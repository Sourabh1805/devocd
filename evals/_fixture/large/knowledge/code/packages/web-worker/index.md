# @vitest/web-worker

Parent: [packages](../index.md)
Scope: packages/web-worker/**
Uses: none

Simulates `Worker` and `SharedWorker` in Node-based environments.

- Entry points: `src/index.ts:3` calls `defineWebWorkers()` as an import side effect. `src/pure.ts:6` `defineWebWorkers(options?)`. Other files: `worker.ts`, `shared-worker.ts`, `runner.ts`, `utils.ts` (inventory only).
- Public surface: import `@vitest/web-worker` (installs globals) or the pure variant, which does not auto-install.
- Run/test this part: `pnpm test` (documented); `test/unit/test/web-worker-node.test.ts`, `web-worker-jsdom.test.ts`, `web-worker-mock.test.ts`.
- Extension points: unconfirmed; worker constructor logic is in `src/worker.ts` (unread).
- Pitfalls: globals are replaced only if `Worker` or `SharedWorker` is undefined or lacks the `__VITEST_WEB_WORKER__` marker (`pure.ts:7-16`). `EventTarget` and `MessageEvent` must exist (`:8-9`, `:18`), or `assertGlobalExists` fails.
- Tests: as above, plus `test/coverage-test/test/web-worker.test.ts` (names only).

Standards: none recorded — add with /devocd:company-policy; route via [PROJECT](../../../PROJECT.md) Links

## Evidence

- packages/web-worker/src/index.ts sha256:625589f3be22309e5841fd3dc1150214ae565e556c533537144f36babfcb3bc4 2026-11-26
- packages/web-worker/src/pure.ts#L6-22 sha256:6a570dbae8c689085368ff5ee27b8a789c2b9dd68f247c4102d06d1eddee05ca 2026-11-26
