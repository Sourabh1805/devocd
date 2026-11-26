# @vitest/ui

Parent: [packages](../index.md)
Scope: packages/ui/**
Uses: none

Vue web UI plus a Vite plugin that serves it, protected by the API token.

- Entry points: `node/index.ts:20` default export `(harness: PluginHarness) => Vite.Plugin` named `vitest:ui` (`apply: 'serve'`). Client: `client/main.ts`, `client/App.vue` (inventory only).
- Public surface: the plugin, `distClientRoot` (`:13`). It uses `isValidApiRequest` and `isFileServingAllowed` from `vitest/node`.
- Run/test this part: `pnpm -C packages/ui test:ui` and `pnpm -C packages/ui typecheck:client` (both appear in `.github/workflows/ci.yml`, documented); e2e in `test/ui/test/*.spec.ts`.
- Extension points: add a UI route or asset middleware inside `configureServer` (`node/index.ts:36`). Order matters: the auth middleware is mounted first on `base` (`:72`), then coverage (`:86-99`), attachments (`:104`), the html with token (`:144`), then static (`:168`).
- Pitfalls:
  - Everything under the UI base requires the token: a valid `?token=` sets the `vitest-ui-token` cookie, which is httpOnly and SameSite strict (`:15`, `:41-50`). Otherwise the response is 403 (`:82`).
  - `/__vitest_attachment__` serves files only for valid API requests and allowed paths (`:110-122`).
  - A version mismatch with vitest only warns (`:21-29`).
  - The token is injected into the HTML as `window.VITEST_API_TOKEN` (`:159`); never log that HTML.
- Not read: `client/**` (Vue components, composables), `node/reporter.ts`, `vite.config.ts`.
- Tests: `test/ui/test/ui.spec.ts`, `trace.spec.ts`, `merge-reports.spec.ts` (Playwright, names only); `packages/ui/vitest.config.ts` (not read).

Standards: none recorded — add with /devocd:company-policy; route via [PROJECT](../../../PROJECT.md) Links

## Evidence

- packages/ui/node/index.ts#L13-178 sha256:c205fa7ad6a7e8223e4a1424d31feea7ad83a4ed770448d8678a4ca11b8a2cde 2026-11-26
- .github/workflows/ci.yml#L66-67 sha256:75c015b53193ec2b4bc1ba92ee8db4283d030973d1f4e82f1d5e20c8e41b4159 2026-11-26
