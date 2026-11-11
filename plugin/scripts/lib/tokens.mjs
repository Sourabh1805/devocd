// @ts-check

/** Rough token estimate: ASCII characters count 1/4, everything else 1/2. */
export function estimateTokens(/** @type {string} */ text) {
  let ascii = 0;
  let other = 0;
  for (const ch of text) {
    if (ch.charCodeAt(0) < 128) ascii++;
    else other++;
  }
  return Math.ceil(ascii / 4 + other / 2);
}

/** Global size limits, by file kind. Tokens are estimated. */
export const LIMITS = Object.freeze({
  parent: { lines: 60, tokens: 500, keyRulesTokens: 300 },
  pointer: { lines: 40, tokens: 400 },
  project: { lines: 80, tokens: 700 },
  entry: { lines: 100, tokens: 900 },
  flow: { lines: 80 },
  reference: { lines: 200 },
  launchTokens: 2000,
  footprintTokens: 125,
});
