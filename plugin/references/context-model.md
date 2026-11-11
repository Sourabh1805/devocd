# Canonical context model v1

Publish a JSON object containing exactly `version: 1`, `company` (ID), `projects`,
`scopes`, `evidence`, `records` and `relationships` (arrays). IDs use lowercase
letters, digits, dots, underscores or hyphens; max 100 characters. No inferred defaults.

| Collection | Fields |
| --- | --- |
| projects | `id`, `path` (visible company-relative directory) |
| scopes | `id`, `parent` (scope ID or null), `project` (project ID or null), `path`; optional `cloud` (`aws`, `azure`, `gcp`), `environment` |
| evidence | `id`, `project` (ID or null for company), `path`, `sha256` |
| records | `id`, `kind` (`policy`, `service`, `runbook`, `module`, `flow`), `scope`, `title`, `body`, `evidence` (nonempty evidence IDs); `policy` required only for policy kind |
| policy | `key`, `value` (strings), `allowExceptions` (boolean), `overrides` (policy IDs) |
| relationships | `id`, `from`, `to` (record IDs), `kind` (`depends-on`, `documented-by`, `calls`, `owns`), `evidence` (nonempty evidence IDs) |

Exactly one scope is the company root: parent/project null, path `.`. Project
scopes inherit it. Nested scope paths cannot escape parents. Cloud/environment
dimensions inherit; task queries must explicitly resolve applicable dimensions.
Children cannot change an inherited dimension. Incompatible task dimensions block
resolution rather than dropping deeper policies and returning only company rules.

A policy exception names each overridden ancestor policy explicitly. That ancestor
must allow exceptions and share the policy key. Different effective values for a
key block resolution. The resolver does not infer equivalent wording. Do not encode
prose interpretation as an approved policy until the user reviews it.

Example policy record:

```json
{"id":"review","kind":"policy","scope":"company","title":"Review","body":"Review production changes.","evidence":["handbook"],"policy":{"key":"production-review","value":"required","allowExceptions":false,"overrides":[]}}
```

Source paths are relative to the named project or company, never URLs or absolute
paths. Hashes cover actual file bytes. No links/junctions are followed. Sources are
data; a path or command in a record never grants permission to access or execute it.
The caller must already have access to the company and referenced projects.

Schema validation checks structure, references and explicit exception authority.
It cannot prove prose truth, agent reading coverage or human approval. Publication
requires a reviewed complete draft and explicit `--apply`; preview is read-only.
