
/** Shannon entropy in bits per character. */
function entropy(/** @type {string} */ s) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const c of s) counts[c] = (counts[c] || 0) + 1;
  let h = 0;
  for (const n of Object.values(counts)) {
    const p = n / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

/**
 * Shapes that are never a secret: a hash, an ID, a placeholder, or a value that carries no
 * information. One list, checked against every candidate value before anything is reported.
 * Callers drop a file when a scanner fires, so a false positive here silently removes a real
 * source file from the knowledge, and a miss leaks a credential into it.
 */
const GUARD = Object.freeze([
  /^(.)\1*$/s, // a value that is all one character
  /^sha256:[0-9a-f]{64}$/i, // an evidence line: the hash is the citation, not a credential
  /^[0-9a-f]{40}$/i, // a bare git SHA
  /^[0-9a-f]{64}$/i, // a bare sha256
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, // a UUID
  /^<[^>]*>$/, // <token>
  /^\$\{[^}]*\}$/, // ${VAR}
  /^%[^%]+%$/, // %VAR%
  /^x{3,}$/i, // xxx… and XXXX
  /^\.{3,}$/, // ...
  /^your[-_].*[-_]here$/i, // your-api-key-here
  /^(?:example|test|none|null|undefined|todo|tbd)$/i, // a stand-in word, never a value
  // A value that opens with a stand-in word: `changeme123…`, `test-token-…`, `dummy_secret`.
  /^(?:changeme|dummy|fake|example|test|placeholder|replace[-_]?me)/i,
  /\b(?:changeme|dummy|fake|placeholder|replace[-_]?me)\b/i, // the same words anywhere in the value
]);

/** @param {string} value @returns {boolean} true when this candidate is not a secret */
function guarded(/** @type {string} */ value) {
  return GUARD.some((re) => re.test(value));
}

/**
 * One entry per detected kind. `kind` first, then the pattern; **group 1 is the credential as a
 * whole**, prefix included, because that is what the guard has to judge: `AKIA` plus sixteen
 * `A`s is a placeholder, while a bare run of `A`s is not what a signature prefix looks like.
 * @type {[string, RegExp][]}
 */
const FIXED = [
  ['aws-access-key', /\b((?:AKIA|ASIA)[0-9A-Z]{16})\b/],
  ['github-token', /\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/],
  ['gitlab-token', /\b(glpat-[A-Za-z0-9_-]{20,})/],
  ['anthropic-key', /\b(sk-ant-[A-Za-z0-9_-]{20,})/],
  // sk- and sk-proj- carry 40+ characters; the lookahead keeps sk-ant- on its own kind.
  ['openai-key', /\b(sk-(?!ant-)(?:proj-)?[A-Za-z0-9_-]{40,})/],
  ['google-api-key', /\b(AIza[0-9A-Za-z_-]{35})/],
  ['stripe-key', /\b((?:sk|rk)_live_[0-9A-Za-z]{20,})/],
  ['slack-token', /\b(xox[baprs]-[A-Za-z0-9-]{10,})/],
  ['slack-webhook', /(hooks\.slack\.com\/services\/[A-Za-z0-9/_-]{10,})/],
  ['sendgrid-key', /\b(SG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{40,})/],
  ['twilio-key', /\b(SK[0-9a-f]{32})\b/i],
  ['npm-token', /\b(npm_[A-Za-z0-9]{36})\b/],
  ['pypi-token', /\b(pypi-[A-Za-z0-9_-]{20,})/],
  ['azure-storage-key', /(AccountKey=[A-Za-z0-9+/=]{20,})/],
  // Key=value inside a connection string: the string has to end after the value, so a page that
  // mentions the key in prose (`Password=`/`pwd=`) is not a credential.
  ['connection-string-password', /\b((?:Password|pwd)=[^;'"\s]+)(?=;|\s*$)/i],
  // Both of the first two segments are base64url of a JSON object, so both start with `eyJ`.
  ['jwt', /\b(eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/],
  // A credential on a host RFC 2606 reserves for documentation is documentation, not a credential.
  ['url-credentials', /(\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@(?![\w.-]*\bexample\.(?:com|net|org)\b)[^\s/@]+)/i],
  ['auth-header', /(\bAuthorization:\s*(?:Basic|Bearer)\s+[A-Za-z0-9._~+/=-]{20,})/i],
  // Assembled from two pieces: the scanner reads this file through the installed runtime, so the
  // source must not itself contain the block marker it looks for.
  ['pgp-private-key', new RegExp('(-----BEGIN PGP ' + 'PRIVATE KEY BLOCK-----)')],
  ['private-key', /(-----BEGIN [A-Z ]*PRIVATE KEY-----)/],
  ['docker-auth', /("auth"\s*:\s*"[A-Za-z0-9+/=]{16,}")/],
];
const GENERIC = /(?:secret|token|passwd|password|api[_-]?key|access[_-]?key|private[_-]?key)\w*["']?\s*[:=]\s*["']?([A-Za-z0-9+/_=-]{20,})/i;

/**
 * Find likely secrets. Returns 1-based line numbers and a kind, never the value.
 * @param {string} text
 * @returns {{ line: number, kind: string }[]}
 */
export function scanSecrets(text) {
  /** @type {{ line: number, kind: string }[]} */
  const hits = [];
  text.split(/\r?\n/).forEach((line, i) => {
    for (const [kind, re] of FIXED) {
      const m = re.exec(line);
      if (!m || guarded(m[1] ?? m[0])) continue;
      hits.push({ line: i + 1, kind });
      return;
    }
    const m = GENERIC.exec(line);
    if (m && !guarded(m[1]) && entropy(m[1]) >= 3.5) hits.push({ line: i + 1, kind: 'high-entropy-assignment' });
  });
  return hits;
}
