// @ts-check
// Layered redundancy: find sentences and bullets stated in more than one layer of loaded context.
import { homedir } from 'node:os';
import { join } from 'node:path';
import { isHeaderKeyLine } from './pagemeta.mjs';
import { estimateTokens } from './tokens.mjs';

/**
 * `yields`: a read-only layer whose facts belong elsewhere (a project or reference memory): it loses to any
 * DevOCD layer, and the repeat is reported on it as information, since DevOCD never edits it.
 * @typedef {{ file: string, text: string, rank: number, load: 'always'|'touch'|'demand', readOnly: boolean, yields?: boolean }} Layer
 */
/** Keeping priority: team files and personal memory 2, DevOCD layers 1, yielding memory 0. */
const tier = (/** @type {Layer} */ l) => (l.yields ? 0 : l.readOnly ? 2 : 1);
/** @typedef {{ file: string, line: number, keep: string, keepLine: number, match: 'exact'|'near', severity: 'warning'|'information', words: number, tokensPerSession: number }} Repeat */
/** @typedef {{ layer: number, line: number, words: number, norm: string, orig: string, cites: boolean, shingles: Set<string> }} Unit */

const WEIGHT = { always: 1, touch: 0.5, demand: 0.25 };
const MIN_WORDS = 8;
const NEAR = 0.8; // word-set Jaccard; 5-gram shingles cannot reach 0.8 after a two-word insertion in a 15-word sentence
const CITES_PATH = /`[^`\s]*\/[^`\s]*`|`[^`\s]*\.[A-Za-z0-9]{1,6}`/;

/** Claude Code's memory folder for a project: <config>/projects/<slug>/memory. */
export function memoryDirFor(/** @type {string} */ projectDir, { home = homedir(), configDir = process.env.CLAUDE_CONFIG_DIR } = {}) {
  return join(configDir || join(home, '.claude'), 'projects', projectDir.replace(/[^A-Za-z0-9]/g, '-'), 'memory');
}

/** @returns {string} the unit lowercased, stripped of markdown, lightly stemmed, single-spaced */
function normalize(/** @type {string} */ s) {
  return s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ')
    .map((w) => (w.length > 4 ? w.replace(/(ing|ed|es|s)$/, '') : w)).join(' ');
}

/** @returns {Unit[]} the comparable units of one layer */
function unitsOf(/** @type {Layer} */ layer, /** @type {number} */ index) {
  const lines = layer.text.split('\n');
  /** @type {Unit[]} */ const out = [];
  let fence = '';
  let evidence = false;
  let i = 0;
  if (/^---\s*$/.test((lines[0] ?? '').replace(String.fromCharCode(65279), ''))) {
    const end = lines.findIndex((l, n) => n > 0 && /^---\s*$/.test(l));
    if (end > 0) i = end + 1;
  }
  for (; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, '');
    const f = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) { if (f && f[1][0] === fence[0] && f[1].length >= fence.length && !f[2].trim()) fence = ''; continue; }
    if (f) { fence = f[1]; continue; }
    const t = line.trim();
    if (/^#{1,6}(\s|$)/.test(t)) { evidence = /^##\s+evidence\s*$/i.test(t); continue; }
    if (evidence || !t || isHeaderKeyLine(t) || /^<!--.*-->$/.test(t) || (/^[\s|:-]+$/.test(t) && t.includes('-'))) continue;
    const bullet = /^(?:[-*]|\d+[.)])\s+(.*)$/.exec(t);
    const parts = (bullet ? bullet[1] : t).split(/(?<=[.!?])\s+/);
    for (const orig of parts) {
      const norm = normalize(orig);
      const w = norm ? norm.split(' ') : [];
      if (w.length < MIN_WORDS) continue;
      const shingles = new Set();
      for (const x of w) shingles.add(x);
      out.push({ layer: index, line: i + 1, words: w.length, norm, orig, cites: CITES_PATH.test(t), shingles });
    }
  }
  return out;
}

/**
 * Find sentences and bullets repeated across (or within) layers, reported once on the side that should lose them.
 * @param {Layer[]} layers in load order
 * @returns {Repeat[]}
 */
export function findRepeats(layers) {
  /** @type {Repeat[]} */ const out = [];
  /** @type {Unit[]} */ const seen = [];
  /** @type {Map<string, number>} */ const exact = new Map();
  /** @type {Map<string, number[]>} */ const index = new Map();
  layers.forEach((_, li) => {
    for (const u of unitsOf(layers[li], li)) {
      let m = exact.get(u.norm);
      let kind = /** @type {'exact'|'near'} */ ('exact');
      if (m === undefined) {
        kind = 'near';
        /** @type {Map<number, number>} */ const shared = new Map();
        for (const s of u.shingles) for (const id of index.get(s) ?? []) shared.set(id, (shared.get(id) ?? 0) + 1);
        let best = NEAR;
        for (const [id, n] of [...shared].sort((a, b) => a[0] - b[0])) {
          const j = n / (u.shingles.size + seen[id].shingles.size - n);
          if (j >= best && (m === undefined || j > best)) { m = id; best = j; }
        }
      }
      const id = seen.push(u) - 1;
      if (!exact.has(u.norm)) exact.set(u.norm, id);
      for (const s of u.shingles) { const a = index.get(s); if (a) a.push(id); else index.set(s, [id]); }
      if (m === undefined) continue;
      const first = seen[m];
      const [a, b] = [layers[first.layer], layers[u.layer]];
      let keepFirst = true;
      if (first.layer !== u.layer && tier(a) !== tier(b)) keepFirst = tier(a) > tier(b);
      else if (first.layer !== u.layer && !a.readOnly && a.rank !== b.rank) keepFirst = (first.cites || u.cites) ? a.rank > b.rank : a.rank < b.rank;
      const [loser, winner] = keepFirst ? [u, first] : [first, u];
      const lf = layers[loser.layer];
      out.push({
        file: lf.file, line: loser.line, keep: layers[winner.layer].file, keepLine: winner.line, match: kind,
        // DevOCD never edits a read-only file, so a repeat reported on one is information.
        severity: lf.readOnly ? 'information' : 'warning', words: loser.words,
        tokensPerSession: Math.max(1, Math.round(estimateTokens(loser.orig) * WEIGHT[lf.load])),
      });
    }
  });
  return out.sort((x, y) => (x.file < y.file ? -1 : x.file > y.file ? 1 : x.line - y.line));
}
