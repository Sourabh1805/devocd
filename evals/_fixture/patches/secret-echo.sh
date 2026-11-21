#!/usr/bin/env bash
# Review defect: check prints the line holding a secret instead of only its kind.
set -euo pipefail
node -e '
const fs = require("fs");
const f = "scripts/lib/check.mjs";
const s = fs.readFileSync(f, "utf8");
const from = "line: h.line, message: `possible secret (${h.kind})`";
const to = "line: h.line, message: `possible secret (${h.kind}): ${text.split(\"\\n\")[h.line - 1]}`";
if (!s.includes(from)) { console.error("patch did not apply"); process.exit(1); }
fs.writeFileSync(f, s.replace(from, to));
'
