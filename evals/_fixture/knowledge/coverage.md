# Coverage

Parent: [PROJECT](PROJECT.md)

Inventory fingerprint `363b05a12dd2bdbf0d38301cf0c47cdfc4e1d2d20b659abcc7fff7b3286e240a`, `complete: true`, 2026-11-20.
Totals: 80 directories, all mapped or folded; 222 available files, about 82 read (some partially); 13 skipped entries.
Result: a partial graph. This is not a claim of complete coverage.

## Skipped by the inventory
- `.git` (excluded); `tests/fixtures/learning/company` (ignored-or-empty); `.claude-plugin/icon.png` (skipped bulk).
- Withheld as secret-content, not read, no evidence cited: `docs/superpowers/plans/2026-11-06-devocd-skills.md`, `tests/e2e/install.test.mjs`, `tests/e2e/pr-review.test.mjs`, `tests/fixtures/diffs/planted/worktree/src/config.js`, `tests/fixtures/sources/security-policy.md`, `tests/unit/artifacts.test.mjs`, `proposal.test.mjs`, `rules.test.mjs`, `secrets.test.mjs`, `trace.test.mjs`. Their secret kinds are unknown because they were not read.

## Directories
| Directory | Page or decision |
| --- | --- |
| `.` | [PROJECT](PROJECT.md); root files read: `package.json`, `README.md`, `AGENTS.md`, `SECURITY.md`; unread: `.gitattributes`, `.gitignore`, `LICENSE` |
| `.claude-plugin` | [skills](code/skills/index.md); `plugin.json` read, `marketplace.json` unread |
| `.github`, `.github/workflows` | [cicd](cicd.md); `ci.yml` read |
| `.github/ISSUE_TEMPLATE` | unread (`feature_request.md`); folded, not CI |
| `agents` | [skills](code/skills/index.md); all three read |
| `bin` | [cli](code/scripts/cli.md); `devocd` read, `devocd.cmd` and `package.json` unread |
| `docs` | guides: [install](guides/install-and-validate.md), [integrations](guides/tool-integrations.md), [contributing](guides/contributing.md); read: README, repo-memory, known-limitations, TASKS, deterministic-foundation, tool-integrations (heads) |
| `docs/archive`, `docs/evidence`, `docs/research`, `docs/superpowers`, `docs/superpowers/plans`, `docs/superpowers/specs` | unexplored: historical or evidence files, unread |
| `hooks` | [hooks](code/scripts/hooks.md) |
| `references`, `references/orchestration` | [canonical-context](code/scripts/lib/canonical-context.md) for `context-model.md`; `orchestration/*` unread |
| `scripts`, `scripts/lib` | [scripts](code/scripts/index.md) and its six lib pages; all 38 lib files and 4 top-level scripts read, several partially |
| `skills` and each `skills/*` and `*/references` | [skills](code/skills/index.md), [pr-review](code/skills/pr-review.md); SKILL.md files all read; references read: knowledge-contract, project-template, flow-template, capture/workflow, refresh/incremental, pr-review/knowledge; unread: the other references (interview, personal-split, operations-template, context-workflow, company-policy, install, setup, pr-review stack files) |
| `tests`, `tests/e2e`, `tests/helpers`, `tests/unit` | [tests](code/tests/index.md); only the files cited there were read |
| `tests/fixtures` and all subfolders (`answers`, `diffs/**`, `generated/api/**`, `learning/**`, `sources`) | folded into [tests](code/tests/index.md): fixture data, not project code; only `learning/expected.json` read |

## Unread source and docs (gaps)
- Unread: about 140 of the available files: most of `docs/` (plan, build-decisions, claims, decision-capture-review, knowledge-builder-design, learning-eval, release-readiness, v1-launch, archive/*, research, evidence JSON, specs), `references/orchestration/*`, most skill references, all but 6 unit tests, most fixtures, `.gitattributes`, `.gitignore`, `LICENSE`, `bin/devocd.cmd`, `bin/package.json`, `.claude-plugin/marketplace.json`.
- Partial reads: `deps.mjs` (to line 230), `parent.mjs` (270), `claims.mjs` (140), `proposal.mjs` (100), `integrations.mjs` (130), `split.mjs` (70), `artifacts.mjs` (100), `redundancy.mjs` (60), `knowledge-view.mjs` (40), `context-schema.mjs` (60), `context-resolver.mjs` (80), `context-adapters.mjs` (50), `context-refresh.mjs` (50).
- Test counts per file were taken with a search over `tests/`, which also touched withheld test files (counts only, no content read).
- Reads came from the plugin-root checkout; 23 function line anchors were confirmed in the project root, but byte-equality is unverified.
- No `history.md` was produced: the repo has no CHANGELOG or release tags in the files read.

## Evidence

- skills/add-project/references/knowledge-contract.md#L16-92 sha256:541e16fc091db9d05e3d8afd061f697c7b65b2912af55f0f2806f533295d7b05 2026-11-20
