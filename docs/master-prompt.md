> Original vision from the owner, kept verbatim. `docs/superpowers/specs/2026-11-06-devocd-design.md` supersedes it wherever they differ.

# DevOCD — MASTER PRODUCT DEVELOPMENT PROMPT
## The Engineering Control System for AI Coding Agents

**Product:** DevOCD  
**CLI:** `devocd`  
**Repository:** `devocd` (subject to availability verification)  
**Category:** AI Developer Infrastructure / Agent Orchestration / Engineering Automation  
**Architecture:** Local-first, cross-harness, workflow-driven, graph-powered  
**Release strategy:** Open-source or source-available core with optional commercial capabilities, subject to a final licensing decision.

**Tagline:** Engineering discipline for AI coding agents.

---

# 1. YOUR ROLE

You are the founding engineering team responsible for designing, implementing, testing, securing, documenting, and preparing DevOCD for public release.

Operate with the combined expertise of:

- Principal software architect.
- Senior DevOps and platform engineer.
- AI agent infrastructure engineer.
- Developer-experience specialist.
- Security engineer.
- Distributed systems engineer.
- Frontend architect.
- Software testing and evaluation engineer.
- Open-source maintainer.
- Technical product architect.

Your responsibility is to build a real, production-quality system, not a demonstration consisting of loosely connected Markdown files.

Make technically justified decisions, document important trade-offs, and prefer reliable implementations over impressive but unnecessary complexity.

**Primary mission:**

Create a unified engineering system that allows developers and AI coding agents to discover the correct project context, follow approved workflows, execute reusable engineering skills, maintain persistent engineering knowledge, and coordinate multiple specialized agents.

DevOCD must work across multiple coding harnesses without forcing teams to rewrite their instructions and skills for each platform.

---

# 2. PRODUCT PHILOSOPHY

DevOCD is based on eight principles.

### 2.1 Minimal context

Coding agents should load only the instructions relevant to their current task.

Do not insert complete architecture documents, workflow libraries, or enormous instruction files into the initial context.

### 2.2 Hierarchical knowledge

Organize engineering knowledge as a navigable hierarchy.

A small root index identifies projects and points to deeper instructions.

Project indexes point to subsystem documentation and relevant workflows.

Workflow nodes load task-specific instructions only when required.

### 2.3 Deterministic where possible

Use ordinary code for tasks that do not require probabilistic reasoning.

Examples include file discovery, schema validation, graph traversal, permission checks, linting, and execution-state management.

Do not waste LLM tokens on deterministic tasks.

### 2.4 One source of truth

Skills, workflows, permissions, and memory records must have canonical definitions.

Different coding harnesses receive compatible representations of those definitions.

Never maintain separate contradictory copies for Claude Code, Codex, and OpenCode.

### 2.5 Engineering safety

Infrastructure changes, production operations, and repository mutations require explicit permission boundaries.

Markdown instructions alone are not sufficient security enforcement.

### 2.6 Evidence-backed execution

Every important engineering conclusion should be supported by relevant evidence.

A PR review must cite affected files and checks.

An incident investigation must distinguish observations, hypotheses, and verified root causes.

### 2.7 Persistent engineering memory

Useful knowledge should survive individual agent sessions.

Memory must support provenance, scoped access, version history, contradictions, expiration, and deletion.

### 2.8 Local-first, cloud-optional

The CLI, context system, skills, workflows, and local memory must work without a hosted service.

Cloud functionality enhances collaboration rather than becoming a mandatory dependency.

---

# 3. REQUIRED CAPABILITIES

DevOCD must ultimately support:

1. Tiny hierarchical `CLAUDE.md` and `AGENTS.md` indexes.
2. Portable skills for Claude Code, Codex, and OpenCode.
3. YAML-based executable workflows with Mermaid visualization.
4. Professional PR-review and incident-triage workflows.
5. Local Markdown memory with provenance and graph relationships.
6. Hosted graph database with team synchronization.
7. Large interactive web dashboard and visual workflow editor.
8. Multi-agent swarm orchestration.

Each capability must be independently testable.

Do not build the hosted graph database, dashboard, and orchestration system before validating the foundational CLI and workflow engine.

---

# 4. RESEARCH BEFORE IMPLEMENTATION

Before writing substantial code, investigate current official documentation for:

- Anthropic Claude Code.
- OpenAI Codex CLI.
- OpenCode.
- Agent Skills specification.
- Model Context Protocol.
- Claude Code plugins and marketplace distribution.
- Codex skill installation.
- OpenCode skills and plugin mechanisms.
- Hierarchical instruction discovery and precedence.
- Harness permissions and hook capabilities.
- YAML workflow validation.
- Mermaid graph generation.
- Graph storage technologies.
- Multi-agent orchestration frameworks.

Investigate relevant open-source projects, including:

- obra/superpowers
- basicmachines-co/basic-memory
- getzep/graphiti
- Aider repository map
- LangGraph
- Existing code-review agents
- Existing agent skill managers
- Existing context management tools
- Existing workflow graph editors
- Existing local-first knowledge graph tools

For every relevant competitor, document:

- Repository or official website.
- License.
- Verified capabilities.
- Architecture.
- Advantages.
- Limitations.
- Features DevOCD can independently implement.
- Opportunities for differentiation.

Do not copy incompatible code or copyrighted assets.

Do not assume a feature exists because its documentation uses similar terminology.

Create:

- `docs/research/competitors.md`
- `docs/research/harnesses.md`
- `docs/research/architecture-decisions.md`
- `docs/research/marketplace-requirements.md`

Record the date on which platform behavior was verified.

Treat undocumented integration details as unsupported until demonstrated.

---

# 5. SYSTEM ARCHITECTURE

Design DevOCD as a modular system with clear boundaries.

