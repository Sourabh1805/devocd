// Reject commit identities GitHub would credit to the wrong account.
//
// GitHub credits a commit by its email: a login-only `<login>@users.noreply.github.com`
// address belongs to whoever owns that login, so it credits the owner's commit to that
// stranger. Reserved example and local domains never belong to a real account either.
// `noreply@github.com` (GitHub's own web merges) and `<digits>+<login>@users.noreply.github.com`
// are the real thing and pass, as does any ordinary address.
//
// Usage: node tests/tools/authors.mjs <base> <head>
// Exit: 0 no bad identity in the range, 1 at least one, 2 on a bad argument or git failure.
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const LOGIN_ONLY = /^[^+@]+@users\.noreply\.github\.com$/i;
const RESERVED = ['.invalid', '@example.com', '@example.org', '@localhost', '.local'];

/** Would GitHub credit this email to an account that may not be the commit's owner? */
function badEmail(email) {
  const lower = String(email ?? '').toLowerCase();
  return LOGIN_ONLY.test(lower) || RESERVED.some((suffix) => lower.endsWith(suffix));
}

/** @param {{ hash: string, author: string, committer: string }[]} entries */
export function badIdentities(entries) {
  return entries.filter((entry) => badEmail(entry.author) || badEmail(entry.committer));
}

/** @param {string[]} argv */
function main(argv) {
  if (argv.length !== 2 || !argv[0] || !argv[1]) {
    console.error('usage: node tests/tools/authors.mjs <base> <head>');
    return 2;
  }
  const [base, head] = argv;
  const log = spawnSync('git', ['log', '--format=%H%x09%ae%x09%ce', `${base}..${head}`], { encoding: 'utf8' });
  if (log.error || log.status !== 0) {
    console.error(log.error?.message ?? (log.stderr ?? '').trim());
    return 2;
  }
  const entries = log.stdout.split('\n').filter(Boolean).map((line) => {
    const [hash, author, committer] = line.split('\t');
    return { hash, author, committer };
  });
  const bad = badIdentities(entries);
  for (const entry of bad) console.log(`${entry.hash.slice(0, 7)} author=${entry.author} committer=${entry.committer}`);
  return bad.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
