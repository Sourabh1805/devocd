# Knowledge builder contract

For canonical context or optional Investigator investigation, read `context-workflow.md`.

The `add-project` coordinator runs
`node "${CLAUDE_PLUGIN_ROOT}/scripts/devocd.mjs" knowledge-inventory "P"`
after preflight and gathering answers, before drafting or writing. It also runs
`detect-commands "P" --json` and `detect-dependencies "P" --json` and passes both
results to the builder: they feed PROJECT's Commands and Dependencies sections. Delegate in the
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
  The inventory classifies logs, lockfiles, assets and binaries as `irrelevant-bulk`:
  list them under a one-line "skipped bulk" note, never as coverage gaps. Only unread
  source files are gaps. Notebooks arrive as cell source (outputs stripped); read and
  cite that source, never raw `.ipynb` JSON.
  Split large coverage tables into linked `coverage/<part>.md` pages.
- Thematic pages, only when the repo has the material (same evidence rules, never
  invented): `cicd.md` for pipelines and release process from `.github/workflows/*`,
  `.gitlab-ci.yml`, `Jenkinsfile` or Dockerfiles (triggers, steps, command names
  only); `guides/` with a page per substantial guide found in `docs/`, README
  sections or `CONTRIBUTING.md`, linked with a one-line summary; `history.md`,
  light, from a CHANGELOG or release tags only — never a retelling of git log.
- `decisions.md`: durable knowledge — approved constraints, decisions and their
  reasons (for example "`big_chat/` is a fixed stub — do not edit, per README"),
  each with source and date. Refresh reconsiders derived facts when hashes change;
  it never rewrites or deletes a decision. Changes here go through explicit approval.

Existing flat `code/*.md` documents remain valid. Do not impose a fixed nesting
depth or create empty indexes to mirror every directory. Every created page must
be reachable from PROJECT through parent/child links. Cross-links describe actual
dependencies, calls, data flow or shared standards, labelled in surrounding text.
Use relative Markdown links within `.devocd/`; source paths are backticked text,
not links escaping the graph. Company files are linked only from PROJECT's Links
section, only to files that exist inside the company folder (the parent file
always; the standards index only when present — a missing target is `ref/broken`).
Include a parent link on nested pages.

Each module/flow page is a coding aid, not an introduction, with these sections:
- Purpose (one sentence) and source scope.
- Entry points: the `file:line` a task starts from.
- Public surface: exports, routes or CLI verbs other code calls, and where they
  are consumed.
- Run/test this part: documented command names that exercise it, marked
  "documented, not approved for PR review".
- Extension points: "to add a new X, touch Y and Z" recipes observed from existing
  examples in the code.
- Pitfalls: invariants, units, ordering and footguns found in code, comments and
  tests.
- Uses: any cross-repository dependency this module imports, by name — the detail
  lives in PROJECT's Dependencies section, not here.
- Standards: the policy topics that apply to this scope (end of page; see below).
- Evidence: repo-relative `path#L12-40`, the inventory SHA-256 for each cited file
  and discovery date, as an `## Evidence` list (format below).

### Page header lines (machine-read)

Helpers parse these lines (`scripts/lib/pagemeta.mjs`), so follow the format
exactly; prose elsewhere on the page is free. Keys start at column 0, outside code fences. `Parent:`, `Scope:` and `Uses:` count only in the header region, before the first `##` or deeper heading; `Standards:` counts anywhere.
- `Parent: [text](relative/path.md)`: the parent page; an `#anchor` is ignored.
- `Scope: a, b, c`: repo-relative paths or globs, comma-separated (commas inside `{...}` do not split), each optionally in backticks; `none` for an empty list (also for `Uses:`).
- `Standards: coding, security — route via [PROJECT](../PROJECT.md) Links`: topics up to the
  first ` — ` or ` - `; write `none` when no topic applies.
- `Uses: our-shared, proto`: cross-repository dependency names, split like Scope.
- Under a `## Evidence` heading, one list item per cited file:
  `- <path>[#L<start>[-<end>]] sha256:<64 lowercase hex> <YYYY-MM-DD>` (path may be in backticks).
Paths must not contain `..` or start with `/` or a drive letter. Each key appears once.

Hashes describe the
source at discovery time; re-inventory and compare before relying on old evidence.
Only claim a file was inspected if it was actually read. Record uncertainties and
partial coverage prominently in PROJECT. Discovery must not manufacture approved
commands or alter approval policy. Respect existing file budgets (project 80 lines /
700 estimated tokens, flows 80 lines, other references 200 lines); split by meaning.
The graph renderer supports at most 500 Markdown documents and 4 MiB of text: if
the hierarchy exceeds that, report the limit and propose separate project roots.

### Incremental refresh