```text
AI Coding Harnesses
    |
    | Claude Code / Codex / OpenCode
    v
Harness Compatibility Layer
    |
    v
DevOCD Core
    |
    +-- Context Router
    +-- Skill Registry
    +-- Workflow Engine
    +-- Policy Engine
    +-- Validation Engine
    +-- Execution Tracer
    +-- Memory Engine
    +-- Agent Orchestrator
    |
    +-- Local Storage
    |     +-- Markdown
    |     +-- SQLite
    |     +-- Local event journal
    |
    +-- Optional Hosted Services
          +-- Authentication
          +-- Organization Management
          +-- Graph Database
          +-- Synchronization
          +-- Audit Events
          +-- Workflow Runs
          +-- Team Permissions
          |
          +-- Web Dashboard
```

The CLI is the primary local entry point.

The dashboard communicates through typed APIs.

The workflow engine must not depend on the dashboard.

The orchestration layer must use the workflow engine rather than creating an incompatible execution model.

The hosted service must not become the authoritative source for files that are explicitly local-only.

---

# 6. TECHNOLOGY STACK

Recommended initial choices:

**Language:** TypeScript with strict type checking.

**Runtime:** Supported Node.js LTS version.

**Package manager:** pnpm or another well-supported option.

**CLI:** A mature command-line framework.

**Validation:** Zod or JSON Schema.

**Skill format:** Agent Skills-compatible `SKILL.md`.

**Workflow format:** YAML with versioned schemas.

**Workflow visualization:** Mermaid.

**Local persistence:** Markdown, SQLite, and a journal for execution events.

**Hosted graph:** Database provider interface; evaluate graph-native databases and PostgreSQL graph tables using real requirements.

**Backend API:** A maintained TypeScript server framework.

**Frontend:** React with TypeScript.

**Workflow editor:** React Flow or a suitable equivalent.

**Tests:** Vitest or another mature framework, Playwright for browser tests.

**CI/CD:** GitHub Actions.

**Interoperability:** Optional MCP server.

**Monorepo:** TypeScript workspace packages with explicit dependencies.

These are proposed choices, not mandatory decisions.

Document justified deviations.

Do not add Redis, Kubernetes, Kafka, hosted vector databases, or other infrastructure before demonstrating an actual requirement.

---

# 7. REPOSITORY STRUCTURE

Create a repository approximately following this organization:

```text
devocd/
├── README.md
├── LICENSE
├── CONTRIBUTING.md
├── SECURITY.md
├── CHANGELOG.md
├── CODE_OF_CONDUCT.md
├── AGENTS.md
├── CLAUDE.md
├── package.json
├── pnpm-workspace.yaml
│
├── apps/
│   ├── cli/
│   ├── dashboard/
│   └── server/
│
├── packages/
│   ├── core/
│   ├── config/
│   ├── context/
│   ├── skills/
│   ├── workflows/
│   ├── execution/
│   ├── policies/
│   ├── memory/
│   ├── storage/
│   ├── graph/
│   ├── orchestration/
│   ├── tracing/
│   ├── validation/
│   ├── evaluations/
│   ├── mcp/
│   ├── adapters/
│   │   ├── claude-code/
│   │   ├── codex/
│   │   └── opencode/
│   └── shared/
│
├── skills/
│   ├── pr-review/
│   ├── incident-triage/
│   ├── terraform-review/
│   ├── debugging/
│   ├── release-readiness/
│   └── architecture-review/
│
├── workflows/
│   ├── pr-review.flow.yaml
│   ├── incident-triage.flow.yaml
│   ├── terraform-change.flow.yaml
│   └── release-check.flow.yaml
│
├── schemas/
├── templates/
├── examples/
├── tests/
├── docs/
├── scripts/
└── .github/
    └── workflows/
```

Keep package boundaries intentional.

Avoid creating an excessive number of packages without meaningful independence.

---

# 8. HIERARCHICAL CONTEXT SYSTEM

## Objective

DevOCD must produce small instruction files that function like a navigable table of contents.

The agent initially sees the workspace map, not the entire workspace.

### Required hierarchy

```text
Workspace
  |
  +-- Root AGENTS.md / CLAUDE.md
  |
  +-- Project A
  |     |
  |     +-- PROJECT.md
  |     +-- Architecture references
  |     +-- Workflows
  |     +-- Skills
  |     +-- Subsystem indexes
  |
  +-- Project B
  |     |
  |     +-- PROJECT.md
  |     +-- Workflows
  |     +-- Skills
  |
  +-- Project C
        |
        +-- PROJECT.md
        +-- Operations
              |
              +-- PagerDuty
              +-- Incidents
              +-- Runbooks
```

### Root instruction requirements

The root file contains:

- Workspace name.
- Short description.
- Registered project list.
- One-line project descriptions.
- Relative links to project instructions.
- Minimal global rules.
- How to discover relevant workflows.

It must not load complete project documentation.

Example:

```md
# DevOCD Workspace

Use the project index relevant to the task.

## Projects

- api: Backend services — projects/api/PROJECT.md
- infra: Terraform infrastructure — projects/infra/PROJECT.md
- portal: Frontend application — projects/portal/PROJECT.md

## Guidance

Resolve project scope before loading task instructions.
Load only relevant references.
Follow effective security and permission policies.
```

### Project index requirements

A project index contains:

- Purpose.
- Technology stack.
- Main service boundaries.
- Relevant directories.
- Architecture references.
- Common development commands.
- Operational workflows.
- Skill references.
- Relevant memory namespaces.

### Hard limits

Implement configurable defaults:

- Root file: 60 lines maximum, 500 estimated tokens.
- Project index: 80 lines maximum, 700 estimated tokens.
- Skill entry: 100 lines maximum, 900 estimated tokens.
- Workflow instruction reference: 80 lines maximum.
- Memory entry: 60 lines maximum.
- Supporting reference: 200 lines maximum.

Default initial context target: 2,000 tokens.

Default workflow instruction budget: 4,000 tokens.

These are DevOCD budget defaults, not harness context-window restrictions.

### Context routing

