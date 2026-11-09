# DevOCD

DevOCD is a skills-only plugin for Claude Code. It sets up company-wide
standards that Claude Code loads from a parent folder, and it reviews
branches and pull requests against those standards. It ships no hooks, no
MCP servers and no agents, and its helper script makes no network calls.

To install and use it, read [plugin/README.md](plugin/README.md).

The name DevOCD is provisional, and so is a public listing. The license is
decided at the marketing step, so this repo does not state one yet.

To report a vulnerability, or to read the threat model, see
[SECURITY.md](SECURITY.md).

## Run the tests

You need Node 22.13 or later. There are no dependencies to install.

Unit tests, which are free and run in CI on Windows, Linux and macOS:

```text
node --test "tests/unit/**/*.test.mjs"
```

Check the plugin's shape (manifest, skills, file sizes, link types) with
`claude plugin validate`, and its always-on token cost with
`claude plugin details` (it fails over 100). Both are local commands with no
model call. Without the `claude` CLI on PATH, the check is skipped:

```text
node scripts/validate-plugin.mjs
```

The live suites in `tests/e2e` run real `claude -p` sessions, cost real
money and never run in CI. They need the Claude Code CLI and a login, and
they run only when `DEVOCD_LIVE=1` is set:

```text
DEVOCD_LIVE=1 node --test "tests/e2e/**/*.test.mjs"
```

Each suite stops at a spend cap, by list-price estimate. The default is
$10 per suite. Set `DEVOCD_LIVE_CAP_USD` to change it. Results so far are
in [docs/release-readiness.md](docs/release-readiness.md), and what the
tests do not cover is in
[docs/known-limitations.md](docs/known-limitations.md).

## Layout

```text
.claude-plugin/marketplace.json   the marketplace entry, pointing at plugin/
plugin/                           what ships
  .claude-plugin/plugin.json
  README.md                       for people who use the plugin
  scripts/devocd.mjs, lib/        the helper: checks, safe edits, review-diff
  skills/{install,add-project,pr-review,check}/
tests/{unit,e2e,fixtures,helpers}/
scripts/validate-plugin.mjs
docs/                             limitations, readiness record, design, research
.github/workflows/ci.yml
```
