# Refresh and staleness

Parent: [PROJECT](../../../PROJECT.md)
Scope: skills/refresh/**, scripts/lib/refresh.mjs, scripts/devocd-hooks.mjs
Uses: none

Detecting that source moved, planning which pages to rebuild, and recording a new baseline.

- Entry points: edit hook `scripts/devocd-hooks.mjs:101`, session notice `:148`, `skills/refresh/SKILL.md:38-52`, `scripts/lib/refresh.mjs:138` (`refreshStatus`)
- Call path:
  1. After a Write/Edit, `onEdit` appends `{t, path}` to `.devocd/journal/edits.jsonl` and, if `sources.json` maps the path to pages, merges them into `stale.json` ([hooks](../../../code/scripts/hooks.md)).
  2. Next session, `onSessionStart` announces stale pages.
  3. `refresh-status` compares a fresh snapshot with `refresh.json`; reasons `no-baseline`, `incomplete-inventory`, `source-changed`, `current` (`refresh.mjs:141-143`).
  4. `refresh-plan` writes `refresh.pending.json` and returns `mode`: `incremental` (list of `affected`, `parents`, `unmapped`) or `full` (`:147-157`, `impactOf` `:98-135`).
  5. Incremental: builder rewrites only affected pages (`skills/refresh/references/incremental.md`); full: re-run add-project. Both go through draft, approval, `backup`.
  6. `refresh-complete` checks the snapshot matches the plan, runs `check`, rewrites the graph, stores `refresh.json`, advances `sourceRefreshed`, clears stale marks except edits journaled after the snapshot began (`:189-206`, `clearStale` `:63-85`).
- Public surface: `refresh-status`, `refresh-plan`, `refresh-complete` verbs; `decisions.md` and `decision-history/` are never touched (`skills/refresh/SKILL.md:21-22`).
- Run/test this part: documented `npm test` (not approved for PR review); `tests/unit/refresh.test.mjs` (read), `refresh-impact.test.mjs`, `hooks.test.mjs` (read).
- Extension: to change what counts as affected, edit `impactOf` (`refresh.mjs:98`); cited pages beat scope matches, and the most specific scope wins ties.
- Pitfalls: source changed during refresh makes `refresh-complete` throw (`:195`); the skill never runs `git pull` itself and there is no background watcher (`SKILL.md:32-36`, `:54-57`); stale marks are lost under concurrent edits.

Standards: none recorded — add with /devocd:company-policy

## Evidence

- skills/refresh/SKILL.md#L19-58 sha256:0db80e3ca749f0414de2c5e93fc3497a2541b30bb1374f58ed5ced8dc140213e 2026-11-20
- skills/refresh/references/incremental.md#L1-19 sha256:8b1097fe429af257f4736a1329e80e916e4d4dcda3836fbe2c50a8c5f642bbcb 2026-11-20
- scripts/lib/refresh.mjs#L63-206 sha256:fd12298a22da262c2f06ff95dcdcf7bd569d377aeb1afb960c6f47b745d9d9d9 2026-11-20
- scripts/devocd-hooks.mjs#L101-157 sha256:91beccf0f6d7d0d48eea608b1e5e0d688d8c99fd4288a57b615288f1c7e06226 2026-11-20
