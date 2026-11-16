# Incremental refresh

Use when `refresh-plan` returned `mode: incremental`. It lists `affected` (page ids with
the changed paths and why: cited or in-scope), `parents` (ancestor ids) and `unmapped`
(changed paths no page covers). Never read or pass file contents on the coordinator's behalf.

1. Run `knowledge-inventory "P"`. Delegate in the foreground to `devocd:knowledge-builder`.
   Pass the absolute project and plugin roots, the complete inventory (its sha256 values are
   the evidence hashes), ONLY the affected page ids with their reasons, the parent ids to
   sanity-check, and the unmapped paths for discovery. Tell it to follow "Incremental
   refresh" in `${CLAUDE_PLUGIN_ROOT}/skills/add-project/references/knowledge-contract.md`.
   If delegation is unavailable, say so and stop; do not claim a builder ran.
2. Run `protect "P"`, then `clean-draft "P"`, and write each returned page in full to
   `P/.devocd/draft/` at its final relative path (never decisions.md or decision-history).
3. Send the `## Draft` summary and ask one approval question, as in the draft section of
   `${CLAUDE_PLUGIN_ROOT}/skills/add-project/references/project-template.md`: list the pages
   rewritten, parents changed or confirmed unchanged, new pages and coverage notes.
4. On approval, run `backup "P"`, then apply the draft files to `P/.devocd/`, leave all other
   files alone, then run `clean-draft "P"`. Then continue with `refresh-complete`.
