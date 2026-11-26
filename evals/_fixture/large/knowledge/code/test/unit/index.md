# test/unit

Parent: [test organisation](../index.md)
Scope: test/unit/**
Uses: none

Unit suite that runs in several pools on one config. It does not start a new Vitest per test. Covers expect, spy, snapshot, mocking, environments and utils.

- Entry points: `test/unit/package.json:5-14` scripts `test`, `test:threads`, `test:forks`, `test:vmThreads` (each `vitest --project <pool>`), `bench`, `coverage`, `collect`. The root `pnpm test` calls `test:threads` (`package.json:28`). Specs in `test/unit/test/**` (about 100 files by inventory); sources in `test/unit/src`.
- Run/test this part: `pnpm test` (documented, approved here by PROJECT). Single file: `pnpm test <file>` (documented in team notes).
- Extension points: add `test/unit/test/<name>.test.ts`, with helper sources in `src/`; custom environment example `test/unit/vitest-environment-custom/index.ts`; mocking specs in `test/unit/test/mocking/`.
- Pitfalls:
  - Depends on workspace packages and `link:`/`file:` fixtures (`package.json:22-54`).
  - Uses `vite: latest` (`:52`) and the e2e package does the same.
  - The vitest config was not read, so project names beyond the scripts are unconfirmed.
- Tests: this layer. Packages covered: [expect](../../packages/expect/index.md), [spy](../../packages/spy/index.md), [snapshot](../../packages/snapshot/index.md), [mocker](../../packages/mocker/index.md), [pretty-format](../../packages/pretty-format/index.md), [utils](../../packages/utils/index.md), [web-worker](../../packages/web-worker/index.md).

Standards: none recorded — add with /devocd:company-policy; route via [PROJECT](../../../PROJECT.md) Links

## Evidence

- test/unit/package.json#L1-58 sha256:fe31cf40ab9028a2abe297dd758646054d9f2ef22311f616d65268870f8a789d 2026-11-26
- package.json#L28 sha256:83f4c7796f97680f795b8f66197df34e4642570350a2b11c45f895e71f146671 2026-11-26
