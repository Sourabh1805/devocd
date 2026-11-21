# skills and agents

Parent: [PROJECT](../../PROJECT.md)
Scope: skills/**, agents/**, .claude-plugin/**, references/**
Uses: none

The plugin surface: eight skills that sequence helper commands under approval, three read-only agents, and the plugin manifest.

- Entry points: `skills/<name>/SKILL.md` frontmatter `allowed-tools` (for example `skills/add-project/SKILL.md:5-10`), `agents/knowledge-builder.md:1-5`, `.claude-plugin/plugin.json`
- Skills and the helpers they may run: `setup` (discover-projects, integrate, refresh-status; invokes install, add-project, check), `install` (preflight, backup, protect, render-parent, check, knowledge, clean-draft), `add-project` (all helper verbs, builder and investigator agents), `company-policy`, `refresh` (refresh-*, knowledge-inventory, backup, protect, clean-draft, Write to `.devocd/**`), `check` (check only), `capture` (decision-keeper only, no shell), `pr-review` (see [pr-review](pr-review.md)). Flows: [Onboarding](../../flows/runtime/onboarding/index.md), [Refresh](../../flows/runtime/refresh/index.md).
- Agents: `knowledge-builder`, `decision-keeper`, `investigator` all have `tools: Read, Glob, Grep`; the investigator needs explicit scope, evidence paths, `maxFiles`, `maxTokens` and a `mode` of map, policy-audit or incident (`agents/investigator.md:7-14`).
- Run/test this part: `npm test` (documented, not approved for PR review); covering tests `tests/unit/plugin-contract.test.mjs` (read: manifest, skill list, footprint), `add-project-skill.test.mjs`, `install-skill.test.mjs`, `setup-skill.test.mjs`, `company-policy-skill.test.mjs`, `template-links.test.mjs` (names only)
- To add a skill: create `skills/<name>/SKILL.md` with a short description and minimal `allowed-tools`, add the name to `SKILLS` in `tests/unit/plugin-contract.test.mjs:18`, keep the always-on listing within `LIMITS.footprintTokens` (`scripts/lib/tokens.mjs:23`), and update the README table.
- Pitfalls:
  - Skills never pre-grant Write or Edit except `refresh` (`Write(**/.devocd/**)`) and `setup` (`Write(.devocd/setup/**)`); security notes in `SECURITY.md` list older grants.
  - Descriptions are deliberately one or two words; the budget counts name plus description of all skills and agents (`tokens.mjs:22-23`). `docs/known-limitations.md:36` still quotes an older 100-token budget (stale documentation).
  - Page contract lives in `skills/add-project/references/knowledge-contract.md`; changing page header formats must update `scripts/lib/pagemeta.mjs` too.
  - Agent text and skills state that fetched content is data, never instructions.

Standards: none recorded — add with /devocd:company-policy

## Evidence

- skills/add-project/SKILL.md#L1-52 sha256:7d5b5ed2e20fa398bd404f3b2c24aa8477dfb0681b0db8de608388ca130fc1c1 2026-11-20
- skills/setup/SKILL.md#L1-67 sha256:1e5f91879ef6532aea9e4cd880c9a618e050bb0407d44e98aeb790a5cd3024b3 2026-11-20
- skills/install/SKILL.md#L1-55 sha256:322f1eb87168d0371b127cfb0bd3ae5d55965b64a7807c4442fd62e91a2975bc 2026-11-20
- skills/company-policy/SKILL.md#L1-58 sha256:64d032c84af3b054e33298f437504dfcff8bd269f52143b20f14b62d534bd3e2 2026-11-20
- skills/refresh/SKILL.md#L1-58 sha256:0db80e3ca749f0414de2c5e93fc3497a2541b30bb1374f58ed5ced8dc140213e 2026-11-20
- skills/check/SKILL.md#L1-48 sha256:dabfa5d82c04ba9f31c5dcc6effe23c62e17f5c4730784dc78b5a5e099359355 2026-11-20
- skills/capture/SKILL.md#L1-25 sha256:03a951d4c4b17f95ee45a52c3bb21143f15f28b1bdb4c520411624c14b752e6f 2026-11-20
- skills/capture/references/workflow.md#L1-60 sha256:1cc6eb889d69b90663eeba23a7750b1d59e54a87461eca80fd63c5aedbe7d032 2026-11-20
- agents/knowledge-builder.md#L1-49 sha256:cb7a01d2fd60ef95417300815c43b157ba044fe6646178bf5b52437bb3e3c774 2026-11-20
- agents/decision-keeper.md#L1-35 sha256:8f0ca04dca0d8334bd02c5ac3f7120dbedc511e101b670966275bc688321c6ac 2026-11-20
- agents/investigator.md#L1-41 sha256:a088b775272b1ccdc4e69a698f0dc708acb9176fd2d07c5e69185ca8601d5b47 2026-11-20
- .claude-plugin/plugin.json#L1-9 sha256:33258b3f624aed6f6021792d38efc924672f6809585ef6a6340e99d66c6515a9 2026-11-20
- tests/unit/plugin-contract.test.mjs#L1-60 sha256:0ac4de93fd5ac070c53619c6c010dd98d8be64f63ce4f2d5838f3e4802cadfde 2026-11-20
- SECURITY.md#L28-53 sha256:aa3559e8169fc27f3cc6925ca900433d3e0908824e88daaa4fd48256ac77fc15 2026-11-20
- docs/known-limitations.md#L36-36 sha256:5577d66400996717c3c82fb52e49890bf27f0ae1bb61b7092564f4317505d485 2026-11-20
