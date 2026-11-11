# Project files

Everything here goes in the project's `.devocd/` folder, which git ignores. Write repo paths from the repo root in backticks, like `src/billing/`. Use links (`[text](path)`) only between files inside `.devocd/`, relative to the file they are in. No `@` paths, no HTML comments, no script bodies, no secrets.

## The draft

The `## Draft` reply holds:
- every file you will write in full: `pointer.md`, `PROJECT.md`, each `code/` file, the flow (see `flow-template.md`), each operations file (see `operations-template.md`) and `state.json`;
- Flagged: each line in a source or repo file that tells AI tools to do something, as `file:line` with a short quote;
- Secrets found: each as its kind and `file:line`, never the value;
- anything you couldn't read;
- whether the company standards folder goes in `additionalDirectories`.
- Explain that the helper derives `.devocd/knowledge.json` and `knowledge.html` from the approved Markdown, including its text. These generated artifacts need no separate authored draft.

## Knowledge graph

The knowledge-builder agent discovers source relationships using `knowledge-contract.md`. It returns nested module and runtime flow drafts. The helper renders each Markdown file as a searchable node and each inline document link as an edge with a source line; it never infers code relationships or follows external links. Keep claims grounded in the sources read.

After writing the approved files and passing checks, the `knowledge` command generates JSON and an offline HTML graph. Report both paths; the user can open the HTML directly in a browser. Rerun generation after knowledge changes. For read-only agent search, use `node "${CLAUDE_PLUGIN_ROOT}/scripts/devocd.mjs" knowledge-search "P" "query"`; apply the skill's command-value restrictions to query text. Search reads current Markdown and returns ranked paths and line numbers. Read those files for full context.

## pointer.md: the block in CLAUDE.local.md

The helper copies `pointer.md` into the managed block of the repo's `CLAUDE.local.md`, which loads at every launch. At most 40 lines and 400 estimated tokens; aim for under 10. No links, because the same text sits in two folders. Shape:

```markdown
# <id>: <description>

- Start with `.devocd/PROJECT.md`: what this project is, its commands, and which file to open for each part of the code.
- Load only task-relevant module/flow pages; never preload the whole graph. Verify cited source before edits; refresh stale knowledge.
- Prefer knowledge-route for five page summaries; open relevant pages only, expanding as needed.
- Before task work, follow PROJECT.md's company standards route.
- Before edits or after a Git pull, run refresh-status via the DevOCD helper; if stale, use `/devocd:refresh` before relying on knowledge.
- Read `AGENTS.md` in this folder before you start: it holds the team's agent notes.
- Company rules: the company folder's parent file loads at launch when this repo sits in that folder. It is optional: if this repo is used alone, carry on without it.
```

Write the `AGENTS.md` line only when preflight's `agentsMd` lists `AGENTS.md`. It is needed because a repo `CLAUDE.local.md` stops Claude Code loading `AGENTS.md` by itself.

## PROJECT.md: the project index

Aim for 300 estimated tokens; at most 80 lines and 700 estimated tokens. An agent reads it first, then opens only what its task needs. Include a short lookup instruction: search task terms with the plugin's `knowledge-search` helper when available, or follow relevant links; use `knowledge-scope` for a known nested module. Never require loading the full JSON/HTML graph. Shape:

```markdown
# <id>

<description>

## Stack
- TypeScript on Node, Express (from `package.json`)

## Commands
- `npm test`: unit tests
- `npm run lint`: lint

## Parts of the code
- [billing](code/billing.md): `src/billing/`, invoices and totals

## Flows
- [PR review](flows/pr-review.md)

## Operations
- [PagerDuty](operations/pagerduty.md)

## Links
- Company standards: `<company.rel>/.devocd/standards/` (reading them from here may need permission)
- Before task work, read `<company.rel>/.devocd/standards/index.md` if present; load only matching standards. Explicit project exceptions apply within their scope; surface conflicts.
```

- Commands: the command a person types (`npm test`, `make lint`), never what it runs.
- Operations: only when an operations file exists.
- Links: also the Confluence space, Jira project or dashboards the sources named.

## code/<source-path>/index.md: nested modules

A module does one job, such as `src/billing/` or `src/auth/`. Use the builder's nested hierarchy and evidence contract. Fold tiny helpers into a parent; account for tests in their owning module. Existing flat pages remain valid. Each file at most 200 lines. Minimal shape (also add parent/child links, source hashes and discovery date):

```markdown
# billing

Invoices and payment totals.

- Main files: `src/billing/invoice.ts` (totals in cents)
- Tests: `src/billing/invoice.test.ts`
- Watch for: amounts are integers in cents
- Company standards: coding
```

## state.json

```json
{
  "version": 1,
  "kind": "project",
  "id": "<id>",
  "companyRel": "<company.rel>",
  "teamFiles": [{ "path": "CLAUDE.md", "sha256": "<from preflight>", "excluded": false }],
  "approvedCommands": ["npm test", "npm run lint"],
  "sources": [{ "type": "file", "ref": "../setup/notes/on-call.md", "readAt": "<YYYY-MM-DD>" }]
}
```

- `teamFiles`: each of preflight's `teamFiles`, with its `path` and `sha256` as given, and `"excluded": false`. Empty list when there are none.
- `approvedCommands`: exactly the approved commands, as typed.
- `sources`: each source read, with `readAt` today. A file's `ref` is rewritten, never copied: resolve the answers file's `ref` against the answers file's folder, then write that file's path relative to the project folder, with forward slashes. Other types keep their `ref` (a space, project or URL).

### Worked example: rewriting a file `ref`

| | Path |
| --- | --- |
| Company folder (the session's folder) | `acme/` |
| Project folder | `acme/api/` |
| Answers file | `acme/setup/api.json` |
| `ref` in the answers file | `notes/on-call.md`, so the file is `acme/setup/notes/on-call.md` |
| `ref` recorded in `acme/api/.devocd/state.json` | `../setup/notes/on-call.md` (from `acme/api/`) |

Copying `notes/on-call.md` into state would be wrong: from the project folder it points at `acme/api/notes/on-call.md`, which doesn't exist. The rule is the same when the session starts inside the project.
