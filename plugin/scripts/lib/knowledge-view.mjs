// @ts-check
import { rankPages } from './search.mjs';

/** Self-contained offline viewer. Source content is always inserted as text.
 * @param {import('./knowledge.mjs').KnowledgeGraph} graph
 */
export function renderKnowledge(graph) {
  const data = JSON.stringify(graph).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; base-uri 'none'; form-action 'none'">
<title>DevOCD knowledge graph</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#101827;color:#e6edf7;font:16px system-ui,sans-serif}
header{padding:24px;border-bottom:1px solid #35445c}h1{font-size:24px;margin:0 0 8px}p{color:#adbed6}
input{width:100%;max-width:600px;padding:12px;background:#1d2c43;color:inherit;border:1px solid #657d9c;border-radius:6px;font:inherit}
main{display:grid;grid-template-columns:minmax(240px,1fr) 3fr;gap:20px;padding:20px}button{display:block;width:100%;text-align:left;padding:10px;margin:5px 0;background:#1d2c43;color:inherit;border:1px solid #405879;border-radius:5px;cursor:pointer;font:inherit}
button small{display:block;color:#adbed6;margin-top:4px}
button:hover,button[aria-pressed=true]{background:#305381}button:focus-visible,input:focus-visible{outline:3px solid #72c7ff}
svg{width:100%;height:420px;background:#142035;border-radius:8px}line{stroke:#597695;stroke-width:1.5}circle{fill:#72c7ff;stroke:#101827;stroke-width:2}text{fill:#e6edf7;font-size:12px}g{cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.6 ui-monospace,monospace}#detail{padding:16px;background:#142035;border-radius:8px;margin-top:16px}
@media(max-width:700px){main{grid-template-columns:1fr}svg{height:320px}}
</style></head><body>
<header><h1>Project knowledge graph</h1><p>Local Markdown documents and their directed links. Select a document to inspect its source and connections.</p>
<label for="search">Search titles, paths and content</label><br><input id="search" type="search" placeholder="Search knowledge…" autocomplete="off">
<nav id="scopes" aria-label="Nested graphs"></nav><div id="projects"></div>
<p id="status" role="status" aria-live="polite"></p></header>
<main><nav id="results" aria-label="Documents"></nav><section aria-label="Knowledge graph"><svg id="graph" viewBox="0 0 900 500" role="img" aria-label="Document connections"></svg><article id="detail"><h2 id="title">Select a document</h2><p id="path"></p><div id="connections"></div><pre id="content"></pre></article></section></main>
<script id="data" type="application/json">${data}</script>
<script>
${rankPages.toString()}
const data = JSON.parse(document.getElementById('data').textContent);
const byId = new Map(data.nodes.map(node => [node.id, node]));
const el = id => document.getElementById(id);
let selected = null;
let scope = '.';
function showScopes() {
  el('scopes').replaceChildren();
  const current = (data.scopes || []).find(s => s.id === scope);
  const items = (data.scopes || []).filter(s => s.parent === scope || s.id === current?.parent);
  for (const item of items) el('scopes').append(button(item.id === current?.parent ? 'Up: ' + item.id : 'Graph: ' + item.id, () => { scope = item.id; showScopes(); render(); }));
}
for (const project of data.projects || []) {
  const p = document.createElement('p'); p.textContent = project.id + ': ' + project.entry;
  el('projects').append(p);
}
showScopes();
function button(label, action) { const b = document.createElement('button'); b.textContent = label; b.onclick = action; return b; }
function select(id) {
  selected = id;
  const node = byId.get(id);
  el('title').textContent = node.title; el('path').textContent = '.devocd/' + node.id;
  el('content').textContent = node.text; el('connections').replaceChildren();
  const labels = {parent: ['Parent', 'Child'], 'governed-by': ['Governed by', 'Governs'], links: ['Links to', 'Linked from']};
  const edges = data.edges.filter(e => (e.source === id || e.target === id) && byId.has(e.source === id ? e.target : e.source));
  for (const type of ['parent', 'governed-by', 'links']) {
    for (const edge of edges.filter(e => e.type === type)) {
      const outgoing = edge.source === id, other = outgoing ? edge.target : edge.source;
      const suffix = edge.line == null ? '' : ' (line ' + edge.line + ')';
      el('connections').append(button(labels[type][outgoing ? 0 : 1] + ': ' + byId.get(other).title + suffix, () => select(other)));
    }
  }
  const external = (data.external || []).filter(e => e.source === id);
  if (external.length) {
    const box = document.createElement('div'), heading = document.createElement('h3'), list = document.createElement('ul');
    heading.textContent = 'External';
    for (const item of external) { const li = document.createElement('li'); li.textContent = item.type + ': ' + item.target + (item.line == null ? '' : ' (line ' + item.line + ')'); list.append(li); }
    box.append(heading, list); el('connections').append(box);
  }
  for (const b of el('results').children) b.setAttribute('aria-pressed', String(b.dataset.id === id));
}
function svgElement(tag, attrs) { const e = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [k,v] of Object.entries(attrs)) e.setAttribute(k, String(v)); return e; }
function render() {
  const query = el('search').value.trim(), inScope = data.nodes.filter(node => scope === '.' || node.id.startsWith(scope + '/'));
  const ranked = query ? rankPages(inScope, data.edges, query) : inScope.slice().sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map(node => ({id: node.id, snippet: ''}));
  const matches = ranked.map(r => byId.get(r.id)), snippets = new Map(ranked.map(r => [r.id, r.snippet]));
  el('results').replaceChildren();
  for (const node of matches) { const b = button(node.title + ' — ' + node.id, () => select(node.id)); b.dataset.id = node.id; if (snippets.get(node.id)) { const s = document.createElement('small'); s.textContent = snippets.get(node.id); b.append(s); } b.setAttribute('aria-pressed', String(selected === node.id)); el('results').append(b); }
  const visible = matches.slice(0, 60), positions = new Map();
  el('status').textContent = matches.length + ' of ' + data.nodes.length + ' documents · ' + data.edges.length + ' edges' + (matches.length > 60 ? ' · Diagram shows first 60; all matches are listed.' : '');
  const svg = el('graph'); svg.replaceChildren();
  visible.forEach((node,i) => { const angle = i * Math.PI * 2 / visible.length; positions.set(node.id, {x:450+330*Math.cos(angle),y:250+190*Math.sin(angle)}); });
  const defs = svgElement('defs', {}), marker = svgElement('marker', {id:'arrow',viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:6,markerHeight:6,orient:'auto-start-reverse'});
  marker.append(svgElement('path', {d:'M 0 0 L 10 5 L 0 10 z',fill:'#597695'})); defs.append(marker); svg.append(defs);
  for (const edge of data.edges) { const a = positions.get(edge.source), b = positions.get(edge.target); if (a && b) { const length = Math.hypot(b.x-a.x,b.y-a.y); svg.append(svgElement('line', {x1:a.x,y1:a.y,x2:b.x-(b.x-a.x)*10/length,y2:b.y-(b.y-a.y)*10/length,'marker-end':'url(#arrow)'})); } }
  for (const node of visible) {
    const p = positions.get(node.id), g = svgElement('g', {tabindex:0,role:'button','aria-label':node.title});
    g.append(svgElement('circle', {cx:p.x,cy:p.y,r:8}));
    const label = svgElement('text', {x:p.x,y:p.y-14,'text-anchor':'middle'}); label.textContent = node.title.slice(0,28); g.append(label);
    g.onclick = () => select(node.id); g.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(node.id); } }; svg.append(g);
  }
}
el('search').addEventListener('input', render); render(); if (data.nodes.length) select(data.nodes[0].id);
</script></body></html>\n`;
}
