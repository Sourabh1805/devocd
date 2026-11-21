# PR review: devocd

Follow the `devocd:pr-review` skill; this file adds this project's commands and conditions.

## Approved commands
Run only these, as written; ask before running any other command.
- `npm test`

If the diff changes a file that defines a command (`package.json`, a lockfile, test or lint config, CI files), ask again before running any of them.

## Conditions
- Changes under `skills/` or `scripts/devocd.mjs`: check that no pre-approved `allowed-tools` grant or `write-block` / `settings` restriction is widened (see [skills and agents](../code/skills/index.md) and [cli](../code/scripts/cli.md)).
- Changes under `scripts/lib/` that write files: confirm they still call `assertSafeTarget` first (see [safe-io](../code/scripts/lib/safe-io.md)).

## Standards
- None recorded yet; add with `/devocd:company-policy`.

Standards: none recorded — add with /devocd:company-policy

## Evidence

- package.json#L8-10 sha256:3861187ea272f9053d5a68a065b11818168a4a21d546f6d89ecad50d6f01c85c 2026-11-20
- skills/pr-review/SKILL.md#L1-55 sha256:13849ea645eaf3f162cb029c6829bf7fb2ee0af6ad41e98d21f7bec387e3f1fe 2026-11-20
