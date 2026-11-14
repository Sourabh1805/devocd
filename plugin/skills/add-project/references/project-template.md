# Project files

On reruns, preserve state.decisionCapture when present and leave decisions.md and
decision-history/ untouched. They are updated only by approved capture proposals.

Everything here goes in the project's `.devocd/` folder, which git ignores. Write repo paths from the repo root in backticks, like `src/billing/`. Use links (`[text](path)`) only between files inside `.devocd/`, relative to the file they are in. No `@` paths, no HTML comments, no script bodies, no secrets.

## The draft

Write every draft file in full to `P/.devocd/draft/` at its final relative path (`draft/pointer.md`, `draft/PROJECT.md`, `draft/code/...`, the flow per `flow-template.md`, each operations file per `operations-template.md`, and `draft/state.json`) — run `protect "P"` first so nothing lands in git. The chat `## Draft` reply is a short summary, not the file contents:
- Scope: what was covered, and the module/flow pages produced (count and the file list with paths, so the user can open any draft file before approving);
- Key findings: the most useful discoveries and defects the pages record, in a few bullets;
- Approved commands for PR review: the exact names (or "None approved"). Required — approval of the draft covers them, so they are never hidden inside `state.json`;
- Flagged: each line in a source or repo file that tells AI tools to do something, as `file:line` with a short quote;
- Secrets found: each as its kind and `file:line`, never the value;
- anything you couldn't read, and other uncertainties;
- whether the company standards folder goes in `additionalDirectories`.
- Explain that the helper derives `.devocd/knowledge.json` and `knowledge.html` from the approved Markdown, including its text. These generated artifacts need no separate authored draft.

Run `clean-draft "P"` before writing the drafts: a stale file left by an earlier, rejected run must never be applied. Skills have no delete tool, so `clean-draft` is the only way to clear the folder; it removes only `P/.devocd/draft/`, never through a link, never tracked files.

Approval applies the files from `draft/` unchanged (placeholders substituted at write time); after applying, run `clean-draft "P"` again to remove `P/.devocd/draft/`. Approval means the user accepts the described changes, not that they verified every claim.

## Knowledge graph

The knowledge-builder agent discovers source relationships using `knowledge-contract.md`. It returns nested module and runtime flow drafts. The helper renders each Markdown file as a searchable node and each inline document link as an edge with a source line; it never infers code relationships or follows external links. Keep claims grounded in the sources read.

After writing the approved files and passing checks, the `knowledge` command generates JSON and an offline HTML graph. Report both paths; the user can open the HTML directly in a browser. Rerun generation after knowledge changes. For read-only agent search, use `node "${CLAUDE_PLUGIN_ROOT}/scripts/devocd.mjs" knowledge-search "P" "query"`; apply the skill's command-value restrictions to query text. Search reads current Markdown and returns ranked paths and line numbers. Read those files for full context.

## pointer.md: the block in CLAUDE.local.md

The helper copies `pointer.md` into the managed block of the repo's `CLAUDE.local.md`, which loads at every launch. At most 40 lines and 400 estimated tokens; aim for under 10. No links, because the same text sits in two folders. Shape:

```markdown
# <id>: <description>

- Start with `.devocd/PROJECT.md`: what this project is, its commands, and which file to open for each part of the code.
- After durable task findings, use `/devocd:capture` for approved README/decision updates with history.
- Before edits, consult relevant `.devocd/decisions.md` entries if present; follow supersedes/retires links, not archived hunks.
- Load only task-relevant module/flow pages; never preload the whole graph. Verify cited source before edits; refresh stale knowledge.
- Prefer knowledge-route for five page summaries; open relevant pages only, expanding as needed.
- Before task work, follow PROJECT.md's company standards route.
- Before edits or after a Git pull, run refresh-status via the DevOCD helper; if stale, use `/devocd:refresh` before relying on knowledge.
- If the company has canonical context, use context-resolve first; blocked context must not fall back to Markdown.
- Read `AGENTS.md` in this folder before you start: it holds the team's agent notes.
- Company rules: the company parent file loads at launch when this repo sits in that folder. A recorded company makes them required: unreachable parent or standards means say so and ask before proceeding. Only a project with no registered company carries on alone.
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
- Documented: `npm test`, `npm run lint`, `npm run typecheck` (from detect-commands; names only)
- Approved for PR review: `npm test` — documented is not approved; PR review runs only approved commands.

## Parts of the code
- [billing](code/billing.md): `src/billing/`, invoices and totals

## Flows
- [PR review](flows/pr-review.md)

## Project pages
- [CI/CD](cicd.md) · [Decisions](decisions.md) · [Guides](guides/deploying.md)

## Dependencies
- `our-shared` (git): shared client library — [shared project](../../shared/.devocd/PROJECT.md) (from `.devocd/`, via the company folder)
- `proto` (submodule at `third_party/proto`)

## Operations
- [PagerDuty](operations/pagerduty.md)

## Links
- [Company rules](../<company.rel>/CLAUDE.md) and [standards index](../<company.rel>/.devocd/standards/index.md)
- Before task work, read the standards index if present; load only matching standards. Explicit project exceptions apply within their scope; surface conflicts.
```

Link targets resolve from the file's own folder. PROJECT.md lives in `P/.devocd/`,
one level below the project root that preflight's `company.rel` is measured from,
so every company link gets an extra leading `../` (companyRel `..` means the
parent file is `../../<parentFile>`). The same applies to cross-project links.

- Commands: the command a person types (`npm test`, `make lint`), never what it runs.
  Documented commands come from `detect-commands`; the Approved line lists only
  `state.json.approvedCommands`, and exists even when empty ("None approved: ask first").
- Project pages, Dependencies, Operations: only when the page or dependency exists.
  Dependencies come from `detect-dependencies` (git, workspace, local path, submodule,
  nested repo). When one matches a project registered in the company state, link that
  project's PROJECT.md (the link stays inside the company folder); load it only when
  a task needs the dependency, never preload another project.
- Links: the company parent file is always linked; link the standards `index.md`
  only when it exists (a missing target is a broken link). Also the Confluence
  space, Jira project or dashboards the sources named.

## code/<source-path>/index.md: nested modules

A module does one job, such as `src/billing/` or `src/auth/`. Use the builder's nested hierarchy and evidence contract (`knowledge-contract.md` lists the required coding-aid sections). Fold tiny helpers into a parent; account for tests in their owning module. Existing flat pages remain valid. Each file at most 200 lines. Minimal shape (also add parent/child links, source hashes and discovery date):

```markdown
# billing

Parent: [PROJECT](../PROJECT.md)

Invoices and payment totals.

- Entry points: `src/billing/invoice.ts:12` (`createInvoice`), called from `src/api/routes.ts:40`
- Public surface: `createInvoice`, `invoiceTotal` — consumed by `src/api/` and `src/reports/`
- Run/test this part: `npm test` (documented, not approved for PR review)
- To add a new charge type: extend `ChargeKind` in `src/billing/types.ts:8`, handle it in `invoiceTotal` (`invoice.ts:55`), add a case to `invoice.test.ts`
- Pitfalls: amounts are integers in cents; totals round half-even (`invoice.ts:60-64`)
- Tests: `src/billing/invoice.test.ts`

Standards: coding — route via [PROJECT](../PROJECT.md) Links
```

A page that only paraphrases the folder name fails the contract: it must name the entry point, the covering test and at least one extension recipe or pitfall when the source shows one.

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
