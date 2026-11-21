# Codex and Antigravity integration

Parent: [PROJECT](../PROJECT.md)

Summary of `docs/tool-integrations.md`: native startup blocks and a local runtime for non-Claude hosts.

- `node scripts/devocd.mjs integrate <project> all` previews; add `--apply` to install (`docs/tool-integrations.md:3-8`). Code: [onboarding-helpers](../code/scripts/lib/onboarding-helpers.md).
- Codex uses `AGENTS.override.md` when present, else `AGENTS.md`; Antigravity uses `GEMINI.md` or `AGENTS.md` (`:14-16`).
- Apply writes managed blocks, `.devocd/TOOLS.md`, `CAPTURE.md`, `REFRESH*.md` and a copy of the helpers under `.devocd/runtime/`; text outside blocks is preserved.
- Host loading is not verified; an interactive smoke test is still needed (`:38-41`).

## Evidence

- docs/tool-integrations.md#L1-46 sha256:0e076f0f2683b0e3ed989b19ccf805c5126486d45d8bed598168f789a71a3357 2026-11-20
- scripts/lib/integrations.mjs#L92-130 sha256:8aad53226a8970d60e6056a51a72fcae553d070dfda1bdf7cc6d3861acc75aab 2026-11-20
