# Decisions

## D-0001 — Helpers never write through links
Date: 2026-11-07

Every helper that writes checks its target with `lstat` first and refuses a symlink or
junction, so a planted link cannot redirect a write outside the project. See `SECURITY.md`.

## D-0002 — Releases are cut from main only
Date: 2026-11-08

A release bumps `version` in `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`
in one pull request to `main`, merged only after CI is green on Windows, macOS and Linux. The
maintainer creates the `vX.Y.Z` tag on that merge commit on `main`; nobody tags a feature or
release branch. Rejected: tagging release branches, after two plugin versions drifted apart in
the marketplace on 2026-11-07.

## D-0003 — No network from hooks or helpers, update checks included
Date: 2026-11-09

Hooks and helper commands never contact the network, and that includes version or update
checks. Users learn of new versions from the marketplace listing. A feature that needs the
network must be opt-in, off by default, and listed in `SECURITY.md` before it merges.

## D-0004 — Secret-scanning changes need the security owner
Date: 2026-11-10

Any change to `scripts/lib/secrets.mjs` or its tests needs an approving review from the
security owner (GitHub team `@devocd/security`) before merge, even when CI is green. Authors
never merge such a change themselves.

## D-0005 — Keyword search stays; local embeddings rejected
Date: 2026-11-12

A local embedding index (a 90 MB ONNX model) was trialled for `knowledge-search` on 2026-11-11.
On the 40 golden queries it scored 34 of 40 against keyword search's 35 of 40, while adding a
90 MB download and a native runtime that failed to load on Windows ARM. Keep keyword search;
revisit only with a pure-JavaScript model under 10 MB that beats keyword search on the same set.

## D-0006 — No personal data in generated output
Date: 2026-11-13

Knowledge pages, review reports and decision entries never record people's names, email
addresses or git identities. Refer to roles instead: author, reviewer, security owner. Pages
are shared across teams and kept in backups, so personal data there cannot be withdrawn.

## D-0007 — Every page claim cites its evidence
Date: 2026-11-14

Each claim in a module page carries a `file#Lx-y sha256:` evidence line. A claim without one is
dropped at draft time rather than published unverified.

## D-0008 — Windows is a first-class platform
Date: 2026-11-14

Every change is tested on Windows in CI, and paths recorded in state use forward slashes.

## D-0009 — Skills stay inside the listing budget
Date: 2026-11-15

The always-on skill listing stays under 190 estimated tokens. Adding a skill means shortening
or removing another.

## D-0010 — No knowledge write without an approved draft
Date: 2026-11-16

Helpers write knowledge only from a draft the user approved in this session; `--yes` never
fabricates approval.
