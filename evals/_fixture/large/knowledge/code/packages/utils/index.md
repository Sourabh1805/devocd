# @vitest/utils

Parent: [packages](../index.md)
Scope: packages/utils/**
Uses: none

Shared helpers exposed only through subpath exports.

- Entry points: `package.json:24-84` exports `./diff`, `./resolver`, `./error`, `./helpers`, `./offset`, `./constants`, `./timers`, `./trace`, `./display`, `./source-map`, `./source-map/node`, `./serialize`. Source: `src/diff/*` (diff printing), `src/source-map*`, `src/error.ts`, `src/helpers.ts`.
- Public surface: consumed across the monorepo, for example `@vitest/utils/error` (`runtime/workers/init.ts:8`), `@vitest/utils/source-map` (`runtime/worker.ts:4`), `@vitest/utils/helpers` (`pools/poolRunner.ts:17`).
- Run/test this part: `pnpm test` (documented).
- Extension points: a new helper means a source file plus an `exports` entry in `package.json`. Consumers import the subpath, not the root (`pool.ts:1` imports types only from the root).
- Pitfalls: the code behind each export was not read.
- Tests: `test/unit/test/utils.spec.ts`, `utils-display.spec.ts`, `diff.test.ts` (names only); `test/unit/package.json` imports `@vitest/utils/*` from dist.

Standards: none recorded — add with /devocd:company-policy; route via [PROJECT](../../../PROJECT.md) Links

## Evidence

- packages/utils/package.json#L24-84 sha256:045507002825e358f3936074fba8064d62bdb07b4622906fceb26b8bc07725ed 2026-11-26
- packages/vitest/src/runtime/worker.ts#L4 sha256:072264fc58cc9e3f05f11034cb297a57e214c66873d22de48886ae94baa34727 2026-11-26
