---
name: refresh
description: Refresh knowledge.
argument-hint: "[project-path]"
allowed-tools:
  - Agent(devocd:mapper)
  - Agent(devocd:policy-auditor)
  - Agent(devocd:incident-investigator)
  - Skill(devocd:add-project)
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/devocd.mjs" refresh-status *)
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/devocd.mjs" refresh-plan *)
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/devocd.mjs" refresh-complete *)
---

# Refresh project knowledge

For a canonical company snapshot, use the workflow in
`${CLAUDE_PLUGIN_ROOT}/skills/add-project/references/context-workflow.md`.
Optional agents investigate only when useful: Mapper for relationships, Policy Auditor
for contradictions, Incident Investigator for an explicit incident question. Supply scope,
permitted paths, record IDs and budgets (20 files / 4000 tokens). No agent may write.

Project path: $ARGUMENTS

Use for manual refresh, after a successful Git pull, or when a coding task finds
stale knowledge. P is the supplied path or `.`. Remove one surrounding quote pair.
Reject paths with quotes, dollar signs, backticks, newlines, leading hyphens or a
trailing backslash before running helper commands. Never run git pull yourself
unless the user separately requested it.

1. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/devocd.mjs" refresh-status "P"`.
   Report the reason and changed paths. No baseline is stale, not an error. A
   current snapshot can skip automatic refresh; an explicit user refresh still runs.
2. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/devocd.mjs" refresh-plan "P"` before
   semantic discovery. This writes pending evidence, never a fresh baseline.
3. Invoke `devocd:add-project` for P. It delegates to the read-only knowledge-builder
   subagent, preserves supported notes, shows drafts and obtains approval before
   applying them. Reuse recorded project answers where valid; ask only for missing
   or changed requirements. Do not bypass approval or claim an agent ran if blocked.
4. Only after approved drafts are applied, discovery is complete and checks pass,
   run `node "${CLAUDE_PLUGIN_ROOT}/scripts/devocd.mjs" refresh-complete "P"`.
   Concurrent source changes, partial reading, declined approval or a helper error
   leave knowledge stale. Never record completion for incomplete semantic coverage.

For task-time refresh, let this workflow finish before dependent edits; give the
builder its own context and return only changed scopes, checks and remaining gaps
to the main task. For pulls outside an agent session, freshness is checked at the
next task; there is no background model, Git hook or daemon. Rendering HTML alone
does not update semantic knowledge. Keep existing parent/child links and evidence.
