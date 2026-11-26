# @vitest/pretty-format

Parent: [packages](../index.md)
Scope: packages/pretty-format/**
Uses: none

Value serializer (Jest port) used by snapshots and diffs, with DOM, Immutable and React plugins.

- Entry points: `src/index.ts:523` `format`; `:417` `DEFAULT_OPTIONS`; `:564` `plugins` registry. Plugin sources: `src/plugins/{AsymmetricMatcher,DOMCollection,DOMElement,Immutable,ReactElement,ReactTestComponent}.ts` (inventory only).
- Public surface: `format(val, options?)`, `plugins`.
- Run/test this part: `pnpm test` (documented); `test/unit/test/pretty-format.test.ts`.
- Extension points: to add a serializer, add a file under `src/plugins/` and register it in the `plugins` object (`index.ts:564`).
- Pitfalls: only signatures were read; behavioural details are unconfirmed.
- Tests: `test/unit/test/pretty-format.test.ts` (name only). `test/unit/package.json` imports `@vitest/pretty-format`.

Standards: none recorded — add with /devocd:company-policy; route via [PROJECT](../../../PROJECT.md) Links

## Evidence

- packages/pretty-format/src/index.ts#L417-564 sha256:a3b23db57e89046e28c7ce71f6b5defafc618ed9afecd0a2d13137531ecdd3a2 2026-11-26
