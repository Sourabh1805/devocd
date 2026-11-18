# Codex and Antigravity integration

After project setup, preview native startup instructions:

```text
node scripts/devocd.mjs integrate <project> all
node scripts/devocd.mjs integrate <project> all --apply
```

Use `codex` or `antigravity` instead of `all` to select one. Setup offers the same
preview/apply flow. Preview does not write. Apply installs a managed block and
local Node helper runtime plus a portable workflow under `.devocd/`.

Codex uses an existing AGENTS.override.md when present, otherwise AGENTS.md.
Antigravity supports AGENTS.md and GEMINI.md. For both without a Codex override,
one AGENTS.md block is sufficient; otherwise the override and GEMINI.md are used.
Existing text outside managed blocks is preserved. Explicit apply can edit tracked
instruction files, and the preview names them. No commit or push occurs. Newly
created entry files are locally ignored in Git; existing files keep their tracking.

Existing instruction files are backed up under the reported `.devocd/.backups/`
stamp. To remove integration, remove only the DevOCD managed block from the reported
startup files; leave team text intact. Delete a file only if nothing else remains.
Remove generated root entry names from .git/info/exclude if you want to track them.
The runtime and TOOLS.md can remain for manual use. Rerun integration after plugin
upgrades to update the local helper copy. No daemon or global config is installed.

Restart the host, ask it to identify the DevOCD entry and run:

```text
node .devocd/runtime/devocd.mjs refresh-status .
node .devocd/runtime/devocd.mjs knowledge-route . "task terms"
```

Use the portable TOOLS.md workflow for native read-only subagent discovery and
approved refresh writes. Claude-specific skills/agents are not assumed available
in another host. If native subagents are unavailable, the host must disclose its
single-agent fallback. Helpers validate evidence stability, not semantic accuracy.
Nested overrides, instruction budgets and host permissions can affect loading.
Automated tests validate generated paths, managed edits and local runtime commands;
actual host startup and model behavior still require an interactive smoke test.

Verified conventions (2026-11-11):
- [Codex instruction discovery](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- [Antigravity rules](https://antigravity.google/docs/rules)
