# @vitest/coverage-istanbul

Parent: [packages](../index.md)
Scope: packages/coverage-istanbul/**
Uses: none

Istanbul instrumentation coverage provider (source instrumented at transform time).

- Entry points: `src/provider.ts:21` `IstanbulCoverageProvider`: `initialize` `:33`, `requiresTransform` `:68`, `clean` `:83`, `getModuleCacheData` `:125`, `restoreModuleCacheData` `:130`, `generateCoverage` `:150`, `generateReports` `:205`, `onEnabled` `:306`. Other files: `index.ts`, `base.ts`, `browser.ts`, `commands.ts` (not read).
- Public surface: the provider module loaded by core when `coverage.provider === 'istanbul'`. `startVitest` makes sure the matching package is installed (`cli-api.ts:123-133`).
- Run/test this part: `pnpm run test:ci:coverage` (documented); `test/coverage-test/test/*.istanbul.test.ts`.
- Extension points: custom instrumenter is exercised by `test/coverage-test/test/custom-instrumenter.istanbul.test.ts` (name only; not read).
- Pitfalls: instrumenting happens in a transform, so plugin order matters (`transform-plugin-order.istanbul.test.ts`, name only). The compile cache stays enabled for istanbul (`pool.ts:113-122`).
- Tests: as above.

Standards: none recorded — add with /devocd:company-policy; route via [PROJECT](../../../PROJECT.md) Links

## Evidence

- packages/coverage-istanbul/src/provider.ts#L21-306 sha256:5da83a13b512d53d29021d44fc823ecdfad3973fac26037e5dc91c9f222f89a2 2026-11-26
- packages/vitest/src/node/cli/cli-api.ts#L123-133 sha256:6f24c8e41f1987da01f275843fb72aa5af8096602717479577f400211c457021 2026-11-26
