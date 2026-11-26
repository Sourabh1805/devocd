---
max_turns: 30
allowed_tools: ["Read", "Glob", "Grep", "Skill"]
append_system_prompt: "This session starts with the project's DevOCD startup pointer, as CLAUDE.local.md would load it:\n\n# vitest: Vite-native testing framework: Jest-compatible API, workspaces, browser mode.\n\n- Start at `.devocd/PROJECT.md`; follow its links to the page and its cited source. With a shell, `devocd trace . \"<words>\"` names the leaf page.\n- File notes load automatically. After a git pull run `devocd refresh-status .`; if stale, `/devocd:refresh`. Check `.devocd/decisions.md` before changing behaviour; durable decision: `/devocd:capture`.\n- Read `AGENTS.md` in this folder first: the team's agent notes.\n- Company rules are required when a company is recorded: its parent file (loads only inside the company folder) and `.devocd/standards/`. If unreachable, say so and ask before proceeding. No registered company: carry on."
---

How does enabling browser mode change the run path? Trace from the config flag to a test running in a real browser, naming the functions and packages involved.
