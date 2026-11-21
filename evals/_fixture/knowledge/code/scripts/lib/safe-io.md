# safe-io

Parent: [scripts](../index.md)
Scope: scripts/lib/{fsutil,protect,backup,block,settings,draft,split}.mjs
Uses: none

Guarded filesystem and git primitives: every DevOCD write goes through these and refuses links.

- Entry points: `scripts/lib/fsutil.mjs:142` (`assertSafeTarget`), `:188` (`writeFilesAtomic`), `:54` (`walk`); `scripts/lib/protect.mjs:82` (`protectRepo`) and `:66` (`assertNotTracked`); `scripts/lib/backup.mjs:52`/`:83`; `scripts/lib/block.mjs:16` (`findBlock`), `:106` (`writeBlock`); `scripts/lib/settings.mjs:17`; `scripts/lib/draft.mjs:14` (`cleanDraft`); `scripts/lib/split.mjs:27` (`splitTeam`)
- Public surface: CLI `protect`, `backup`, `restore`, `write-block`, `settings`, `clean-draft`, `split-team`; `walk`/`lstatOrNull`/`codedError` are used by nearly every library.
- Run/test this part: `npm test` (documented, not approved for PR review); covering tests `tests/unit/fsutil.test.mjs`, `protect.test.mjs`, `backup.test.mjs`, `block.test.mjs`, `settings.test.mjs`, `settings-safety.test.mjs`, `draft.test.mjs`, `split.test.mjs` (names only, not read)
- To add a guarded writer: call `assertSafeTarget`/`checkTarget`/`prepareTarget` first (`fsutil.mjs:142-177`), run `assertNotTracked` inside a work tree, and publish several files with `writeFilesAtomic`.
- Pitfalls:
  - `protectRepo` writes only to `.git/info/exclude` (patterns at `protect.mjs:7`), then checks with `git check-ignore`; a tracked `.gitignore` that re-includes a path makes it refuse with `NOT_IGNORED` (`:33-44`). Git runs by argv, never a shell (`:19`).
  - `backupDir` keeps the newest 5 (`backup.mjs:5`); `restoreDir` never overwrites existing `decisions.md` or `decision-history/` and never removes files created after the backup (`:99-105`; `docs/repo-memory.md:59`).
  - Managed block markers must be exactly one begin and one end line, else `BLOCK_MALFORMED` (`block.mjs:30`); non-UTF-8 files are refused (`:69`).
  - `editSettings` refuses malformed JSON and removes an empty settings file (`settings.mjs:26-56`).
  - `cleanDraft` deletes only `.devocd/draft`, refusing links and tracked content (`draft.mjs:14-28`).
  - `splitTeam` takes only `.devocd/split.draft.json`, copies bytes, and deletes the plan even on failure (`split.mjs:27-41`); split files are capped at 200 lines (`:7`).
  - `writeFilesAtomic` rollback is best effort, not a journal (`fsutil.mjs:211`).

Standards: none recorded — add with /devocd:company-policy

## Evidence

- scripts/lib/fsutil.mjs#L54-215 sha256:d033587636c10db9e402265f2bb62cb9ad844b2fe47f39b864c1e12b84f8b959 2026-11-20
- scripts/lib/protect.mjs#L1-109 sha256:0219474ae42acc3035d45677295836e0fbd6dc082943aaaf97a3648aabb8138b 2026-11-20
- scripts/lib/backup.mjs#L1-108 sha256:ad1f4a146a636195487f1e0b275cdaecf2e36b65a53a246203ad3f3766275e90 2026-11-20
- scripts/lib/block.mjs#L1-108 sha256:952a8a83f50ecf94327769e87459a4ff8761991bd21aefee7e085928a6bbb0f0 2026-11-20
- scripts/lib/settings.mjs#L1-61 sha256:9b037ccb3c60f1e886c698653a0c2525ecd648a77b9350b656709fb4e17872e2 2026-11-20
- scripts/lib/draft.mjs#L1-28 sha256:44ef6d2a7d8fdf231706ea4471382ec3f5af87aaea3a12e5b182fce4f1dfca45 2026-11-20
- scripts/lib/split.mjs#L1-70 sha256:f14835de905ce674a9b4410fbacc92d999b93e1bf0bdbb0a36b27c35bf9d0efb 2026-11-20
