# @vitest/browser-preview

Parent: [packages](../index.md)
Scope: packages/browser-preview/**
Uses: none

Headed-only provider that just opens the user's default browser at the Vitest URL. Built on `defineBrowserProvider` from [@vitest/browser](../browser/index.md).

- Entry points: `src/preview.ts:7` `preview()` and `:16` `PreviewBrowserProvider`; `openPage` at `:44`.
- Public surface: `preview()` provider option. `supportsParallelism = false` (`:18`).
- Run/test this part: `pnpm run test:ci:unit` covers `test/ui/test/browser-preview.spec.ts` (documented; by name only).
- Extension points: model a new provider on this class. Implement `BrowserProvider` (`name`, `supportsParallelism`, `initScripts`, `openPage`, `getCommandsContext`, `isOpen`) and wrap it with `defineBrowserProvider({ name, providerFactory })`.
- Pitfalls: the constructor throws if `browser.headless` is set (`:29-33`). `initScripts` points to `dist/locators.js` (`:24`).
- Tests: `test/ui/test/browser-preview.spec.ts`, `test/ui/fixtures/browser-preview` (names only).

Standards: none recorded — add with /devocd:company-policy; route via [PROJECT](../../../PROJECT.md) Links

## Evidence

- packages/browser-preview/src/preview.ts#L1-50 sha256:5beef73e260637b96db059fb484a92f7820058944f27026ef51d46012178e40a 2026-11-26
