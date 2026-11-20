# Proposal review

A reviewer checks every validated proposal in a fresh context before a human approves
publication. Review is not a re-run of the work, and a reviewer never edits the proposal;
it returns findings and one verdict.

## Spec compliance

- [ ] The brief's goal is met by the proposed pages or claims, not only by the summary.
- [ ] Every page path is inside the permitted draft prefixes, and no file is proposed twice.
- [ ] Claim bodies validate as T44 claims and claim no more authority than their evidence gives.
- [ ] The unit carries exactly one status, and that status is justified by its proposals.

## Cited evidence

- [ ] Every cited file exists, is a regular file, and matches its SHA-256.
- [ ] PR and session references are real and belong to this unit.
- [ ] Nothing is cited that the brief did not allow the worker to read.
- [ ] No secret, token or raw prompt text appears in evidence, content or concerns.

## Grounded claims

- [ ] Each statement traces to a cited source; unevidenced statements are marked as hypotheses.
- [ ] The text reports what the source says, not what seems likely to be true.
- [ ] Conflicting sources are named as conflicts, not averaged into a confident answer.
- [ ] No repetition, and no approved-sounding wording: approval is the user's decision.

## Verdict

Return one of: accept, correct (name the rule that was broken), or escalate (the brief
itself is at fault). A correction round resumes the same worker with the findings; it
does not pass the unit forward.
