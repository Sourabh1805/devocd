# devocd: DevOCD: a Claude Code plugin that maps projects, policies and decisions into scoped knowledge pages.

- Start at `.devocd/PROJECT.md`; follow its links to the page and its cited source. With a shell, `devocd trace . "<words>"` names the leaf page.
- File notes load automatically. After a git pull run `devocd refresh-status .`; if stale, `/devocd:refresh`. Check `.devocd/decisions.md` before changing behaviour; durable decision: `/devocd:capture`.
- Read `AGENTS.md` in this folder first: the team's agent notes.
- Company rules are required when a company is recorded: its parent file (loads only inside the company folder) and `.devocd/standards/`. If unreachable, say so and ask before proceeding. No registered company: carry on.
