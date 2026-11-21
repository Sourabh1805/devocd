# Onboarding (setup, install, add-project)

Parent: [PROJECT](../../../PROJECT.md)
Scope: skills/setup/**, skills/install/**, skills/add-project/**, scripts/lib/{preflight,parent,inventory,knowledge}.mjs
Uses: none

How a project becomes a knowledge graph: skills sequence read-only helpers, a read-only builder agent drafts pages, the user approves, helpers apply.

- Entry points: `skills/setup/SKILL.md:37-53` (coordinator), `skills/install/SKILL.md:24-55` (company), `skills/add-project/SKILL.md:20-52` (project)
- Call path for `add-project`:
  1. `preflight "P" --json` (`scripts/lib/preflight.mjs:87`): company, parent file, team files. No company stops the run (`SKILL.md:22-24`).
  2. Gather answers (`references/interview.md`, not read); `detect-commands`, `detect-dependencies`, `knowledge-inventory` feed the builder ([onboarding-helpers](../../../code/scripts/lib/onboarding-helpers.md), [source-freshness](../../../code/scripts/lib/source-freshness.md)).
  3. `protect` then `clean-draft`; drafts written to `.devocd/draft/` (`SKILL.md:36`); builder follows `references/knowledge-contract.md`.
  4. One approval question (`:39-41`); answers-file `approval` must be exactly `approved`.
  5. On approval: `backup` (rerun), apply drafts, `clean-draft`, `link-projects` (rerun), `write-block` for `CLAUDE.local.md`, `register` with the company, optional `settings add-dir`, `check`, `refresh-baseline` with the discovery fingerprint, `knowledge` on the company (`:46-52`).
- Public surface: outputs `.devocd/PROJECT.md`, `code/`, `flows/runtime/`, `pointer.md`, `state.json`, `CLAUDE.local.md` block, `knowledge.json`, `knowledge.html`, rule stubs.
- Run/test this part: documented `npm test` (not approved for PR review); `tests/unit/add-project-skill.test.mjs`, `setup-skill.test.mjs`, `install-skill.test.mjs` pin the skill text; live `tests/e2e/add-project.test.mjs` needs `DEVOCD_LIVE=1`.
- Extension: to add a drafted file kind, extend `knowledge-contract.md` and the matching template, and teach `kindOf` (`scripts/lib/knowledge.mjs:26`) about its path.
- Pitfalls: the fingerprint passed to `refresh-baseline` guards edits made between discovery and approval, which are never blessed as current (`scripts/lib/refresh.mjs:177`); a partial inventory renders but records no baseline; `setup` never invents policies or runs project commands (`SKILL.md:44-48`); nested folders deeper than one level are module knowledge, not projects (`:26-28`).

Standards: none recorded — add with /devocd:company-policy

## Evidence

- skills/setup/SKILL.md#L37-53 sha256:1e5f91879ef6532aea9e4cd880c9a618e050bb0407d44e98aeb790a5cd3024b3 2026-11-20
- skills/install/SKILL.md#L24-55 sha256:322f1eb87168d0371b127cfb0bd3ae5d55965b64a7807c4442fd62e91a2975bc 2026-11-20
- skills/add-project/SKILL.md#L20-52 sha256:7d5b5ed2e20fa398bd404f3b2c24aa8477dfb0681b0db8de608388ca130fc1c1 2026-11-20
- skills/add-project/references/knowledge-contract.md#L1-180 sha256:541e16fc091db9d05e3d8afd061f697c7b65b2912af55f0f2806f533295d7b05 2026-11-20
- skills/add-project/references/project-template.md#L1-165 sha256:f5d019b6002d49534abcc6241c1cd199fac8e990b284cfbea80c479a73c39af3 2026-11-20
- scripts/lib/refresh.mjs#L172-186 sha256:fd12298a22da262c2f06ff95dcdcf7bd569d377aeb1afb960c6f47b745d9d9d9 2026-11-20
