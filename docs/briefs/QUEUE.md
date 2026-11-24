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
| 10 | [T105](T105.md) | The hook timing test stops failing at random | `tests/unit/hooks.test.mjs` (the timing test only), `tests/tools/coverage.mjs` | T64b (#77) | review, PR #79 |
| 11 | [T77](T77.md) | Large edits are still tracked: a streaming hook-input reader and an untracked notice | `scripts/lib/hookinput.mjs` (new), `scripts/devocd-hooks.mjs` (main block, dispatch, session start), `clearStale` in `refresh.mjs`, new tests | T105 (#79) | ready after #10; branch `brief/T77` |

Every brief also edits its own line in `docs/TASKS.md` (the tick and PR link) and, where
named, its trap line in `docs/repo-memory.md`.

**Kept with the controller** (design work, not briefed): T94, T78, T54, T56, T81, T82,
T95, T96, T100, T101, T102, T104.
**Briefed later** (waiting on controller work): T74 after T77 (DeepSeek) and T78 (same hook file);
T87 and T89 after T56 (the CLI command table).
