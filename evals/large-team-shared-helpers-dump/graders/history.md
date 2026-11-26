---
type: "llm"
weight: 2
---

The answer recommends against a shared internal package (or against it for now) and says it was tried before and reverted because bundled copies did not share state (expect and snapshot saw different instances under HMR). It suggests duplicating, or putting only stateless helpers in @vitest/utils.
