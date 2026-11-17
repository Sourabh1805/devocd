---
name: check
description: Check setup.
argument-hint: "[folder]"
allowed-tools:
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/devocd.mjs" check *)
---

# Check a DevOCD folder

Arguments: $ARGUMENTS

The folder F is the argument, trimmed, with one pair of double quotes removed if it has them (none: `.`). If F holds `"`, `$`, a backtick or a line break, starts with `-` or ends in a backslash, say so and stop, with no command run.

This skill only reads. Never use Write or Edit, and never run any command except the one below. Suggest fixes; the person applies them.

## 1. Run the check

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/devocd.mjs" check "F" --json`. An exit code of 1 only means errors were found: the report is still on screen. A helper error with no report: show it and stop.

## 2. Explain

Start with one line: the number of errors, warnings and information notes, then the launch figure. Label every token figure "estimated", never a plain "tokens". Then take the issues in order of severity, each in plain words with the file, the line, and one suggested fix:

| Rule | Meaning | Fix to suggest |
|---|---|---|
| `budget/lines` | a file is longer than its limit | shorten it; move detail into `.devocd/` references |
| `budget/tokens` | a file, or the key rules, is over its estimated token limit | cut or shorten; for key rules keep fewer |
| `ref/broken` | a link points at a file that is missing | fix the path or regenerate the file |
| `ref/escape` | a link leaves the company folder | link only to files inside it |
| `import/present` | a generated file holds an `@path` import | use a plain relative link |
| `secret/found` | something looks like a credential | remove it; rotate it if it was real |
| `block/malformed` | the devocd marker lines are damaged | fix or delete them, then rerun the install or add-project skill |
| `block/missing` | startup file or managed block is absent | rerun install or add-project |
| `entry/missing` | project index or saved pointer is absent or empty | rerun add-project |
| `context/over-target` | a page exceeds its writing target | split detail into linked pages |
| `context/repeated` | substantial prose repeats another page | replace repetition with a link |
| `state/invalid` | `.devocd/state.json` is missing or wrong | run `/devocd:install` (company) or `/devocd:add-project` (project) |
| `team-file/changed` | a team file changed since it was read | rerun `/devocd:add-project` |
| `launch/over-target` | the launch load is over its estimated target | trim the larger memory files the report lists |
| `page/header`, `page/section-missing`, `page/standards-missing`, `page/evidence-missing` | a project page has a bad header line, lacks Entry points or Pitfalls, a `Standards:` line, or evidence | fix the line or add it (warning) |
| `evidence/stale`, `evidence/unchecked` | cited source files changed or are missing; or freshness could not be checked | refresh the page |
| `decisions/format`, `decisions/duplicate`, `decisions/link`, `decisions/cycle`, `decisions/unstructured` | `decisions.md` entries break the entry format (ID, Date, unique, valid Supersedes/Retires, no cycles), or it has none | fix the entry; see the capture workflow |
| `source/unconfirmed` | facts still marked unconfirmed | confirm them with the team |

For `secret/found` name only the kind and the place (file and line). Never repeat, quote or paraphrase the value, even if you can see it.

No issues: say the folder is clean. End by saying nothing was changed.
