# cli

Parent: [scripts](index.md)
Scope: scripts/devocd.mjs, bin/**
Uses: none

Single dispatcher for every `devocd <verb>`; each verb is a thin wrapper over a library function.

- Entry points: `scripts/devocd.mjs:364` (`main`), table `COMMANDS` at `scripts/devocd.mjs:243-361`, usage text at `:31-68`, run guard at `:383`. `bin/devocd:6` imports `scripts/devocd.mjs` and sets `process.exitCode`.
- Public surface: about 35 verbs (see `USAGE`), consumed by `Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/devocd.mjs" ...)` grants in each `skills/*/SKILL.md` and by `hooks/hooks.json`.
- Exit codes: usage error 2 (`:77-81`, `:377`), refusal codes in `REFUSALS` 1 (`:71-74`, `:378`), anything else 3. `check` returns 1 when an issue has severity error (`:91`).
- Constrained verbs: `write-block` writes only `<project>/CLAUDE.local.md` from that project's `.devocd/pointer.md` in a folder with project state (`:126-137`). `settings` accepts only the company standards folder from `preflight` or team files in the project state (`:175-190`).
- Run/test this part: `npm test` (documented, not approved for PR review); covering test `tests/unit/bin.test.mjs` (name only, not read)
- To add a verb: add a handler to `COMMANDS` (`:243`), add its line to `USAGE` (`:31`) by hand, add a code to `REFUSALS` (`:71`) if it can refuse, grant it in the owning `SKILL.md` `allowed-tools`, add a unit test.
- Pitfalls: `USAGE` and `COMMANDS` are synced by hand (`docs/repo-memory.md:63`); unknown commands use `Object.hasOwn`, so keep that guard (`:367`); loosening the `write-block` or `settings` checks widens what pre-approved skills may write.
- Unconfirmed: `bin/package.json` was not read; the launcher uses CommonJS `require`, so it presumably marks that folder as CommonJS.

Standards: none recorded — add with /devocd:company-policy

## Evidence

- scripts/devocd.mjs#L31-81 sha256:46fb43c45f1bea1c71890efb955f3741061eef92240fac1e923fec0655d37bdc 2026-11-20
- scripts/devocd.mjs#L126-190 sha256:46fb43c45f1bea1c71890efb955f3741061eef92240fac1e923fec0655d37bdc 2026-11-20
- scripts/devocd.mjs#L243-385 sha256:46fb43c45f1bea1c71890efb955f3741061eef92240fac1e923fec0655d37bdc 2026-11-20
- bin/devocd#L1-11 sha256:1e15a980e34b4a1922ac08b44837b7d044b30f3fe84cd15b3bf1de8829263348 2026-11-20
- docs/repo-memory.md#L52-65 sha256:133d959fbac9a67fdd1780c8ad1e24a1e20bfb9a3f95d31e4f032f8bd4e80c08 2026-11-20
