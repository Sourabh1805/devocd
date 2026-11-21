# onboarding-helpers

Parent: [scripts](../index.md)
Scope: scripts/lib/{parent,preflight,projects,commands,deps,artifacts,integrations}.mjs
Uses: none

Company registry and parent-file rendering, plus the read-only discovery that add-project feeds into the knowledge drafts.

- Entry points: `scripts/lib/preflight.mjs:87` (`preflight`), `scripts/lib/parent.mjs:233` (`registerProject`), `:173` (`writeParent`), `:202` (`applyDraft`), `scripts/lib/commands.mjs:28` (`detectCommands`), `scripts/lib/deps.mjs:29` (`detectDependencies`) and `:184` (`resolveProjectLinks`), `scripts/lib/artifacts.mjs:75`, `scripts/lib/projects.mjs:11`, `scripts/lib/integrations.mjs:92` (`integrateProject`)
- Public surface: CLI `preflight`, `register`, `render-parent`, `detect-commands`, `detect-dependencies`, `link-projects`, `discover-projects`, `integrate`. Consumed by [Onboarding](../../../flows/runtime/onboarding/index.md).
- Run/test this part: `npm test` (documented, not approved for PR review); covering tests `tests/unit/parent.test.mjs`, `parent-draft.test.mjs`, `parent-safety.test.mjs`, `preflight.test.mjs`, `commands.test.mjs`, `deps.test.mjs`, `cross-project-links.test.mjs`, `integrations.test.mjs`, `projects.test.mjs` (names only, not read). `artifacts.test.mjs` is withheld by the inventory.
- To add a documented-command source: extend `detectCommands` (`commands.mjs:35-59`); only names matching `SAFE_BASE` (test, lint, typecheck, check, format) are returned, never script bodies. To add a dependency kind: extend `detectDependencies` (`deps.mjs:40-108`). To add a host integration: `HOSTS`/`names` logic in `integrations.mjs:92-104`.
- Pitfalls:
  - Parent block limits: 60 lines/500 tokens, key rules 300 tokens; over-long project lists move to `.devocd/projects.md` (`parent.mjs:114-136`). `sanitizeLine` strips comments, markers, links and `@` (`:27-45`).
  - `applyDraft` replaces `projects` from existing state, so a draft cannot add or drop projects; the draft file is deleted either way (`:183-223`).
  - Project ids must match `^[a-z0-9]+(-[a-z0-9]+)*$`, at most 64 chars (`:10-52`); registered paths must stay inside the company folder (`:238-241`).
  - `preflight` picks `CLAUDE.local.md` as parent file inside a git work tree, else `CLAUDE.md` (`preflight.mjs:92`); AGENTS.md search is 4 levels deep.
  - `link-projects` matches git deps by repository name only, not remote URL (`deps.mjs:157-159`).
  - `integrate` previews by default and `--apply` may edit tracked instruction files (`integrations.mjs:91`). It copies `scripts/` into `.devocd/runtime` (`:106-108`).
  - Artifact detection drops any ref that scans as a secret and strips credentials (`artifacts.mjs:81-83`).

Standards: none recorded — add with /devocd:company-policy

## Evidence

- scripts/lib/preflight.mjs#L1-98 sha256:09a3d874797f7562fd09789b224b7dc3bae69665fec8ea43e4e1010868383ef5 2026-11-20
- scripts/lib/parent.mjs#L10-248 sha256:f2b243b254b2b4cd2050a2ec05bf341e2cd874db45ea15cb9c012f94d535f278 2026-11-20
- scripts/lib/commands.mjs#L1-66 sha256:2836fb7af59f793990516c65e7a8f841b98b8b67b6f6bbc603e7e6cc389863ba 2026-11-20
- scripts/lib/deps.mjs#L1-230 sha256:30bc9bb75e3b014747836e6dd1b025bdfe4db6bab80c618ecd455f8931e848e8 2026-11-20
- scripts/lib/artifacts.mjs#L1-100 sha256:f61465369ad9cc02708a6cdfd23feef2f26ba62e9d8ac1dd65e478a076545eb5 2026-11-20
- scripts/lib/projects.mjs#L1-27 sha256:52fc366663d84b36413d07e9ec1fb580aef29278dc54741c18e6c95f2de8a70b 2026-11-20
- scripts/lib/integrations.mjs#L1-130 sha256:8aad53226a8970d60e6056a51a72fcae553d070dfda1bdf7cc6d3861acc75aab 2026-11-20
