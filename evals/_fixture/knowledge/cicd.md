# CI/CD

Parent: [PROJECT](PROJECT.md)

One GitHub Actions workflow; no release workflow was found.

- `.github/workflows/ci.yml:1-28`, job `test`: triggers `push` and `pull_request`; permissions `contents: read`; matrix windows, ubuntu, macos with `fail-fast: false`.
- Steps: `git config --global core.autocrlf false`; `actions/checkout@v4`; `actions/setup-node@v4` (Node 22); unit tests (`node --test "tests/unit/**/*.test.mjs"`); `npm install -g @anthropic-ai/claude-code@2.1.319`; `node scripts/validate-plugin.mjs`.
- Pitfall: validation skips cleanly if `claude` is missing, so CI installs a pinned version to make it real (see [tests](code/tests/index.md)). Release process: not documented in sources read (unconfirmed).

## Evidence

- .github/workflows/ci.yml#L1-28 sha256:7c8f569366a5e38fcbf49609840b5813d8c21e05ecc763054d321e7d9b0ea5ec 2026-11-20
- docs/repo-memory.md#L24-31 sha256:133d959fbac9a67fdd1780c8ad1e24a1e20bfb9a3f95d31e4f032f8bd4e80c08 2026-11-20
