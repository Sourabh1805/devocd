# packages

Parent: [PROJECT](../../PROJECT.md)
Scope: packages/*/package.json
Uses: none

Index of the 14 published workspace packages. Each owns one responsibility.

- Entry points: workspace build is `package.json:14` (`pnpm -r ... run build`); tests resolve packages through built `dist/`.
- Public surface and routing:
  - [vitest](vitest/index.md): CLI, node API, pools, test runtime. The core package.
  - [browser](browser/index.md), [browser-playwright](browser-playwright/index.md), [browser-preview](browser-preview/index.md): browser mode and its providers.
  - [ui](ui/index.md): web UI served through a Vite plugin.
  - [expect](expect/index.md), [spy](spy/index.md), [snapshot](snapshot/index.md), [pretty-format](pretty-format/index.md): assertions, mocks, snapshots, serialization.
  - [mocker](mocker/index.md): module mocking and hoisting transforms.
  - [coverage-v8](coverage-v8/index.md), [coverage-istanbul](coverage-istanbul/index.md): coverage providers.
  - [utils](utils/index.md): shared helpers via subpath exports.
  - [web-worker](web-worker/index.md): `Worker` and `SharedWorker` simulation in Node.
- Run/test this part: `pnpm run build`, `pnpm run typecheck` (documented, not approved for PR review unless listed in PROJECT).
- Extension points: to add a package, copy a sibling `package.json` (`exports`, `peerDependencies`) and wire its tests under `test/`. Unconfirmed: workspace globs live in `pnpm-workspace.yaml`, which was not read.
- Pitfalls: `packages/vitest` and `packages/browser` expose an `__vitest_source__` export condition (see `packages/browser/package.json:34`) that resolves workspace packages from TypeScript source. This is the source-level reason for the "rebuild before testing" caveat. Team note, unverified: only `@vitest/mocker` is not inlined into the vitest bundle.
- Tests: [test organisation](../test/index.md).

Standards: none recorded — add with /devocd:company-policy; route via [PROJECT](../../PROJECT.md) Links

## Evidence

- package.json#L14-43 sha256:83f4c7796f97680f795b8f66197df34e4642570350a2b11c45f895e71f146671 2026-11-26
- packages/browser/package.json#L24-54 sha256:596e5ebe7488a76580b9b0514437b39da53812eb4567687a089eae9ca3c1aee4 2026-11-26
