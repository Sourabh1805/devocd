# DevOCD eval suite

Scored cases for [`claude plugin eval`](https://code.claude.com/docs/en/plugin-evals)
(Claude Code 2.1.325 or later). They measure whether DevOCD helps on real tasks, and whether
its safeguards hold when the forbidden action is actually possible.

## Layout

- `_tools/cases.mjs` is the only place cases are defined. `node evals/_tools/generate.mjs`
  writes the case folders; `--check` reports drift, and a unit test runs it.
- `_fixture/fixture.sh` builds every workspace from **DevOCD's own repository at the commit in
  `_fixture/PIN`**, which predates `evals/`, so no answer can leak into a run. `devocd` mode adds
  the knowledge snapshot in `_fixture/knowledge/`; `company` mode lays out a company folder with
  the repository as an un-onboarded project; a patch name adds a `feature` branch with one
  known defect (`_fixture/patches/`).
- Generated case folders: `<task>-plain` and `<task>-devocd` pairs, and `safeguard-*` cases.

## Why cases come in pairs

`claude plugin eval` never loads project config (`CLAUDE.md`, `CLAUDE.local.md`, `.claude/`),
so DevOCD's startup pointer and path-scoped notes cannot load inside a run. Each task therefore
runs twice: on the bare repository, and on the repository plus `.devocd/` with the pointer text
added to the system prompt, as a real session would load it. The pair difference measures the
knowledge; `--ablation with-without` additionally measures the plugin's skills and hooks.

## Running

Every run uses the plugin's own scaffold, so pass `--scaffold` and `--trust-plugin` (these
cases are authored here). Results go to `evals/results/` (git-ignored); record the actual
`costUsd` and per-case scores in `docs/release-readiness.md`.

```text
# Lookups: read-only tools, run anywhere (Windows included)
claude plugin eval . --scaffold --trust-plugin --tag lookup --ablation none

# Reviews and safeguards need Bash and write tools to be granted by the operator. Bash needs
# an OS sandbox: Linux, macOS or WSL2 (native Windows has none).
claude plugin eval . --scaffold --trust-plugin --tag needs-bash --ablation none \
  --allow-tools Write Edit "Bash(node *)" "Bash(git *)"
```

Safeguard cases grant the tools that would break them, so a refusal is the skill's decision,
not a missing permission. Each one also checks the skill actually ran.

## Recorded spend

| Run | Spend |
| --- | --- |
| Knowledge snapshot: `/devocd:add-project` on the pinned commit, sonnet, 78 turns | $3.21 |
| Smoke check: 16 lookup and synthesis cases, haiku, 1 run each, `--ablation none` | $0.10 |

The smoke check proves the suite runs; it is not a measurement (T94 runs 3 runs per case).

## Refreshing the knowledge snapshot

The snapshot is the output of `/devocd:add-project` on the pinned commit. When `PIN` moves,
regenerate it (one paid run), replace `_fixture/knowledge/`, then run `generate.mjs` so the
devocd cases carry the new pointer.
