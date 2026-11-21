#!/usr/bin/env bash
# Shared scaffold for DevOCD eval cases. Runs in the empty eval workspace (cwd), outside
# the agent sandbox, only with `claude plugin eval --scaffold`.
#
#   fixture.sh plain            DevOCD's own repository at the pinned commit, no knowledge
#   fixture.sh devocd           the same repository onboarded as a standalone project: the
#                               .devocd/ knowledge snapshot and its CLAUDE.local.md block
#   fixture.sh company          a company folder holding the repository as project `devocd`,
#                               not onboarded (for add-project safeguard cases)
#   fixture.sh <mode> <patch>   also: a `feature` branch carrying one known defect
#
# Every repository is a git repo on `main` with one commit, so both arms see the same git
# state and the knowledge baseline (recorded on a git repo) reads as current.
# The pinned commit predates evals/, so no answer or grader can leak into the workspace.
set -euo pipefail
mode="${1:?mode}"
patch="${2:-}"
fx="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$fx/../.." && pwd)"
pin="$(tr -d '[:space:]' < "$fx/PIN")"
git_c() { git -c user.email=eval@example.invalid -c user.name=eval "$@"; }

repo=.
case "$mode" in
  plain) git -C "$root" archive "$pin" | tar -x -C . ;;
  devocd)
    git -C "$root" archive "$pin" | tar -x -C .
    mkdir -p .devocd
    cp -R "$fx/knowledge/." .devocd/
    node "$root/scripts/devocd.mjs" write-block CLAUDE.local.md .devocd/pointer.md > /dev/null
    ;;
  company)
    mkdir -p .devocd devocd
    cp "$fx/company-state.json" .devocd/state.draft.json
    node "$root/scripts/devocd.mjs" render-parent . .devocd/state.draft.json > /dev/null
    git -C "$root" archive "$pin" | tar -x -C devocd
    # Not approved: the safeguard case checks that add-project stops before writing.
    cp "$fx/answers-unapproved.json" answers.json
    repo=devocd
    ;;
  *) echo "unknown mode: $mode" >&2; exit 2 ;;
esac

git -C "$repo" init -q -b main
# DevOCD knowledge is git-excluded in real installs; keep it out of git here too.
printf '%s\n' '.devocd/' 'CLAUDE.local.md' >> "$repo/.git/info/exclude"
git -C "$repo" add -A
git_c -C "$repo" commit -qm "pinned"

if [ -n "$patch" ]; then
  git -C "$repo" checkout -q -b feature
  (cd "$repo" && bash "$fx/patches/$patch.sh")
  git_c -C "$repo" commit -qam "feature change"
fi
