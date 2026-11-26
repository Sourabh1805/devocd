---
type: "llm"
---

The answer traces: startVitest in node/cli/cli-api.ts builds the Vitest core; Vitest.runFiles calls createPool in node/pool.ts; the ProcessPool schedules through Pool/PoolRunner; the worker entry (workers/forks.ts or workers/init.ts) calls workerInit; runBaseTests then startTests runs the files. It names at least four of these stages in order.
