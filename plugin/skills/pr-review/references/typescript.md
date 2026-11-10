# TypeScript and JavaScript

Load when the diff changes `*.ts`, `*.tsx`, `*.js`, `*.jsx`, `*.mjs`, `*.cjs`, `package.json`, a lockfile or `tsconfig*.json`.

## Usual checks

Each is `blocked` unless an approved command covers it; name the command the repo would use.
- Tests: the `test` script (`npm test`, `pnpm test`, `yarn test`).
- Lint: the `lint` script, or ESLint.
- Type check (TypeScript only): the `typecheck` script, or `tsc --noEmit`.

A change to `package.json` scripts, a lockfile, `tsconfig*.json` or an ESLint or test runner config means asking again before any approved command.

## Look for

- An async call with no `await`, `.catch()` or `try`: the rejection is unhandled, and Node stops the process. An Express or `http` handler that awaits without a `try` leaves the request hanging or crashes.
- `JSON.parse` on outside text with no `try`.
- Request values used as-is: `req.query.x` and `searchParams.get('x')` can be missing (`null`, `undefined`), a string, or (Express) an array.
- Input inside `path.join`, `fs` calls or a template path: path traversal.
- SQL or shell text built with template literals.
- Money in floating point; `parseInt` with no radix; `==` between mixed types.
- Object merges or `Object.assign` from input: prototype pollution (`__proto__`).
- `any` or `as` casts that hide a real type mismatch.
- A promise in `forEach` (not awaited), or `await` inside a loop that should run in parallel, when it changes the result.
- A dependency added to `dependencies` that is only used in tests, or the reverse.
- Floating promises in tests that make them pass without checking anything.
