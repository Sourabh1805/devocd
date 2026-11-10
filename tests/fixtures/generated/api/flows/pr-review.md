# PR review: api

Follow the `devocd:pr-review` skill; this file adds this project's commands and conditions.

## Approved commands
Run only these, as written; ask before running any other command.
- `npm test`
- `terraform fmt -check -recursive infra`
- `tflint --chdir=infra`

If the diff changes a file that defines a command (`package.json`, a lockfile, test or lint config, CI files), ask again before running any of them.

## Conditions
- Changes under `src/db/`: check every query against the company key rules.
- Changes under `infra/`: check IAM changes for least privilege (company security standard).

## Standards
- Security and coding, in `../.devocd/standards/`.
