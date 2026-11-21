#!/usr/bin/env bash
# Review defect: restore no longer checks every target before writing anything.
set -euo pipefail
sed -i '/checkTarget(to); \/\/ check everything before writing anything/d' scripts/lib/backup.mjs
grep -q 'check everything before writing anything' scripts/lib/backup.mjs && { echo "patch did not apply" >&2; exit 1; } || true
