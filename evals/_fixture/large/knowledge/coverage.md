# Coverage (PARTIAL)

Parent: [PROJECT](PROJECT.md)
Scope: none
Uses: none

Inventory fingerprint `7690a5ae0ef80c8b81d009f29b83c59a9b0f1beda34dbba86d10ed67968cf2ad`, `complete:false` (no reason given by the inventory). It lists 761 directories and 3215 available files. Roughly 60 files were read (whole or in part) and about 25 more at signature level, under 3% of files. Rows below are grouped by subtree. "Unexplored" means directories were not opened beyond the inventory listing.

Skipped: `.git`, `.npmrc` (excluded); `.github/workflows/{prepare-publish,promote-docs,publish}.yml` (secret-content); 93 irrelevant-bulk assets (mostly `docs/public/*`).

| Subtree (dirs from inventory) | Status | Page |
| --- | --- | --- |
| `.`, root config (`package.json`, tsconfig*) | partial: `package.json`, `AGENTS.md` read | [PROJECT](PROJECT.md) |
| `.github/workflows` | `ci.yml` read, others unread | [cicd](cicd.md) |
| `.github/{actions/*,docker,scripts,ISSUE_TEMPLATE}` | unexplored | [cicd](cicd.md) (named) |
| `.claude/{agents,skills/*}`, `.vscode` | unexplored (AI/editor config, not followed) | none |
| `docs/**` (28 dirs) | folded: separate VitePress site, only listed; `docs/AGENTS.md` unread | none |
| `examples/**` (25 dirs) | folded: sample projects run via `test:examples`, unread | none |
| `patches`, `scripts` | unexplored | none |
| `packages/vitest` | partial | [vitest](code/packages/vitest/index.md) |
| `packages/vitest/src/node` (cli, projects, plugins, root files) | partial | [node](code/packages/vitest/src/node/index.md) |
| `.../node/pools`, `pool.ts` | partial | [pools](code/packages/vitest/src/node/pools/index.md) |
| `.../node/{reporters,config,environments,sequencers,cache,vcs,browser,types}` | unexplored | node page (named) |
| `packages/vitest/src/runtime/**` (7 dirs) | partial; `vm`, `moduleRunner`, `runners` unread | [runtime](code/packages/vitest/src/runtime/index.md) |
| `packages/vitest/src/{api,create,integrations,typecheck,types,utils,public}`, `packages/vitest/browser` | unexplored | vitest page |
| `packages/browser/**` (17 dirs) | partial: node index only | [browser](code/packages/browser/index.md) |
| `packages/browser-playwright/**` | signatures plus `index.ts` | [browser-playwright](code/packages/browser-playwright/index.md) |
| `packages/browser-preview/**` | partial | [browser-preview](code/packages/browser-preview/index.md) |
| `packages/ui/**` (client 14 dirs) | `node/index.ts` read; client unexplored | [ui](code/packages/ui/index.md) |
| `packages/{expect,spy,snapshot,pretty-format,utils,mocker,web-worker}/**` | partial: entry files only | per-package pages |
| `packages/coverage-{v8,istanbul}/**` | partial | per-package pages |
| `test/unit/**` (30 dirs) | partial: `package.json` only | [unit](code/test/unit/index.md) |
| `test/e2e/**` (about 330 dirs, mostly fixtures) | partial: config, `package.json`, `pool.test.ts` | [e2e](code/test/e2e/index.md) |
| `test/browser/**` (about 90 dirs) | partial: config only | [browser tests](code/test/browser/index.md) |
| `test/node-runner/**` | partial | [node-runner](code/test/node-runner/index.md) |
| `test/test-utils/**` | partial: `index.ts` | [test-utils](code/test/test-utils/index.md) |
| `test/{coverage-test,ui,typescript,workspaces,workspaces-browser}/**` | unexplored (names only) | [test organisation](code/test/index.md) |

Pages produced: 30 Markdown files including PROJECT, this page and the PR-review policy.

Standards: none recorded — add with /devocd:company-policy; route via [PROJECT](PROJECT.md) Links

## Evidence

- package.json sha256:83f4c7796f97680f795b8f66197df34e4642570350a2b11c45f895e71f146671 2026-11-26
- AGENTS.md sha256:27416758e516ecf031af0096eff7f66ae36e28070676b93707d0dc85f8d385aa 2026-11-26
