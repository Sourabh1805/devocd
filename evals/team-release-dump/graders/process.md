---
type: "llm"
weight: 2
---

The answer says the version bump goes in one pull request to main that changes both .claude-plugin/plugin.json and .claude-plugin/marketplace.json, merged only after CI passes on Windows, macOS and Linux, and that the vX.Y.Z tag is created on the merge commit on main (by the maintainer), never on the feature branch.
