# Build decisions

These are the calls made while building DevOCD, where the spec and plan didn't settle something. Each row says what was decided and what it costs if the decision turns out wrong. The IDs (R1-R58) match the build log; the log itself was a temporary working file.

Where a row and the spec disagree, the spec wins, unless the row explains why it changed.

## What users see

| ID | Decision | Cost if wrong |
| --- | --- | --- |
| R2 | The parent block's order is heading, one line about the company, Key rules, Projects, Guidance, so key rules survive when the project list overflows. | A small template change. |
| R5 | Backups copy `.devocd/` (without old backups) and `CLAUDE.local.md`, plus the company `CLAUDE.md` in a company folder. Never a repo's team `CLAUDE.md`. | One more file in a backup. |
| R6 | `.devocd/projects.md` may pass the 200-line reference limit, so 200 projects fit. `check` still counts it. | A long list costs tokens, but only when read. |
| R7 | `check <dir>` covers that folder's block and its `.devocd/`, not child projects. Limits and the `@import` rule apply to DevOCD's text, not the user's text outside the block. | A check misses or over-reports in an edge layout. |
| R12, R45 | Undoing the personal split means removing the team file from `claudeMdExcludes`, or rerunning add-project. The README gives plain steps. | A wording change. |
| R17 | Removing the last DevOCD setting deletes an empty `settings.local.json`, even a user's own `{}`. | An empty file disappears, with no change in behaviour. |
| R18 | A leading `@` is removed from names, descriptions and key rules, so they can't act as imports. A project path starting with `@` gets `./` in front. | A rare path with ` @` inside fails `check` and must be moved. |
| R19 | Empty sections show "none recorded yet" rather than nothing, because an empty heading reads as broken to an agent. | A bullet count is off by one. |
| R22 | add-project always writes the AGENTS.md pointer when a repo has `AGENTS.md`, because its own `CLAUDE.local.md` turns AGENTS.md off. | One unneeded line in the pointer. |
| R24, R27 | The helper gained `preflight` (read-only checks) and `render-parent` with a draft. A draft must be named `*.draft.json`, and it's applied only if it's valid and fits. | One filename rule to relax. |
| R28 | `install` in the home folder warns and stops, because the parent file would load in every project on the machine. | A user who wants home must use a subfolder. |
| R30 | A rerun of `install` keeps the registered projects and ignores any in the draft. Projects belong to add-project. | `install` can't remove a project. |
| R32, R35 | `preflight` also reports where the company folder is, and the team files with their hashes, because the agent has no shell to work these out. | A field to move elsewhere. |
| R36 | `.devocd/pointer.md` stays as the source of the `CLAUDE.local.md` block, so reruns have a stable input. | One small duplicate file per project. |
| R42 | The personal split is chosen with a `personalSplit` answer. The team file is excluded with an absolute forward-slash path, and state records `excluded: true` only after that succeeds. | A field rename. |
| R44 | The helper, not the agent, copies the team file into `.devocd/team/`, byte for byte. It refuses if any line would be left out. | One more helper command to maintain. |
| R46 | Only a team `CLAUDE.md` is offered the split, not `.claude/CLAUDE.md` or `AGENTS.md`. This is listed as a known limitation. | A small later extension. |
| R49 | `pr-review` reads the branch diff only through the helper's read-only `review-diff`. The open `git diff` permission is gone, because it could write files (`--output`) or read outside the repo (`--no-index`). | One more helper command. |
| R51 | With no base branch given, a review compares with `origin/HEAD`'s branch, then `main`, then `master`, and otherwise says it couldn't run. A pushed branch's own upstream is never used. | A one-line reorder. |
| R52 | The always-on cost is held to 100 estimated tokens, as counted by `claude plugin details`, which counts all four skills. The descriptions were shortened to fit. | Descriptions slightly terser than needed. |
| R56 | After the final review: `protect` checks with git that the files really are ignored. The helper's `write-block` and `settings` accept only DevOCD's own targets. `install` lists its five commands instead of a wildcard. `add-project` keeps its wildcard, relying on those helper checks. | A live regression, caught by the full run. |

## Tests and measurement

