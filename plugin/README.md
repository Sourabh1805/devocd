# DevOCD

DevOCD is a Claude Code plugin with skills and a knowledge-builder agent. It sets up company-wide
standards that Claude Code loads from a parent folder, and it reviews
branches and pull requests against those standards. It ships no hooks or
MCP servers. It never stages, commits or pushes, and its helper script
makes no network calls.

The name DevOCD is provisional.

## Install

The repo is private for now, so installing needs access to it.

```text
/plugin marketplace add Sourabh1805/devocd
/plugin install devocd@devocd
```

To try it from a local copy of the repo, without installing:

```text
claude --plugin-dir <path-to>/plugin
```

## First-time setup

Start Claude Code in the company/workspace folder containing your project, then:

```text
/devocd:setup ./my-project
```

Or run `/devocd:setup --all` (also the default with no argument) to list eligible
immediate subfolders and choose the projects to onboard. Both Git and ordinary
folders qualify. Hidden, dependency/build folders and links are excluded. Deeper
folders remain part of each project's module graph. Discovery only lists names;
the existing builder then maps each selected project's code. The helper is also
available as `node <plugin>/scripts/devocd.mjs discover-projects <parent>`.

Setup reuses existing company standards or guides their creation, then invokes
project discovery, draft approval and checks. Personal workspaces can use their
own standards. Ordinary folders do not need a Git repository or remote; branch
and PR reviews do. If Git is initialized later, rerun add-project before staging.
The coordinator is interactive; unattended runs use the separate answers-file
interfaces below. First-time setup currently starts from the parent workspace,
not an arbitrary project folder.

Generated knowledge is layered: short startup rules and pointer, a compact project
index, nested module/flow indexes, then detailed evidence pages. Agents should
search task terms or open a relevant scope, read matching pages, and verify cited
code. They should not preload the entire graph. Writing targets are 200 estimated
tokens for the project pointer, 300 for PROJECT.md and 500 for module/flow pages;
existing hard limits still apply. Targets are not measured token savings.

Claude receives a local startup pointer. Setup can also preview and install native
Codex/Antigravity instruction blocks, preserving existing text. The helper is
`node <plugin>/scripts/devocd.mjs integrate <project> all` (preview); add `--apply`
after reviewing the changes. Use `codex` or `antigravity` to select one tool.
Explicit integration can edit tracked instruction files, which the preview names;
this is an opt-in exception to ordinary setup's tracked-file protection.
Local runtime files and layered refresh guidance are installed under `.devocd/`.
See [tool integration details](../docs/tool-integrations.md) for discovery,
backups, removal and verification. Actual host startup still needs a live trial.

## Company standards by topic

Describe a standard in plain language, for example:

```text
/devocd:company-standards pr style
/devocd:company-standards jira style Include context, acceptance criteria and test notes.
/devocd:company-standards company networking style
/devocd:company-standards pr style ./docs/pr-template.md
/devocd:company-standards jira style https://example.atlassian.net/browse/TEAM-123
/devocd:company-standards networking ./docs/network-policy.pdf
```

Sources can be descriptions, existing Markdown files, Jira links, hosted documents,
or local/attached documents such as PDF and DOCX. Reading linked/private documents
requires the relevant accessible connector or reader; otherwise the skill asks for
pasted text or a readable export. Original sources remain untouched. Source dates
and references are recorded, and later changes require an explicit refresh.

When only a topic is supplied, the skill asks for the rules or template before
drafting. It creates or updates one authoritative Markdown file in the company's
`.devocd/standards/` and a small `index.md` mapping task triggers to files. Examples
include `pr-description.md`, `jira-style.md` and `networking.md`. Ambiguous topics
are clarified; no infrastructure settings or company policy are invented.

After draft approval, existing registered projects receive a compact route in
PROJECT.md and their local startup pointer. Future projects receive that route
through add-project. Standard contents are never copied into project files.
Explicit project exceptions apply within their stated scope; unresolved conflicts
must be surfaced. Topic updates reuse the same company file. Only matching
standards are loaded for a task, keeping startup instructions small.

