# @vitest/expect

Parent: [packages](../index.md)
Scope: packages/expect/**
Uses: none

Jest-compatible `expect` implemented as chai plugins, plus asymmetric matchers.

- Entry points: `src/index.ts:1-28`; `src/jest-expect.ts:36` `JestChaiExpect` (built-in matchers); `src/jest-extend.ts:191` `JestExtend` (`expect.extend`); `src/state.ts:35` `getState` and `:39` `setState`.
- Public surface: `JestChaiExpect`, `JestExtend`, `JestAsymmetricMatchers`, `ChaiStyleAssertions`, `customMatchers`, `addCustomEqualityTesters`, `getCustomEqualityTesters`, constants `GLOBAL_EXPECT`, `MATCHERS_OBJECT`, and the re-exported `chai`. Consumed by vitest core when it builds the global `expect` (wiring not read).
- Run/test this part: `pnpm test` (documented). Unit project: `test/unit/test/expect.test.ts`, `jest-expect.test.ts`.
- Extension points: built-in matcher means a chai method inside `JestChaiExpect` (`jest-expect.ts`, body not read), with typings in `src/types.ts`. User matchers go through `JestExtend`.
- Pitfalls: unconfirmed beyond the index. Matcher state is per `expect` instance via `getState`.
- Tests: `test/unit/test/expect.test.ts`, `expect-poll.test.ts`, `expect-circular.test.ts`, `chai-style-assertions.test.ts`, `expect.test-d.ts` (names only).

Standards: none recorded — add with /devocd:company-policy; route via [PROJECT](../../../PROJECT.md) Links

## Evidence

- packages/expect/src/index.ts#L1-28 sha256:73e3ab29ac7a6a2be6dbed051715d953eeee8d946568e7ce6553dd9f26130dba 2026-11-26
- packages/expect/src/jest-expect.ts#L36 sha256:b481521d5d73dcd498b354bbad39544ea5cc6e4c0891dae40083325cdc15e79f 2026-11-26
- packages/expect/src/jest-extend.ts#L191 sha256:093a1ff42b2da78fa390f451041fcfade5768c351f9837246a92c01e63726859 2026-11-26
- packages/expect/src/state.ts#L35-39 sha256:40205552d9aa855aa189afacdfa0ab8d01a76911e9b2274c3f078e28306b53e8 2026-11-26
