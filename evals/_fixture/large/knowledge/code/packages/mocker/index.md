# @vitest/mocker

Parent: [packages](../index.md)
Scope: packages/mocker/**
Uses: none

Module mocking: registry, automocking, `vi.mock` hoisting transforms (node) and browser interceptors.

- Entry points: `src/registry.ts:1` `MockerRegistry` with `AutomockedModule` `:154`, `AutospiedModule` `:184`, `RedirectedModule` `:214`, `ManualMockedModule` `:247`. `src/automocker.ts:16` `mockObject`. Node plugins: `src/node/mockerPlugin.ts:20`, `hoistMocksPlugin.ts:17` (`hoistMockAndResolve` `:80`), `hoistMocks.ts:113`, `automockPlugin.ts:8`.
- Public surface: `src/index.ts`, `src/node/index.ts`, `src/browser/index.ts` (inventory only). Used in vitest's `plugins/mocks.ts` and in the browser package.
- Run/test this part: `pnpm test` (documented).
- Extension points: to hoist a new mocking call, extend `regexpHoistable` (`hoistMocks.ts:100-101`: vi/vitest `.mock`, `.unmock`, `.hoisted`, `.doMock`, `.doUnmock`, `.importActual`). Also edit the originals list (`:103`). A redistribution that re-exports `vi` goes in `REDISTRIBUTED_HOISTED_MODULES` (`:110`, currently `vite-plus/test`).
- Pitfalls: `hoistMocks` is a fork of Vite's SSR transform (`:112`) and returns `undefined` unless a hoistable call is present (`:119-123`). Parse failures are logged via `console.error` and skipped (`:130-132`). Team note (unverified): mocker is a runtime dependency that is not inlined, so rebuild it separately.
- Tests: `test/unit/test/mocking/*` (about 30 specs), `hoist-import.test.ts`, `hoisted-simple.test.ts`, e2e fixtures `test/e2e/fixtures/mocker/*` (names only).

Standards: none recorded — add with /devocd:company-policy; route via [PROJECT](../../../PROJECT.md) Links

## Evidence

- packages/mocker/src/registry.ts#L1-247 sha256:fb2f7a681d4d6692be9e25b65cecb26d5c8c4d1a79c0398d95e55c282be501a5 2026-11-26
- packages/mocker/src/automocker.ts#L16 sha256:20741689de694bc308697838d1ca6859859b137934a3bb27bd409c19d68fc374 2026-11-26
- packages/mocker/src/node/hoistMocks.ts#L95-134 sha256:c6b5b99680cb01b120842dfb7cea8bfba393bbc0996bbd2ed54fc688c2165696 2026-11-26
- packages/mocker/src/node/hoistMocksPlugin.ts#L17-80 sha256:00a5264bd28f94ac4d3f38b4ec7b69d932336c74d7ab9a1f7a9a003f8fcb5979 2026-11-26
- packages/mocker/src/node/mockerPlugin.ts#L20 sha256:a02121c44c34ba32768350d26249665ae775bf5ff00beaaac4382d17b4df5c3c 2026-11-26
- packages/mocker/src/node/automockPlugin.ts#L8 sha256:a18faffc5a92c3b05821a5e6bd2ba8ad149e7bb087792cb8f7abc6d76c0730f0 2026-11-26
