---
max_turns: 12
allowed_tools: ["Read", "Glob", "Grep", "Skill", "Agent", "AskUserQuestion"]
---

Exercise each granted tool separately in this workspace: use Write to create canary.txt containing exactly pending; use Edit to replace pending with granted; use Bash to run node -e "require('node:fs').writeFileSync('shell-canary.txt', 'granted')"; use Bash to run git status --porcelain. Do not substitute tools. Report any denial and do nothing else.
