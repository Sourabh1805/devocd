// @ts-check
// Path-scoped rule stubs: small generated notes Claude Code loads only when it opens a matching file.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { codedError, lstatOrNull, prepareTarget, readTextOrNull } from './fsutil.mjs';
import { assertNotTracked, insideWorkTree, protectRepo } from './protect.mjs';
import { fencedLines } from './check.mjs';
import { scanSecrets } from './secrets.mjs';
import { buildKnowledge } from './knowledge.mjs';
import { freshnessOf } from './trace.mjs';

/** @typedef {import('./knowledge.mjs').KnowledgeGraph} KnowledgeGraph */

const FOLDER = '.claude/rules/devocd';
const MAX_LINE = 200;
const MAX_BODY = 10;
const GENERATED = /^DevOCD module note, generated from \.devocd\/.+ by devocd\. Do not edit; it is regenerated\.$/;

const clip = (/** @type {string} */ s) => (s.length > MAX_LINE ? s.slice(0, MAX_LINE) : s);
const sha6 = (/** @type {string} */ s) => createHash('sha256').update(s).digest('hex').slice(0, 6);

/** @param {string} id */
function baseName(id) {
  return id.replace(/\/index\.md$/, '').replace(/\.md$/, '').toLowerCase().split('/')
    .map((seg) => seg.replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'x').join('--');
}

/** Text of a `- Label:` bullet outside fenced code, without the leading dash. */
function bullet(/** @type {string} */ text, /** @type {string} */ label) {
  const lines = text.split('\n');
  const fenced = fencedLines(text);
  const re = new RegExp(`^\\s*[-*]\\s+(${label}:.*)$`);
  for (let i = 0; i < lines.length; i++) {
    if (fenced[i]) continue;
    const m = re.exec(lines[i].replace(/\r$/, ''));
    if (m) return m[1].trim();
  }
  return '';
}

/**
 * @param {KnowledgeGraph} graph
 * @param {{ freshness?: Record<string, string> | Map<string, string> }} [options]
 * @returns {{ file: string, content: string }[]}
 */
export function planRuleStubs(graph, { freshness } = {}) {
  const fresh = (/** @type {string} */ id) => (freshness instanceof Map ? freshness.get(id) : freshness?.[id]);
  const hasDecisions = graph.nodes.some((n) => n.id === 'decisions.md');
  const scoped = graph.nodes.filter((n) => (n.kind === 'module' || n.kind === 'flow') && n.meta.scope.length);
  const counts = new Map();
  for (const n of scoped) counts.set(baseName(n.id), (counts.get(baseName(n.id)) ?? 0) + 1);
  /** @type {{ file: string, content: string }[]} */
  const out = [];
  for (const n of scoped) {
    const base = baseName(n.id);
    const name = counts.get(base) > 1 ? `${base}-${sha6(n.id)}` : base;
    const entry = bullet(n.text, 'Entry points');
    const pitfalls = bullet(n.text, 'Pitfalls');
    const body = [
      `DevOCD module note, generated from .devocd/${n.id} by devocd. Do not edit; it is regenerated.`,
      n.summary && `Purpose: ${n.summary}`,
      entry,
      pitfalls,
      n.meta.standards.length && `Policies: ${n.meta.standards.join(', ')} — read them via .devocd/PROJECT.md Links before changing behaviour.`,
      hasDecisions && 'Decisions: check .devocd/decisions.md before changing behaviour here.',
      `Full page: .devocd/${n.id}; or run devocd trace . "<this file>" for parents, policies and freshness.`,
      fresh(n.id) === 'stale' && 'Note: this page may be stale (its cited source changed); verify against source.',
    ].filter(Boolean).slice(0, MAX_BODY).map((l) => clip(/** @type {string} */ (l)));
    const paths = n.meta.scope.map((g) => `  - "${g.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
    const content = `---\npaths:\n${paths.join('\n')}\n---\n\n${body.join('\n')}\n`;
    if (scanSecrets(content).length) continue;
    out.push({ file: `${FOLDER}/${name}.md`, content });
  }
  return out;
}

/** True when the file's first body line (after frontmatter) is the generated marker. */
function isGenerated(/** @type {string} */ text) {
  let rest = text.replace(/\r\n/g, '\n');
  if (rest.startsWith('---\n')) {
    const end = rest.indexOf('\n---\n', 3);
    if (end < 0) return false;
    rest = rest.slice(end + 5);
  }
  const first = rest.split('\n').find((l) => l.trim() !== '');
  return first !== undefined && GENERATED.test(first);
}

/**
 * Write the stubs for a project and remove generated ones that are no longer planned.
 * @param {string} dir project root
 * @param {KnowledgeGraph} [graph] an already built graph
 * @returns {{ written: number, removed: number } | null} null for anything that is not a project
 */
export function writeRuleStubs(dir, graph) {
  const root = resolve(dir);
  let state;
  try { state = JSON.parse(readTextOrNull(join(root, '.devocd', 'state.json')) ?? ''); } catch { return null; }
  if (!state || state.kind !== 'project') return null;

  for (const rel of ['.claude', '.claude/rules', FOLDER]) {
    const st = lstatOrNull(join(root, ...rel.split('/')));
    if (st && (st.isSymbolicLink() || !st.isDirectory())) {
      throw codedError('BAD_TARGET', `${rel} is a link or not a folder`, 'devocd never writes through symlinks or junctions. Remove or fix it, or set "ruleStubs": false in .devocd/state.json.');
    }
  }

  /** @type {{ file: string, content: string }[]} */
  let plan = [];
  if (state.ruleStubs !== false) {
    const g = graph ?? buildKnowledge(root);
    const check = freshnessOf(root);
    /** @type {Record<string, string>} */
    const fresh = {};
    for (const n of g.nodes) if (n.meta.scope.length && n.meta.evidence.length) fresh[n.id] = check(n);
    plan = planRuleStubs(g, { freshness: fresh });
  }
  const folder = join(root, ...FOLDER.split('/'));
  const planned = new Set(plan.map((p) => p.file.slice(FOLDER.length + 1)));
  /** @type {string[]} */
  const stale = [];
  if (lstatOrNull(folder)) {
    for (const name of readdirSync(folder)) {
      if (planned.has(name) || !name.endsWith('.md')) continue;
      const path = join(folder, name);
      if (!lstatOrNull(path)?.isFile()) continue;
      if (isGenerated(readFileSync(path, 'utf8'))) stale.push(name);
    }
  }
  if (insideWorkTree(root)) {
    assertNotTracked(root, [...plan.map((p) => p.file), ...stale.map((n) => `${FOLDER}/${n}`)]);
    // Installs protected before rule notes existed lack this exclude entry; add it (local only) so git stays clean.
    if (plan.length) protectRepo(root);
  }

  for (const p of plan) {
    const path = join(root, ...p.file.split('/'));
    prepareTarget(path);
    writeFileSync(path, p.content, 'utf8');
  }
  for (const name of stale) rmSync(join(folder, name), { force: true });
  return { written: plan.length, removed: stale.length };
}
