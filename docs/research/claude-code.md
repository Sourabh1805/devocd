# Claude Code facts behind the design

Verified: 2026-11-06 against Claude Code 2.1.319. Source pages are under
https://code.claude.com/docs/en/ . Status `documented` means the page says so;
`unverified` means nobody has observed it yet.

## Decision 2: file choices

| Fact | Status | Source |
| --- | --- | --- |
| `CLAUDE.md` and `CLAUDE.local.md` load from the working directory and every parent at launch. | documented | memory.md |
| Files in subfolders load once a file there is read, written or edited. | documented | memory.md |
| An `@import` that resolves outside the working directory triggers an approval dialog; imports follow at most four hops. | documented | memory.md |
| `AGENTS.md` is read only when no `CLAUDE.md` is in the working directory or above. | documented | memory.md |
| `CLAUDE.local.md` is not auto-ignored by git. | documented | memory.md |
| Reads outside the working directory prompt for permission. | documented | permissions.md |
| `permissions.additionalDirectories` grants file access only, not configuration. | documented | permissions.md, settings-reference.md |
| `blockReadsOutsideWorkingDirectories` hard-blocks reads outside the working directory. | documented | settings-reference.md |

## Decision 3: no git changes

| Fact | Status | Source |
| --- | --- | --- |
| `CLAUDE.local.md` is not auto-ignored, so the plugin must exclude it itself. | documented | memory.md |

## Decision 4: team CLAUDE.md

| Fact | Status | Source |
| --- | --- | --- |
| `claudeMdExcludes` takes absolute-path globs, set in user, project, local or managed settings. | documented | memory.md, settings-reference.md |

## Decision 5 and skill mechanics

| Fact | Status | Source |
| --- | --- | --- |
| `${CLAUDE_SKILL_DIR}` and `${CLAUDE_PLUGIN_ROOT}` are substituted in skill text and in `allowed-tools` Bash rules. | documented | skills.md, plugins/components.md |
| `disable-model-invocation` keeps the skill's description out of context. | documented | skills.md |
| A plugin's `bin/` directory reaches Bash and unsandboxed PowerShell. | documented | plugins/components.md |
| Claude Code runs the lockfile's package manager at plugin install, so the plugin ships no lockfile. | documented | plugins/loading.md |
| `claude plugin eval` refuses Bash on native Windows and does not load `CLAUDE.md`. | documented | plugin-evals.md |

## Unverified until Task 4

- `claudeMdExcludes` working on a `CLAUDE.md` inside the repository's own working directory.
- Running plugin scripts from skills on Windows.
- The exact conditions under which a `CLAUDE.md` turns `AGENTS.md` off.
