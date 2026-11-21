---
type: "llm"
weight: 2
---

The review reports that the change removes the check of every restore target before any write, so a restore can write some files and then fail on a link or invalid target, or write through a link.
