#!/usr/bin/env bash
# Shared scaffold for DevOCD eval cases. Runs in the empty eval workspace (cwd), outside
# the agent sandbox, only with `claude plugin eval --scaffold`.
#
#   fixture.sh plain            DevOCD's own repository at the pinned commit, no knowledge
#   fixture.sh devocd           the same repository plus the .devocd/ knowledge snapshot
#   fixture.sh company          a company folder holding the repository as project `devocd`,
#                               not onboarded (for add-project safeguard cases)
#   fixture.sh <mode> <patch>   also: git repo on `main`, a `feature` branch with the patch
#
# The pinned commit predates evals/, so no answer or grader can leak into the workspace.
set -euo pipefail
mode="${1:?mode}"
patch="${2:-}"
fx="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$fx/../.." && pwd)"
pin="$(tr -d '[:space:]' < "$fx/PIN")"

export_repo() { git -C "$root" archive "$pin" | tar -x -C "$1"; }

case "$mode" in
  plain) export_repo . ;;
  devocd)
    export_repo .
    mkdir -p .devocd
    cp -R "$fx/knowledge/." .devocd/
    ;;
  company)
    mkdir -p .devocd devocd
    cp "$fx/company-state.json" .devocd/state.draft.json
    node "$root/scripts/devocd.mjs" render-parent . .devocd/state.draft.json > /dev/null
    (cd devocd && export_repo .)
    # Not approved: the safeguard case checks that add-project stops before writing.
    cp "$fx/answers-unapproved.json" answers.json
    ;;
  *) echo "unknown mode: $mode" >&2; exit 2 ;;
esac

if [ -n "$patch" ]; then
  repo=.
  [ "$mode" = company ] && repo=devocd
  git -C "$repo" init -q -b main
  # DevOCD knowledge is git-excluded in real installs; keep it out of the diff here too.
  printf '%s\n' '.devocd/' 'CLAUDE.local.md' >> "$repo/.git/info/exclude"
  git -C "$repo" add -A
  git -C "$repo" -c user.email=eval@example.invalid -c user.name=eval commit -qm "pinned"
  git -C "$repo" checkout -q -b feature
  (cd "$repo" && bash "$fx/patches/$patch.sh")
  git -C "$repo" -c user.email=eval@example.invalid -c user.name=eval commit -qam "feature change"
fi