When refresh passes only affected page ids, parent ids and unmapped paths, rewrite only the
listed pages, keeping their ids, header lines and links stable, and refresh their evidence.
Check each listed parent and return a replacement only if a summary or child link is now
wrong. Create a new page only for an unmapped path that warrants one (linked from its
parent), or record it in coverage. Never touch other pages, `decisions.md` or `decision-history/`.

## Lightweight layers

Before drafting, assign each fact one owning page. Parent indexes explain boundaries
and link to children; they do not summarize every descendant. Keep exceptions close
to the relevant rule. Do not remove evidence, uncertainty or limitations to hit a
target. `check` warns on excess estimated tokens and repeats (`context/repeated`);
fix avoidable warnings or explain necessary exceptions in the handoff.

Write short factual bullets: purpose, constraints, paths and decisions. Omit
introductions, repeated explanations and empty headings. Use readable grammar;
do not trade accuracy or essential exceptions for fewer words.

- Startup: company key rules and a project pointer only. Aim for a pointer of
  4 bullets or fewer and under 200 estimated tokens; the existing hard ceiling remains 400.
- PROJECT: aim for 300 estimated tokens, with immediate module/flow links and
  coverage warnings. The 700-token ceiling is a limit, not a target.
- Module/flow indexes: one-sentence purpose, immediate children, boundaries and
  task-routing hints. These pages never load at launch, so depth is free there:
  aim for 800 estimated tokens per flow page and 900 per module page; split
  details into meaningful child pages before approaching the existing line limits.
  A page that only paraphrases folder names fails this contract.
- Leaves: implementation facts, exceptions, tests and evidence. Keep evidence
  near the claims it supports; link shared details instead of copying them.

Do not repeat child contents or source hashes in every ancestor. Keep one
authoritative explanation and link to it. State each fact once, in its home layer (company policy in standards, code facts in the deepest page that owns them); elsewhere link or cite it. `check` reports repeats as `context/repeated`. Never omit required evidence to meet a
target; split by responsibility, preserving parent links and reachability.
No fixed depth: create nested scopes only for independently useful concepts.

## Backtracking chain

Every page must be traceable up to the company rules that govern it: each
module/flow page links its parent page and ends with a `Standards:` line naming
the policy topics that apply to its scope (coding, security, pr-description, ...),
chosen from the company standards index when one exists; with no standards yet,
write `Standards: none recorded — add with /devocd:company-policy`. The topics
route through PROJECT's Links section (module and flow pages never link outside
the project; PROJECT carries the company links), so the chain is
page → parents → PROJECT → company parent → policy files. Adding a
policy updates the standards index and project routing, not every page.

## Result returned to the coordinator

Never replace or delete `.devocd/decisions.md` or `.devocd/decision-history/`
during onboarding reruns or refresh. These contain approved durable memory;
propose reconsideration through `/devocd:capture`, preserving all history.

Return full contents keyed by `.devocd/`-relative path for PROJECT, module and
runtime flow pages and coverage. Include source evidence, coverage totals, excluded
and unread paths, flagged locations, and a refresh change list. The coordinator
adds pointer, operations, review policy and state using their existing templates.
Retired pages remain until the user explicitly authorizes their removal; clearly
mark them stale in the index. A partial inventory or incomplete reading must yield
a partial graph, never a claim of complete coverage.

## Consumption from any coding tool

First step: open `.devocd/PROJECT.md` and follow its links to the page and the source it cites.
With a shell, in Claude Code run `devocd trace . "<file or task words>"` from the project folder to name
the leaf page (other tools: `node .devocd/runtime/devocd.mjs trace . "..."`). Go up the parent chain
only when the leaf does not answer. Use the company registry
only to select a project or find applicable standards. Never preload all projects.
For broader browsing, search current knowledge by task terms using `knowledge-search`, or request a
known nested scope using `knowledge-scope`. Read only matching pages and follow
links when the task needs them. Do not load all Markdown, knowledge.json, HTML,
coverage tables or evidence hashes into the model at startup.
`knowledge-route` is optional browsing: it returns five metadata
matches (each with a one-line snippet of at most 160 characters) and a nextOffset. Read one relevant page first; expand only for unresolved
questions or dependencies. An empty result, or a top result with coverage below 0.5, means no good match: search different terms or inspect
source, not that the project lacks the capability. Use full scopes only when the
task requires their breadth. Module notes also load automatically through path-scoped rules when a matching file is opened. Never claim measured token savings from size estimates.
Open only relevant module and flow pages, then verify their cited source before
editing code. `knowledge-search` searches current Markdown; JSON/HTML are derived
snapshots and must be regenerated after edits. Codex and other tools can read the
same files without this Claude agent definition; they do not automatically load
CLAUDE.local.md. Tell them the PROJECT path explicitly or add a pointer through
their own supported setup. Do not overwrite a team's AGENTS.md.

The trace step above returns the leaf page, its parent chain, governing policies, freshness and
a canonical-context flag in one call.
