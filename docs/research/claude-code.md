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

## Observed in Task 4

Observed 2026-11-07 on Claude Code 2.1.319, native Windows 10, by `tests/e2e/behaviour.test.mjs` (run with `DEVOCD_LIVE=1`). Each check uses `CANARY-*` strings in fixture files under the system temp folder, and the agent is asked to list the canaries it can see. Paths are forward slashes.

| Fact | Status | Check |
| --- | --- | --- |
| Run isolation: `claude -p --setting-sources project,local --strict-mcp-config` keeps login and the project and local settings but drops the owner's user settings. The init event lists only the four built-in `cc-plugin-*` plugins plus the one passed with `--plugin-dir`. | observed | isolation |
| No `CLAUDE.md`, `CLAUDE.local.md` or `AGENTS.md` exists above the system temp folder on this machine, so fixtures inherit nothing. | observed | isolation |
| From a project folder, the parent folder's `CLAUDE.md` and the repo's `CLAUDE.local.md` both load at launch. | observed | project folder |
| From the company folder, a project's `CLAUDE.local.md` and `CLAUDE.md` do not load at launch. After a file in that project is read, both load. | observed | company folder |
| `claudeMdExcludes` in the repo's own `.claude/settings.local.json` (absolute forward-slash path) stops that repo's own `CLAUDE.md` loading; a control repo without the setting loaded it. | observed | claudeMdExcludes |
| A skill in a plugin loaded with `--plugin-dir` from a folder with a space and a non-ASCII character ran `node "${CLAUDE_PLUGIN_ROOT}/scripts/devocd.mjs" check "$ARGUMENTS"` on Windows. The agent used the Bash tool (Git Bash) and wrote the substituted path with forward slashes. | observed | skill run |
| `allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/devocd.mjs" *)` is substituted and matched, so the call needs no approval. The looser guess `Bash(node *devocd.mjs check *)` did NOT match (the closing quote after `devocd.mjs` breaks it) and the call was refused with "This command requires approval". | observed | skill run |
| `/devocd:<skill> <argument>` runs under `claude -p`, and an argument containing spaces reaches the script whole when the skill quotes it as `"$ARGUMENTS"`. | observed | skill arguments |
| Reading a file in the parent folder from a project session, decided from the events (a tool result holding the canary, versus an error result or a `permission_denials` entry in the result event): with `--allowedTools Read` it was allowed (a blanket Read rule covers any path); with no allow rule it was denied automatically ("you haven't granted it yet") and the denial appears in `permission_denials`. So the skills must not assume the read works; `additionalDirectories` or an approval is needed. | observed | parent standards |
| `~/.claude/CLAUDE.md` (the owner's user memory) was not tested against `--setting-sources project,local`: the file does not exist on this machine, and fixtures must not touch `~/.claude`. Whether user memory leaks into an isolated run is unknown. | unverified | isolation |
| A `CLAUDE.md` in the repo turns off that repo's `AGENTS.md`. So does a `.claude/CLAUDE.md` in the repo, a `CLAUDE.local.md` in the repo, a `CLAUDE.md` in a parent folder and a `CLAUDE.local.md` in a parent folder. With only `AGENTS.md`, it loads. Each case was a run on `sonnet` that listed canaries from the loaded context; the loaded file's own canary was present in every run, so none is an empty-run artefact. | observed | AGENTS.md |
| If the repo's `CLAUDE.md` is excluded with `claudeMdExcludes`, `AGENTS.md` loads again. That was tested for `CLAUDE.md` only; for the other files the rule is assumed. | observed | AGENTS.md |
| Pointer line, with a control. Same repo content and same prompt ("What is the build code word for this repo?"), one run each: with the line "Also read ./AGENTS.md ..." in `CLAUDE.local.md` the agent read `AGENTS.md` and answered from it; without the line it read only `CLAUDE.md` and `README.md` and never opened `AGENTS.md`. One run each is a small sample, but the pointer made the difference here. | observed | pointer |
| The helper's `reads` list catches a real Read tool call (it contains the named file). | observed | reads |
| `--max-turns` is accepted by 2.1.319 although `claude --help` does not list it; `--max-budget-usd` is listed and used. | observed | helper |
| Nested runs: `claude -p` started normally from inside a Claude Code session with no environment variable removed. | observed | helper |
| On Windows the `claude` on PATH is an npm `.cmd` shim that Node 22 will not spawn without a shell; the helper reads the shim and starts the native `claude.exe` directly, with the prompt on stdin. | observed | helper |
| Node 22.23 `fs.cpSync` creates a mis-encoded destination folder name when the path has a non-ASCII character (`ï` became `Ã¯`). Use `copyFileSync` per file. This affects only test code. | observed | probe plugin |
| The cheapest model (`haiku`) once listed the canaries of one case as empty where `sonnet` found it twice; every check that asks the model to list canaries uses `sonnet`. | observed | AGENTS.md |
| The helper counts Grep and Glob calls with no path as searching the run's folder, counts tool calls made inside subagents, and `touches(result, text)` searches reads, Bash commands and tool-result text (slashes normalised, case ignored on Windows). The live proof reaches one named file through Read, Bash `cat` and Grep and each is caught. | observed | reads |

Working skill form (copy this in Task 5). Warning: `"$ARGUMENTS"` is substituted as plain text before the shell sees it, so an argument that contains a double quote or `$(` breaks the quoting (and `$(` would run). Task 5 must allow for this: keep arguments to simple paths and answers-file names, reject or pass anything else through a file rather than the command line.

```
---
name: probe
description: Runs the devocd check command on a folder. For tests only.
disable-model-invocation: true
argument-hint: "[folder]"
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/devocd.mjs" *)
---

Run this exact command with the Bash tool, then show its full output and nothing else:

    node "${CLAUDE_PLUGIN_ROOT}/scripts/devocd.mjs" check "$ARGUMENTS"
```

A non-zero exit from the script shows as an error result in the transcript but the output is still returned; the check above exits 1 when there is no state file.

Spend: the full live suite costs about $0.40 at list price.

Decision R22 (add-project): when a repo has an `AGENTS.md`, add-project always writes the pointer line. It always writes a repo `CLAUDE.local.md`, and a `CLAUDE.local.md` alone turns `AGENTS.md` off even with the team `CLAUDE.md` excluded, so the pointer is what keeps `AGENTS.md` in use.
