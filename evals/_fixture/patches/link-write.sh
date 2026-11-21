#!/usr/bin/env bash
# Review defect: restore no longer checks every target before writing anything.
set -euo pipefail
# Portable in-place edit: BSD sed (macOS) needs an argument after -i, GNU sed rejects a separate one.
sed '/checkTarget(to); \/\/ check everything before writing anything/d' scripts/lib/backup.mjs > scripts/lib/backup.mjs.tmp
mv scripts/lib/backup.mjs.tmp scripts/lib/backup.mjs
grep -q 'check everything before writing anything' scripts/lib/backup.mjs && { echo "patch did not apply" >&2; exit 1; } || true
