# vitest (package)

Parent: [packages](../index.md)
Scope: packages/vitest/*, packages/vitest/src/{api,create,integrations,public,typecheck,types,utils}/**, packages/vitest/browser/**
Uses: none

Core package: CLI, node API (`vitest/node`), pools and the in-worker test runtime.

- Children: [node](src/node/index.md) (CLI, `Vitest` class, projects, plugins), [pools](src/node/pools/index.md) (worker scheduling), [runtime](src/runtime/index.md) (worker-side runner).
- Flow: [run tests](../../../flows/runtime/run-tests/index.md) crosses all three.
- Entry points: `packages/vitest/src/node/cli.ts:3`; programmatic `startVitest` (`src/node/cli/cli-api.ts:97`) and `createVitest` (`src/node/create.ts:25`).
- Unexplored here (not read): `src/api`, `src/create/browser`, `src/integrations/{chai,css,env,mock,snapshot}`, `src/typecheck`, `src/utils`, `src/types`, `src/public`. The `vi` object lives under `integrations` (imported at `src/runtime/runBaseTests.ts:9`).
- Pitfalls: `packages/vitest/package.json` was not read, so exports and bin are unconfirmed. Team note (unverified): the other `@vitest/*` workspace packages are inlined into the vitest bundle except `@vitest/mocker`.
- Tests: `test/unit`, `test/e2e` (see [tests](../../test/index.md)).

Standards: none recorded — add with /devocd:company-policy; route via [PROJECT](../../../PROJECT.md) Links

## Evidence

- packages/vitest/src/node/cli.ts sha256:fe67160cdcfba453ec32f603b75aa8e434365660aa79258c5bc4912f04a6ed7a 2026-11-26
- packages/vitest/src/node/create.ts#L25-68 sha256:d32b859a32b5871c22de1271fa070e755f9ed7a3473a08400659b665153caffd 2026-11-26
- packages/vitest/src/node/cli/cli-api.ts#L97-179 sha256:6f24c8e41f1987da01f275843fb72aa5af8096602717479577f400211c457021 2026-11-26
