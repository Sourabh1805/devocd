# knowledge-graph

Parent: [scripts](../index.md)
Scope: scripts/lib/{knowledge,pagemeta,search,knowledge-view,trace,rules,scope}.mjs
Uses: none

Turns curated `.devocd/**/*.md` pages into a graph of nodes and edges, and serves search, trace and path-scoped rule stubs from it.

- Entry points: `scripts/lib/knowledge.mjs:63` (`buildKnowledge`), `:247` (`writeKnowledge`), `scripts/lib/trace.mjs:153` (`traceKnowledge`) and `:250` (`reviewContext`), `scripts/lib/pagemeta.mjs:53` (`parsePageMeta`), `scripts/lib/rules.mjs:96` (`writeRuleStubs`)
- Call path: CLI `knowledge` (`scripts/devocd.mjs:328`) → `writeKnowledge` → `buildKnowledge` → `renderKnowledge` (`scripts/lib/knowledge-view.mjs:6`) → `writeFilesAtomic` writes `knowledge.json`, `knowledge.html`, and `sources.json` (projects only) → `writeRuleStubs`. `trace` and `knowledge-search`/`-route`/`-scope` call `buildKnowledge` fresh each time.
- Public surface: `buildKnowledge`, `scopeKnowledge` (`:195`), `searchKnowledge` (`:223`), `routeKnowledge` (`:228`, five results per page), `pagesForPath` (`trace.mjs:128`), `pageFreshness` (`:88`), `scopeMatch` (`:63`), `findScope`/`preference` (`scope.mjs:28`, `:70`), consumed by `refresh.mjs`, `check.mjs`, `content-check.mjs`, the hooks.
- Run/test this part: `npm test` (documented, not approved for PR review); covering tests `tests/unit/knowledge.test.mjs`, `pagemeta.test.mjs`, `search.test.mjs` (names only, not read). `trace.test.mjs` and `rules.test.mjs` are withheld by the inventory (secret-content), so no test claim is made.
- To add a header key: extend `KEY`/`EVIDENCE_KEY` (`pagemeta.mjs:11-13`) and the parse branch (`:127-146`), then the contract text. To add a node kind: `kindOf` (`knowledge.mjs:26-35`) and the weights in `rankPages` (`search.mjs:74-75`). To add an edge type: the link loop in `buildKnowledge` (`:135-159`).
- Pitfalls:
  - Limits: 500 pages, 256 KiB per page, 4 MiB total (`knowledge.mjs:18-20`); a page containing a secret is skipped, not fatal (`:96-97`).
  - `draft/`, `decision-history/` and dot-folders are excluded (`:71-73`).
  - `Parent:`, `Scope:`, `Uses:` count only before the first `##`; `Standards:` counts anywhere (`pagemeta.mjs:129`). Evidence uses `#L12-40`; `:12` form raises a problem (`:120`).
  - `rankPages` must stay one self-contained function: its source is embedded in the viewer (`search.mjs:1-11`, `knowledge-view.mjs:30`).
  - A query with no whitespace and a slash or extension is treated as a path (`trace.mjs:158`); others use word search.
  - Rule stubs carry a generated marker; stubs no longer planned are deleted only when the marker is present (`rules.mjs:78-88`, `:123-130`). `ruleStubs: false` in project state disables them (`:111`).
  - Two glob dialects exist, here and in `check.mjs` (`docs/repo-memory.md:62`).

Standards: none recorded — add with /devocd:company-policy

## Evidence

- scripts/lib/knowledge.mjs#L18-260 sha256:849129100d95bb474fb0fb30e293b57678ac5d03e5fa2ea88b2bac291e6aa108 2026-11-20
- scripts/lib/pagemeta.mjs#L11-148 sha256:f0181524e934bd253f6220d145f4a8ea20838bc469cec63c4a9308c28cd13231 2026-11-20
- scripts/lib/search.mjs#L1-119 sha256:f9f87725d7f8039812494175aa61e5b9f5df30cce2315c8fb6bf2c9741039fe6 2026-11-20
- scripts/lib/knowledge-view.mjs#L1-40 sha256:b0337996093e469a7380e785e5cc59cdc7c456ed357616ef91b32bcacdec62ce 2026-11-20
- scripts/lib/trace.mjs#L63-304 sha256:93eff5f7fd5671df8654ecd060be8da67a49abc715533c6393a97009e49635fe 2026-11-20
- scripts/lib/rules.mjs#L47-144 sha256:2b81a9a56324128f1d396b778b16ef99fe937a19f2d6dad336e5b15c56a747f1 2026-11-20
- scripts/lib/scope.mjs#L28-74 sha256:7490a533a03ab2d1a93721844703c429803ce54f57bf837b17a4c009292f7490 2026-11-20
