# Known limitations

- The license and the icon wait for the marketing step, so the plugin is not yet listing-ready.
- Flows guide an agent but can't force it to follow them.
- Ignored files live in one checkout only, and `git clean -xdf` deletes them.
- Reading company standards from a project session is refused under non-interactive `claude -p` unless the folder is granted (`additionalDirectories`) or Read is allowed; interactively it prompts.
- That `install` uses connector tools (Confluence, Jira and others) read-only is unverified against a real connector until the owner's trial in Task 10. Live runs use `--strict-mcp-config`, so no connector is present; the skill text requires read-only use, a static test checks that text, and the live runs check that no write-type connector call appears.
- In a non-interactive `install` approved by its answers file, the agent sometimes drafts in its own thinking and writes straight away, showing the draft's findings only in its report. The skill requires the draft before any write; that order is only checked by the owner's interactive trial in Task 10, since in a non-interactive run nobody can read the draft before the write anyway. A run that isn't approved always shows the draft and writes nothing, and the live tests check that.
- The warning when `install` runs in the home folder is tested by a unit test of `preflight` and a static check of the skill text, not by a live run, because a live run would have to override the home and Claude config folders and could break the login or touch the owner's real config.
- The live checks in `tests/e2e` cost real money and run only with `DEVOCD_LIVE=1`; they were observed on Claude Code 2.1.319 on Windows only.
