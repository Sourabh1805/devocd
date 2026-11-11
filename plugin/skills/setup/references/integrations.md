# Native tool integration

After successful project setup, ask which tools need startup routing: Claude only,
Codex, Antigravity or both. Claude already has its local pointer. For the others,
run `node "${CLAUDE_PLUGIN_ROOT}/scripts/devocd.mjs" integrate "P" "T"` where
T is `codex`, `antigravity` or `all`. Follow add-project's path validation rules.

Show the preview, especially trackedInstructionFiles. Explicit integration may
edit tracked AGENTS.md, AGENTS.override.md or GEMINI.md using a managed block;
unrelated bytes are preserved and previous files backed up. Obtain approval of
those concrete changes, then rerun with `--apply`. Never claim integration was
installed from preview alone. Do not alter global tool configuration.

The helper installs Node runtime files under .devocd/runtime and a portable
TOOLS.md workflow. These are on-demand resources, not startup imports. Both
tools share the same PROJECT.md, company routes and graph. For `all`, a single
AGENTS.md block serves both unless Codex has an override, in which case the
helper uses the override plus GEMINI.md. No Claude plugin agent is installed into
another host; the portable workflow uses its native subagent where available.

After apply, run the project check and report errors. Restart the selected tool
and ask it to identify the DevOCD entry and run the read-only refresh-status
helper. Do not claim a live host trial unless observed. Nested override files,
instruction limits and host permissions may require additional scoped setup.
