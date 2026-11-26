# Decisions

Each entry has a source and date. Changes go through `/devocd:capture`.

## D-0001 — `packages/expect` stays runtime-agnostic
Date: 2026-10-02

`packages/expect` must not import Node.js built-ins (`node:*`) or read the filesystem, directly or
through a dependency it bundles: the package is also bundled into browser and edge runtimes. A
matcher that needs a host capability takes it from `packages/vitest` at runtime instead.

## D-0002 — No shared internal package for cross-package helpers
Date: 2026-10-08

A `@vitest/shared` package was created on 2026-09-17 to hold helpers duplicated across packages
(`isPlainObject`, `format`, `getType`) and reverted on 2026-10-01: two bundles ended up with
separate copies of its module-level state, so `expect` and `snapshot` saw different instances under
HMR. Helpers stay duplicated per package; add one to `@vitest/utils` only when it holds no state.

## D-0003 — Pool and scheduler changes need the performance owner
Date: 2026-10-14

Changes under `packages/vitest/src/node/pool.ts`, `poolRunner.ts`, `pools/` or `watchdog.ts` need an
approving review from the performance owner (GitHub team `@vitest/perf`) before merge, even when CI
is green. The author does not merge such a change themselves.

## D-0004 — `.snap` files are generated; update with `-u` only
Date: 2026-10-20

Snapshot files are output, not source. A failing snapshot is fixed by running the suite with `-u`
(or `--update`) and committing the regenerated file; the runner rewrites `.snap` files on the next
run, so a hand edit is lost and is rejected in review.

## D-0005 — Release from main; bump, then tag the merge commit
Date: 2026-10-26

A release bumps the version in the root `package.json` and in every published package's
`package.json` in one pull request to `main`, merged only after CI is green on Linux, macOS and
Windows. A maintainer creates the `vX.Y.Z` tag on that merge commit on `main`. Feature or release
branches are never tagged.

## D-0006 — Browser-mode tests are nightly only
Date: 2026-11-01

`test:browser` runs on the nightly schedule and before a release, not on every pull request. A pull
request that changes browser code runs the unit suite only; a nightly failure blocks the release.

## D-0007 — No new runtime dependencies in `packages/expect`
Date: 2026-11-04

`packages/expect` ships in every install. A new runtime dependency needs an explicit decision
before it merges; small helpers are inlined instead.

## D-0008 — Security reports go to the private advisory channel
Date: 2026-11-06

A suspected vulnerability is reported through GitHub's private security advisory, never as a public
issue or pull request. The maintainer who receives it coordinates the fix and the disclosure date.

## D-0009 — Public API changes need a migration note
Date: 2026-11-09

A change to an exported type or function in a published package adds a note under
`docs/guide/migration.md` in the same pull request, so the next release can link to it.

## D-0010 — Documentation examples use pnpm
Date: 2026-11-11

Code examples in `docs/` and in package READMEs use `pnpm`, matching the workspace's package
manager. npm and yarn commands are shown only where a page compares package managers.
