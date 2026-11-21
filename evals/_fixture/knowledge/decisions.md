# Decisions

## D-0001 — Helpers never write through links
Date: 2026-11-07

Every helper that writes checks its target with `lstat` first and refuses a symlink or
junction, so a planted link cannot redirect a write outside the project. See `SECURITY.md`.
