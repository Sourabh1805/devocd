# @vitest/spy

Parent: [packages](../index.md)
Scope: packages/spy/**
Uses: none

Mock functions and spies (`vi.fn`, `vi.spyOn` backend).

- Entry points: `src/index.ts:336` `fn`; `:364-382` `spyOn` overloads; `:92` `createMockInstance`; `:40` `isMockFunction`; `:840` `restoreAllMocks`; `:847` `clearAllMocks`; `:851` `resetAllMocks`.
- Public surface: those functions plus types from `src/types.ts`. The runtime calls `vi.restoreAllMocks()` after each test file (`packages/vitest/src/runtime/runBaseTests.ts:107`).
- Run/test this part: `pnpm test` (documented).
- Extension points: new mock-config behaviour means a field in `MockConfig`/`MockContext` (`src/types.ts`) and handling in `createMockInstance` (`index.ts:92`). Not fully traced.
- Pitfalls:
  - Global registries are WeakRef/FinalizationRegistry-based sets of "dirty" mocks, so `resetAllMocks` visits only mocks changed since their last reset (`index.ts:44-90`, comment at `:50-52`).
  - The file imports builtins from `./primordials` rather than using globals directly. The likely reason is protection from user-patched builtins (inferred, unconfirmed).
- Tests: `test/unit/test/fn.test.ts`, `jest-mock.test.ts`, `spy.test.ts`, `test/unit/test/mocking/vi-fn.test.ts`, `vi-spyOn.test.ts` (names only).

Standards: none recorded — add with /devocd:company-policy; route via [PROJECT](../../../PROJECT.md) Links

## Evidence

- packages/spy/src/index.ts#L40-110 sha256:2c4db3679e2b4481b364f635c5124b1efb1b2190bc1f42eae5bbc6979486136c 2026-11-26
- packages/vitest/src/runtime/runBaseTests.ts#L104-108 sha256:b0c6fc7faa1cdb03fd957855887d9dd658272ce018adc4a612223ba04a21fc1e 2026-11-26
