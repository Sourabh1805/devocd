# Install and validate

Parent: [PROJECT](../PROJECT.md)

Summary of README: installing the plugin, first commands, settings, validation.

- Install inside Claude Code: `/plugin marketplace add Sourabh1805/devocd`, then `/plugin install devocd@devocd`; local alternative `claude --plugin-dir "<path>"` (`README.md:7-24`).
- First use: `/devocd:setup --all` from the parent workspace, `/devocd:check` from a project.
- Settings: `devocdHooks: false` disables hooks; `decisionCapture: true` enables capture reminders (`README.md:25`). Backups keep 5 rolling snapshots (`:26`).
- Validate: `node --test "tests/unit/**/*.test.mjs"` and `node scripts/validate-plugin.mjs` (`:79-82`). Live trials need `DEVOCD_LIVE=1` and a budget.
- Limits are listed in `docs/known-limitations.md` and `SECURITY.md`; see [tests](../code/tests/index.md).

## Evidence

- README.md#L7-26 sha256:06d718e3c02a919a19383c5abab85d84c40debb0d7d08b9d84e4099a2ecec0eb 2026-11-20
- README.md#L77-84 sha256:06d718e3c02a919a19383c5abab85d84c40debb0d7d08b9d84e4099a2ecec0eb 2026-11-20
