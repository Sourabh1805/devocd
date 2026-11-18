# Claim records

History is recorded-then; `verifiedAt` means current code was checked.
Recording or approving a summary never promotes its category or authority.
This library is separate from the canonical context model; T48 integrates them.

```js
{
  id: 'C-0001',
  statement: 'The Dockerfile references the base image.',
  category: 'source-fact', // source-fact | practice | decision | policy | hypothesis
  authority: 'observed',  // observed | team-accepted | company-policy | none
  scope: { project: 'shop', paths: ['src/**'], environment: 'prod' },
  evidence: [{ type: 'file', path: 'Dockerfile', sha256: 'a'.repeat(64) }],
  origin: 'tool',         // human | team | assistant | tool
  status: 'proposed',     // proposed | accepted | superseded | rejected
  recordedAt: '2026-11-17',
  verifiedAt: null,
  supersedes: []
}
```

All fields are required. IDs match `^C-\d{4,}$`. Statements are nonblank,
one line, at most 300 JavaScript string characters. Evidence has 1–20 items.
Scope uses project, path and environment concepts from the canonical model:
`project` and `environment` are nonblank strings or null; empty `paths` means
the whole project. Paths are relative POSIX paths or globs: no absolute/drive
paths, backslashes, control characters, empty segments, `.` or `..` segments.
File evidence uses concrete paths, without globs. No files are resolved or read
by the validator. Dates are real Gregorian `YYYY-MM-DD`, years 0001–9999.

Evidence shapes (no extra keys):

- `{ type: 'file', path, sha256, lines? }`: 64 hex hash; optional inclusive
  `L12-40` range, positive safe integers with start no greater than end.
- `{ type: 'pr', number, state, date }`: positive safe integer number;
  state is `merged`, `reverted` or `closed`.
- `{ type: 'review-comment', pr, comment, outcome }`: positive safe integer
  PR/comment IDs; outcome is `accepted`, `rejected` or `unknown`.
- `{ type: 'session', id, date }`: eight hex digits. Hex is case-insensitive.

## Validation rules

1. `shape`: required fields, types, enums, bounds, real dates, safe paths and
   unknown keys at every object level. Other semantic rules skip malformed records.
2. `duplicate-id`: IDs must be unique across the list.
3. `secret`: the statement must pass the existing secret scanner.
4. `source-fact`: observed authority and at least one file item are required.
5. `practice`: observed authority and at least two distinct PR numbers or file
   paths, in any combination; PR state does not affect this count. Sessions and
   review comments do not count; repeated references to one PR/file count once.
6. `decision`: acceptance requires a file, merged PR or accepted review comment.
   Sessions, reverted/closed PRs and rejected/unknown comments do not support it.
7. `policy`: company-policy authority is exclusive to policies; policies require
   that authority, file evidence and a non-assistant origin.
8. `hypothesis`: authority must be none; accepted status is forbidden.
9. `assistant-origin`: assistants may originate only hypotheses.
10. `verified`: a verification date requires file evidence and cannot predate
    recording. No implied link between source dates and current verification.
11. `supersedes`: targets must exist, cannot be self, and cannot form cycles.
    An accepted claim can supersede only claims whose status is superseded.

`validateClaims(list)` returns `{ ok, errors: [{ id, rule, message }] }`.
Messages never quote input text; malformed IDs and list-level errors use null.
An empty list is valid. Validation does not mutate input.
`approveClaim(claim)` returns a deep copy with accepted status, preserving
category and authority. Revalidate the resulting list: hypotheses remain invalid
when accepted, and unsupported decisions do not become supported by approval.
`currentness(claim)` returns `verified` only when `verifiedAt` is set and file
evidence exists; otherwise `recorded-only`. It does not perform verification.

Run `node scripts/devocd.mjs claims-check claims.json` to read and validate
a JSON array. JSON output and exit 0 mean valid; exit 1 means invalid, unreadable,
or malformed input. Missing/extra arguments or options are usage errors (exit 2).
The command never writes files or prints JSON parser excerpts of claim text.