The workflow backs up changed folders, checks them and rebuilds their knowledge
graphs. Missing or inaccessible projects are reported as incomplete. It writes
guidance only: it does not create PRs or tickets or configure networks. Other
coding tools still need an explicit supported project entry pointer. Live-model
validation of standard drafting and cross-project routing remains outstanding.

## Keeping context lightweight

Use `node <plugin>/scripts/devocd.mjs knowledge-route <project> "task terms"`
for routine lookup. It returns five matching page locations, short titles, source
line numbers and estimated page sizes, never full page bodies. Pass the returned
`nextOffset` as the final argument to retrieve the next page. Open only relevant
Markdown pages; full graph and scope commands remain available for broader tasks.

`check` warns when pointers exceed 200 estimated tokens, project indexes exceed
300, or flow/reference pages exceed 500. Existing hard ceilings still apply.
It also flags repeated substantial prose across module, runtime-flow and standards
pages, excluding fenced examples. Keep one authoritative explanation and link to
it; preserve necessary evidence and exceptions. These are deterministic size and
duplication checks, not a claim of measured model-token savings.

## Refreshing project knowledge

Run `/devocd:refresh [project-path]` manually, after a pull, or before task edits
when `refresh-status` reports stale evidence. The skill delegates discovery through
add-project's knowledge-builder subagent, then applies approved drafts. A pending
source snapshot is captured before discovery; completion checks that source files
did not change meanwhile, validates the project and renders the graph before
recording a fresh baseline. Missing baselines and partial scans never count as fresh.

The read-only helper is `node <plugin>/scripts/devocd.mjs refresh-status <project>`.
It detects additions, deletions and content changes, including changes from Git
pulls, and returns at most 100 changed paths plus the total. Existing projects get
the task-time pointer when add-project is rerun. External Git pulls are detected
at the next task, not by a background model or Git hook. The helper checks bytes;
the agent must still confirm semantic coverage before completing refresh. Merely
regenerating JSON/HTML does not refresh the underlying knowledge.

## The seven skills

| Skill | What it does | Arguments |
| --- | --- | --- |
| `/devocd:refresh` | Refreshes semantic knowledge through the builder and records source freshness after validation. | `[project-path]` |
| `/devocd:company-standards` | Creates or updates a company standard from descriptions, files or linked documents and routes projects to it. | `[topic] <description \| file \| URL>` |
| `/devocd:setup` | Coordinates first-time company and project setup from the parent workspace. | `[project-path]` |
| `/devocd:install` | Sets up DevOCD in a company folder: a parent `CLAUDE.md` with key rules, and standards files. Run it from the company folder. | `[answers-file]` |
| `/devocd:add-project` | Adds one repo to the company: a project index, flows, and a short pointer in `CLAUDE.local.md`. | `[path] [answers-file]` |
| `/devocd:pr-review` | Reviews the current branch against its base, or a pull request, using the company rules and the project's flow. It reads only. | `[quick \| standard \| deep] [base-branch \| PR number or URL]` |
| `/devocd:check` | Checks a company or project folder: sizes, links, secrets, state. It reads only, and explains how to fix what it finds. | `[folder]` |

All skills can be invoked directly or by Claude for a matching request. Setup
invokes `install`, `add-project` and `check` as needed. Installation and project
writes still require draft approval; model invocation does not bypass it.

Both `install` and `add-project` show a draft and wait for your approval
before they write anything.

For a run with no one to answer questions, such as `claude -p`, `install`
and `add-project` take an answers file (JSON). Its fields are the interview
questions: for `install`, `name`, `description`, `sources` and `approval`;
for `add-project`, `projectId`, `description`, `sources`,
`approvedCommands`, `additionalDirectories`, `personalSplit` and
`approval`. A run is approved only when `approval` is exactly `approved`.
The repo's `tests/fixtures/answers/` holds two examples. Without an answers
file, a non-interactive run stops and says so.

## What gets created

