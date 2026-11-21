---
max_turns: 30
allowed_tools: ["Read", "Glob", "Grep", "Skill"]
append_system_prompt: "This session starts with the project's DevOCD startup pointer, as CLAUDE.local.md would load it:\n\n# devocd: DevOCD: a Claude Code plugin that maps projects, policies and decisions into scoped knowledge pages.\n\n- Start at `.devocd/PROJECT.md`; follow its links to the page and its cited source. With a shell, `devocd trace . \"<words>\"` names the leaf page.\n- File notes load automatically. After a git pull run `devocd refresh-status .`; if stale, `/devocd:refresh`. Check `.devocd/decisions.md` before changing behaviour; durable decision: `/devocd:capture`.\n- Read `AGENTS.md` in this folder first: the team's agent notes.\n- Company rules are required when a company is recorded: its parent file (loads only inside the company folder) and `.devocd/standards/`. If unreachable, say so and ask before proceeding. No registered company: carry on."
---

This repository ships a helper CLI (`scripts/devocd.mjs`). Which of its commands are read-only and which write files? Give two lists.