Resolve context using:

1. Explicit project name.
2. Current working directory.
3. Modified files.
4. Repository ownership.
5. Project manifest.
6. Known service identifiers.
7. Workflow metadata.
8. Optional semantic classification.

Return an ambiguity result when multiple projects are plausible.

### Required commands

```bash
devocd init
devocd scan
devocd context lint
devocd context inspect
devocd context explain
devocd context budget
```

### Acceptance criteria

- Twenty-project fixture produces a compliant root index.
- Project-specific requests do not load unrelated project references.
- Broken references are detected.
- Cyclic imports are detected.
- User-owned instructions are preserved.
- Generation is idempotent.
- Routing decisions are explainable.
- Token-budget tests are automated.

---

# 9. PORTABLE SKILL SYSTEM

## Objective

Create skills once and distribute them across supported coding agents.

Canonical skills use the Agent Skills specification where practical.

### Skill structure

```text
skills/
└── pr-review/
    ├── SKILL.md
    ├── devocd.yaml
    ├── references/
    │   ├── security.md
    │   ├── terraform.md
    │   └── java.md
    └── scripts/
        └── validate.ts
```

Use `SKILL.md` for portable agent-facing instructions.

Store additional DevOCD metadata in `devocd.yaml` or another validated extension mechanism that does not compromise compatibility.

### Skill metadata

Support:

- Skill identifier.
- Name and description.
- Trigger conditions.
- Supported project types.
- Required tools.
- Capabilities.
- Permission requirements.
- Input/output contracts.
- Related workflows.
- Supporting references.
- Validation requirements.
- Failure behavior.
- Version.

### Required initial skills

Implement:

1. PR review.
2. Incident triage.
3. Terraform review.
4. Systematic debugging.
5. Release readiness.
6. Architecture review.
7. Log investigation.
8. Test selection.
9. Change impact analysis.
10. Documentation maintenance.

Start by thoroughly implementing the first four.

### Harness adapters

Support:

- Claude Code.
- OpenAI Codex.
- OpenCode.

The adapter must:

- Detect supported capabilities.
- Generate appropriate instruction entry points.
- Install skills in documented locations.
- Detect conflicts.
- Respect host permissions.
- Validate generated output.
- Support safe uninstall and rollback.
- Report unsupported functionality.

Never assume all harnesses handle nested instructions, tool permissions, plugins, and subagents identically.

### Required commands

```bash
devocd skills list
devocd skills validate
devocd skills inspect pr-review
devocd install --harness claude-code
devocd install --harness codex
devocd install --harness opencode
devocd install --harness all
devocd sync --dry-run
devocd doctor
```

### Acceptance criteria

- Valid Agent Skills frontmatter.
- Correct output for each supported harness.
- Installation is idempotent.
- Existing user files are not accidentally overwritten.
- Installed skills can be discovered in actual harness smoke tests.
- Capability limitations are visible.
- Uninstallation preserves user-owned files.

---

# 10. YAML WORKFLOW ENGINE

## Objective

DevOCD must provide an executable workflow graph that determines which skill or tool should be used for a given engineering task.

Use YAML as the canonical definition.

Generate Mermaid from YAML.

Do not maintain a separate manually edited graph that can diverge from execution behavior.

### Required workflow node types

- Start.
- Context resolution.
- Classification.
- Decision.
- Condition.
- Skill execution.
- Tool execution.
- Validation.
- Approval.
- Human handoff.
- Output.
- Error.
- Recovery.
- Terminal.

### Workflow requirements

Every workflow must define:

- ID and version.
- Description.
- Input schema.
- Execution policy.
- Nodes and edges.
- Transition conditions.
- Timeout policy.
- Retry policy.
- Expected outputs.
- Failure handling.

### Illustrative structure

```yaml
version: 1
id: incident-triage
name: Incident Triage

entry: start

nodes:
  - id: start
    type: start
    next: project

  - id: project
    type: context
    resolver: project
    next: classify

  - id: classify
    type: decision
    selector: incident_type
    branches:
      infrastructure: infra_triage
      application: app_triage
      default: unknown

  - id: infra_triage
    type: skill
    skill: terraform-review
    next: report

  - id: app_triage
    type: skill
    skill: incident-triage
    next: report

  - id: unknown
    type: handoff
    next: report

  - id: report
    type: output
    next: complete

  - id: complete
    type: terminal
```

Treat this as an illustrative design; finalize a strict schema before implementing the parser.

### Workflow capabilities

Implement:

- Deterministic routing.
- Typed inputs and outputs.
- Branch evaluation.
- Bounded retries.
- Checkpoint persistence.
- Approval gates.
- Failure transitions.
- Execution state.
- Dry-run mode.
- Execution tracing.
- Workflow versioning.
- Resume support.
- Safe cancellation.

### Visualization

Generate Mermaid diagrams from the validated workflow graph.

Support graph export for the dashboard.

### Commands

```bash
devocd flow list
devocd flow show incident-triage
devocd flow validate incident-triage
devocd flow render incident-triage
devocd flow run incident-triage --dry-run
devocd flow trace <run-id>
```

### Acceptance criteria

- Invalid graphs are rejected.
- Unreachable nodes are detected.
- Missing transitions are detected.
- Unbounded cycles are rejected.
- Mermaid matches executable workflow semantics.
- Deterministic inputs yield deterministic routing.
- Checkpoints survive restart.
- Dry runs do not perform mutations.
- Every run has an inspectable trace.

---

# 11. PROFESSIONAL PR REVIEW

## Objective

Provide a production-oriented PR-review workflow that selects relevant engineering checks rather than blindly running every possible tool.

### Workflow

```text
PR request
   ↓
Resolve repository
   ↓
Inspect changed files
   ↓
Identify affected subsystems
   ↓
Load project policies
   ↓
Select relevant checks
   ↓
Run permitted validations
   ↓
Review correctness/security
   ↓
Aggregate evidence
   ↓
Generate report
```

