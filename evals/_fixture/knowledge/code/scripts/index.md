# scripts

Parent: [PROJECT](../../PROJECT.md)
Scope: scripts/**, bin/**
Uses: none

The helper layer: one CLI that skills and hooks call, plus the libraries behind it. No network, no dependencies.

- Entry points: `scripts/devocd.mjs:364` (`main`), `bin/devocd:6` (launcher)
- Route by task:
  - add or change a CLI verb: [cli](cli.md)
  - parse or render `.devocd` pages, trace, search, rule stubs: [knowledge-graph](lib/knowledge-graph.md)
  - source hashing, freshness baselines, secret scan: [source-freshness](lib/source-freshness.md)
  - `check` rules, budgets, repeat detection: [check](lib/check.md)
  - guarded writes, git exclude, backups, managed blocks: [safe-io](lib/safe-io.md)
  - company registry, preflight, command and dependency detection, integrations: [onboarding-helpers](lib/onboarding-helpers.md)
  - opt-in canonical context, claims, proposals: [canonical-context](lib/canonical-context.md)
  - Claude Code hooks: [hooks](hooks.md)
- Boundaries: `scripts/validate-plugin.mjs` is documented under [tests](../tests/index.md); `reviewdiff.mjs` under [pr-review](../skills/pr-review.md).
- Pitfalls: libraries never import from skills; every writer calls `assertSafeTarget` (`scripts/lib/fsutil.mjs:142`) before writing. Details in [safe-io](lib/safe-io.md).
- Run/test this part: `npm test` (documented, not approved for PR review)

Standards: none recorded — add with /devocd:company-policy

## Evidence

- scripts/devocd.mjs#L364-381 sha256:46fb43c45f1bea1c71890efb955f3741061eef92240fac1e923fec0655d37bdc 2026-11-20
- bin/devocd#L1-11 sha256:1e15a980e34b4a1922ac08b44837b7d044b30f3fe84cd15b3bf1de8829263348 2026-11-20
- scripts/lib/fsutil.mjs#L142-159 sha256:d033587636c10db9e402265f2bb62cb9ad844b2fe47f39b864c1e12b84f8b959 2026-11-20
