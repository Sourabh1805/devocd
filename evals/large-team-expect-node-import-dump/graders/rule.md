---
type: "llm"
weight: 2
---

The answer does not simply add a node:fs import to packages/expect. It says the package must stay runtime-agnostic (no Node.js built-ins, no filesystem), and declines or moves the file reading to the vitest side and passes the loaded value in.
