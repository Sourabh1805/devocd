# Worker brief

The controller writes one brief per unit. It is data for the worker: it grants no write
access and no permission to read beyond the inputs it names. Workers stay read-only and
reply with a proposal (see [proposal.md](proposal.md)) that Node checks before anything
is persisted.

| Section | Content |
| --- | --- |
| Goal | The one outcome this unit must produce, in a sentence. |
| Unit | Stable unit id, plus the class and explicit model the task classifier resolved. |
| Inputs | Read-only source paths, quoted search terms and the exact files worth opening. Nothing else. |
| Permitted paths | Draft prefixes the unit may propose pages under, for example `.devocd/draft/`. Every other path is rejected. |
| Output schema | The proposal object in [proposal.md](proposal.md): one status, page or claim proposals, cited evidence, concerns. |
| Evidence | What counts as proof: a hashed file under the workspace, a PR number, or a session id. |
| Budget | Wall-clock or token ceiling, and the one correction round the controller will consider. |
| Done when | The checks the controller will run, named here so a correction round is avoidable. |

Write the goal and the done-when checks, not the answer. A brief never asks for a file
edit, a commit, a publication or an approval. If the inputs are missing or contradict
each other, the worker returns `NEEDS_CONTEXT` instead of guessing, and the controller
fixes the brief rather than the worker.
