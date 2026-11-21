---
max_turns: 30
allowed_tools: ["Read", "Glob", "Grep", "Skill"]
---

Walk through what happens when someone runs `/devocd:refresh` on a project whose sources changed: list the helper commands it runs in order, say when it rebuilds incrementally and when it falls back to a full rebuild, and say what must be true before it records the refresh as complete.
