# test/browser

Parent: [test organisation](../index.md)
Scope: test/browser/**
Uses: none

Browser-mode suite driven from `specs/*.test.ts`, which launch fixtures; in-browser tests are in `test/`.

- Entry points: `test/browser/vitest.config.mts:22` config (`include: test/**.test.{ts,js,tsx}`, `includeSource: src/*.ts`, browser `enabled`, `instances`/`provider` from `./settings.ts`). Specs: `test/browser/specs/*.test.ts` (about 50, e.g. `runner.test.ts`, `locators.test.ts`, `mocking.test.ts`); fixtures `test/browser/fixtures/*`.
- Run/test this part: `pnpm run test:browser:playwright` (documented; root script `package.json:43` delegates to `pnpm -C test/browser run test:playwright`). CI splits it (see [cicd](../../../cicd.md)).
- Extension points: custom browser command means an entry in `test.browser.commands` (`:64-73`). A new scenario means `specs/<name>.test.ts` plus `fixtures/<name>`.
- Pitfalls:
  - Config injects custom headers including `X-Frame-Options: DENY` and a CSP (`:24-30`); the Vitest iframe must still load.
  - A plugin throws if the UI path `/__vitest__/` is transformed (`:103-108`).
  - CI isolates `runner.test.ts` on Windows because it is the heaviest spec (`ci.yml:253-277`).
  - Needs Playwright browsers.
- Not read: `settings.ts`, `package.json`, `specs/*`.
- Tests: this layer; covers [browser](../../packages/browser/index.md), [browser-playwright](../../packages/browser-playwright/index.md).

Standards: none recorded — add with /devocd:company-policy; route via [PROJECT](../../../PROJECT.md) Links

## Evidence

- test/browser/vitest.config.mts#L22-137 sha256:308ccd76fb441924ce739bdd4fa0d7f1af1b4e9c710424575bd9c9042eabdc6a 2026-11-26
- package.json#L43 sha256:83f4c7796f97680f795b8f66197df34e4642570350a2b11c45f895e71f146671 2026-11-26
- .github/workflows/ci.yml#L253-277 sha256:75c015b53193ec2b4bc1ba92ee8db4283d030973d1f4e82f1d5e20c8e41b4159 2026-11-26
