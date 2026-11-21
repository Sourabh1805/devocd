# canonical-context

Parent: [scripts](../index.md)
Scope: scripts/lib/{context-store,context-schema,context-resolver,context-adapters,context-refresh,claims,classify,proposal}.mjs, references/context-model.md
Uses: none

The opt-in JSON "canonical context" store (immutable generations, scope and policy resolution) and the claim, worker-class and proposal validators; separate from the Markdown graph.

- Entry points: `scripts/lib/context-store.mjs:86` (`publishContext`), `:44` (`loadContext`), `:63` (`inspectContext`), `scripts/lib/context-resolver.mjs:5` (`resolveContext`) and `:58` (`affectedContext`), `scripts/lib/context-schema.mjs:15` (`validateContext`), `scripts/lib/context-adapters.mjs:6` (`adaptContext`) and `:26` (`agentRequest`), `scripts/lib/context-refresh.mjs:7`, `scripts/lib/claims.mjs:79` (`validateClaims`), `scripts/lib/classify.mjs:34`, `scripts/lib/proposal.mjs:65`
- Public surface: CLI `context-publish`, `context-resolve`, `context-impact`, `context-refresh`, `context-agent`, `claims-check` (`scripts/devocd.mjs:244-271`, `:336`). `classify` and `validateProposal` are not imported by the CLI in `devocd.mjs`; only tests and docs reference them (unconfirmed beyond that import list).
- Run/test this part: `npm test` (documented, not approved for PR review); covering tests `tests/unit/context-foundation.test.mjs`, `context.test.mjs`, `claims.test.mjs`, `classify.test.mjs` (names only, not read). `proposal.test.mjs` is withheld by the inventory.
- To add a record kind or relationship kind: `validateContext` (`context-schema.mjs:15-60+`) and `references/context-model.md`. To add a host adapter: `HOSTS` (`context-adapters.mjs:4`). To add a claim rule: `validateClaims` (`claims.mjs:86-109`).
- Pitfalls:
  - Publishing needs `--apply`; without it the call previews. `expectedGeneration` must equal the active pointer or it throws `CONTEXT_CONFLICT`; an exclusive `context.lock` serializes writers (`context-store.mjs:98-106`). A crash can leave the lock behind.
  - Generation id is the sha256 of the bundle; load verifies it (`:44-54`). Bundle max 8 MiB; bundles containing likely secrets are refused (`:90`).
  - Evidence may not point at `.git`, `.devocd`, env or key files (`context-schema.mjs:56`).
  - Resolution is `blocked` on missing cloud/environment, conflicting policy values or stale evidence (`context-resolver.mjs:51`); adapters throw `CONTEXT_BLOCKED` then (`context-adapters.mjs:8`).
  - Incremental refresh may not change `version`, `company`, `projects`, `scopes`, nor move or reclassify records (`context-refresh.mjs:12-21`).
  - Markdown pages and this store are two knowledge systems; do not add a third reader (`docs/repo-memory.md:64-65`). `trace` warns when `context-current.json` exists (`trace.mjs:15-23`).
  - Claims: assistant origin only for hypotheses; practice needs two independent PRs or files (`claims.mjs:95-107`). Classification refuses `inherit` models (`classify.mjs:71`).

Standards: none recorded — add with /devocd:company-policy

## Evidence

- scripts/lib/context-store.mjs#L1-135 sha256:cb38e0c52570778ff268f880194d445f649fd1367be97740982b7b7fa608a910 2026-11-20
- scripts/lib/context-schema.mjs#L1-60 sha256:983543cb51baaab643787860c8f4593838bca2a881cd7cb6cb5570b62c044393 2026-11-20
- scripts/lib/context-resolver.mjs#L1-70 sha256:74a3f15afb5f3ef644bda6d480563ef85cf09973f05d15625804022c652abc0c 2026-11-20
- scripts/lib/context-adapters.mjs#L1-35 sha256:c954c75f7c7544d3d4404c8cbe891b0344505caab4f447d4e2b733e1d71d5391 2026-11-20
- scripts/lib/context-refresh.mjs#L1-42 sha256:20792013e461896699cf7331f2715bc887febb5fee6187c5832d19e33356f99c 2026-11-20
- scripts/lib/claims.mjs#L1-140 sha256:79d43fc7ca748cc7bfdb4bc02bbe56c7d47d094e737040e1a95c576eba65ceae 2026-11-20
- scripts/lib/classify.mjs#L1-86 sha256:173f70691837de97d2411f77285fe4cf79bb10590a113f18d253a187df2f54a2 2026-11-20
- scripts/lib/proposal.mjs#L1-100 sha256:8c5f4fb576c9243129060a5bebd01eb4da63a65123d0c227dc10de9c3c840849 2026-11-20
- references/context-model.md#L1-40 sha256:28462558b23efa77c72b54fcfe628c398b4089c3979f89e790ffc7ddb7f6d4a0 2026-11-20
- docs/deterministic-foundation.md#L44-62 sha256:e035c54c2eb13013a4770df68fa28b3b8554c6bdb59b3fca335346f0ec0a8061 2026-11-20
