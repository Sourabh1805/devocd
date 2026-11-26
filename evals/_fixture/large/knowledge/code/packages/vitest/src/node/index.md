# vitest node side

Parent: [vitest](../../index.md)
Scope: packages/vitest/src/node/**
Uses: none

Main-process half of Vitest: CLI parsing, the `Vitest` orchestrator class, project resolution, Vite plugins, specification discovery. `pool.ts` and `pools/` belong to [pools](pools/index.md).

- Entry points:
  - `src/node/cli.ts:3` calls `createCLI().parse()`.
  - `src/node/cli/cac.ts:74` `createCLI`. Commands: run, related, watch, dev, bench, init, doctor, list (`cac.ts:170-187`), default `start` (`:193`).
  - `src/node/cli/cac.ts:302` `start` lazily imports `./cli-api` and calls `startVitest`.
  - `src/node/cli/cli-api.ts:97` `startVitest`, `:223` `prepareVitest`.
  - `src/node/create.ts:25` `createVitest` builds `Logger`, `PluginHarness`, `resolveConfig`, `new Vitest` (`:55`).
  - `src/node/core.ts:81` class `Vitest`: `start` `:860`, `runFiles` `:1050` (private), `collect` `:801`, `cancelCurrentRun` `:1359`, `rerunFiles` `:1404`.
- Public surface: `startVitest`, `createVitest`, `Vitest`, `TestProject` (`project.ts:41`), `VitestSpecifications` (`specifications.ts:10`), `VitestCorePlugin` (`plugins/index.ts:14`), `resolveProjectEntries` (`projects/resolveProjects.ts:98`), `attachProjectsFromEntries` (`:1445`), `resolveAndAttachProjects` (`:1546`). Consumed by the `vitest/node` export, `packages/ui/node/index.ts` and the test-utils.
- Run/test this part: `pnpm test` (documented), e2e via `pnpm run test:ci:e2e`. Not approved for PR review beyond PROJECT's list.
- Extension points:
  - New CLI command: register `cli.command('x [...filters]', undefined, options).action(fn)` next to `cac.ts:170-193`, with a handler like `watch` (`:263`) that sets options and calls `start`. Option definitions live in `cli/cli-config.ts` (not read). Team note: regenerate `docs/guide/cli-generated.md` after option changes.
  - New Vite plugin: add it to the array returned by `VitestCorePlugin` (`plugins/index.ts:14`); sibling plugin files are in `plugins/` (inventory only).
- Pitfalls:
  - `start` exits with `process.exit()` and exit code 1 on a startup error (`cac.ts:312-320`).
  - `Vitest.start` throws `FilesNotFoundError` when no specs match, unless watch mode runs with `--changed`, `--related` or `--last-failed` (`core.ts:902-919`).
  - `startVitest` closes the server in `finally` unless `shouldKeepServer()` (`cli-api.ts:173-178`).
  - `vitest run --watch` stays in watch mode (`cac.ts:268-272`).
  - `createVitest` closes the instance if startup fails (`create.ts:64-66`).
- Unexplored: `reporters/`, `config/`, `environments/`, `sequencers/`, `cache/`, `vcs/`, `browser/`, `types/`, `watcher.ts`, `stdin.ts`, `logger.ts`, `coverage.ts`. They are named in coverage only.
- Tests: `test/e2e/test/cli-config.test.ts`, `test/e2e/test/cancel-run.test.ts`, `test/e2e/test/watch/*.test.ts` (names from inventory, not read); `test/node-runner/test/cli.test.js` (read) exercises `startVitest`.

Standards: none recorded — add with /devocd:company-policy; route via [PROJECT](../../../../../PROJECT.md) Links

## Evidence

- packages/vitest/src/node/cli/cac.ts#L74-352 sha256:0db6d70b0f592c6b29f9249c2b60ff876c0743272779ddba7be947273cf253b1 2026-11-26
- packages/vitest/src/node/cli/cli-api.ts#L97-205 sha256:6f24c8e41f1987da01f275843fb72aa5af8096602717479577f400211c457021 2026-11-26
- packages/vitest/src/node/create.ts#L25-68 sha256:d32b859a32b5871c22de1271fa070e755f9ed7a3473a08400659b665153caffd 2026-11-26
- packages/vitest/src/node/core.ts#L860-937 sha256:95534441cc276bd427a5d59e008def1e1695625796661f82771df6226f457730 2026-11-26
- packages/vitest/src/node/project.ts#L41 sha256:657a50ce76f65155d21db5a19a8a66d2c1e7ca4e27ac07221a39714c5c48c1d7 2026-11-26
- packages/vitest/src/node/specifications.ts#L10 sha256:e60b5aba2de02a549182f16f055ddf6e8cd9e157cb35a68e7e0721c87e93b960 2026-11-26
- packages/vitest/src/node/projects/resolveProjects.ts#L98 sha256:c878388f1dcd1afff2d649ccfedf71489bf646c6b75b81c7b256f7f2ff03e226 2026-11-26
- packages/vitest/src/node/plugins/index.ts#L14 sha256:dd022f62580245b43700f54587795c1571e8f122cbc26ce69157ddd0a2c1dd0d 2026-11-26
- packages/vitest/src/node/test-run.ts#L44-164 sha256:46b7d1566cad18a02ec86c54ebecd1fca7bd22a3e503fe101c7dc4fdee2b825f 2026-11-26
- test/node-runner/test/cli.test.js sha256:43bd9ef4c8c519df12ea7cbefe995e9ee4c7cd9126a481645968b60890cd66ff 2026-11-26
