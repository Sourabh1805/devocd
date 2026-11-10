# api

Payments API: invoices, customer data and the invoice bucket.

## Stack
- JavaScript on Node, ES modules, no dependencies (from `package.json`)
- Terraform for AWS (from `infra/`)

## Commands
- `npm test`: unit tests
- `terraform fmt -check -recursive infra`: Terraform formatting
- `tflint --chdir=infra`: Terraform lint

## Parts of the code
- [invoices](code/invoices.md): `src/invoices/`, invoice totals
- [db](code/db.md): `src/db/`, database queries
- [infra](code/infra.md): `infra/`, AWS resources

## Flows
- [PR review](flows/pr-review.md)

## Links
- Company standards: `../.devocd/standards/` (reading them from here may need permission)
