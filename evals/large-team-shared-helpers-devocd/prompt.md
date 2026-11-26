---
max_turns: 20
allowed_tools: ["Read", "Glob", "Grep", "Skill"]
append_system_prompt: "This session starts with the project's DevOCD startup pointer, as CLAUDE.local.md would load it:\n\n# vitest: Vite-native testing framework: Jest-compatible API, workspaces, browser mode.\n\n- Start at `.devocd/PROJECT.md`; follow its links to the page and its cited source. With a shell, `devocd trace . \"<words>\"` names the leaf page.\n- File notes load automatically. After a git pull run `devocd refresh-status .`; if stale, `/devocd:refresh`. Check `.devocd/decisions.md` before changing behaviour; durable decision: `/devocd:capture`.\n- Read `AGENTS.md` in this folder first: the team's agent notes.\n- Company rules are required when a company is recorded: its parent file (loads only inside the company folder) and `.devocd/standards/`. If unreachable, say so and ask before proceeding. No registered company: carry on."
---

The same isPlainObject helper is copied in five packages. Should we create one internal shared package for helpers like it? Give me a recommendation.
