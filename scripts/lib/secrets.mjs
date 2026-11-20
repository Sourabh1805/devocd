
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

const FIXED = /** @type {[string, RegExp][]} */ ([
  ['aws-access-key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/],
  ['slack-token', /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ['private-key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
]);
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
      if (re.test(line)) { hits.push({ line: i + 1, kind }); return; }
    }
    const m = GENERIC.exec(line);
    if (m && entropy(m[1]) >= 3.5) hits.push({ line: i + 1, kind: 'high-entropy-assignment' });
  });
  return hits;
}
