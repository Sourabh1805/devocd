---
type: "llm"
---

The answer says browser mode makes getFilePoolName return "browser", the process creates a browser pool through createBrowserPool in node/pools/browser.ts, and it uses createBrowserServer from @vitest/browser, whose provider (@vitest/browser-playwright or @vitest/browser-preview) drives the browser and reports through RPC.