| ID | Decision | Cost if wrong |
| --- | --- | --- |
| R10 | Read-only connector use is checked from the skill text and the event stream. No real connector was tested, so the owner's trial is the first real use. | A connector write could slip through until a real connector is tried. The skill text still forbids it. |
| R13 | The plugin validator tolerates only the missing license and icon, which wait for the marketing step. | A future validator finding could be missed. |
| R14 | Size limits count the lines inside a block, not the two marker lines. | A limit is off by two lines. |
| R15, R16 | Several review findings that broke the global rules were fixed at once: non-UTF-8 bytes, writes through linked folders, tracked settings files, and half-finished restores. | A little extra work. |
| R21 | Unit tests cover the live-test helper's event parsing and its cost cap, and one live test proves reads are detected. | One small extra test file. |
| R23 | The two AGENTS.md cases that hadn't been tried got real runs. | A few cents. |
| R25 | The home-folder warning is tested with a unit test and the skill text, not a live run that would touch the owner's real config. | Caught only by the static check and the owner's trial. |
| R26 | With an approved answers file, a test asserts that the draft's findings are shown. It records, but doesn't assert, whether the draft came before the writes. | A scripted run may show the draft after writing. The owner's trial checks the interactive order. |
| R31 | Known limitations note that under `claude -p`, a source outside the working folder needs a read grant. | One line to remove. |
| R33 | One live check confirmed that a project session can read the company standards after opting in, with a control run without it. | About $0.05. |
| R34 | add-project's live tests build the company with the helper, not a live install. | A handoff bug shows only in the full run. |
| R38, R39 | Tests that could pass on a run that did nothing were tightened. The source-path fault in add-project was fixed with a worked example. | About $1 more live spend. |
| R40 | install's matching source-path weakness was fixed in the final fix batch (I-7). | Fixed. |
| R53 | Routing tests assert the right project's index was read, the answer was right, and no search covered the whole company folder. | One wording iteration. |
| R54 | The key-rule test asks the agent to follow the company standards, so it tries the blocked read. It must still use whole cents in at least 2 of 3 runs. | About $0.30 more live spend. |

## Build process, budgets and internal interfaces

| ID | Decision | Cost if wrong |
| --- | --- | --- |
| R1 | Work happened on `feat/skills` in the new repo, with no separate worktree. | Nothing; there was no other work. |
| R3, R4, R8, R9, R11, R20 | Interfaces were fixed early so tasks could build on each other: the state shapes, `renderParent`'s return, `runClaude`'s options, the answers-file fields, and where saved fixtures live. | A rename across a few files. |
| R29 | From Task 6 on, each task aimed for under $5 of live spend and stopped before $10. | A task needs a second dispatch. |
| R37 | add-project's entry was full, so the split's wording went into a reference file. | Some wording to trim. |
| R41, R47, R50 | Some tasks and fixes used cheaper models, or fresh agents instead of resumed ones, to save cost and context. | One more fix round. |
| R43 | Task 8's budget was an aim of $12 and a stop at $15, because the plan needs three runs per PR-review case. | About $10 of extra spend. It actually used about $6.40. |
| R48, R58 | A few tiny fixes were checked or made by the controller instead of a new reviewer. | The final review would catch it. |
| R55, R57 | Task 10's order: docs, the owner's trial (not blocking), final review and fixes, push and CI, then the full live run. | Trial feedback needs one more small fix. |

## After the full live run

| ID | Decision | Cost if wrong |
| --- | --- | --- |
| R59 | Runs where `claude` exited at once with no message were treated as a temporary service fault and rerun. The spend total counts real cost, since those runs are charged their whole budget by the ledger. | Real spend a few dollars higher than counted. |
| R60 | `install` recognises a rerun from `preflight`'s new `state` field, not by the agent looking for files. | A field to remove. |
| R61 | The routing key-rule test names the standards file in its prompt, so the blocked read always happens. | The test no longer shows whether an agent would look for the standards unprompted, which it never claimed. |
| R62 | When key rules don't fit, `render-parent` prints them all, numbered. The agent's reply still listed all 40 in only 1 of 4 runs, so this is a known limitation. | A user reads the list in the helper's output instead of the reply. |
