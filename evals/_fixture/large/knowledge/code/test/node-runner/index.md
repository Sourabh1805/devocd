# test/node-runner

Parent: [test organisation](../index.md)
Scope: test/node-runner/**
Uses: none

Tests run with Node's built-in runner (`node --test`), so the test process has no Vitest APIs and must call `vitest/node` itself.

- Entry points: `test/node-runner/package.json:5-7` script `test` is `node --test './test/*'`. `test/node-runner/test/cli.test.js:4` checks that importing vitest in a global setup is reported as an error. `root-tmpdir.test.js` is not read. Fixtures: `fixtures/globalSetup`, `fixtures/root-tmpdir`.
- Run/test this part: `pnpm run test:ci` (documented) includes this package via `--filter '@vitest/test-*'` only if its package name matches. The package name is `@test/node-runner`, so whether the root filter selects it is unconfirmed.
- Extension points: add `test/node-runner/test/<name>.test.js` using `node:test` and `startVitest` from `vitest/node` (pattern in `cli.test.js:1-13`).
- Pitfalls: relative `root` (`./fixtures/globalSetup`) depends on cwd being the package.
- Tests: this layer.

Standards: none recorded — add with /devocd:company-policy; route via [PROJECT](../../../PROJECT.md) Links

## Evidence

- test/node-runner/package.json sha256:7f5e929d95661f8f81fb88864beb223b3b264e943151a207e784a60e5bcbcb19 2026-11-26
- test/node-runner/test/cli.test.js#L1-13 sha256:43bd9ef4c8c519df12ea7cbefe995e9ee4c7cd9126a481645968b60890cd66ff 2026-11-26
- package.json#L29 sha256:83f4c7796f97680f795b8f66197df34e4642570350a2b11c45f895e71f146671 2026-11-26
