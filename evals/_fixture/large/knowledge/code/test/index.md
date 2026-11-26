# test organisation

Parent: [PROJECT](../../PROJECT.md)
Scope: test/*, test/README.md
Uses: none

Repo tests are separate pnpm packages (`@vitest/test-*`) run against built packages.

- Children: [unit](unit/index.md), [e2e](e2e/index.md), [browser](browser/index.md), [node-runner](node-runner/index.md), [test-utils](test-utils/index.md).
- Not mapped to pages (listed in coverage): `test/coverage-test`, `test/ui`, `test/typescript`, `test/workspaces`, `test/workspaces-browser`. Per `test/README.md`, `ui` holds Playwright e2e tests for the UI package. The root scripts name them (`test:ci:coverage`, `test:ci:unit`).
- Entry points: `test/README.md:3-23` categories. Root scripts: `pnpm test` is `pnpm --filter test-unit test:threads` (`package.json:28`); `test:ci` runs every `@vitest/test-*` except browser (`:29`).
- Run/test this part: `pnpm test`, `pnpm run test:ci`, `pnpm run test:ci:unit`, `pnpm run test:ci:e2e`, `pnpm run test:ci:coverage` (documented). Which approved commands apply: see PROJECT.
- Extension points: a new category means a new `test/<name>/package.json` with a `test` script named `@vitest/test-<name>`. The `--filter '@vitest/test-*'` in root scripts picks it up. Add it to the CI table in `test/README.md` (the CI file says to keep them in sync, `ci.yml:170`).
- Pitfalls: `test:ci:unit` excludes e2e, coverage and browser but includes `test-ui` and `test-workspaces-browser` run sequentially (`package.json:33`). Suites run against built output; build first. Windows is in the CI matrix, so normalize path separators.
- Tests: n/a (this is the test layer).

Standards: none recorded — add with /devocd:company-policy; route via [PROJECT](../../PROJECT.md) Links

## Evidence

- test/README.md#L1-43 sha256:2424422fce0f4f2477dfbe027511c543caf0dcad690eb7b7a1e445ba62e2d6a4 2026-11-26
- package.json#L28-43 sha256:83f4c7796f97680f795b8f66197df34e4642570350a2b11c45f895e71f146671 2026-11-26
- .github/workflows/ci.yml#L170-190 sha256:75c015b53193ec2b4bc1ba92ee8db4283d030973d1f4e82f1d5e20c8e41b4159 2026-11-26