### General checks

- Git diff validity.
- Whitespace errors.
- Conflict markers.
- Formatting.
- Linting.
- Compilation.
- Type checking.
- Relevant tests.
- Secret exposure.
- Dependency changes.
- Error handling.
- Input validation.
- Security implications.
- Breaking API changes.
- Documentation impact.
- Generated-code consistency.

### Terraform checks

Include appropriate checks such as:

- `terraform fmt -check`
- `terraform validate`
- Provider version validation.
- IAM policy changes.
- Sensitive variable review.
- Infrastructure security scanning.
- Resource destruction risk.
- Module dependency checks.

Do not automatically execute `terraform apply`.

Avoid remote backend initialization or untrusted provider execution without approval.

### Stack-aware behavior

Support:

- TypeScript and JavaScript.
- Python.
- Java and Maven/Gradle.
- Go.
- Terraform.
- Docker.
- Kubernetes.
- GitHub Actions.
- Shell scripts.

### Review modes

- Quick.
- Standard.
- Deep.

### Findings

Each finding must include:

- Severity.
- Confidence.
- File.
- Line reference.
- Evidence.
- Explanation.
- Suggested fix.
- Validation status.

Distinguish:

- Passed.
- Failed.
- Skipped.
- Unavailable.
- Blocked.
- Not applicable.

### Acceptance criteria

- Known defects in fixtures are detected.
- Clean fixtures do not receive fabricated findings.
- Relevant commands are actually executed.
- Check failures are reported accurately.
- Expensive checks are not unnecessarily invoked.
- No repository mutation occurs without permission.
- Markdown and JSON reports are supported.

---

# 12. INCIDENT TRIAGE AND RUNBOOKS

## Objective

Automatically route an incident to the relevant project, service, operational documentation, and diagnostic workflow.

### Example

Request:

"Investigate a P3 PagerDuty incident affecting Project Three."

Expected navigation:

```text
Workspace
   ↓
Project Three
   ↓
Project instruction index
   ↓
Incident workflow
   ↓
PagerDuty configuration
   ↓
Affected service
   ↓
Incident classification
   ↓
Relevant runbook
   ↓
Diagnostic skill
   ↓
Read-only investigation
   ↓
Evidence-backed report
   ↓
Proposed memory update
```

### Required integrations

Create provider interfaces for:

- PagerDuty.
- GitHub.
- Log providers.
- Cloud monitoring.
- Cloud infrastructure.
- Internal runbooks.

Start with synthetic providers.

Optional real integrations may be added after permission and error handling have been tested.

### Incident report

Include:

- Incident identifier.
- Severity.
- Affected services.
- Observed symptoms.
- Timeline.
- Available evidence.
- Potential causes.
- Confirmed root cause, if supported.
- Diagnostic actions.
- Failed or unavailable checks.
- Recommended next steps.
- Escalation recommendation.
- Related historical incidents.

Never invent live monitoring evidence.

### Safety

Incident investigation must be read-only by default.

Acknowledging incidents, restarting services, modifying infrastructure, resolving alerts, or deploying fixes requires explicit authorization.

### Acceptance criteria

- Correct project and runbook selection.
- Safe handling of unknown incident types.
- Accurate evidence references.
- Correct permission checks.
- Clear uncertainty reporting.
- Structured final report.
- Approved memory proposals.
- Successful operation against synthetic fixtures.

---

# 13. PERSISTENT LOCAL ENGINEERING MEMORY

## Objective

Create a persistent engineering knowledge graph that survives agent sessions and helps future tasks.

### Memory categories

- Workspace.
- Repository.
- Project.
- Service.
- Component.
- Architecture.
- Engineering convention.
- Incident.
- Root cause.
- Decision.
- Known issue.
- Deployment.
- Pull request.
- Dependency.
- Ownership.

### Relationships

Support:

- depends_on
- owned_by
- affects
- supersedes
- resolved_by
- caused_by
- documented_in
- related_to
- validated_by

### Canonical storage

Use Markdown with structured metadata.

Example:

```text
.devocd/
└── memory/
    ├── projects/
    ├── services/
    ├── decisions/
    ├── incidents/
    └── relationships/
```

Use SQLite for indexing and efficient retrieval.

The SQLite index must be rebuildable from canonical source records.

### Provenance

Each memory fact requires:

- Stable ID.
- Scope.
- Entity.
- Source.
- Created timestamp.
- Last verification timestamp.
- Verification status.
- Optional confidence score.
- Optional expiration.
- Related entities.
- Version or supersession metadata.

### Memory lifecycle

```text
Observation
   ↓
Candidate extraction
   ↓
Sensitive-data filtering
   ↓
Deduplication
   ↓
Provenance verification
   ↓
Contradiction detection
   ↓
Approval if required
   ↓
Persistent storage
   ↓
Scoped retrieval
   ↓
Revalidation or expiration
```

### Important rules

- Do not save secrets.
- Do not automatically persist customer data.
- Do not turn hypotheses into confirmed facts.
- Do not share private project memory across unauthorized projects.
- Do not silently overwrite conflicting facts.
- Do not rely on stale memory without labeling its status.
- Support deletion and data retention.

### Commands

```bash
devocd memory search
devocd memory inspect
devocd memory propose
devocd memory approve
devocd memory forget
devocd memory export
devocd memory rebuild-index
```

### Acceptance criteria

- Memory survives restart.
- Index rebuild preserves relationships.
- Project isolation is enforced.
- Contradictions are detected.
- Expired facts are handled correctly.
- Secrets are redacted.
- Memory deletion is testable.
- Provenance survives export/import.

---

# 14. HOSTED GRAPH DATABASE

## Objective

Add optional hosted knowledge and collaboration for teams.

Do not require a cloud database for local DevOCD usage.

### Requirements

Implement:

- Organization management.
- Workspaces.
- Projects and repositories.
- Graph entities.
- Typed relationships.
- User and team permissions.
- Authentication.
- Authorization.
- Hosted memory search.
- Change synchronization.
- Event history.
- Retention policies.
- Backup and recovery.
- Audit logging.

### Database selection

Evaluate:

- Managed graph databases.
- Neo4j-compatible solutions.
- PostgreSQL with explicit graph relationships.
- Other mature alternatives.

Select based on demonstrated requirements:

- Multi-tenant authorization.
- Query patterns.
- Traversal performance.
- Operational complexity.
- Cost.
- Backup and migration.
- Local synchronization compatibility.

Avoid choosing an expensive managed graph database merely because the product contains graphs.

### Local-to-hosted synchronization

Support:

- Offline work.
- Durable local change journal.
- Stable entity identifiers.
- Incremental synchronization.
- Conflict detection.
- Idempotent replay.
- Explicit deletion semantics.
- Partial sync failure recovery.

### Acceptance criteria

- Two users can synchronize authorized changes.
- Offline changes survive and later synchronize.
- Conflicts do not silently overwrite data.
- Tenant isolation is tested.
- Backups can be restored.
- Sync errors preserve local state.
- Provenance survives synchronization.

---

# 15. LARGE WEB DASHBOARD

## Objective

Create a professional engineering dashboard that offers visibility and control over workflows, skills, projects, memory, and agent execution.

The dashboard must be a genuine working application.

### Dashboard modules

**Overview**
- Organization overview.
- Projects.
- Active workflows.
- Recent runs.
- Validation failures.
- Agent activity.

**Project explorer**
- Repositories.
- Services.
- Dependencies.
- Context hierarchy.
- Instruction indexes.

**Workflow studio**
- Visual node editor.
- Drag-and-drop nodes.
- Typed connections.
- Branch conditions.
- Mermaid preview.
- YAML export.
- Validation panel.
- Workflow simulation.
- Version history.

**Skill registry**
- Installed skills.
- Compatibility.
- Versions.
- Dependencies.
- Validation results.

**Memory explorer**
- Entity graph.
- Related incidents.
- Architecture decisions.
- Provenance.
- Expired facts.
- Conflicts.
- Approval queue.

**PR and incident center**
- Historical investigations.
- Review reports.
- Diagnostic outcomes.
- Workflow traces.

**Agent orchestration center**
- Worker agents.
- Tasks.
- Dependencies.
- Execution status.
- Budgets.
- Failures.
- Approvals.

**Administration**
- Teams.
- Permissions.
- Audit logs.
- Integrations.
- Retention.
- Security settings.

### Visual requirements

Use a polished, professional developer-tool interface.

Prefer restrained design over excessive gradients or decorative elements.

Provide:

- Dark and light themes.
- Fast navigation.
- Search.
- Responsive layout.
- Accessible components.
- Clear status indicators.
- Useful keyboard shortcuts.
- Structured error messages.

### Acceptance criteria

- Workflows can be visually edited and saved.
- Visual editing preserves executable workflow semantics.
- Invalid graphs cannot be published as runnable workflows.
- Permission enforcement occurs on the server.
- Memory graphs render and navigate correctly.
- Workflow traces are inspectable.
- Browser tests cover critical flows.
- Dashboard outages do not break local CLI usage.

---

# 16. MULTI-AGENT SWARM ORCHESTRATION

## Objective

Allow DevOCD to coordinate multiple specialized coding agents when a task benefits from parallel investigation or separate areas of expertise.

The swarm must use the existing workflow engine.

Do not build an unrelated second execution platform.

### Agent roles

Potential agents:

1. Coordinator.
2. Context investigator.
3. Code reviewer.
4. Security reviewer.
5. Infrastructure reviewer.
6. Incident investigator.
7. Test verifier.
8. Architecture reviewer.
9. Summary agent.

### Execution model

```text
User Request
     |
     v
Coordinator
     |
     v
Workflow Planner
     |
     +---- Code Review Agent
     |
     +---- Security Agent
     |
     +---- Infrastructure Agent
     |
     v
Evidence Aggregator
     |
     v
Validation
     |
     v
Human Approval if Needed
     |
     v
Final Report
```

### Required capabilities

- Typed agent contracts.
- Task dependency graphs.
- Concurrent execution.
- Bounded concurrency.
- Per-agent context budgets.
- Per-agent tool permissions.
- Execution timeouts.
- Cost budgets.
- Retry policies.
- Cancellation.
- Durable checkpoints.
- Artifact handoffs.
- Evidence sharing.
- Result aggregation.
- Conflict detection.
- Agent run traces.

### Isolation

Agents performing modifications must have controlled filesystem access.

Prefer separate Git worktrees or isolated environments where appropriate.

Prevent multiple agents from silently modifying the same files.

Do not allow a coordinator to bypass permissions by delegating restricted actions.

### Swarm evaluation

Compare multi-agent results to a single-agent baseline.

Measure:

- Task success.
- Defect detection.
- Unsupported findings.
- Execution time.
- Token usage.
- Tool calls.
- Cost.
- Failure recovery.

Do not assume multi-agent execution is automatically better.

### Acceptance criteria

- Three-agent PR review works against test fixtures.
- Independent tasks can execute concurrently.
- Dependent tasks wait for required outputs.
- Worker failure is handled.
- Cancellation works.
- Permissions remain enforced.
- File conflicts are detected.
- Cost and step limits are respected.
- Results include traceable evidence.

---

# 17. SECURITY AND PERMISSION ENGINE

Security applies across the entire system.

### Action classifications

**Tier 0 — Read-only operations**
- File inspection.
- Safe parsing.
- Metadata retrieval.
- Read-only diagnostics.

**Tier 1 — Local reversible operations**
- Generated files.
- Local changes.
- Reversible modifications.

**Tier 2 — Repository mutations**
- Commits.
- Branch modifications.
- Pull request updates.
- Dependency modifications.

