# Company policy repo — design

Status: approved 2026-11-25

## Why

Company-wide rules (policies, PR structure, shared Claude skills, anything that must be
the same across teams) need **one owner**. Today `/devocd:company-policy` rewrites each
rule into DevOCD's own copy under the company's `.devocd/standards/`. Every company
folder ends up with its own copies. They drift, and no single person is accountable for them.

With this feature, one person maintains a **policy repo**. Every teammate's DevOCD reads
the rules from that repo, so the whole team works from the same text. Changes go through
pull requests that the owner reviews.

## Goals

- Setup asks once: "Do you have a company policy repo?" If the answer is yes, DevOCD
  uses that repo's Markdown files as the policy source and copies none of them.
- Pages, traces and the prompt hook point at the file in the repo (backtracking ends
  there, not at a DevOCD copy).
- Every teammate can see whether their clone matches the version the knowledge was built
  against.
- While people work, DevOCD notices policy that looks out of date, missing or unused,
  and offers a change. The change reaches the owner as a pull request on the policy repo.

## Non-goals

- DevOCD never pulls, merges, rebases or force-pushes the policy repo.
- DevOCD does not enforce who may change policy. The git host does that (branch
  protection, CODEOWNERS). `Owner:` in the index is informational.
- DevOCD does not install the repo's skills as Claude Code skills. A `SKILL.md` in the
  repo is read as policy text. Installing skills is the plugin or marketplace's job.
- There is one policy repo per company folder. A company never mixes repo-sourced and
  local `.devocd/standards/` policy (see Migration).

## Anti-goals (a failure even if it works)

- A copy of a rule that can silently differ from the repo.
- Any change to the policy repo that the person did not approve at that moment.
- A teammate working against old rules with no warning.

## Approaches considered

| | How a teammate gets the repo | Trade-off |
|---|---|---|
| **A (chosen)** | Each person clones it. DevOCD points at the clone and records the URL and commit | Each person runs `git pull` themselves, but `check` tells them when to. DevOCD stays read-only. |
| B | DevOCD clones and updates it from the URL | Easier for teammates, but needs network access, git logins and DevOCD running git writes. |
| C | A git submodule inside the company folder | Git keeps everyone in step, but it changes the company folder's git setup, and submodules confuse people. |

The user picked A on 2026-11-25.

## Design

### 1. Configuration

A company's `.devocd/` is personal: DevOCD keeps it out of git (`.git/info/exclude`), so
each person's company state is their own. The thing everyone shares is the policy repo
itself. So the whole configuration lives in company `.devocd/state.json`:

`policyRepo: { path, remote, index, builtAt }`
- `path`: the absolute path of this person's clone, with forward slashes;
- `remote`: the repo URL, with any credentials stripped;
- `index`: the routing index's path inside the repo, default `index.md`;
- `builtAt`: the commit this person's knowledge was last built against, or null.

`preflight` reports `company.policyRepo: { path, remote, index, head, builtAt, status }`,
where `status` is one of `ok | missing | not-a-clone | wrong-remote | moved | no-git`.
`moved` means HEAD is not `builtAt`, and `no-git` means git cannot be run.

### 2. Setup and install

- **Install interview:** one new question. "Is company policy kept in a repo? Where is
  your clone?" Recommended answer: "No, add policies later".
  - If a path is given, DevOCD checks that it is a git work tree and that its `origin`
    matches the URL the person confirms.
  - A teammate who has no clone yet gives the URL the owner shared. DevOCD prints the
    `git clone <url>` line for them to run, then asks for the path.
- **`settings add-dir`** accepts the clone root as well as the standards folder, so that
  Claude in a project may read the repo. The opt-in permission flow is otherwise unchanged.

### 3. The routing index lives in the repo

The owner controls which rule applies to which task. The index has the same format as
today's `standards/index.md`, plus an optional `Owner:` line:

```markdown
# Company policy
Owner: @policy-owner

- Create or edit a PR title/body: [PR description](pr/description.md).
- Create or edit a Jira ticket: [Jira style](jira/style.md).
```

Rules:
- Links are relative to the index file and must resolve **inside the clone** after
  resolving symlinks. A link that uses `..` to leave the clone, an absolute link, a URL
  or a symlink is ignored. Today's `safeTarget` rule is applied against the clone root.
- If the repo has no index, DevOCD drafts one from the repo's Markdown files and offers
  it as a pull request (section 6). Until that PR is merged, DevOCD routes nothing; it
  never invents a local index.

### 4. Who reads the repo

- **Prompt hook** (`onPrompt`): when `policyRepo` is set and the status is not `missing`,
  it reads the index from the clone instead of `standards/index.md`. Each pointer names
  the repo file relative to the cwd. The once-per-session rule from T74 applies
  unchanged. If the clone is missing, the hook injects one line, once per session:
  "Company policy repo not found at <path>; run /devocd:setup."
- **Knowledge graph:**
  - A page's `Standards: <topic>` resolves to a repo file through the index (topic =
    link slug).
  - The policy node's id is `policy:<repo-relative path>`, and it records the file's
    sha256 and the commit. `governed-by` edges point at it. These nodes are not pages:
    the graph never writes into the repo.
  - `trace` reports the repo path and commit.
