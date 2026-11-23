# Worker queue

One brief at a time per worker. A brief starts only when everything in **Needs** is merged.
No two running briefs may own the same file. Status: `ready`, `running`, `review`, `done`.

| # | Brief | Goal in one line | Owns (only these) | Needs | Status |
|---|---|---|---|---|---|
| 1 | [T76](T76.md) | Restore makes `.devocd/` match the backup exactly | `scripts/lib/backup.mjs`, `scripts/devocd.mjs` (restore only), `tests/unit/backup.test.mjs`, plugin README restore section | — | running |
| 2 | [T75](T75.md) | Secret scanner catches common secret types, no false positives | `scripts/lib/secrets.mjs`, `tests/unit/secrets.test.mjs`, `SECURITY.md` (one sentence) | — | ready |
| 3 | [T99](T99.md) | Completion helpers report the check result they were gated on | `scripts/lib/refresh.mjs` (baselineRefresh, completeRefresh), `tests/unit/refresh*.test.mjs` | — | ready |
| 4 | [T97](T97.md) | File notes lead with pitfalls and the test to run | `scripts/lib/rules.mjs`, `tests/unit/rules.test.mjs`, one line in `knowledge-contract.md` | — | ready |
| 5 | [T63](T63.md) | Make the four slowest test files fast without losing coverage | `tests/unit/capture.test.mjs`, `settings.test.mjs`, `parent-draft.test.mjs`, `reviewdiff.test.mjs` | — | ready |
| 6 | [T61](T61.md) | Turn near-identical tests into tables | `tests/unit/parent-draft.test.mjs`, `split.test.mjs`, `protect.test.mjs`, `settings.test.mjs` | T63 (shares files) | ready after #5 |

Every brief also edits its own line in `docs/TASKS.md` (the tick and PR link) and, where
named, its trap line in `docs/repo-memory.md`.

**Kept with the controller** (design work, not briefed): T94, T77, T78, T54, T56, T81, T82,
T95, T96, T100, T101, T102, T104.
**Briefed later** (waiting on controller work): T74 after T77 and T78 (same hook file);
T87 and T89 after T56 (the CLI command table).
