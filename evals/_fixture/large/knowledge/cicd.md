# CI/CD

Parent: [PROJECT](PROJECT.md)
Scope: .github/workflows/*, .github/actions/**, .github/docker/**
Uses: none

Descriptive map of `.github/workflows/ci.yml` (read in full). Command names only.

- Triggers: push to `main`, pull_request (opened, synchronize, reopened, closed), `workflow_dispatch` (`ci.yml:7-15`). Concurrency cancels in-progress runs per PR or ref (`:17-19`). Default permissions are `{}` (`:5`).
- Jobs:
  - `lint` (`:29`): `pnpm dedupe --check`, install `pnpm i --filter '!docs'`, `pnpm run build`, `pnpm -C docs run cli-table`, `git diff --exit-code` (stale artifacts), `pnpm run lint`, `pnpm run typecheck`, `pnpm run -C packages/ui typecheck:client`, actionlint.
  - `changed` (`:75`): skips tests when only docs, markdown or non-ci `.github` files changed.
  - `playwright-deps-image` (`:103`): builds and pushes a ghcr.io image only if its tag is missing; fork PRs cannot push.
  - `test` (`:151`): matrix suite unit/e2e/coverage on ubuntu node 24 and 26; extra legs e2e node 22, e2e macOS, unit/e2e/coverage on Windows node 24. Runs `pnpm run test:ci:<suite>`, then `pnpm run test:examples` (unit, ubuntu) and `pnpm -C packages/ui test:ui`. Uploads results as artifacts.
  - `test-browser-windows` (`:259`) and `test-browser-linux` (`:309`): `pnpm run test:browser:playwright`, sharded; Windows isolates `runner.test.ts`; Linux runs in the playwright-deps container.
  - `test-vite7` (`:367`): `pnpm override-vite7`, then e2e and the browser `runner.test.ts` smoke.
  - `merge-reports` (`:439`): merges blob reports into html artifacts.
- Other workflows (names only, not read): ai-policy, approve-contributor, cr, ecosystem-ci-trigger, issue-close-require, issue-labeled, knip, lock-closed-issues, pr-redirect-all, semgrep, zizmor. Excluded by the inventory as secret-content: `prepare-publish.yml`, `promote-docs.yml`, `publish.yml`, so the release flow is unmapped. Root scripts `release` and `publish-ci` run `scripts/release.ts` and `scripts/publish-ci.ts` (not read).
- Pitfalls:
  - Actions are pinned to commit SHAs. Several `uses:` lines read `$/.github/actions/...` (`:42`, `:202`); this is probably a sanitization artefact in the file read, unconfirmed.
  - Actionlint is downloaded with `curl ... | bash` from the `main` branch (`:72`).
  - The test steps carry `# zizmor: ignore[template-injection]` (`:218`, `:307`).
  - `PNPM_CONFIG_TRUST_LOCKFILE` is true except in the lint job (`:26`, `:36`).
- Tests of CI itself: none. The matrix table is mirrored in `test/README.md:29-42`.

Standards: none recorded — add with /devocd:company-policy; route via [PROJECT](PROJECT.md) Links

## Evidence

- .github/workflows/ci.yml#L1-513 sha256:75c015b53193ec2b4bc1ba92ee8db4283d030973d1f4e82f1d5e20c8e41b4159 2026-11-26
- package.json#L12-43 sha256:83f4c7796f97680f795b8f66197df34e4642570350a2b11c45f895e71f146671 2026-11-26
- test/README.md#L29-42 sha256:2424422fce0f4f2477dfbe027511c543caf0dcad690eb7b7a1e445ba62e2d6a4 2026-11-26
