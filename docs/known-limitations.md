# Known limitations

- The license and the icon wait for the marketing step, so the plugin is not yet listing-ready.
- Flows guide an agent but can't force it to follow them.
- Ignored files live in one checkout only, and `git clean -xdf` deletes them.
- Reading company standards from a project session is refused under non-interactive `claude -p` unless the folder is granted (`additionalDirectories`) or Read is allowed; interactively it prompts.
- The live checks in `tests/e2e` cost real money and run only with `DEVOCD_LIVE=1`; they were observed on Claude Code 2.1.319 on Windows only.