**Tier 3 — External or production mutations**
- Deployments.
- Cloud infrastructure changes.
- Production restarts.
- Incident acknowledgements.
- Secret changes.
- Destructive operations.

### Required security protections

- Strict input validation.
- Filesystem path validation.
- Symlink escape protection.
- Command injection prevention.
- Shell execution allowlists.
- Tool timeouts.
- Output-size caps.
- Network restrictions.
- Secret redaction.
- Tenant isolation.
- Audit events.
- Authentication.
- Authorization.
- Permission checks immediately before execution.

### Prompt injection protection

Treat repository files, incident payloads, logs, tool results, web content, and PR comments as untrusted data.

These inputs must not redefine effective security policies.

A skill or agent may request an action, but the execution layer must determine whether that action is authorized.

---

# 18. CONTEXT AND TOKEN OPTIMIZATION

DevOCD must measure the cost of providing instructions to agents.

### Track

- Root index tokens.
- Project context tokens.
- Skill tokens.
- Reference tokens.
- Memory retrieval tokens.
- Total context loaded.
- Number of file reads.
- Routing accuracy.
- Workflow success.
- Token-estimation confidence.

### Techniques

- Progressive disclosure.
- Hierarchical indexes.
- Deterministic routing.
- Lazy reference loading.
- Scoped memory retrieval.
- Duplicate-policy elimination.
- Tool-output truncation with explicit notices.
- Context caching with invalidation.
- Relevant-file ranking.

### Benchmark

Compare:

1. Full-context approach.
2. Hierarchical index approach.
3. Graph-routed context approach.

Measure actual performance.

Use 50% reduction in unnecessary instruction loading as an initial experiment target, not a promised result.

Do not fabricate provider token usage or API costs.

### Commands

```bash
devocd budget report
devocd budget compare
devocd context explain
devocd eval context
```

---

# 19. DEVELOPER EXPERIENCE AND CLI

The developer-facing commands should be consistent and discoverable.

Proposed interface:

```bash
# Setup
devocd init
devocd scan
devocd doctor

# Context
devocd context inspect
devocd context lint
devocd context budget
devocd context explain

# Skills
devocd skills list
devocd skills validate
devocd skills inspect

# Workflows
devocd flow list
devocd flow render
devocd flow validate
devocd flow run
devocd flow trace

# Reviews
devocd review
devocd incident investigate

# Memory
devocd memory search
devocd memory propose
devocd memory inspect
devocd memory export

# Agent orchestration
devocd agents list
devocd swarm run
devocd swarm inspect
devocd swarm cancel

# Harness installation
devocd install
devocd sync
devocd uninstall

# Evaluation
devocd eval
devocd budget report
```

Use `--dry-run` for potentially mutating operations.

Support JSON output for automation.

Make errors actionable.

Do not require registration, cloud access, or an API key for core functionality.

---

# 20. OPTIONAL MCP SERVER

Create an optional MCP interface for discovering and invoking DevOCD functionality.

Candidate tools:

- `devocd.list_projects`
- `devocd.resolve_context`
- `devocd.list_skills`
- `devocd.get_skill`
- `devocd.list_workflows`
- `devocd.get_workflow`
- `devocd.validate_workflow`
- `devocd.render_workflow`
- `devocd.search_memory`
- `devocd.propose_memory`
- `devocd.get_run_trace`

Keep the MCP surface small.

Do not duplicate every CLI command as an agent tool without an actual need.

Apply the same scope and permission checks as the CLI.

---

# 21. ADVANCED ENGINEERING FEATURES

After completing the foundational components, evaluate:

### Context drift detection

Detect discrepancies between repository implementation and documented architecture.

### Skill conflict detection

Identify duplicate or contradictory skill instructions.

### Workflow optimization

Identify redundant graph branches and frequently failing nodes.

### Incident-to-runbook learning

Propose improvements based on verified incident resolutions.

### Graph change impact analysis

Identify related services, projects, workflows and documentation affected by a change.

### Memory freshness scoring

Reduce reliance on stale engineering knowledge.

### Workflow replay

Reproduce workflows using recorded synthetic or sanitized inputs.

### Skill evaluation

Test skill versions against repeatable engineering fixtures.

### Automated documentation suggestions

Recommend updates when code or configuration changes affect documented behavior.

### Agent budget optimization

Select the minimum required number of agents for a task based on previous evaluations.

Implement only when measurable value is demonstrated.

---

# 22. IMPLEMENTATION ROADMAP

Implement the system in 12 independently verifiable stages.

## Stage 0 — Architecture and foundations

Implement:

- Monorepo.
- CLI skeleton.
- Shared schemas.
- Test infrastructure.
- Example repositories.
- Architecture decision records.
- CI.

**Acceptance:** Clean build and test execution on supported platforms, valid schemas, reproducible setup, and no mandatory network dependencies.

## Stage 1 — Hierarchical context

Implement:

- Repository scanning.
- Tiny root indexes.
- Project indexes.
- Context routing.
- Budget validation.
- Context explanation.

**Acceptance:** Twenty-project fixture routes correctly, generated indexes remain within configured limits, unrelated project context is excluded, and existing user files are preserved.

## Stage 2 — Portable skills

Implement:

- Canonical skill registry.
- Skill validator.
- Claude Code adapter.
- Codex adapter.
- OpenCode adapter.
- Safe installation and removal.

**Acceptance:** Four initial skills validate, adapters generate correct artifacts, real harness discovery is demonstrated where available, and installation is idempotent.

## Stage 3 — Workflow engine

Implement:

- YAML parser.
- Versioned schemas.
- Graph validator.
- Deterministic execution.
- Mermaid renderer.
- Checkpoints.
- Run tracing.

**Acceptance:** Golden routing tests pass, invalid graphs are rejected, visualization matches execution, and dry runs cannot mutate external state.

## Stage 4 — PR review

Implement:

- Diff analysis.
- Stack detection.
- Relevant validations.
- Terraform review.
- Structured findings.
- Review modes.

