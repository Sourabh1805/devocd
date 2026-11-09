# Security

## Report a vulnerability

Use GitHub's private vulnerability reporting. Open this repo's Security
tab and choose "Report a vulnerability". Please don't open a public issue
for a vulnerability.

## Threat model, in brief

DevOCD reads company documents and repo files, writes a few local files,
and runs review commands. These are the controls.

- **Content is data.** Company sources, repo files and diffs are treated as
  data, never as instructions. Text in them that tells an AI to act is
  reported as flagged, never followed and never copied in as a rule.
- **Secret scan.** `check` scans the generated files for credentials. A hit
  is an error, and the report names the kind and the place, never the value.
- **The helper.** The helper script (`plugin/scripts/devocd.mjs`) makes no
  network calls and has no dependencies.
- **git by argv.** The helper calls git with an argument list, never
  through a shell.
- **No writes through symlinks.** The helper refuses to write through one.
- **`pr-review`.** It is read-only. It runs only the commands you approved
  in `add-project`, and it asks again when a file that defines a command
  changes. For a pull request it reads `gh pr diff` and runs no repo
  command. It never runs `terraform apply`, `terraform init` or a deploy.
- **Narrow tool grants.** Each skill's `allowed-tools` names only what it
  needs. The branch diff goes through the helper's read-only `review-diff`
  with fixed flags, because plain `git diff` can write a file or read any
  file.
- **No hooks, MCP servers or agents ship.**
- **No git changes.** DevOCD never commits, pushes or stages, and never
  edits a tracked file. It changes `.git/info/exclude`, which is local.
  Changes to `permissions.additionalDirectories` and `claudeMdExcludes` in
  `.claude/settings.local.json` happen only with the user's consent.

## Known gaps

These are from [docs/known-limitations.md](docs/known-limitations.md),
which has the full list. The ones that matter for a security review:

- A skill guides an agent. It can't force it to follow a flow.
- `pr-review` approves commands by name. An approved test command still runs
  the changed code and tests. The re-ask rule goes by file names, and a
  script that loads another changed file is not caught.
- Under non-interactive `claude -p`, `pr-review` can't ask, so a command that
  needs a new approval is reported `blocked` and not run. In an interactive
  session, Claude Code shows its own permission prompt for each approved
  command.
- In a non-interactive run approved by an answers file, the agent sometimes
  writes before showing its draft. Only the interactive trial checks the
  order. A run that isn't approved writes nothing.
- Connector tools (Confluence, Jira and others) are required to be used
  read-only. That is checked by the skill text and by the absence of write
  calls in the live runs, and it is not yet verified against a real
  connector.
- The secret scan finds credentials by pattern. It can miss some.
- Ignored files live in one checkout only, and `git clean -xdf` deletes
  them.
- The live checks ran on Claude Code 2.1.319 on Windows only, on small
  made-up fixtures, on one model.