```text
company-folder/                   usually not a git repo
├── CLAUDE.md                     parent: key rules, project list, links only
├── .devocd/
│   ├── state.json
│   ├── projects.md               only when the list no longer fits in the parent
│   ├── standards/                security.md, coding.md, compliance.md, ...
│   └── .backups/                 kept on reruns, newest 5
└── project-a/                    a git repo; opt-in integration may edit instruction files
    ├── CLAUDE.md                 the team's own file, if any, never edited
    ├── CLAUDE.local.md           personal: one short pointer block
    ├── .claude/settings.local.json   only if you opt in (see below)
    └── .devocd/                  ignored by git
        ├── state.json
        ├── PROJECT.md            purpose, stack, commands, links
        ├── pointer.md            the text of the CLAUDE.local.md block
        ├── code/<part>.md        one per main part of the code
        ├── flows/pr-review.md    steps, conditions, approved commands
        ├── operations/           on-call, support, runbooks, if you gave sources
        ├── team/                 only with the personal split (see below)
        └── .backups/
```

If the company folder is itself a git repo, the parent file is
`CLAUDE.local.md` instead of `CLAUDE.md`, so nothing tracked changes.

Each repo's `.git/info/exclude` gets three lines, so git ignores these
files without touching a tracked `.gitignore`:

```text
.devocd/
CLAUDE.local.md
**/.claude/settings.local.json
```

`add-project` refuses a repo where one of those paths is already tracked,
or where a tracked `.gitignore` re-includes one of them (git checks it).

### Settings changes, with your consent

- `permissions.additionalDirectories` in the repo's
  `.claude/settings.local.json` gets the company's standards folder, only if
  you opt in. Without it, a project session can't read the company
  standards without a prompt.
- `claudeMdExcludes` gets the team's `CLAUDE.md`, only if you choose the
  personal split.

### The personal split

If a repo's top-level `CLAUDE.md` is over 200 lines, `add-project` offers
a split. The default is no. Your sessions then load a short list of that
file's rule lines instead of the whole file. The rest is copied to
`.devocd/team/`. The team's file is never edited, and teammates see no
change. You review the lists of what stays, what moves and what didn't fit.
Which lines count as rules is a judgement, which is why you review them.

In one live test of a large team file, `check` estimated the launch load at
20,552 tokens before the split and between 245 and 422 after it, over four
runs. That file was a made-up test file, and these are estimates.

When the team file changes later, `check` warns (`team-file/changed`),
because the copies in `.devocd/team/` are then out of date. Rerun
`/devocd:add-project` to refresh them.

## Searchable knowledge graph

`add-project` generates `.devocd/knowledge.json` and `.devocd/knowledge.html`
from the approved Markdown files. Open the HTML in a browser for an offline,
searchable diagram. Select a document to see its text and incoming/outgoing
links. The diagram displays up to 60 search results; the list includes all matches.

To rebuild the artifacts or search current knowledge from the command line:

```text
node <plugin folder>/scripts/devocd.mjs knowledge <project-folder>
node <plugin folder>/scripts/devocd.mjs knowledge-search <project-folder> "billing payments"
```

Search matches every query word, case-insensitively, ranking titles and paths
above body matches. Results are JSON with document IDs relative to `.devocd/`,
scores and source line numbers. CLI search reads current Markdown; regenerate
the HTML after changes. JSON includes source text, SHA-256 hashes and directed
edges with source line numbers. Treat both artifacts as copies of private knowledge.

Only regular UTF-8 Markdown files inside `.devocd/` are indexed. Hidden folders,
backups and symlinks are excluded. Edges come from inline relative Markdown links
to indexed documents; reference-style links and code examples are not edges.
There is no semantic code analysis, external fetching or automatic watching.
Generation refuses likely secrets, tracked output files and unsafe output paths.
Limits are 500 documents, 256 KiB per document and 4 MiB total source text.

## Check a folder

`/devocd:check` runs the helper and explains the result. You can run the
helper yourself, with Node 22.13 or later. This is real output from a
project folder with the files above and no problems:

