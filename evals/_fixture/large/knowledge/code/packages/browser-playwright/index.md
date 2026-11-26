# @vitest/browser-playwright

Parent: [packages](../index.md)
Scope: packages/browser-playwright/**
Uses: none

Playwright-backed browser provider plus its commands (click, fill, screenshot, trace, upload, and more).

- Entry points: `src/index.ts:1-7` re-exports `playwright` (`src/playwright.ts:89`), `PlaywrightBrowserProvider` (`:293`) and `defineBrowserCommand` from `@vitest/browser`. `openPage` is `playwright.ts:787`, `close` is `:820`.
- Public surface: `playwright(options)` provider factory, `PlaywrightProviderOptions`, `CDPSession`. Consumed in user config `test.browser.provider` (`test/browser/vitest.config.mts:49`).
- Run/test this part: `pnpm run test:browser:playwright` (documented).
- Extension points: add a command as `src/commands/<name>.ts` and export it from `src/commands/index.ts` (existing: clear, click, dragAndDrop, fill, hover, keyboard, pointer, screenshot, select, tab, trace, type, upload, viewport, wheel; file names from inventory, registration not read).
- Pitfalls: signature-level only; `playwright.ts` body and `commands/*` were not read. `test/e2e/package.json` also depends on it for e2e browser checks.
- Tests: `test/browser/specs/playwright-connect.test.ts`, `playwright-trace.test.ts`, `locators.test.ts` (names only).

Standards: none recorded — add with /devocd:company-policy; route via [PROJECT](../../../PROJECT.md) Links

## Evidence

- packages/browser-playwright/src/index.ts sha256:d9b02b22db173f3153a63e94482c3243e0f21775cda2d7d4fffea7ec3c355f79 2026-11-26
- packages/browser-playwright/src/playwright.ts#L89-820 sha256:16372639289a7399f34fd6f96b6bbfdca847eb3b4fc06d44a36e7e5a411c4f53 2026-11-26
