# Learning evaluation contract

This synthetic fixture defines behavior before the learning pipeline exists.
Run `node --test tests/unit/learning-eval.test.mjs`. No network or real history is used.

## PR input (`history/prs.json`)

```js
{
  number: 101, title: 'Use SQS FIFO queue to preserve order', body: 'Reason...',
  author: 'fixture-reviewer', authorIsBot: false,
  state: 'merged',                 // merged | closed
  mergedAt: '2026-11-01T12:00:00Z', // real UTC timestamp; null for closed
  labels: [],
  files: [{ path: 'infra/queue.tf', additions: 2, deletions: 1 }],
  reviewComments: [{ id: 9001, author: 'fixture-reviewer',
    body: 'Switch to Kinesis instead.', outcome: 'rejected' }],
  revertedBy: null                 // reverting PR number, or null
}
```

All keys are required; no extra keys. PR/comment IDs are positive safe integers;
counts are nonnegative safe integers. Title/author are nonblank strings; body and
labels contain strings. Files is nonempty with relative POSIX paths; comments may
be empty. Outcomes are accepted/rejected/unknown. PR #102 stays `state: merged`
in history but `revertedBy: 103` makes its claim evidence state `reverted`.
Historical cache and lockfile paths need not exist in the current repo snapshot.

## Learner and matching contract

`learnFromHistory({ root, prs, standardsDir })` from `plugin/scripts/lib/learn.mjs`
may be sync or async and returns `{ claims, conflicts, skipped }`. Claims must pass
T44 `validateClaims`. Conflicts are `{ claimId, standard }`, where standard is
relative to company `.devocd` (here `standards/regions.md`). Skipped entries are
`{ number, reason }`; #108 must have a nonblank reason identifying it as a bot.
Claim PR states and review outcomes must agree with the supplied history.
Returned claims must never have accepted status: learning does not auto-accept.

The six learning tests are TODO `T49 learnFromHistory` only while the module or
export is absent. An existing non-function export or broken module fails the suite.
Once the export exists, every learning assertion runs on a fresh temporary copy.
No learner or mock implementation is supplied by this fixture.

`expected.json` has six entries with `must` and `mustNot` partial claim matchers.
Objects match recursively; scalars match exactly; arrays match unordered subsets
using distinct items. A string matcher `{ "$contains": ["Redis", "latency"] }`
requires both case-insensitive substrings, allowing wording/IDs to vary.
`onlyEvidence` limits mustNot to claims whose entire evidence fits that matcher;
it does not forbid a claim with additional independent supporting evidence.
Case metadata (counts, currentness, supportGroup, conflicts, stale, artifacts)
is harness-only, never an extension to T44's claim shape. Every must matcher is
completed with placeholder IDs/dates and valid evidence and checked with T44.

## Six cases

1. #101 yields a **proposed decision**, with merged PR and `infra/queue.tf` file
   evidence. `currentness` is verified, and the hash matches the actual file.
   No proposed/accepted claim can rely only on its rejected Kinesis comment.
2. No proposed/accepted claim relies only on #102. Omission is allowed; a claim
   relying only on it must be rejected, with PR evidence state reverted.
3. #104/#105 yield an observed practice scoped to prod, paired in conflicts with
   `standards/regions.md`. Observing us-east-1 never creates higher authority or
   overrides the company requirement for eu-west-1/eu-central-1.
4. #106/#107 have the Claude Code footer; notes repeat their Redis/latency guess.
   Exactly one assistant-origin hypothesis represents it, never a decision or
   practice about Redis. `supportGroup` records these three known copies as one
   provenance group; the harness counts independent support as 1, not 3, without
   adding a field to Claim or requiring all copies as evidence.
5. Setup uses real `baselineRefresh` in a temp repo, saves its snapshot beside it
   as `baseline.json`, then edits billing. No PR touches that path. `refreshStatus`
   reports it modified now and after learning. Baseline/pending refresh snapshots
   and all `sourceRefreshed` fields in `.devocd` JSON must remain unchanged;
   history-only bookkeeping may change. No source hashes are committed.
6. Today's detector returns two api:1.2 images, with distinct fake accounts and
   prod/staging environments. Future image claims must carry scope.environment;
   neither a shared claim nor file evidence may merge the two images. The learner
   may omit image claims; artifact discovery already has an independent live test.

Only synthetic accounts 111111111111 and 222222222222 occur in the fixture.
