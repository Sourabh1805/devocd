# Terraform

Load when the diff changes `*.tf`, `*.tfvars`, `*.tf.json` or `.terraform.lock.hcl`.

## Never

Never run `terraform apply`, `terraform destroy`, `terraform import`, a `terraform state` change, or anything with `-auto-approve`, approved or not. Never run `terraform init`: it downloads providers and modules, writes `.terraform/`, and can reach a remote backend. `terraform plan` needs init and real credentials: never run it here. Report each as `blocked` when the review would need it.

## Usual checks

Each is `blocked` unless an approved command covers it; name the command the repo would use.
- Format: `terraform fmt -check` (reads only; it exits 3 and lists the files that aren't formatted, which is `failed`).
- Lint: `tflint`.
- Validate: `terraform validate`, which needs `terraform init` first, so it stays `blocked`.
- Security scan: `trivy config`, `checkov` or `tfsec`, when the repo uses one.

## Look for

- IAM with `*`: `Action = "*"`, `"s3:*"`, `Resource = "*"`, `iam:PassRole` on `*`, `AdministratorAccess` attached. Compare with what the resource's name or description says it needs; the gap is the finding. Severity `high`, or `critical` for `*` on `*`.
- Storage that is public or unencrypted: public ACLs, public access blocks turned off, no encryption, no versioning where data must survive.
- Network open to the world: security groups or firewall rules with `0.0.0.0/0` or `::/0` on anything but public web ports.
- Secrets in variable defaults, `*.tfvars` or `locals`.
- A change to an attribute that forces replacement of a stateful resource (a database, a bucket name), or a `count` or `for_each` key change that destroys and recreates.
- Missing `prevent_destroy` on data stores; `lifecycle { ignore_changes }` that hides drift.
- Providers or modules with no version constraint, or modules from an unpinned git ref.
