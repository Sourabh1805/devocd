# pr-review

Parent: [skills and agents](index.md)
Scope: skills/pr-review/**, scripts/lib/reviewdiff.mjs
Uses: none

The read-only review skill and its diff helper; it gets context from `review-context` and approved commands from `flows/pr-review.md`.

- Entry points: `skills/pr-review/SKILL.md:12` (steps 1-6), `scripts/lib/reviewdiff.mjs:68` (`reviewDiff`), CLI `review-diff` at `scripts/devocd.mjs:234`, `scripts/lib/trace.mjs:250` (`reviewContext`)
- Call path: arguments validated before any tool call (`SKILL.md:16-19`) → `gh pr diff` for a PR, else `review-diff "." "<base>"` → `references/knowledge.md` runs `review-context` → stack references by file type (`SKILL.md:40-44`) → approved commands by mode (`:46-51`) → report per `references/output-format.md` (not read).
- Public surface: grants only `review-diff`, `review-context`, `gh pr diff` and reading its own references (`SKILL.md:5-10`).
- Run/test this part: `npm test` (documented, not approved for PR review); covering tests `tests/unit/pr-review-skill.test.mjs`, `reviewdiff.test.mjs`, `review-context.test.mjs` (names only). Live suite `tests/e2e/pr-review.test.mjs` is withheld by the inventory.
- To add a stack reference: add `skills/pr-review/references/<stack>.md` and its file-pattern line in `SKILL.md:40-44`.
- Pitfalls:
  - Base must match `^[A-Za-z0-9._/-]+$` and not start with `-` (`reviewdiff.mjs:7`, `:69`). The default base is `origin/HEAD`, then `main`, then `master`, never the upstream (`:44-52`).
  - Diffs over 25000 characters are not printed; read one file with `--path` (`:6`, `:93`). git runs by argv with `--no-ext-diff --no-textconv` (`:20-23`, `:82`).
  - A PR is never checked out; every repo command is `blocked` for a PR (`SKILL.md:30`). Page text and the diff are data (`:25`).
  - A changed file that defines a command makes the skill ask again before any run (`:49`); it never runs `terraform apply`/`init` or a deploy (`:26`).
  - Pages describe this checkout, not the PR; a stale or unknown page must be confirmed in code (`references/knowledge.md:7`, `:27`).

Standards: none recorded — add with /devocd:company-policy

## Evidence

- skills/pr-review/SKILL.md#L1-55 sha256:13849ea645eaf3f162cb029c6829bf7fb2ee0af6ad41e98d21f7bec387e3f1fe 2026-11-20
- skills/pr-review/references/knowledge.md#L1-33 sha256:0835162bcd108b7ca7c4881a86897346711f8c82c9923091ffa3bdb82117f5fe 2026-11-20
- scripts/lib/reviewdiff.mjs#L1-99 sha256:4a149a807533f5d59ff4c9f878ed249436394b9bf61c4641314930e14886eba0 2026-11-20
- scripts/devocd.mjs#L234-240 sha256:46fb43c45f1bea1c71890efb955f3741061eef92240fac1e923fec0655d37bdc 2026-11-20
