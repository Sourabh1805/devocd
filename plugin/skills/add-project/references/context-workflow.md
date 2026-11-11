# Canonical context workflow

Use this opt-in workflow when the company has `.devocd/context-current.json` or asks
for structured context. Legacy Markdown remains supported; never silently promote
prose into approved policy or claim it has transactional guarantees.

1. Read the model contract in `<plugin root>/references/context-model.md`.
   Gather explicit project roots, scopes, policy keys/values and allowed exceptions.
   Evidence must name permitted source files and hashes from actual reading.
2. Create a company-relative query JSON with project, path and applicable cloud/environment.
   Run `context-resolve <company> <query.json>` before relying on saved context.
   Missing dimensions, stale evidence or conflicting policies block dependent work.
3. For refresh, run `context-impact <company>`. Investigate affected records and newly
   discovered files; preserve unaffected records and supported manual notes. Hashes
   are freshness evidence, not proof of semantic correctness.
4. Optionally call Mapper, Policy Auditor or Incident Investigator with bounded inputs.
   Agents return proposals only. No delegation is required for the canonical workflow.
   If unavailable, disclose that and investigate read-only in the calling skill.
5. Draft a complete replacement model, show a compact semantic diff, and obtain approval.
   For incremental updates, use `context-refresh <company> <draft.json> <current-generation>`;
   it rejects unrelated edits. For initial setup or explicitly reviewed scope changes,
   run `context-publish <company> <draft.json> <current-generation|none>` to validate
   and preview. Only approved changes get the same command with `--apply`.
   A stale base, stale evidence or lock means stop and re-review; never bypass it.
6. Rerun resolution. `context-resolve <company> <query.json> <claude|codex|antigravity>`
   provides a bounded host payload. It never grants permissions or edits team instructions.

These commands are deterministic local helpers in `scripts/devocd.mjs`. Read sources
only within existing host permissions. Publication is explicit; proposals and semantic
claims are not self-approving. Do not use legacy refresh-complete to mark canonical data fresh.