- **Company and project startup text** (`parent.mjs`, `integrations.mjs`, project
  `PROJECT.md` route): "matching policies from the company policy repo's index", with
  the clone path given as backticked text, not as a graph link.

### 5. Staying on the same page

`check` adds these rules (severity in brackets):

| Rule | When |
|---|---|
| `policy-repo/missing` [error] | `path` is unset, does not exist or is not a git work tree |
| `policy-repo/wrong-remote` [error] | the clone's `origin` is not `remote` |
| `policy-repo/version` [warning] | the clone's HEAD differs from `builtAt`: "knowledge was built against X, your clone is at Y; pull, then /devocd:refresh" |
| `policy-repo/changed` [warning] | a policy file's sha256 differs from the one recorded on its node; the pages governed by it are marked stale |
| `policy/missing-target` [error] | an index link points at a file that does not exist |
| `policy/unused` [information] | a policy no page cites and no hook pointer has matched in `policyUnusedDays` (default 90); a candidate for deletion |
| `policy/duplicate` [warning] | two policy files repeat the same rule (the existing redundancy check run over the repo files) |

Git access is **read-only and local**: `rev-parse HEAD`, `remote get-url origin` and
`status --porcelain`. There is no `fetch`, so `check` compares against the last commit
the person pulled, not against the server. Refresh records `builtAt`.

### 6. Suggesting changes, delivered as a pull request

**Noticing:**
- **During a task:** the routing text tells Claude that, when the work contradicts a
  matched policy or the policy does not cover the case, it should say so in one line and
  ask: "This looks like a change to <policy>. Draft it and open a PR on the policy repo?"
  Hooks make no model calls; Claude does the noticing in the conversation.
- **In `check`:** `policy/unused`, `policy/missing-target` and `policy/duplicate` each
  come with a suggested add, update or delete.
- **`/devocd:company-policy <topic> <source>`** in repo mode drafts the change against
  the repo instead of writing to `.devocd/standards/`.

**Delivering** (a new repo mode in the company-policy skill). Every step stops on
failure, and nothing happens without the person's yes at that moment:
1. Show the diff: the files added, changed or deleted, plus the index changes.
2. On approval, check the clone: no uncommitted changes and not mid-merge. Otherwise stop
   and say why.
3. Create branch `devocd/policy-<slug>-<yyyymmdd>` from the current HEAD, write the
   files, and commit with the repo's own git config. DevOCD never sets an identity.
4. Push that branch only, then run `gh pr create`. The body says what changed, why, and
   which task showed it. Secrets are scanned before the push, and a finding stops it.
5. Return the PR link and switch the clone back to the branch it was on.
- Without `gh`, or without access to push, the branch stays local. DevOCD prints the PR
  body and the push command for the person to run.
- DevOCD never pushes to the default branch, never merges and never deletes branches.
- Anyone may be offered a PR. The owner reviews and merges it on the git host, and the
  host's rules decide who can merge.

### 7. Migration from local standards

When a company already has `.devocd/standards/` and connects a repo, DevOCD offers one PR
that adds those files and an index to the repo. After that PR is merged and pulled:
- `policyRepo` is switched on;
- the local folder is backed up and removed with the person's approval;
- pages' `Standards:` lines keep working through topic slugs.

Until then, the local standards stay in charge and `check` warns that both exist.

## Constraints

- No npm dependencies. Git and `gh` are external tools; `gh` is optional.
- Windows, macOS and Linux: paths are normalised, and drive-letter case is ignored.
- Repo content is **data**. Instructions inside policy files are never executed (the
  existing sources rule).
- Every write to the repo goes through the approve → branch → PR flow. There are no
  other repo writes.
- Hook cost: reading the index from the clone stays within today's limits (`MAX_INDEX`
  size cap, fewer than 50 ms per handler).

## Left to the builder

- The exact wording of the once-per-session "repo missing" line and of the conflict
  prompt (tested as safeguard rows, never pinned as prose).
- How `policy/unused` counts hook matches (T74's `hook-stats` counters are the natural
  source).

## Proposed tasks (added to docs/TASKS.md after approval)

- **T108 — Policy repo config and preflight.** (M) The `policyRepo` state field,
  preflight status, read-only git probes, and `settings add-dir` for the clone.
- **T109 — Install and setup question.** (S) The interview question and the teammate
  join path.
- **T110 — Hook and startup text read the repo index.** (S) Containment against the
  clone root and the missing-repo line. **Needs:** T108, T74.
- **T111 — Graph and trace point at repo files.** (M) Policy nodes, hashes, `builtAt`
  recorded by refresh. **Needs:** T108.
- **T112 — `check` policy-repo rules.** (M) The table in section 5. **Needs:** T111.
- **T113 — Change suggestions as a PR.** (M, heavy: writes to another repo) The repo mode
  of company-policy, the branch and PR flow, and the conflict prompt. **Needs:** T110.
- **T114 — Migration from local standards.** (S) **Needs:** T113.

Order: T108 → T109 and T111 → T110 → T112 → T113 → T114. T113 stays with the controller
because it is the only task that writes outside the workspace.