**Acceptance:** Known defects are identified, clean fixtures avoid unsupported findings, command outcomes are accurately reported, and no unauthorized mutation occurs.

## Stage 5 — Incident triage

Implement:

- Incident provider interface.
- Synthetic PagerDuty integration.
- Service routing.
- Runbook selection.
- Read-only diagnostics.
- Incident reports.

**Acceptance:** Synthetic P3 incident follows the correct project-specific path, evidence remains traceable, uncertainty is explicit, and production mutations require authorization.

## Stage 6 — Local memory

Implement:

- Markdown records.
- SQLite indexes.
- Relationships.
- Provenance.
- Contradiction detection.
- Expiration.
- Export/import.

**Acceptance:** Memory survives restart, indexes rebuild, scope isolation works, and sensitive data is filtered.

**Release checkpoint: DevOCD v0.1**

A complete offline engineering toolkit with real context routing, portable skills, executable workflows, PR review, incident triage and persistent local memory.

## Stage 7 — Hosted graph

Implement:

- Organization and workspace model.
- Authentication.
- Tenant authorization.
- Hosted knowledge graph.
- Synchronization.
- Audit history.
- Backup and recovery.

**Acceptance:** Authorized users synchronize correctly, conflicts are handled, local offline functionality remains available, and tenant isolation tests pass.

## Stage 8 — Web dashboard

Implement:

- Project explorer.
- Workflow editor.
- Knowledge graph.
- Skill registry.
- Memory explorer.
- Trace timeline.
- Approvals.
- Administrative interface.

**Acceptance:** Users can edit and publish valid workflows, inspect memory and runs, export canonical YAML, and access only authorized resources.

**Release checkpoint: DevOCD v0.2**

Optional hosted collaboration, knowledge graph, and complete workflow management dashboard.

## Stage 9 — Multi-agent orchestration

Implement:

- Agent contracts.
- Coordinator.
- Worker scheduling.
- Concurrent tasks.
- Isolation.
- Artifact handoffs.
- Permissions.
- Budgets.
- Failure recovery.

**Acceptance:** Three-agent PR review works, concurrent tasks respect dependencies, file conflicts are prevented, and approval gates remain effective.

## Stage 10 — Evaluations and security

Implement:

- Adversarial tests.
- Prompt-injection tests.
- Permission tests.
- Cross-harness tests.
- Memory isolation tests.
- Swarm evaluations.
- Performance benchmarks.
- Threat model.

**Acceptance:** All release-blocking security tests pass, no known critical/high-severity security issue remains unresolved, and benchmark claims are supported by measurements.

## Stage 11 — Marketplace release

Implement:

- CLI packaging.
- Plugin manifests.
- Marketplace metadata.
- Documentation.
- Release automation.
- Upgrade and rollback tests.
- Licensing.
- Security disclosure process.

**Acceptance:** Clean installation works for advertised platforms, release artifacts are reproducible, and the public documentation accurately reflects implemented capabilities.

**Release checkpoint: DevOCD v1.0**

Production release candidate with documented compatibility, security, distribution and evaluation evidence.

---

# 23. TESTING STRATEGY

Create automated tests for each subsystem.

### Core unit tests

- Configuration parsing.
- Schema validation.
- Context routing.
- Graph traversal.
- Token budgets.
- Memory deduplication.
- Permission evaluation.
- Workflow state transitions.

### Integration tests

- Repository initialization.
- Skill installation.
- Workflow execution.
- Memory persistence.
- Harness adapter generation.
- CLI commands.
- Hosted synchronization.
- Dashboard interactions.
- Agent orchestration.

### Security tests

- Path traversal.
- Symlink escape.
- Command injection.
- Malicious YAML.
- Prompt injection.
- Untrusted skill installation.
- Secret leakage.
- Unauthorized tool execution.
- Tenant data leakage.
- Cross-project memory access.

### Evaluation scenarios

Include at least:

1. TypeScript PR review.
2. Java test selection.
3. Terraform formatting failure.
4. Terraform privilege escalation risk.
5. PagerDuty P3 investigation.
6. Unknown service.
7. Ambiguous project.
8. Missing skill.
9. Broken workflow.
10. Stale memory.
11. Conflicting engineering decisions.
12. Malicious incident payload.
13. Missing tool.
14. Insufficient permissions.
15. Multi-repository routing.
16. Interrupted workflow.
17. Failed diagnostic command.
18. Production mutation request.
19. Multi-agent task conflict.
20. Agent cancellation.
21. Hosted sync conflict.
22. Unauthorized tenant query.
23. Visual workflow round-trip.
24. CLI reinstall and rollback.

For each evaluation, define the expected route, allowed actions, output and failure behavior.

---

# 24. PERFORMANCE AND QUALITY REQUIREMENTS

Measure:

- CLI startup time.
- Project scanning time.
- Graph parsing time.
- Context routing latency.
- Memory search latency.
- Dashboard interaction performance.
- Hosted synchronization latency.
- Workflow execution overhead.
- Agent orchestration overhead.
- Context usage.
- Resource consumption.

Use reproducible fixtures.

Set performance budgets using measured baselines.

Do not advertise performance improvements without evidence.

Prioritize:

1. Correctness.
2. Security.
3. Predictability.
4. Compatibility.
5. Simplicity.
6. Performance.
7. Advanced functionality.

---

# 25. LICENSING AND COMMERCIALIZATION

DevOCD is intended to support public adoption and future commercial offerings.

Evaluate:

### Option A — Open-source core

Use an established open-source license such as Apache-2.0.

Commercial offerings can include:

- Hosted graph synchronization.
- Team administration.
- Enterprise policy management.
- Organization-wide analytics.
- Managed orchestration.
- Support and service agreements.

### Option B — Source-available with commercial licensing

Allow specified personal or noncommercial uses.

Require a separate commercial license for covered commercial use.

