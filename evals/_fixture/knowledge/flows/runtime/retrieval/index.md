# Knowledge retrieval

Parent: [PROJECT](../../../PROJECT.md)
Scope: scripts/lib/{trace,search,knowledge,rules}.mjs, scripts/devocd-hooks.mjs
Uses: none

How an assistant finds the right page, policy and decision for a task instead of loading everything.

- Entry points: `scripts/devocd.mjs:320` (`trace`), `:324` (`review-context`), `:276` (`knowledge-route`), `:332` (`knowledge-search`), `scripts/devocd-hooks.mjs:59` (`onPrompt`)
- Call path:
  1. Startup pointer in `CLAUDE.local.md` names `.devocd/PROJECT.md`.
  2. On a prompt, `onPrompt` matches words against the company `standards/index.md` bullets and returns "read <file>" pointers.
  3. On opening a file, generated `.claude/rules/devocd/*.md` stubs (`paths:` frontmatter) show Entry points and Pitfalls (`scripts/lib/rules.mjs:47-76`).
  4. `trace` → `buildKnowledge` → `pagesForPath` (cited pages first, then most specific scope) or `rankPages` for words → `walkUp` parents and `governed-by` policies, plus freshness from the inventory (`scripts/lib/trace.mjs:153-239`).
  5. `review-context` does the path-only version for a changed-file list, capped at 200 files (`:241-304`).
- Public surface: JSON with leaf, chain, policies, decisions, alternatives, freshness, canonical flag. A top result below 0.5 coverage means no good match.
- Run/test this part: documented `npm test` (not approved for PR review); `tests/unit/search.test.mjs`, `knowledge.test.mjs`, `hooks.test.mjs` (read). `trace.test.mjs` and `rules.test.mjs` are withheld by the inventory.
- Extension: to teach routing a new policy trigger, write a standards index bullet `- <trigger words>: [title](file.md)`; matching needs 1 hit for 2 or fewer trigger words, else 2 (`devocd-hooks.mjs:86-87`).
- Pitfalls: if the company holds `context-current.json`, `trace` flags that canonical context must be resolved first (`trace.mjs:15-23`); a path with no page falls back to all-terms word search; stale pages must be verified in code; there is no `Standards` page link when the index is missing.

Standards: none recorded — add with /devocd:company-policy

## Evidence

- scripts/lib/trace.mjs#L15-304 sha256:93eff5f7fd5671df8654ecd060be8da67a49abc715533c6393a97009e49635fe 2026-11-20
- scripts/lib/rules.mjs#L47-76 sha256:2b81a9a56324128f1d396b778b16ef99fe937a19f2d6dad336e5b15c56a747f1 2026-11-20
- scripts/devocd-hooks.mjs#L59-93 sha256:91beccf0f6d7d0d48eea608b1e5e0d688d8c99fd4288a57b615288f1c7e06226 2026-11-20
- scripts/devocd.mjs#L276-334 sha256:46fb43c45f1bea1c71890efb955f3741061eef92240fac1e923fec0655d37bdc 2026-11-20
