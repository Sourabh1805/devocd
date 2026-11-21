# source-freshness

Parent: [scripts](../index.md)
Scope: scripts/lib/{inventory,refresh,completion,secrets}.mjs
Uses: none

Hashes the source tree for evidence, records a refresh baseline, and decides which pages a source change touches.

- Entry points: `scripts/lib/inventory.mjs:33` (`inventoryKnowledge`), `scripts/lib/refresh.mjs:138` (`refreshStatus`), `:147` (`planRefresh`), `:172` (`baselineRefresh`), `:189` (`completeRefresh`), `scripts/lib/completion.mjs:43` (`advanceCompletion`), `scripts/lib/secrets.mjs:28` (`scanSecrets`)
- Call path: `planRefresh` → `snapshot` (`refresh.mjs:24`) → `inventoryKnowledge` → `diffInventories` (`:88`) → `impactOf` (`:98`). `completeRefresh` re-snapshots, compares to `refresh.pending.json`, runs `checkTree`, `writeKnowledge`, then `advanceCompletion('sourceRefreshed')` and `clearStale`.
- Public surface: CLI `knowledge-inventory`, `refresh-status`, `refresh-plan`, `refresh-complete`, `refresh-baseline`; also called by `trace.mjs`, `content-check.mjs`, `context-store.mjs`. Flow: [Refresh](../../../flows/runtime/refresh/index.md).
- Run/test this part: `npm test` (documented, not approved for PR review); covering tests `tests/unit/inventory.test.mjs` (read: nested coverage, exclusions, bulk classification), `tests/unit/refresh.test.mjs` (read: no-baseline, edits, baseline), `refresh-impact.test.mjs`, `completion.test.mjs` (names only). `secrets.test.mjs` is withheld by the inventory.
- To add an excluded folder or private file pattern: `EXCLUDED`/`PRIVATE` (`inventory.mjs:9-10`); to classify more bulk: `LOCKFILES`/`BULK` (`:14-15`). To add a secret rule: `FIXED` (`secrets.mjs:15`).
- Pitfalls:
  - Per-file limit 256 KiB, 16 MiB total, 20000 entries; an oversize or unreadable source file makes `complete: false` (`inventory.mjs:86-100`).
  - Nested repositories, links, git-ignored files and secret-content files are skipped, so they carry no hash: editing a withheld file never marks anything stale (`:61-94`; `refresh.mjs:88-95` diffs `files` only).
  - The fingerprint ignores `CLAUDE.local.md`, `.claude/settings.local.json`, `.claude/rules/devocd/` and `.devocd` so onboarding does not shift it (`refresh.mjs:24-35`).
  - `planRefresh` throws on a partial inventory (`:149`); `baselineRefresh` still renders but returns `current: false` on drift, partial inventory or skipped pages (`:177-181`).
  - Impact is `full` when more than half the module/flow pages are affected or none exist (`:132-133`).
  - Notebooks hash cell source only (`inventory.mjs:72-85`).
  - Secret scan: four fixed patterns plus a generic assignment rule with entropy at least 3.5; hits report line and kind only (`secrets.mjs:15-39`).

Standards: none recorded — add with /devocd:company-policy

## Evidence

- scripts/lib/inventory.mjs#L9-101 sha256:11e41e74cda50968db1bf3aa843a4f79a1c5fc8f97434cfb772c703d728f0dc9 2026-11-20
- scripts/lib/refresh.mjs#L24-206 sha256:fd12298a22da262c2f06ff95dcdcf7bd569d377aeb1afb960c6f47b745d9d9d9 2026-11-20
- scripts/lib/completion.mjs#L11-56 sha256:e8aed9ba1019218895529df0c6c53d318da4bf98930a2dd709c7f65458e76c49 2026-11-20
- scripts/lib/secrets.mjs#L15-39 sha256:9f44a0a7761746b2612b0a12a0fd076defc7c1db326722e74ac9d52bdef5948e 2026-11-20
- tests/unit/inventory.test.mjs#L1-50 sha256:aaa18349fc28cd46fc0798170fe65392bcaab1a0de15cb7cdb9df1ec2002e098 2026-11-20
- tests/unit/refresh.test.mjs#L1-60 sha256:57407c786d4394744c43eac2a49be383d95a57179ac2084dea8fd39240708ed7 2026-11-20
