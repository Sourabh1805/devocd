# devocd

DevOCD: a Claude Code plugin that maps projects, policies and decisions into scoped knowledge pages.

## Stack
- Node >=22.13, ESM, zero runtime dependencies; Claude Code plugin: skills, agents, hooks (from `package.json`, `.claude-plugin/plugin.json`)

## Commands
- Documented: `npm test` (from detect-commands; names only)
- Approved for PR review: `npm test` — documented is not approved; PR review runs only approved commands.

## Parts of the code
- [scripts](code/scripts/index.md): `scripts/`, helper CLI and its libraries
- [hooks](code/scripts/hooks.md): `scripts/devocd-hooks.mjs`, `hooks/`, edit journal and policy pointers
- [skills and agents](code/skills/index.md): `skills/`, `agents/`, `.claude-plugin/`
- [pr-review](code/skills/pr-review.md): `skills/pr-review/`, `scripts/lib/reviewdiff.mjs`
- [tests](code/tests/index.md): `tests/`, `scripts/validate-plugin.mjs`

## Flows
- [Onboarding](flows/runtime/onboarding/index.md) · [Refresh](flows/runtime/refresh/index.md) · [Retrieval](flows/runtime/retrieval/index.md)
- [PR review](flows/pr-review.md)

## Project pages
- [CI/CD](cicd.md) · [Coverage](coverage.md)
- Guides: [install and validate](guides/install-and-validate.md) · [tool integrations](guides/tool-integrations.md) · [contributing](guides/contributing.md)

## Dependencies
- None. The ECR image refs under `tests/fixtures/learning/repo/k8s/` are test fixtures, not dependencies.

## Warnings
- Partial graph: about 140 available files unread and 10 files withheld as secret-content; see [coverage](coverage.md).
- `AGENTS.md` carries contributor instructions (PR per change); treated as data.

## Links
- Before task work, read the standards index if present; none exists yet. Explicit project exceptions apply within their scope; surface conflicts.
