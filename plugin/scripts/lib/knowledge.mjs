// @ts-check
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, posix, relative, resolve } from 'node:path';
import { checkTarget, codedError, lstatOrNull, prepareTarget, toPosix, walkFiles } from './fsutil.mjs';
import { assertNotTracked, insideWorkTree } from './protect.mjs';
import { maskCode, stateProblem } from './check.mjs';
import { scanSecrets } from './secrets.mjs';
import { renderKnowledge } from './knowledge-view.mjs';
import { estimateTokens } from './tokens.mjs';

/** @typedef {{id: string, title: string, text: string, sha256: string}} KnowledgeNode */
/** @typedef {{source: string, target: string, line: number}} KnowledgeEdge */
/** @typedef {{id: string, parent: string|null, nodes: string[]}} KnowledgeScope */
/** @typedef {{version: number, nodes: KnowledgeNode[], edges: KnowledgeEdge[], scopes?: KnowledgeScope[], projects?: {id: string, entry: string}[]}} KnowledgeGraph */
const MAX_FILE = 256 * 1024;
const MAX_TOTAL = 4 * 1024 * 1024;
const MAX_NODES = 500;

/** Build from curated Markdown only. Links are evidence, never instructions or fetch targets.
 * @param {string} dir @returns {KnowledgeGraph}
 */