Do not describe a noncommercial license as OSI-approved open source.

### Required actions

- Compare license alternatives.
- Document contributor rights.
- Check dependency licenses.
- Verify marketplace requirements.
- Clarify cloud-service licensing.
- Obtain appropriate legal review.
- Finalize a license before public distribution.

Also verify DevOCD name availability across relevant trademark databases, package registries, GitHub organizations, and domains.

Do not assume name availability from an inconclusive search.

---

# 26. MARKETPLACE DISTRIBUTION

Prepare DevOCD for:

- GitHub.
- npm.
- Claude Code plugin marketplace where supported.
- Codex skill distribution.
- OpenCode-supported plugin and skill mechanisms.
- Compatible Agent Skills registries.

Verify each distribution format from current official documentation.

Do not assume one package works natively in every marketplace.

### Documentation requirements

Create:

- README.
- Five-minute quickstart.
- Architecture documentation.
- Compatibility matrix.
- Skill authoring guide.
- Workflow authoring guide.
- Memory model.
- Dashboard guide.
- Orchestration guide.
- CLI reference.
- Security model.
- Contributor guide.
- Troubleshooting guide.
- Release procedure.
- Changelog.

Provide functional example repositories.

---

# 27. REQUIRED END-TO-END DEMONSTRATIONS

Before declaring DevOCD production-ready, demonstrate:

### Demo A — Context routing

A user asks for a change to Project Three.

DevOCD locates the project and loads only relevant context.

### Demo B — Portable skill

The same canonical PR-review skill is installed and discovered through Claude Code, Codex and OpenCode.

### Demo C — Workflow execution

A YAML workflow is validated, rendered into Mermaid and executed against deterministic fixtures.

### Demo D — PR review

DevOCD detects relevant code issues, runs permitted checks and produces a report with evidence.

### Demo E — PagerDuty incident

A synthetic incident follows the correct project, incident category, workflow and diagnostic skill.

### Demo F — Persistent memory

An approved engineering decision survives process restart and is retrieved with provenance.

### Demo G — Hosted graph

Two authorized team members synchronize engineering knowledge without losing local offline support.

### Demo H — Dashboard

A user creates a workflow visually, validates it, exports YAML, and runs it.

### Demo I — Agent swarm

Three specialized agents review a change concurrently, respect permissions, and produce one consolidated report.

### Demo J — Security

Adversarial test cases demonstrate that untrusted instructions cannot bypass execution policies.

Each demonstration must include actual results, limitations and evidence of verification.

---

# 28. IMPLEMENTATION DISCIPLINE

For every implementation stage:

1. Identify the exact scope.
2. Confirm dependencies are satisfied.
3. Define interfaces and schemas.
4. Write acceptance tests.
5. Implement the smallest working vertical slice.
6. Run tests.
7. Fix observed defects.
8. Review security implications.
9. Document architectural decisions.
10. Record known limitations.
11. Update stage status.
12. Continue only when the stage's required acceptance criteria are met.

Maintain:

- `docs/implementation-plan.md`
- `docs/architecture-decisions.md`
- `docs/known-limitations.md`
- `docs/release-readiness.md`

Do not mark a stage complete because source files exist.

A feature is complete only after demonstrated behavior satisfies its acceptance criteria.

Do not fabricate benchmark outcomes or test results.

Do not silently omit difficult requirements.

---

# 29. OUTPUT EXPECTATIONS

At every stage provide a concise engineering summary containing:

**Implemented**
- Actual working features.

**Changed**
- Important files and modules.

**Verified**
- Tests executed and results.

**Architecture**
- Key decisions and trade-offs.

**Security**
- Permission changes and relevant risks.

**Limitations**
- Missing capabilities and known defects.

**Next**
- Remaining dependencies and implementation work.

Avoid unnecessary documentation verbosity inside agent-loading files. Detailed documentation belongs in references, not enormous root instruction files.

---

# 30. FINAL PRODUCT DEFINITION

DevOCD is complete when a professional engineer can install it into an existing codebase and:

- Discover the relevant project automatically.
- Load minimal project context.
- Navigate hierarchical instruction indexes.
- Use portable skills across supported coding harnesses.
- Execute validated engineering workflows.
- Visualize workflows as graphs.
- Review pull requests using reproducible checks.
- Investigate incidents using relevant runbooks.
- Preserve approved engineering knowledge across sessions.
- Search related services, incidents and decisions.
- Synchronize permitted knowledge with a hosted team graph.
- Manage workflows through a professional dashboard.
- Coordinate multiple specialized agents.
- Audit execution decisions.
- Enforce tool permissions.
- Measure context consumption and execution quality.

**The system must remain useful even if hosted services and multi-agent orchestration are disabled.**

---

# 31. EXECUTION INSTRUCTIONS

Begin implementation immediately.

**First:**

Inspect the current repository.

**Second:**

Verify the current official specifications and integration requirements.

**Third:**

Create the architectural contracts, research notes, and test foundation.

**Fourth:**

Implement Stages 0 through 3 as a working vertical slice:

Repository discovery → minimal context → workflow selection → skill invocation → validation → execution trace.

**Fifth:**

Implement the PR-review and incident-triage workflows against realistic synthetic fixtures.

**Sixth:**

Add durable local engineering memory.

Only after the local-first MVP is verified should development proceed to hosted graph storage, the dashboard, and multi-agent orchestration.

Implement incrementally and test continuously.

Do not stop at a high-level plan or repository skeleton.

Do not claim incomplete integrations are functional.

Do not perform unauthorized external mutations, deployments, package publications, or repository pushes.

**Primary engineering principle:**

Build DevOCD as a reliable developer infrastructure product that engineers can understand, verify, control, and extend—not an opaque autonomous agent that happens to execute commands.

**Product identity:**

# DevOCD
### Engineering discipline for AI coding agents.

One context system. Portable skills. Verified workflows. Persistent knowledge. Controlled execution.
