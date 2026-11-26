#!/usr/bin/env bash
# Shared scaffold for DevOCD eval cases. Runs in the empty eval workspace (cwd), outside
# the agent sandbox, only with `claude plugin eval --scaffold`.
#
#   fixture.sh plain            DevOCD's own repository at the pinned commit, no knowledge
#   fixture.sh devocd           the same repository onboarded as a standalone project: the
#                               .devocd/ knowledge snapshot and its CLAUDE.local.md block
#   fixture.sh company          a company folder holding the repository as project `devocd`,
#                               not onboarded (for add-project safeguard cases)
#   fixture.sh large-plain      another, large public repository at its pinned commit, no knowledge
#   fixture.sh large-devocd     the large repository plus the knowledge snapshot in large/knowledge/
#   fixture.sh <mode> <patch>   also: a `feature` branch carrying one known defect
#
# Every repository is a git repo on `main` with one commit, so both arms see the same git
# state and the knowledge baseline (recorded on a git repo) reads as current.
# The pinned commit predates evals/, so no answer or grader can leak into the workspace.
# The large repository is never cloned here: the operator keeps one clone and names it with
# DEVOCD_EVAL_LARGE_CACHE, so a run never fetches and the fixture stays offline. `claude plugin
# eval` does not pass that variable to a scaffold script (observed on Windows, Claude Code
# 2.1.325), so a git-ignored large/CACHE file holding the same path is accepted instead.
set -euo pipefail
mode="${1:?mode}"
patch="${2:-}"
fx="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$fx/../.." && pwd)"
pin="$(tr -d '[:space:]' < "$fx/PIN")"
large_pin="$(tr -d '[:space:]' < "$fx/large/PIN" 2>/dev/null || true)"
large_url="$(tr -d '[:space:]' < "$fx/large/REPO" 2>/dev/null || true)"
# Set-but-empty means "no cache": a test uses that to prove the refusal path without the
# environment of the machine leaking in through the CACHE file.
if [ -n "${DEVOCD_EVAL_LARGE_CACHE+x}" ]; then
  large_cache="$DEVOCD_EVAL_LARGE_CACHE"
elif [ -f "$fx/large/CACHE" ]; then
  large_cache="$(cat "$fx/large/CACHE")"
else
  large_cache=""
fi

# The large arm must fail loudly and early: a silent clone or fetch is not allowed in a run.
large_source() {
  if [ -z "$large_cache" ] || [ ! -d "$large_cache/.git" ]; then
    echo "large repository cache is missing: set DEVOCD_EVAL_LARGE_CACHE (or write its path to evals/_fixture/large/CACHE) to a git clone of ${large_url:-the large repository}" >&2
    exit 3
  fi
  if ! git -C "$large_cache" cat-file -e "$large_pin^{commit}" 2>/dev/null; then
    echo "large repository cache $large_cache does not contain commit $large_pin; fetch it first" >&2
    exit 3
  fi
}
# Scaffold commits are disposable and must not invoke a developer's signing setup.
git_c() { git -c user.email=eval@example.invalid -c user.name=eval -c commit.gpgsign=false "$@"; }

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
  large-plain)
    large_source
    git -C "$large_cache" archive "$large_pin" | tar -x -C .
    ;;
  large-devocd)
    large_source
    git -C "$large_cache" archive "$large_pin" | tar -x -C .
    mkdir -p .devocd
    cp -R "$fx/large/knowledge/." .devocd/
    node "$root/scripts/devocd.mjs" write-block CLAUDE.local.md .devocd/pointer.md > /dev/null
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
