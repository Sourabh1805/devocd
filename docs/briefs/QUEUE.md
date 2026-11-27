# Worker queue

One brief at a time per worker. A brief starts only when everything in **Needs** is merged.
No two running briefs may own the same file. Status: `ready`, `running`, `review`, `done`.

| # | Brief | Goal in one line | Owns (only these) | Needs | Status |
|---|---|---|---|---|---|
| 1 | [T76](T76.md) | Restore makes `.devocd/` match the backup exactly | `scripts/lib/backup.mjs`, `scripts/devocd.mjs` (restore only), `tests/unit/backup.test.mjs`, plugin README restore section | — | done |
| 2 | [T75](T75.md) | Secret scanner catches common secret types, no false positives | `scripts/lib/secrets.mjs`, `tests/unit/secrets.test.mjs`, `SECURITY.md` (one sentence) | — | done |
| 3 | [T99](T99.md) | Completion helpers report the check result they were gated on | `scripts/lib/refresh.mjs` (baselineRefresh, completeRefresh), `tests/unit/refresh*.test.mjs` | — | done |
| 4 | [T97](T97.md) | File notes lead with pitfalls and the test to run | `scripts/lib/rules.mjs`, `tests/unit/rules.test.mjs`, one line in `knowledge-contract.md` | — | done |
| 5 | [T63](T63.md) | Make the four slowest test files fast without losing coverage | `tests/unit/capture.test.mjs`, `settings.test.mjs`, `parent-draft.test.mjs`, `reviewdiff.test.mjs` | — | done |
| 6 | [T61](T61.md) | Turn near-identical tests into tables | `tests/unit/parent-draft.test.mjs`, `split.test.mjs`, `protect.test.mjs`, `settings.test.mjs` | T63 (shares files) | done |
| 7 | [T60](T60.md) | One contract test for every skill; wording tests kept only as safeguards | `tests/unit/plugin-contract.test.mjs`, `skill-safeguards.test.mjs` (new), the five `*-skill.test.mjs` files | — | done |
| 8 | [T64](T64.md) | A coverage number we can trust, a gate, and the test rules | `tests/tools/coverage.mjs` (new), `package.json` scripts, `ci.yml` (one step), `AGENTS.md` (Tests section), `docs/repo-memory.md` | T60 (#73) | done |
| 9 | [T64b](T64b.md) | Break one rule at a time and prove the tests notice | `tests/tools/mutants.mjs` (new), new tests in claims/redundancy/refresh/trace test files, `package.json` scripts | T64 (#75) | done |
| 10 | [T105](T105.md) | The hook timing test stops failing at random | `tests/unit/hooks.test.mjs` (the timing test only), `tests/tools/coverage.mjs` | T64b (#77) | done |
| 11 | [T106](T106.md) | Commits credited to the right GitHub account: an identity check in CI, and a verified history rewrite for the owner to push | `tests/tools/authors.mjs` (new), `tests/unit/authors.test.mjs` (new), `ci.yml` (one step), `AGENTS.md` (one bullet), `docs/repo-memory.md` (one trap) | — | done |
| 12 | [T77](T77.md) | Large edits are still tracked: a streaming hook-input reader and an untracked notice | `scripts/lib/hookinput.mjs` (new), `scripts/devocd-hooks.mjs` (main block, dispatch, session start), `clearStale` in `refresh.mjs`, new tests | T105 (#79) | done, PR #80 |
| 13 | [T74](T74.md) | The prompt hook gives each policy pointer once per session; `hook-stats` shows the cost | `onPrompt` and session-start cleanup in `devocd-hooks.mjs`, `scripts/lib/hookstats.mjs` (new), `hook-stats` in `devocd.mjs`, README Settings, new tests | T77 (#80) | done |
| 14 | [T108](T108.md) | Policy repo config: state, preflight status, read-only git probes, `settings add-dir` for the clone | `scripts/lib/policyrepo.mjs` (new), `preflight.mjs` (company result), `assertSettingAllowed` in `devocd.mjs`, state validation in `check.mjs` (the `policyRepo` field only), new tests | T74 on `main` | done, PR [#87](https://github.com/Sourabh1805/devocd/pull/87) |
| 16 | [T94b](T94b.md) | Does DevOCD help on a large repository? Measure it, fixed report format | `fixture.sh` (new modes), `evals/_fixture/large/` (new), new arrays in `cases.mjs`, `generate.mjs`, `evals/_tools/summarize.mjs` (new), eval tests, a new section in `release-readiness.md`, `docs/evidence/t94-large-summary.json` | T94 cases (`7539f41`) | done, PR [#89](https://github.com/Sourabh1805/devocd/pull/89) |
| 17 | [T111](T111.md) | `Standards:` topics resolve to policy-repo files in the graph, trace and refresh-status | `readPolicyIndex` in `policyrepo.mjs`, the `governed-by` block and `policies` field in `knowledge.mjs`, `policies` in `trace.mjs`, snapshot and status in `refresh.mjs`, new tests | T108, T109, T120, T121 | done, PR [#98](https://github.com/Sourabh1805/devocd/pull/98) |
| 18 | [T110](T110.md) | The prompt hook and startup text read the policy repo; a missing clone is said once per session | `promptPointers`, `onSessionStart`, `bumpHookStats` in `devocd-hooks.mjs`, the policy sentence in `parent.mjs`, `project-template.md`, `hookstats.mjs` display, new tests | T111 | done, PR [#99](https://github.com/Sourabh1805/devocd/pull/99) |
| 19 | [T112](T112.md) | `check` reports the policy repo's clone, commit, changed files and index problems | the new rules in `check.mjs`, `policyCloneOf` in `trace.mjs`, new tests | T111 | done, PR [#100](https://github.com/Sourabh1805/devocd/pull/100) |
| 20 | [T112b](T112b.md) | `check` names policies no page cites and no hook pointer has given for `policyUnusedDays` | the new rule and the `policyUnusedDays` validation in `check.mjs`, an optional read helper in `hookstats.mjs`, new tests | T110, T112 | ready |

Every brief also edits its own line in `docs/TASKS.md` (the tick and PR link) and, where
named, its trap line in `docs/repo-memory.md`.

**Kept with the controller** (design work, not briefed): T94, T78, T54, T56, T81, T82,
T95, T96, T100, T101, T102, T104.
**Briefed later** (waiting on controller work): T87 and T89 after T56 (the CLI command table).
