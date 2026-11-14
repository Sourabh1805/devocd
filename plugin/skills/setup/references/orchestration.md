# Setup orchestration: one upfront round, answers handoff, --yes

Setup asks everything it can up front, hands the answers to the install and
add-project skills as answers files, and leaves exactly one approval question
per write unit: one for the company, one per project draft.

## The one upfront round

After `discover-projects`, derive defaults (company name = folder name; a
description from a README or the visible project folders) and ask
ONE AskUserQuestion call, up to four questions, each with a recommended option:

1. Projects — a multi-select of the discovered candidates (all recommended).
   Show exclusions and reasons beneath.
2. Folder kind — "Personal workspace" (recommended) / "Company — I have policy
   sources now" / "Company — add policies later". Skip this question on a rerun
   when valid company state already exists.
3. Tool integration — "Claude only" (recommended) / "also Codex" /
   "also Antigravity" / "all". This replaces any post-setup integration question;
   `integrations.md` keeps the preview/apply mechanics only.
4. Mode — "Fast: accept derived ids, descriptions and detected commands; I review
   one draft per unit" (recommended) / "Ask me per project" (each add-project then
   runs its own batched round).

A follow-up question is asked only when an answer requires it (a source list for
"policy sources now"; new text for a changed name).

## Answers handoff

Echo the collected choices, then write them without an `approval` field — the
per-unit draft approval is never pre-answered:

- `.devocd/setup/answers/install.json`: `{ "name", "description", "sources" }`.
- `.devocd/setup/answers/<id>.json` per selected project in Fast mode:
  `{ "projectId", "description", "useSuggestedCommands": true, "additionalDirectories": false, "sources": [] }`.
  Setup never names or grants commands itself: add-project runs `detect-commands`,
  and its draft summary lists the proposed approved command names, so the
  per-project draft approval is what covers them.

Invoke `devocd:install .devocd/setup/answers/install.json`, then per project
`devocd:add-project <path> .devocd/setup/answers/<id>.json`. Each skill shows its
draft and asks its one approval question (an answers file without an `approval`
field asks interactively instead of stopping). In "Ask me per project" mode,
write no per-project answers files.

Expected interactions for N projects: 1 upfront round + 1 install approval +
N project approvals. Leave the handoff files in place afterwards: they sit under
`.devocd/`, which protect keeps out of git, and a rerun resumes from the same
choices instead of asking again.

## --yes

`--yes` (as in `/devocd:setup --all --yes`) implies Fast mode and accepts every
derived default without the Mode question. It never writes `"approval": "approved"`
into a handoff file and never skips a draft: the per-unit approval questions
remain the only gate. Truly unattended runs use user-authored answers files that carry
`approval` themselves, invoked per skill; setup never fabricates approval.

## Reruns

Valid company state: reuse it; skip question 2. A project already registered and
unchanged (its `refresh-status` says current): report it as kept, don't re-run
add-project unless the user selected it. Report completed, failed and skipped
units separately.
