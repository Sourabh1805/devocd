# Project files

Everything here goes in the project's `.devocd/` folder, which git ignores. Write repo paths from the repo root in backticks, like `src/billing/`. Use links (`[text](path)`) only between files inside `.devocd/`, relative to the file they are in. No `@` paths, no HTML comments, no script bodies, no secrets.

## pointer.md: the block in CLAUDE.local.md

The helper copies `pointer.md` into the managed block of the repo's `CLAUDE.local.md`, which loads at every launch. At most 40 lines and 400 estimated tokens; aim for under 10. No links, because the same text sits in two folders. Shape:

```markdown
# <id>: <description>

- Start with `.devocd/PROJECT.md`: what this project is, its commands, and which file to open for each part of the code.
- Read `AGENTS.md` in this folder before you start: it holds the team's agent notes.
- Company rules: the company folder's parent file loads at launch when this repo sits in that folder. It is optional: if this repo is used alone, carry on without it.
```

Write the `AGENTS.md` line only when preflight's `agentsMd` lists `AGENTS.md`. It is needed because a repo `CLAUDE.local.md` stops Claude Code loading `AGENTS.md` by itself.

## PROJECT.md: the project index

At most 80 lines and 700 estimated tokens. An agent reads it first, then opens only what its task needs. Shape:

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
```

- Commands: the command a person types (`npm test`, `make lint`), never what it runs.
- Operations: only when an operations file exists.
- Links: also the Confluence space, Jira project or dashboards the sources named.

## code/<part>.md: one per main part

A main part is a source folder that does one job, such as `src/billing/` or `src/auth/`. Name the file after the folder. Skip tiny helpers, generated or vendored code, and tests on their own. Only what you saw in the repo. Each file at most 200 lines. Shape:

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
  "sources": [{ "type": "file", "ref": "../docs/on-call.md", "readAt": "<YYYY-MM-DD>" }]
}
```

- `teamFiles`: each of preflight's `teamFiles`, with its `path` and `sha256` as given, and `"excluded": false`. Empty list when there are none.
- `approvedCommands`: exactly the approved commands, as typed.
- `sources`: each source read. A file's `ref` is its path from the project folder, with forward slashes; `readAt` is today.
