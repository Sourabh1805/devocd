# GitHub Actions

Load when the diff changes `.github/workflows/*.yml`, `.github/workflows/*.yaml`, `action.yml`, `action.yaml` or `.github/actions/**`.

A changed CI file defines commands: ask again before running any approved command.

## Usual checks

Each is `blocked` unless an approved command covers it; name the command the repo would use.
- Lint: `actionlint`.
- Security: `zizmor`, when the repo uses it.

## Look for

- `pull_request_target` or `workflow_run` that checks out and runs the PR's code with secrets or a write token.
- `${{ github.event.* }}` (titles, bodies, branch names, comments) placed inside `run:`: script injection. Pass it through `env:` and quote it.
- Third-party actions pinned by tag or branch instead of a full commit SHA.
- No `permissions:` block, or `write-all`; a token with more scope than the job needs.
- Secrets printed, written to files or artifacts, or passed to a step that runs untrusted code.
- Self-hosted runners on a public repo.
- `continue-on-error: true` or `|| true` that hides a failing check.
- A cache or artifact from an untrusted run used in a trusted one.
