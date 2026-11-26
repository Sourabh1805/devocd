# vitest

Vite-native testing framework: Jest-compatible API, workspaces, browser mode.

## Stack
- TypeScript ESM monorepo, pnpm 11.28.6 workspaces, v5.1.2, Node ^22.12 || ^24 || >=26 (`package.json:4-9`)
- Rollup/Vite build, oxlint + oxfmt, `tsc -p tsconfig.check.json` typecheck (`package.json:14-37`)

## Commands
- Documented (names only): `pnpm run lint`, `pnpm run lint:fix`, `pnpm test`, `pnpm run test:ci`, `pnpm run test:ci:unit`, `pnpm run test:ci:e2e`, `pnpm run test:ci:coverage`, `pnpm run test:browser:playwright`, `pnpm run test:examples`, `pnpm run typecheck`
- Approved for PR review: `pnpm test`, `pnpm run typecheck`, `pnpm run lint`. Documented is not approved; PR review runs only approved commands.
- Caveat: pool workers load built `dist/workers/*.js` (`packages/vitest/src/node/pools/workers/forksWorker.ts:40`), so `pnpm test` can exercise stale output unless a build ran. The build command is not approved.

## Parts of the code
- [Packages](code/packages/index.md): the 14 `packages/*`; core is [vitest](code/packages/vitest/index.md)
- [Tests](code/test/index.md): `test/` unit, e2e, browser, node-runner, test-utils

## Flows
- [Run tests: CLI to pool to worker to runner](flows/runtime/run-tests/index.md)
- [PR review](flows/pr-review.md)

## Project pages
- [CI/CD](cicd.md) · [Guides](guides/contributing.md) · [Coverage](coverage.md)

## Coverage warnings
- PARTIAL graph. The inventory is `complete:false` and under 3% of files were read. Unexplored: vitest `node/{reporters,config,environments,sequencers,cache,vcs,api,browser}`, `integrations`, `typecheck`, `vm` runtime, `packages/ui/client`, `docs/`, `examples/`, `scripts/`, most `.github/`. Three publish workflows were excluded by the inventory as secret-content. See [coverage](coverage.md).

## Dependencies
- None cross-repository (workspace only). CI uses the ghcr.io `playwright-deps` image and the npm registry.

## Links
- No company standards index exists yet.