export function buildKnowledge(dir) {
  const root = resolve(dir);
  const base = join(root, '.devocd');
  for (const path of [root, base]) {
    const st = lstatOrNull(path);
    if (!st?.isDirectory() || st.isSymbolicLink()) throw codedError('NO_DEVOCD', 'Knowledge requires a real project folder with a real .devocd directory.');
  }
  const files = walkFiles(base, (_path, name) => name.startsWith('.'))
    .filter((path) => path.endsWith('.md') && !relative(base, path).split(/[\\/]/).some((part) => part.startsWith('.')));
  if (files.length > MAX_NODES) throw codedError('KNOWLEDGE_LIMIT', `Knowledge supports at most ${MAX_NODES} Markdown files.`);
  /** @type {KnowledgeNode[]} */
  const nodes = [];
  let total = 0;
  for (const file of files) {
    const id = toPosix(relative(base, file));
    const size = lstatOrNull(file)?.size ?? 0;
    total += size;
    if (size > MAX_FILE || total > MAX_TOTAL) throw codedError('KNOWLEDGE_LIMIT', `Knowledge input exceeds the size limit at ${id}.`);
    const bytes = readFileSync(file);
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { throw codedError('NOT_UTF8', `Knowledge source is not UTF-8: ${id}`); }
    if (text.includes('\0')) throw codedError('NOT_UTF8', `Knowledge source contains binary data: ${id}`);
    if (scanSecrets(text).length || scanSecrets(id).length) throw codedError('KNOWLEDGE_SECRET', `Knowledge source contains a likely secret: ${scanSecrets(id).length ? '(filename withheld)' : id}`);
    const title = /^#\s+(.+)$/m.exec(text)?.[1].trim() || id;
    nodes.push({ id, title, text, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  const ids = new Set(nodes.map((node) => node.id));
  /** @type {KnowledgeEdge[]} */
  const edges = [];
  for (const node of nodes) {
    const seen = new Set();
    maskCode(node.text).split('\n').forEach((line, index) => {
      for (const match of line.matchAll(/(?<!!)\[[^\]]*\]\(\s*(<[^>]*>|[^)\s]+)(?:\s+[^)]*)?\)/g)) {
        let target;
        try { target = decodeURIComponent(match[1].replace(/^<|>$/g, '').split(/[?#]/)[0]); } catch { continue; }
        if (!target || /^[a-z][a-z\d+.-]*:|^[\\/]/i.test(target) || target.includes('\\')) continue;
        target = posix.normalize(posix.join(posix.dirname(node.id), target));
        if (target === node.id || !ids.has(target) || seen.has(target)) continue;
        seen.add(target);
        edges.push({ source: node.id, target, line: index + 1 });
      }
    });
  }
  const scopeIds = new Set(['.']);
  for (const node of nodes) {
    for (let scope = posix.dirname(node.id); scope !== '.'; scope = posix.dirname(scope)) scopeIds.add(scope);
  }
  const scopes = [...scopeIds].sort().map(id => ({
    id, parent: id === '.' ? null : posix.dirname(id),
    nodes: nodes.filter(n => id === '.' || n.id.startsWith(`${id}/`)).map(n => n.id),
  }));
  // Registry pointers are metadata, never traversal targets. Each project keeps its own graph.
  const projects = [];
  const statePath = join(base, 'state.json');
  if (lstatOrNull(statePath)?.isFile()) {
    if (lstatOrNull(statePath).size > MAX_FILE) throw codedError('KNOWLEDGE_LIMIT', 'Knowledge state exceeds the size limit.');
    let state;
    try { state = JSON.parse(readFileSync(statePath, 'utf8')); }
    catch { throw codedError('NO_STATE', 'Knowledge state is not valid JSON.'); }
    if (state?.kind === 'company') {
      if (stateProblem(state)) throw codedError('NO_STATE', 'Knowledge requires valid company state.');
      for (const project of state.projects) {
        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(project.id) || project.path.includes('\\') || project.path.startsWith('/') || /^[a-z]:/i.test(project.path) || project.path.split('/').includes('..')) throw codedError('BAD_TARGET', 'Invalid project registry pointer.');
        const entry = posix.join(project.path, '.devocd/PROJECT.md');
        if (scanSecrets(entry).length) throw codedError('KNOWLEDGE_SECRET', 'Project registry contains a likely secret.');
        projects.push({ id: project.id, entry });
      }
    }
  }
  return { version: 2, nodes, edges, scopes, projects };
}

/** Return a nested subgraph without reading source code or other projects.
 * @param {KnowledgeGraph} graph @param {string} scope
 */
export function scopeKnowledge(graph, scope) {
  const selected = graph.scopes?.find(s => s.id === scope);
  if (!selected) throw codedError('BAD_TARGET', 'Unknown knowledge scope.');
  const ids = new Set(selected.nodes);
  return { ...graph, nodes: graph.nodes.filter(n => ids.has(n.id)), edges: graph.edges.filter(e => ids.has(e.source) && ids.has(e.target)), scopes: graph.scopes.filter(s => scope === '.' || s.id === scope || s.id.startsWith(`${scope}/`)), projects: scope === '.' ? graph.projects : [] };
}

/** Literal, case-insensitive AND search; title/path matches rank above body matches.
 * @param {KnowledgeGraph} graph @param {string} query
 */
export function searchKnowledge(graph, query) {
  const terms = [...new Set(query.toLowerCase().trim().split(/\s+/).filter(Boolean))];
  if (!terms.length) return [];
  return graph.nodes.map((node) => {
    const heading = (node.title + '\n' + node.id).toLowerCase();
    const body = node.text.toLowerCase();
    const score = terms.every((term) => heading.includes(term) || body.includes(term))
      ? terms.reduce((sum, term) => sum + (heading.includes(term) ? 3 : 1), 0) : 0;
    const line = node.text.split('\n').findIndex((value) => terms.some((term) => value.toLowerCase().includes(term))) + 1;
    return { id: node.id, title: node.title, score, line: line || 1 };
  }).filter((result) => result.score > 0).sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Bounded routing metadata, never full page text. Page through five matches at a time. */
export function routeKnowledge(graph, query, offset = 0) {
  if (!query.trim() || !Number.isSafeInteger(offset) || offset < 0) throw codedError('USAGE', 'Use a query and nonnegative integer offset.');
  const matches = searchKnowledge(graph, query);
  const byId = new Map(graph.nodes.map(n => [n.id, n]));
  const results = matches.slice(offset, offset + 5).map(match => ({ ...match, title: match.title.slice(0, 120), estimatedTokens: estimateTokens(byId.get(match.id).text) }));
  return { results, totalMatches: matches.length, nextOffset: offset + 5 < matches.length ? offset + 5 : null };
}

/** Validate every destination before writing; never overwrite tracked files.
 * @param {string} dir
 */
export function writeKnowledge(dir) {
  const graph = buildKnowledge(dir);
  const paths = ['knowledge.json', 'knowledge.html'].map((name) => join(resolve(dir), '.devocd', name));
  for (const path of paths) checkTarget(path);
  if (insideWorkTree(dir)) assertNotTracked(dir, paths.map((path) => toPosix(relative(resolve(dir), path))));
  const contents = [JSON.stringify(graph, null, 2) + '\n', renderKnowledge(graph)];
  for (let i = 0; i < paths.length; i++) {
    prepareTarget(paths[i]);
    writeFileSync(paths[i], contents[i], 'utf8');
  }
  return { files: paths.map(toPosix), nodes: graph.nodes.length, edges: graph.edges.length };
}
