# Shell

Load when the diff changes `*.sh`, `*.bash`, or a file whose first line is a `sh` or `bash` shebang.

## Usual checks

Each is `blocked` unless an approved command covers it; name the command the repo would use.
- Lint: `shellcheck <file>`.
- Format: `shfmt -d <file>`, when the repo uses it.

Never run the changed script itself to test it.

## Look for

- Unquoted variables (`$var` instead of `"$var"`): word splitting and globbing.
- No `set -euo pipefail` (or the repo's equivalent) in a script that should stop on errors.
- `rm -rf "$DIR/"` where `DIR` can be empty; `cd` with no `|| exit`.
- `eval`, or input placed in a command line.
- `curl ... | sh`; downloads with no checksum.
- Temporary files with fixed names instead of `mktemp`.
- Parsing `ls` output; `for f in $(...)` over file names.
- Secrets on command lines (visible in process lists) or echoed into logs.
- Windows line endings (CRLF) in a script that runs on Linux.