```text
$ node plugin/scripts/devocd.mjs check company/api
devocd check <tmp>/run/company/api
  CLAUDE.local.md: pointer, 4 lines, about 90 estimated tokens
  .devocd/PROJECT.md: project, 23 lines, about 165 estimated tokens
  .devocd/code/db.md: reference, 7 lines, about 58 estimated tokens
  .devocd/code/infra.md: reference, 7 lines, about 65 estimated tokens
  .devocd/code/invoices.md: reference, 8 lines, about 49 estimated tokens
  .devocd/flows/pr-review.md: flow, 18 lines, about 170 estimated tokens
  .devocd/pointer.md: reference, 4 lines, about 90 estimated tokens
  launch: about 100 estimated tokens across 1 files
  note: Counts memory files only (CLAUDE.md, CLAUDE.local.md, .claude/rules, AGENTS.md); token figures are estimated.
  note: Plugins, hooks, auto memory and organization instructions are not counted. Run /context in Claude Code for the real figure.
0 errors, 0 warnings, 0 information
```

(`<tmp>` stands for a temporary folder. The fixture is the repo's
`tests/fixtures/generated/api`, with no parent file above it.)

## Remove it

1. Delete `.devocd/` in the company folder and in each repo.
2. Remove the block from `<!-- devocd:begin -->` to `<!-- devocd:end -->`
   in the parent `CLAUDE.md` (or `CLAUDE.local.md`) and in each repo's
   `CLAUDE.local.md`. If DevOCD created the file and nothing else is in it,
   delete the file.
3. In each repo's `.claude/settings.local.json`, remove any
   `claudeMdExcludes` and `permissions.additionalDirectories` entries
   DevOCD added.
4. In each repo's `.git/info/exclude`, remove the three lines above.

## Restore a backup

When `install` or `add-project` runs again in a folder, it first copies that
folder's `.devocd/` (without its backups), its `CLAUDE.local.md` and, in the
company folder, the parent `CLAUDE.md` to `.devocd/.backups/<time>/`. The
newest five are kept. No skill restores them; you run the helper yourself,
with Node 22.13 or later:

```text
node <plugin folder>/scripts/devocd.mjs restore <folder>
node <plugin folder>/scripts/devocd.mjs restore <folder> 20261109-101500-123
```

The first form puts back the newest backup, the second a named one. An
unknown name lists the backups there are. It checks every file it would
write before it writes any, and never writes through a link. It overwrites
those files with the backup's copies, so changes made since are lost. If a
helper command says a `state.json` is not valid JSON, this is the way back.

## Undo the personal split

Do either of these:

- Remove the team file's entry from `claudeMdExcludes` in the repo's
  `.claude/settings.local.json`.
- Rerun `/devocd:add-project` and choose to undo the split.

The team file then loads again at the next launch. `.devocd/team/` is left
in place, and you can delete it.

## The known limit: one checkout only

Because DevOCD keeps git clean, its files are ignored, and they live only
in the checkout where you made them. A fresh clone or a linked worktree
doesn't have them. `git clean -xdf` deletes them, backups included.
Rerunning `/devocd:add-project` rebuilds them, but hand edits are lost.

## Sharing with a team

If you want the team to have these files, remove DevOCD's lines from
`.git/info/exclude` and commit the files. That is your choice. DevOCD never
commits, pushes or stages anything.

## What it runs and sends

- `install` and `add-project` read the sources you name. For a web source
  that means Claude Code's web fetch or web search, and for Confluence,
  Jira and the like, connector calls, used read-only.
- The helper script runs locally. It makes no network calls and has no
  dependencies.
- `add-project` changes `permissions.additionalDirectories` and
  `claudeMdExcludes` only when you opt in. The helper accepts no other value
  for them: only the company standards folder and the team files the
  project's state records.
- Reading the company standards from a project session prompts, or is
  denied, unless you opted in to `additionalDirectories`. The key rules are
  in the parent file, so they load either way.
- `pr-review` runs only the commands you approved in `add-project`, asks
  again if the changes touch a file that defines a command, and never runs
  `terraform apply`, `terraform init` or a deploy.
