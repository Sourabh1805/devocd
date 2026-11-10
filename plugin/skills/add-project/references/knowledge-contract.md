# Knowledge builder contract

The `add-project` coordinator runs
`node "${CLAUDE_PLUGIN_ROOT}/scripts/devocd.mjs" knowledge-inventory "P"`
after preflight and gathering answers, before drafting or writing. Delegate in the
foreground to `devocd:knowledge-builder`, passing the absolute project and plugin
roots, answers, preflight, and the complete inventory. Supply large inventories in
subtree batches, accounting for every batch. Read its returned drafts; incorporate
them into the normal approval and write steps. If delegation is unavailable, report
it and stop before writing; do not claim that a builder ran.

## Portable hierarchy

All paths below are relative to the project's `.devocd/` directory:

- `PROJECT.md`: compact entry point linking immediate module indexes and flows.
- `code/<source-path>/index.md`: a meaningful module; nested modules use nested
  paths, for example `code/apps/api/billing/index.md`.
- `flows/runtime/<flow>/index.md`: observed runtime flow; independently useful
  subflows nest beneath it. Keep `flows/pr-review.md` as the approved review policy.
- `coverage.md`: every inventoried directory mapped to a document, folded into a
  parent with a reason, or explicitly unexplored; include excluded roots/reasons.
  Split large coverage tables into linked `coverage/<part>.md` pages.

Existing flat `code/*.md` documents remain valid. Do not impose a fixed nesting
depth or create empty indexes to mirror every directory. Every created page must
be reachable from PROJECT through parent/child links. Cross-links describe actual
dependencies, calls, data flow or shared standards, labelled in surrounding text.
Use relative Markdown links within `.devocd/`; source paths and company paths are
backticked text, not links escaping the graph. Include a parent link on nested pages.

Each module/flow page records purpose, source scope, entry points, children,
relationships, tests and evidence. Evidence includes repo-relative `file:line`,
the inventory SHA-256 for each cited file and discovery date. Hashes describe the
source at discovery time; re-inventory and compare before relying on old evidence.
Only claim a file was inspected if it was actually read. Record uncertainties and
partial coverage prominently in PROJECT. Discovery must not manufacture approved
commands or alter approval policy. Respect existing file budgets (project 80 lines /
700 estimated tokens, flows 80 lines, other references 200 lines); split by meaning.
The graph renderer supports at most 500 Markdown documents and 4 MiB of text: if
the hierarchy exceeds that, report the limit and propose separate project roots.

## Lightweight layers

Write short factual bullets: purpose, constraints, paths and decisions. Omit
introductions, repeated explanations and empty headings. Use readable grammar;
do not trade accuracy or essential exceptions for fewer words.

- Startup: company key rules and a project pointer only. Aim for a pointer under
  10 lines and 200 estimated tokens; the existing hard ceiling remains 400.
- PROJECT: aim for 300 estimated tokens, with immediate module/flow links and
  coverage warnings. The 700-token ceiling is a limit, not a target.
- Module/flow indexes: one-sentence purpose, immediate children, boundaries and
  task-routing hints. Aim for 500 estimated tokens per page; split details into
  meaningful child pages before approaching the existing line limits.
- Leaves: implementation facts, exceptions, tests and evidence. Keep evidence
  near the claims it supports; link shared details instead of copying them.

Do not repeat child contents or source hashes in every ancestor. Keep one
authoritative explanation and link to it. Never omit required evidence to meet a
target; split by responsibility, preserving parent links and reachability.
No fixed depth: create nested scopes only for independently useful concepts.

## Result returned to the coordinator

Return full contents keyed by `.devocd/`-relative path for PROJECT, module and
runtime flow pages and coverage. Include source evidence, coverage totals, excluded
and unread paths, flagged locations, and a refresh change list. The coordinator
adds pointer, operations, review policy and state using their existing templates.
Retired pages remain until the user explicitly authorizes their removal; clearly
mark them stale in the index. A partial inventory or incomplete reading must yield
a partial graph, never a claim of complete coverage.

## Consumption from any coding tool

For a known project, start at its `.devocd/PROJECT.md`; use the company registry
only to select a project or find applicable standards. Never preload all projects.
Search current knowledge by task terms using `knowledge-search`, or request a
known nested scope using `knowledge-scope`. Read only matching pages and follow
links when the task needs them. Do not load all Markdown, knowledge.json, HTML,
coverage tables or evidence hashes into the model at startup.
Open only relevant module and flow pages, then verify their cited source before
editing code. `knowledge-search` searches current Markdown; JSON/HTML are derived
snapshots and must be regenerated after edits. Codex and other tools can read the
same files without this Claude agent definition; they do not automatically load
CLAUDE.local.md. Tell them the PROJECT path explicitly or add a pointer through
their own supported setup. Do not overwrite a team's AGENTS.md.
