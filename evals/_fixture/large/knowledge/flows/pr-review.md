# PR review: vitest

Follow the `devocd:pr-review` skill; this file adds this project's commands and conditions.

## Approved commands
Run only these, as written; ask before running any other command.
- `pnpm test`
- `pnpm run typecheck`
- `pnpm run lint`

If the diff changes a file that defines a command (`package.json`, a lockfile, test or lint config, CI files), ask again before running any of them.

## Conditions
- Changes under `.github/workflows/`: ask before running any command.
- Changes to `pnpm-workspace.yaml` or any `package.json`: dependency changes, ask again before running commands.

## Standards
- None recorded yet; the company standards folder has no index.