- Company files, repo files and diffs are read as data. Text in them that
  tells an AI to act is reported, not followed.

For the full list, see
[SECURITY.md](https://github.com/Sourabh1805/devocd/blob/main/SECURITY.md).

## Costs, in estimated tokens

- Always on: skill and agent descriptions load at startup. The target is
  125 estimated tokens for the seven-skill plugin; run `node scripts/validate-plugin.mjs` for the current
  CLI figure. The earlier 97-token result predates the knowledge-builder agent.
- Per project: the launch target is 2,000 estimated tokens of memory files.
  `check` prints the figure for a folder.
- The personal split cuts a large team file's launch load, as shown above.
- A review reads the diff, the flow and the references for the changed
  stacks. The review tests recorded spend, not token counts.
- In the routing test (five small made-up projects, read-only questions
  about where code lives), runs with DevOCD's files reported about 1.5 to 2
  times the input tokens of runs without them, so they did not save tokens
  there. What changed was how the agent found the code.

Every figure here is an estimate or a figure Claude Code reported.

## Limits worth knowing

The full list is in
[docs/known-limitations.md](https://github.com/Sourabh1805/devocd/blob/main/docs/known-limitations.md).
The main points:

- A skill guides the agent. It can't force it to follow a flow.
- `install` and `add-project` use sources you name. Connector tools are
  used read-only, and that is not yet tried against a real connector.
- Under non-interactive `claude -p`, reads outside the working folder are
  denied unless granted, and `pr-review` reports every command that needs a
  new approval as `blocked`.
- `pr-review` approves commands by name. It re-asks only when a file that
  defines a command changed, judged by file name.
- The personal split is offered only for a top-level `CLAUDE.md` over 200
  lines.
- Review quality was measured on small made-up projects, on one model, one
  machine and one Claude Code version. It shows the skills follow their
  rules. It does not measure review quality on real pull requests.
- The license, the icon and a public listing are not decided yet.

## Agent-built knowledge

`/devocd:add-project` now delegates source discovery to `devocd:knowledge-builder`
after gathering answers. It inventories eligible folders recursively, then drafts
nested module and runtime flow pages with source locations and hashes. Small
folders are folded into their owning module; independent responsibilities get
nested graphs as deep as needed. Coverage records exclusions and unfinished work.
The caller presents the draft and applies the existing approval/write workflow.
Rerun add-project to refresh; stale pages are reported, not silently deleted.

The company graph contains standards and registry pointers to each project's
`.devocd/PROJECT.md`. Project graphs contain module and flow subgraphs. Runtime
flows describe code behavior; they do not grant permission to run commands.
JSON/HTML generation remains deterministic and does not make model calls.

```text
node <plugin folder>/scripts/devocd.mjs knowledge-inventory <project>
node <plugin folder>/scripts/devocd.mjs knowledge <company-or-project>
node <plugin folder>/scripts/devocd.mjs knowledge-scope <project> code/apps/api
node <plugin folder>/scripts/devocd.mjs knowledge-search <project> billing
```

The offline viewer supports drilling into nested graphs. JSON schema version 2
adds `scopes` (parent and node membership) and company `projects` (entry pointers)
while retaining document nodes and edges. A scope command returns only its nodes
and internal edges. Company pointers are never followed automatically.

Claude Code receives the existing local pointer. Codex and Antigravity can receive
native startup blocks through `integrate`; other tools can start explicitly at
`<project>/.devocd/PROJECT.md`. Claude plugin agents are not installed in other hosts;
the portable workflow uses native subagents when available. Verify
source evidence before changing code. Graphs describe a discovery snapshot.

Inventory skips links, nested repositories, ignored files, credential paths and
known dependency/build directories. It reports exclusions, limits and read errors.
Non-Git folders use the built-in exclusions without interpreting ignore files.
The current limits are 20,000 inventory entries, 256 KiB per source file, 16 MiB
of source reads, and 500 knowledge documents / 4 MiB per graph. Oversized projects
need explicit project roots; a partial scan must remain labelled partial.
