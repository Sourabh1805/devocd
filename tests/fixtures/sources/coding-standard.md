# Acme Example Co: Coding Standard (FAKE FIXTURE)

This is a made-up document used only to test DevOCD.

- Write TypeScript with `strict` on; avoid `any`.
- Prefer small functions with one job; keep files under 300 lines.
- Every bug fix comes with a test that failed before the fix.
- Name tests after behaviour, for example "rejects an expired token".
- Run the linter and the unit tests before opening a pull request.
- Use conventional commit messages (`fix:`, `feat:`, `docs:`).
- Log with the shared logger; never use `console.log` in services.
