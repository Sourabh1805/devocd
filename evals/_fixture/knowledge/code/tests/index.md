# tests

Parent: [PROJECT](../../PROJECT.md)
Scope: tests/**, scripts/validate-plugin.mjs
Uses: none

Offline unit suite (the documented `npm test`), live opt-in end-to-end suites, shared helpers and fixtures, and the plugin validator.

- Entry points: `package.json:9` (`node --test "tests/unit/**/*.test.mjs"`), `tests/helpers/workspace.mjs:11` (`companyState`), `:17` (`projectState`), `scripts/validate-plugin.mjs:94` (`main`)
- Layout: `tests/unit/` (about 60 files, one per library or skill), `tests/e2e/` (live Claude Code runs, never CI), `tests/helpers/` (`workspace`, `tree`, `git`, `claude`, `routing`, `context-fixture`), `tests/fixtures/` (see below)
- Fixtures: `answers/` (add-project and install answer files), `diffs/` (base plus clean, planted, terraform, company-rule branches for PR review), `generated/api/` (expected add-project output shapes), `learning/` (PR history, expected claims and a small repo with `k8s/`, `infra/`, `src/billing`), `sources/` (policy source documents). Fixture folders are folded into this page; they are not project code.
- Run/test this part: `npm test` (documented, not approved for PR review). The e2e suites run only with `DEVOCD_LIVE=1` and not in CI; they cost real money, capped by `DEVOCD_LIVE_CAP_USD` (default 10) (`tests/helpers/claude.mjs:32-38`).
- To add a unit test: create `tests/unit/<name>.test.mjs` using `node:test`; build a temp tree with `workspace(t, { company, projects })` (`workspace.mjs:45-70`), which sets up state and optional git repos via the argv-only git helper.
- To add a plugin validation rule: `validateProblems` (`validate-plugin.mjs:59`) or `alwaysOnProblem` (`:81`).
- Pitfalls:
  - Unit tests must not call `claude`; `validate-plugin.mjs` exits 0 when `claude` is missing (`:103-106`) and fails on any manifest error, incomplete directory or blocking finding (`:59-74`).
  - Always-on budget is `LIMITS.footprintTokens` (190) (`:13`).
  - The inventory withholds secret-looking fixtures (`tests/fixtures/diffs/planted/worktree/src/config.js`, `tests/fixtures/sources/security-policy.md`) and several tests that contain secret patterns (listed in [coverage](../../coverage.md)); they are intentional test data, not read here.
  - `tests/e2e/add-project.test.mjs` plants a README line aimed at AI tools and a canary script body as hostile fixtures (`:32-35`, `:45`).

Standards: none recorded — add with /devocd:company-policy

## Evidence

- package.json#L8-10 sha256:3861187ea272f9053d5a68a065b11818168a4a21d546f6d89ecad50d6f01c85c 2026-11-20
- tests/helpers/workspace.mjs#L1-70 sha256:7035d8bcae0fad8f5090d25fe556405fa31abd93741022fe61860453c1d65cab 2026-11-20
- tests/helpers/claude.mjs#L1-50 sha256:ed20f2643a4555d5d517bec6a8e888f3e553a13828b61b571f32564ef40f7a4d 2026-11-20
- tests/e2e/add-project.test.mjs#L1-50 sha256:65d37fa574fea24954a93a776097cb07c8f24f6973cfa236fa4b4d3c7d73c25e 2026-11-20
- tests/fixtures/learning/expected.json#L1-40 sha256:094bc003e08a548e72781a320547f375c184eeb18684b21d5f5c19dd2303b3c8 2026-11-20
- scripts/validate-plugin.mjs#L1-131 sha256:a519292006d1d05869f048cecce89e5d07f28a7a6bd6351f46cae02f1afd4d31 2026-11-20
