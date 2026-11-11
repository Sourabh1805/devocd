# Deterministic foundation

The canonical context workflow is opt-in and coexists with legacy Markdown setup.
It does not migrate existing policies automatically. Existing knowledge-builder stays;
three additional agents are optional read-only investigations, callable by skills.

The three discoverable agent listings add about 41 startup tokens in the local
Claude CLI (116 to 157). The explicit listing ceiling is now 160; generated context
and file budgets are unchanged. Optional invocation does not mean free discovery.

## Build sequence and boundaries

1. Fail closed on Git tracking/work-tree failures and filesystem enumeration errors.
2. Validate the versioned [model contract](../plugin/references/context-model.md).
3. Publish immutable generation bundles and atomically replace one active pointer.
4. Resolve explicit project/path/cloud/environment scopes and policy exceptions.
5. Render independently tested Claude, Codex and Antigravity context payloads.
6. Rehash evidence, compare project inventories and compute reverse dependency impact.
7. Invoke optional Policy Auditor, Mapper or Incident Investigator only when useful.

No external graph database, remote memory service or live cloud access is required.
Relationships are evidence-backed records; importing an external graph is not implemented.

## Commands

Run the helper from its installed plugin directory. Paths for drafts/queries are
relative to an explicitly supplied company root, which is the access boundary.

```text
node plugin/scripts/devocd.mjs context-publish COMPANY draft.json none
node plugin/scripts/devocd.mjs context-publish COMPANY draft.json none --apply
node plugin/scripts/devocd.mjs context-resolve COMPANY query.json
node plugin/scripts/devocd.mjs context-resolve COMPANY query.json codex
node plugin/scripts/devocd.mjs context-impact COMPANY
node plugin/scripts/devocd.mjs context-refresh COMPANY draft.json CURRENT_GENERATION
node plugin/scripts/devocd.mjs context-agent COMPANY query.json policy-auditor
```

For updates, replace `none` with the current generation hash returned by resolution.
A query is `{"project":"payments","path":"infra/production","cloud":"azure","environment":"production"}`.
Use the model contract to create a draft. Source-derived policy decisions need review.
The fixtures in `tests/helpers/context-fixture.mjs` demonstrate a complete model.

## Publication and recovery

Each generation is a single bundle of validated model plus source inventory, stored
at `.devocd/generations/<sha256>/context.json`. Flush the staged bundle, recheck
source freshness, then rename a flushed temporary pointer over `context-current.json`.
Readers resolve that pointer once and verify the bundle hash. Previous generations
remain available; no automatic deletion or cross-project writes occur.

An exclusive `context.lock` serializes publishers. Expected-generation comparison
rejects stale drafts. Exceptions before activation leave the active version intact.
An interrupted process may leave a lock or unreferenced generation: inspect the lock
and confirm no publisher is running before removing that specific lock. Do not
delete active generations. Filesystem rename guarantees apply; sudden power-loss
durability and network filesystem semantics have not been certified.

Rollback: read a previous generation's model, review its evidence against current
sources, and publish with the current base hash. Stale snapshots cannot silently
replace current context. Legacy setup, integration and Markdown writes do not yet
use this snapshot store; do not describe them as transactional.

## Resolution, refresh and agents

Keep all applicable company policies. Narrower scope alone never overrides one.
Explicit allowed exceptions replace named ancestor rules. Conflicting effective
values, missing dimensions and stale evidence block usable adapter output. Existing
host/team instructions remain authoritative in their own permission system; these
payloads cannot grant commands, network access or writes.

Refresh compares saved evidence and project inventories. Reverse dependencies find
affected services/runbooks. New or changed files without evidence mappings require
broader project discovery. Unrelated projects stay unchanged. Unknown dependencies
remain a semantic discovery gap; hashes never prove a model read or understood code.
Company evidence files are checked, but discovering new company documents is manual.

Optional agents return proposals, source evidence, uncertainty and unread coverage.
The default request bounds are 20 files and 4000 output tokens. These are instructions
to the invoking host, not a substitute for host-enforced token/tool limits. No helper
launches an agent automatically. All skills remain usable without these three agents.

## Evidence and release gate

Local tests cover three synthetic project roots, AWS/Azure nested scopes, conflicting
policies, explicit exceptions, a stale runbook, source changes, interrupted publication
and independent adapter contracts. These tests do not count as live assistant trials.

The release gate requires Claude and Codex to run the same fixture tasks with and
without DevOCD. Use three actual temporary Git repositories; pin assistant versions,
models, prompt hashes, fixture hashes, permissions and repeat count (at least three).
Include normal tasks, missing context, conflicting policies and stale runbooks.

Record per run: expected/selected scope IDs; expected/preserved policy IDs; objective
task assertions; latency in milliseconds; input/output/cached tokens; reported USD
cost or null with a reason; model/host/version; errors; and artifact paths. Unknown
cost is not zero. Store raw outputs alongside scored results; no production secrets.

Proposed gate: zero lost mandatory policies, zero silent conflict/staleness bypasses,
100% deterministic context selections, and at least 90% assistant task success per
host. Report latency/cost distributions against baseline, including failed runs.
Do not claim savings from token estimates or hide failed runs through retries.

Paid live trials remain off pending a chosen budget. Static adapter tests and a mock
assistant cannot establish real host loading, policy preservation or task success.
