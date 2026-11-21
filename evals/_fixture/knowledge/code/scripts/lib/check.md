# check

Parent: [scripts](../index.md)
Scope: scripts/lib/{check,content-check,redundancy,tokens}.mjs
Uses: none

Read-only validation of a company or project folder: state schema, links, secrets, budgets, page quality, repeats, decisions.

- Entry points: `scripts/lib/check.mjs:179` (`checkTree`), `:67` (`stateProblem`), `scripts/lib/content-check.mjs:24` (`pageIssues`) and `:70` (`decisionIssues`), `scripts/lib/redundancy.mjs:91` (`findRepeats`), `scripts/lib/tokens.mjs:3` (`estimateTokens`) and `:14` (`LIMITS`). CLI entry `cmdCheck` at `scripts/devocd.mjs:84`.
- Public surface: `check <dir> [--json]` and the `/devocd:check` skill; `stateProblem` is also used by `scope.mjs`, `refresh.mjs`, `parent.mjs`, `integrations.mjs`; `fencedLines`, `maskCode`, `linkTargets` are shared with `knowledge.mjs`.
- Run/test this part: `npm test` (documented, not approved for PR review); covering tests `tests/unit/check.test.mjs`, `content-check.test.mjs`, `redundancy.test.mjs`, `tokens.test.mjs` (names only, not read)
- To add a state field: validate it in `stateProblem` (`check.mjs:67-103`). To add a content rule: emit an issue in `pageIssues` (warning or information only) and add its row to the table in `skills/check/SKILL.md:25-44`. To change a size limit: `LIMITS`/`CONTEXT_TARGETS` (`tokens.mjs:14-29`).
- Pitfalls:
  - `check` must stay read-only (`docs/repo-memory.md:38`).
  - Errors: link leaving the company folder (`ref/escape`, `check.mjs:217`), broken link, `@import`, secret, size over limit, standards files without `index.md` (`:295`). Content checks never exceed warning (`content-check.mjs:1-2`).
  - Limits: project 80 lines/700 tokens, flow 80 lines, reference 200 lines, pointer 40/400, parent 60/500 (`tokens.mjs:14-24`). Token counts are estimates (ASCII chars/4, others/2).
  - Launch estimate assumes any `CLAUDE.md`/`CLAUDE.local.md` at or above turns `AGENTS.md` off; the parent-folder `.claude/CLAUDE.md` case is assumed, not observed (`check.mjs:144-150`).
  - Pages under `draft/` and `.backups/` are skipped (`:369`); the word `unconfirmed` is counted as information (`:384-389`).
  - `pageIssues` needs `Entry points` and `Pitfalls` in module pages and a `Standards:` line (`content-check.mjs:38-44`).

Standards: none recorded — add with /devocd:company-policy

## Evidence

- scripts/lib/check.mjs#L67-103 sha256:aafca36b3e1738cec5dfb6810d0803c3342f37604ab591d4f16d50c418826311 2026-11-20
- scripts/lib/check.mjs#L129-171 sha256:aafca36b3e1738cec5dfb6810d0803c3342f37604ab591d4f16d50c418826311 2026-11-20
- scripts/lib/check.mjs#L179-411 sha256:aafca36b3e1738cec5dfb6810d0803c3342f37604ab591d4f16d50c418826311 2026-11-20
- scripts/lib/content-check.mjs#L1-138 sha256:f6317490ede771957d014e7d696fa393cae258f0d985842efa3ea53b59d6b40b 2026-11-20
- scripts/lib/redundancy.mjs#L1-60 sha256:b89dce9e33a90f43c1e872a23a3c133f1e3b644cd5de15fbd9acf5982b091452 2026-11-20
- scripts/lib/tokens.mjs#L1-29 sha256:9f992ac0e05f5a6068bac840b6ba1bcc2e85e385aa4cb89a6c1bf8a89dea3093 2026-11-20
- skills/check/SKILL.md#L25-44 sha256:dabfa5d82c04ba9f31c5dcc6effe23c62e17f5c4730784dc78b5a5e099359355 2026-11-20
- docs/repo-memory.md#L33-50 sha256:133d959fbac9a67fdd1780c8ad1e24a1e20bfb9a3f95d31e4f032f8bd4e80c08 2026-11-20
