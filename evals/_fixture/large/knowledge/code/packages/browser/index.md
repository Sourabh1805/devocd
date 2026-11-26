# @vitest/browser

Parent: [packages](../index.md)
Scope: packages/browser/**
Uses: none

Browser-mode server and client: contributes a Vite server factory, RPC, commands, screenshot matcher, tester/orchestrator pages. Providers are [playwright](../browser-playwright/index.md) and [preview](../browser-preview/index.md).

- Entry points: `src/node/index.ts:99` `createBrowserServer` (contributes config, plugins, parent factory and RPC to the single Vite server that core builds; see the doc comment at `:93-98`); `:48` `defineBrowserCommand`; `:666` `defineBrowserProvider`; `src/node/rpc.ts:63` `setupBrowserRpc`; `src/node/projectParent.ts:24` `ParentBrowserProject`; `src/node/project.ts:23` `ProjectBrowser`.
- Public surface: package exports `.`, `./context`, `./client`, `./matchers`, `./locators`, `./utils` (`package.json:24-54`). `./client` and `./locators` have `__vitest_source__` conditions. `assertBrowserFileAccess` and `assertBrowserApiWrite` (`src/node/utils.ts:96`, `:108`) guard file commands.
- Run/test this part: `pnpm run test:browser:playwright` (documented; needs Playwright browsers, CI shards it).
- Extension points: new command means `defineBrowserCommand(fn)` in `src/node/commands/*` (examples: `fs.ts`, `screenshot.ts`, `trace.ts`) and registering it in the commands map (registration site not read). User commands: `test.browser.commands` (`test/browser/vitest.config.mts:64-73`).
- Pitfalls: peer dep `vitest: workspace:*` (`package.json:75-77`). Per team note, `ivya` imports are restricted by lint to existing files (unverified). The build has a node part (rollup) and a client part (`vite build src/client`) (`package.json:68-70`). Client typecheck uses `src/client/tsconfig.json` (`:66`), so root typecheck does not cover it.
- Signature-level only (not read): `src/client/*` (orchestrator, tester, locators), `src/node/commands/screenshotMatcher/*`, middlewares, `shared/`.
- Tests: [browser tests](../../test/browser/index.md); `test/e2e/test/config/browser-configs.test.ts`.

Standards: none recorded — add with /devocd:company-policy; route via [PROJECT](../../../PROJECT.md) Links

## Evidence

- packages/browser/src/node/index.ts#L48-168 sha256:cb711418af7f89ce8cefe787a7910ac687b57ed7ee0e58e6f2605fa49802c503 2026-11-26
- packages/browser/package.json#L24-80 sha256:596e5ebe7488a76580b9b0514437b39da53812eb4567687a089eae9ca3c1aee4 2026-11-26
- test/browser/vitest.config.mts#L64-73 sha256:308ccd76fb441924ce739bdd4fa0d7f1af1b4e9c710424575bd9c9042eabdc6a 2026-11-26
