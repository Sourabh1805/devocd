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
  It recognises AWS, GitHub, GitLab, OpenAI, Anthropic, Google, Stripe, Slack, SendGrid,
  Twilio, npm and PyPI tokens, Azure storage keys, connection-string passwords, JWTs,
  URL credentials, auth headers, PGP and private-key blocks and Docker auth, and ignores
  placeholders, plus hashes and UUIDs unless they are assigned to a secret-named key.
- **The helper.** The helper script (`scripts/devocd.mjs`) makes no
  network calls and has no dependencies.
- **git by argv.** The helper calls git with an argument list, never
  through a shell.
- **No writes through symlinks.** The helper refuses to write through one.
- **`pr-review`.** It is read-only. It runs only the commands you approved
  in `add-project`, and it asks again when a file that defines a command
  changes. For a pull request it reads `gh pr diff` and runs no repo
  command. It never runs `terraform apply`, `terraform init` or a deploy.
- **Tool grants, skill by skill.** A skill's `allowed-tools` lets Claude run
  those commands without asking. No skill grants Write or Edit, so Claude
  Code asks before the agent writes a file itself.
  - `check`: only the helper's read-only `check` subcommand.
  - `pr-review`: only the helper's read-only `review-diff` subcommand,
    `gh pr diff`, and reading its own files. The branch diff goes through
    `review-diff` with fixed flags, because plain `git diff` can write a file
    or read any file. The repo commands you approved are not pre-granted, so
    Claude Code asks for each.
  - `install`: only the five helper subcommands it runs (`preflight`,
    `backup`, `protect`, `render-parent` and `check`), and reading its own
    files.
  - `add-project`: every helper subcommand, and reading its own files. The
    skill uses eight of them, and listing each would push it over its size
    limit. Several write files: `protect`, `backup`, `register`,
    `split-team`, `restore`, `write-block` and `settings`. For the two that
    could otherwise point anywhere, the helper refuses any other shape:
    `write-block` writes only a project's `CLAUDE.local.md`, from that
    project's `.devocd/pointer.md`, in a folder with DevOCD project state;
    `settings` adds or removes only the company standards folder that
    `preflight` computes for that project, and only the team files recorded
    in the project's state. `restore` preserves existing decisions and capture
    history, recovering only missing durable files. For other files it copies a saved backup from
    `.devocd/.backups/` back over the `.devocd/` files and the whole
    `CLAUDE.local.md` (and a company's `CLAUDE.md`), without checking what
    the backup holds, so a backup someone else edited is trusted as it is.
- **Task checkpoint hook, no MCP servers.** The Stop hook reads bounded local
  state and returns a static capture reminder; it never writes, reads transcripts,
  runs project code or contacts a model/network. Recursive stops are skipped.
  The prompt, edit and session-start hooks (on by default, `devocdHooks: false`
  opts out per scope) read only small local files under `.devocd/` and never
  transcripts or the network. The edit hook's only write is a capped path journal
  and a stale-page marker inside that scope's own `.devocd/`; linked folders are refused.
  The decision-keeper and knowledge-builder have only Read, Glob and Grep tools.
  Capture approval and immutable history are agent workflow instructions, not a
  transactional filesystem enforcement mechanism. Normal host tool permissions
  still apply. The inventory helper reads bounded source files for evidence.
- **No git changes.** DevOCD never commits, pushes or stages, and never
  edits a tracked file except an explicitly approved README capture patch or
  opted-in integration instructions. It changes `.git/info/exclude`, which is local, and
  then asks git whether its files are really ignored. If a tracked
  `.gitignore` re-includes one, it refuses and names it.
- **Settings.** `add-project` adds the standards folder to
  `permissions.additionalDirectories`, and the team file to
  `claudeMdExcludes`, in `.claude/settings.local.json` only when the user
  opts in. That consent rests on the skill's instructions. What the helper
  enforces is the narrower part: it accepts no other value.

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
