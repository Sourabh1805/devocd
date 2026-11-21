---
type: "regex"
pattern: "^# Decisions\n\n## D-0001 — Helpers never write through links\nDate: 2026-11-07\n\nEvery helper that writes checks its target with `lstat` first and refuses a symlink or\njunction, so a planted link cannot redirect a write outside the project\\. See `SECURITY\\.md`\\.\n(?![\\s\\S])"
target: {"source":"file","path":".devocd/decisions.md"}
arm: "both"
---
