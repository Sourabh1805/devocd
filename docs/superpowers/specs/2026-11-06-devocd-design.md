# DevOCD design

## Context

`D:\work\DevOCD` is empty and not a git repo. The owner first supplied a large master prompt describing a CLI, workflow engine, hosted graph, dashboard and swarm, then replaced that direction with a simpler goal, stated in their own words. **Where the two differ, this design wins.** The master prompt is saved as `docs/master-prompt.md` as the original vision, and it remains the source for ideas after this version.

**The problem:** agents load the wrong context, or too much of it, and don't know company rules.

**The goal (the owner's):** a plugin of skills, installed once, that builds a company's knowledge as layered files, like Anthropic's skills.
- A **parent file** holds the list of projects and company details, including security standards.
- An **install** skill generates it by asking where the company's information lives: Confluence, Jira, personal files, web search, or Claude itself.
- An **add project** skill goes into a project and creates the same kind of layered files, with flows. The project level holds only nested information about that project, in nested folders for parts of the code, flows, and operations such as PagerDuty and support requests.
- It is **personal**: no git changes by default.
- **Marketing is the last step.** Earning money isn't required.

**Success means:**
1. After `add-project`, `git status --porcelain` is unchanged and `HEAD` hasn't moved.
2. From any project folder, DevOCD's files add at most 2,000 estimated tokens at launch.
3. A real agent working on a task reads no file from an unrelated project.
4. PR review finds planted defects, cites the company rule it relied on, and invents nothing on clean code. Compared with a run without DevOCD, it catches a company-rule violation that run can't know about. Generic bugs may tie, and ties are reported as ties.
5. The plugin passes the directory validator, apart from the license and icon, which wait for the marketing step.

## Goals, non-goals, anti-goals

**Goals:** skills `install`, `add-project`, `pr-review` and `check`; one small helper script; Claude Code first.

**Non-goals for this version (my call, can return later if they prove useful):**
- CLI product, workflow engine, YAML runner and Mermaid generation
- SQLite memory (generated files are the persistent knowledge)
- Hosted graph, dashboard, swarm
- Incident and support flows (`operations/` files are generated, but only the PR review flow ships)
- Codex and OpenCode. Skills follow the portable Agent Skills format, but the personal layer depends on `CLAUDE.local.md`, and `@import` is avoided, so nothing else is designed yet
- Competitor research, which moves to the marketing step
- Listing, license and name decisions, which also move to the marketing step

**Anti-goals (a failure even if it technically works):**
- A context tool that bloats context
- Any tracked file changed by default
- Company content treated as instructions, or secrets copied into files
- Facts presented as confirmed when they came from the web or from a guess
- Silent changes: every write is previewed and approved

## What gets generated

```text
company-folder/                   usually not a git repo
├── CLAUDE.md                     parent: key rules, project list, links only
├── .devocd/
│   ├── state.json
│   ├── projects.md               only when the list no longer fits in the parent
│   └── standards/                security.md, coding.md, compliance.md, ...
└── project-a/                    a git repo, tracked files untouched
    ├── CLAUDE.md                 the team's own file, if any, never edited
    ├── CLAUDE.local.md           personal: one short pointer
    ├── .claude/settings.local.json   only if the user opts in (below)
    └── .devocd/                  ignored by git
        ├── state.json
        ├── PROJECT.md            purpose, stack, commands, links
        ├── code/<part>.md        one per main part, such as billing or auth
        ├── flows/pr-review.md    steps, conditions, approved commands
        └── operations/           pagerduty.md, support.md, runbooks, if sources exist
```

**Size limits:** parent 60 lines and 500 estimated tokens, with key rules capped at 300 of those; `CLAUDE.local.md` block 40 lines and 400; project index 80 lines and 700; skill entry 100 lines and 900; flow 80 lines; standards and other references 200 lines. Launch target 2,000 estimated tokens. All token figures are heuristic and labelled "estimated".

## Key design decisions

**1. Skills first, one helper script.** The skills do the judgement work. A small zero-dependency Node script does what must be exact: size and link checks, secret scanning, ignore rules, backups, and safe edits. Deterministic work doesn't spend tokens or depend on a model getting it right. If Node is missing, a skill says the checks didn't run and does the ignore step by hand. Claude Code doesn't document bundling Node.

**2. Why these file choices (verified):**
- Claude Code loads `CLAUDE.md` and `CLAUDE.local.md` from the working directory and every parent at launch, so a parent file above the repos reaches every project.
- Subfolder files load only once a file there is touched, so starting Claude in the company folder stays small until work begins.
- Generated files use **plain relative links and never `@import`**. Imports load eagerly, and one that resolves outside the working directory triggers an approval dialog when started in a project.
- Reading a parent's `.devocd/standards/` from a project session prompts for permission, and a `blockReadsOutsideWorkingDirectories` setting can forbid it. So **key rules live inline in the parent file**, which is always loaded, and detail files are extra. `add-project` offers to add the narrow standards path to `permissions.additionalDirectories`, with consent, and the README discloses this. If reads are blocked, the skills say what couldn't be read rather than guessing.
- **Every project sits under the company folder.** This is what lets the parent file reach it. `add-project` refuses a path outside the folder and explains why. `install` warns if the folder is the home directory, because the parent would then load in unrelated projects.
- **A company folder inside a git repo, such as a monorepo, still works.** The parent becomes `CLAUDE.local.md` instead of `CLAUDE.md`, and it's protected the same way, so nothing tracked changes. Projects can then be subfolders of that repo.
- **Adding a `CLAUDE.md` can silently turn off `AGENTS.md`.** Claude reads `AGENTS.md` only when no `CLAUDE.md` exists at or above the working folder, and the setting that restores it is ignored in project files. So `install` warns about any `AGENTS.md` it finds in repos under the folder, and `add-project` adds a line telling the agent to read it. `check` counts it. Observed in Task 4 (Claude Code 2.1.319): a `CLAUDE.md` or `CLAUDE.local.md` in the repo or in a parent folder, or a `.claude/CLAUDE.md` in the repo, turns it off (a parent folder's `.claude/CLAUDE.md` was not tested and is assumed to do the same), and because add-project always writes a repo `CLAUDE.local.md` it always writes the `AGENTS.md` pointer when the repo has one; excluding the repo's own `CLAUDE.md` with `claudeMdExcludes` turns it back on.
- **The script assembles the parent, not the agent.** Key rules always stay inline and are capped at 300 estimated tokens; if they don't fit, the skill shows them and asks which to keep. When the project list no longer fits, it moves to `.devocd/projects.md`. The limit is checked before anything is written, so 20 or 200 projects can't break it.

**3. No git changes by default (owner's decision).** The owner asked for the folder to be ignored. Editing a repo's tracked `.gitignore` would itself be a git change, so `protect` adds `.devocd/`, `CLAUDE.local.md` and `.claude/settings.local.json` to `.git/info/exclude`, which is local and untracked, located with `git rev-parse --git-path info/exclude` so worktrees work. If one of those paths is already tracked, ignoring can't work, so it refuses and reports. No skill ever commits, pushes, stages or edits tracked files. **Known limit:** ignored files exist only in that one checkout, so a fresh clone or linked worktree doesn't have them and `git clean -xdf` deletes them, including backups. The README says so, and rerunning `add-project` rebuilds them. Hand edits are lost in that case, which is the cost of staying out of git.

**4. A big team `CLAUDE.md` (owner asked for a split; personal version so git stays clean).** The team's file stays untouched and is reported with its cost. If the user opts in, `add-project` builds layered files from it and extracts its rule lines, not whole sections, into `CLAUDE.local.md`, up to that file's limit. It then shows the full list of what stays, what moves and what didn't fit, because no keyword can catch every rule: "use pnpm" contains none. After approval, it adds the team file to the personal `claudeMdExcludes` setting. Undo removes the setting. `check` warns when the team file's hash changes, because the personal copy may be stale. That the setting also covers a file in the working directory itself is **unverified**, and Task 4 settles it. If it fails, this option is dropped and the cost is only reported.

**5. Company content is data, and the user reviews everything.** Every source is treated as untrusted. Instruction-like text in a page is never followed or copied as a rule; it's flagged in the draft. Every fact in `standards/` and `operations/` records its source and date. Web or assumed facts are marked `unconfirmed`. Connector tools are used read-only. If a source isn't connected, the skill asks the user to paste it or give a file. Files are written only after approval. `check` scans for secrets, and a hit is an error. After generation, the saved files are what gets used, with no live pulling of instructions, which directory policy also forbids.

**6. Flows are short files the agent follows.** `flows/pr-review.md` holds project-specific conditions (which changed paths mean which extra checks and standards) and the commands the user approved during `add-project`. The shipped `pr-review` skill holds the method. A flow without an engine can only guide an agent, not force it, and the docs will say so.

**7. PR review rules.**
- **What it reviews:** by default, the current branch against its base, plus uncommitted changes. A PR number or URL reads the diff through `gh` if available, without checking it out, so no commands run for it and they're reported as blocked.
- Read-only by default. It never commits, pushes, or posts comments unless asked.
- Running a repo's commands executes PR-controlled code. So it runs only commands approved in the flow, and asks for any other. Approval is by name, yet an approved `npm test` still runs whatever the diff changed, so if the diff touches a file that defines a command (such as `package.json`, a lockfile, a `Makefile`, test config or CI files), it asks again first. It never runs `terraform apply`, `terraform init` against a remote backend, or a deploy.
- Modes: quick, standard, deep.
- Every finding has: severity, confidence, file, line, evidence, explanation, suggested fix, validation status, and the rule it relied on, if any.
- Every check is reported as passed, failed, skipped, unavailable, blocked or not applicable.
- References load only when their stack changed: TypeScript and JavaScript, Python, Java, Go, Terraform, Docker, Kubernetes, GitHub Actions, shell.

**8. DevOCD's own footprint stays small.** `install`, `add-project` and `check` set `disable-model-invocation: true`, so their descriptions aren't in context. Only `pr-review` is listed, with a short description. No hooks, MCP servers or agents ship. `claude plugin details` confirms the projected cost; the always-on budget is 100 estimated tokens (my call, adjust once measured).

**9. Non-interactive runs.** Under `claude -p`, `AskUserQuestion` is denied or removed. So `install` and `add-project` accept an answers file as an argument, which also gives repeatable tests, and an approval field stands in for the review step. Without one, in a non-interactive run, they stop and say so rather than guess. Interactive review can't be tested automatically, so the owner tries it in Task 10.

**10. Testing.** Plain unit tests for the script (`node --test`). Live end-to-end tests run real `claude -p` in temp fixtures, then check results with real shell commands. PR review is compared the same way, on a real fixture, with and without DevOCD. `claude plugin eval` isn't used for now: the docs say it refuses runs with Bash on native Windows, which is this machine, and it doesn't load `CLAUDE.md`, where company rules live. It can return at the marketing step on Linux. Skills are written test-first with `superpowers:writing-skills` and tuned with `anthropic-skills:skill-creator`. Live tests are gated and stop at $10 per suite run, by list-price estimate (my call).

## Stack and repository (my calls)

Plain ES modules (`.mjs`), Node 22.13+, no dependencies, no build, because the directory prefers readable source and every dependency is more to review. This drops TypeScript from the master prompt; `// @ts-check` is the only typing.

```text
devocd/
├── .claude-plugin/marketplace.json
├── plugin/                       what ships
│   ├── .claude-plugin/plugin.json
│   ├── README.md
│   ├── scripts/devocd.mjs, scripts/lib/*.mjs
│   └── skills/{install,add-project,pr-review,check}/
├── tests/{unit,e2e,fixtures,helpers}/
├── scripts/validate-plugin.mjs
├── docs/
└── .github/workflows/ci.yml
```

## Owner decisions, at the marketing step (not before building)

1. **License:** required before listing. With money no longer the goal, I recommend Apache-2.0, which replaces the earlier paid-for-firms choice if the owner agrees.
2. **Name:** `github.com/DevOCD` is an empty account from 2021; `devocd` is free on npm and PyPI; domains are inconclusive; trademarks are unchecked. Plugin names are permanent once published, and "OCD" may draw objections.
3. **Icon:** square PNG or JPEG, 512-2048 px, under 2 MB. The first one submitted becomes the permanent listing icon.
4. **Listing:** needs a paid Claude plan and a public repo. Making the repo public and submitting are the owner's call.

## Workflow after approval

1. The controller first saves the master prompt, Part 1 and Part 2 to `docs/`, because only this session holds the pasted prompt.
2. Build with `superpowers:subagent-driven-development` (owner's choice), `superpowers:writing-skills` and `superpowers:test-driven-development` throughout, `superpowers:systematic-debugging` for failures, and `superpowers:verification-before-completion` before calling anything done.
3. Follow the Karpathy guidelines: state assumptions, build nothing speculative, keep changes surgical, and start each task from a failing test.

