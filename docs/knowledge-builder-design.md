# Agent-built knowledge

Adding a project previously asked the main conversation to inspect main folders
and author flat module notes. The new workflow inventories eligible directories
recursively and delegates semantic discovery to a read-only knowledge-builder.

## Responsibilities

- Inventory helper: enumerate eligible source paths, exclusions and evidence hashes.
  Git supplies tracked/non-ignored paths; traversal never follows links or enters
  nested repositories. Bounded reads do not execute package scripts or other code.
- Builder agent: inspect source, choose meaningful nested module/flow boundaries,
  trace relationships and return full drafts with actual coverage and evidence.
- Add-project coordinator: gather user context, delegate, present drafts, apply the
  existing approval policy, persist files and refresh project/company artifacts.
- Renderer: compile authored Markdown links into document graphs. Version 2 adds
  nested scope membership and company registry pointers; no semantic inference.

There is one builder, not a new agent per folder. Nesting follows responsibilities
and source evidence rather than directory depth. Coverage accounts for each
inventoried directory, including folders folded into parents. Large inventories
are passed in batches; unfinished reading remains explicit. Independent source
repositories are separate project roots. The company graph references them
without recursively loading every project's source or knowledge.

## Navigation and refresh

Consumers start at the company registry, open PROJECT.md, select a module or
runtime flow, then inspect cited source. Nested pages have parent/child links and
observed cross-links. Runtime flow maps are separate from PR-review command policy.
Consumers may request a nested JSON subgraph with `knowledge-scope` or drill down
in the offline viewer. Existing flat Markdown documents remain compatible.

Source hashes and locations describe the discovery snapshot. Re-inventory before
trusting old evidence; refresh through add-project. There is no watcher and no
claim that a matching hash proves a model read the file. Retired pages require
explicit removal authorization and remain marked stale until then.

The saved Markdown/JSON is tool-neutral. The packaged agent and delegation entry
point target Claude Code. Other tools need an explicit PROJECT.md pointer; this
change does not install Codex configuration or overwrite team instruction files.

## Validation boundary

Unit tests cover deep traversal, ignored/private paths, junctions, nested repos,
source hash changes, partial reads, hierarchy selection, registry isolation and
viewer navigation. Plugin validation checks discovery and the startup budget.
No paid live-model evaluation was run for this change. Agent compliance, semantic
graph accuracy and performance on large repositories remain evaluation work.

The packaging follows the official [Claude subagent definition](https://code.claude.com/docs/en/sub-agents)
and [plugin layout](https://code.claude.com/docs/en/plugins-reference). The agent
uses only Read, Glob and Grep; no model override, shell, writes or nested agents.
