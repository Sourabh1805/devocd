
/**
 * Ranked page search shared by the CLI and the offline viewer. It is deliberately ONE
 * self-contained function (no imports, no module-level references) so that
 * `rankPages.toString()` can be embedded verbatim into the viewer's inline script.
 * @param {any[]} nodes graph nodes ({id, title, text, kind, headings, summary, meta})
 * @param {any[]} edges graph edges ({source, target, type})
 * @param {string} query natural-language or identifier query
 * @param {{limit?: number, all?: boolean, snippets?: number}} [options] `all` keeps only pages that match every term; `snippets` caps how many results get a line/snippet
 * @returns {{id: string, title: string, score: number, coverage: number, line: number|null, snippet: string}[]}
 */
export function rankPages(nodes, edges, query, options) {
  const STOP = new Set(('why how what when where which who is are was were be been do does did the a an and or of to in on for ' +
    'with from by at as it its this that these those can could should would will i we you my our your me there here into about ' +
    'not no yes than then so if').split(' '));
  const str = (/** @type {any} */ v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
  const stem = (/** @type {string} */ w) => {
    let s = w;
    if (s.length > 3 && s.endsWith('ies')) s = s.slice(0, -3) + 'y';
    else if (s.length > 3 && s.endsWith('s') && !s.endsWith('ss') && !s.endsWith('us')) s = s.slice(0, -1);
    if (s.length > 5 && s.endsWith('ing')) s = s.slice(0, -3);
    else if (s.length > 4 && s.endsWith('ied')) s = s.slice(0, -3) + 'y';
    else if (s.length > 4 && s.endsWith('ed')) s = s.slice(0, -2);
    // Four-letter words too, so move/moved/moving and save/saved/saving meet.
    if (s.length > 3 && s.endsWith('e')) s = s.slice(0, -1);
    return s;
  };
  // Lowercase tokens; identifiers keep the whole token and add their camelCase parts.
  const tokens = (/** @type {string} */ text) => {
    const out = [];
    for (const raw of text.split(/[^\p{L}\p{N}]+/u)) {
      if (!raw) continue;
      out.push(raw.toLowerCase());
      const parts = raw.replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2').replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, '$1 $2').split(' ');
      if (parts.length > 1) for (const p of parts) out.push(p.toLowerCase());
    }
    return out;
  };
  const stemSet = (/** @type {string} */ text) => new Set(tokens(text).map(stem));

  const list = Array.isArray(nodes) ? nodes.filter(n => n && typeof n === 'object') : [];
  const rawTerms = tokens(str(query));
  if (!list.length || !rawTerms.length) return [];
  const kept = rawTerms.filter(t => !STOP.has(t));
  const terms = [...new Set((kept.length ? kept : rawTerms).map(stem))];

  const fieldsOf = (/** @type {any} */ n) => {
    const meta = n.meta && typeof n.meta === 'object' ? n.meta : {};
    const joined = ['scope', 'standards', 'uses'].map(k => (Array.isArray(meta[k]) ? meta[k].join(' ') : '')).join(' ');
    return [
      [5, stemSet(str(n.title))], [4, stemSet(str(n.id))],
      [3, stemSet(Array.isArray(n.headings) ? n.headings.map(str).join('\n') : '')],
      [2, stemSet(str(n.summary))], [2, stemSet(joined)], [1, stemSet(str(n.text))],
    ];
  };
  const indexed = list.map(n => fieldsOf(n));
  const N = list.length;
  const idf = terms.map(term => Math.log(1 + N / Math.max(1, indexed.filter(f => f.some(([, set]) => set.has(term))).length)));

  /** @type {Map<string, number>} */
  const base = new Map();
  /** @type {number[]} */
  const hits = [];
  const matched = list.map((n, i) => {
    let score = 0, hit = 0;
    terms.forEach((term, ti) => {
      let w = 0;
      for (const [weight, set] of indexed[i]) if (set.has(term)) w += weight;
      if (w) { hit++; score += w * idf[ti]; }
    });
    hits[i] = hit;
    if (!hit || (options && options.all && hit < terms.length)) return 0;
    score *= 0.4 + 0.6 * hit / terms.length;
    const kind = n.kind;
    score *= kind === 'generated' ? 0.25 : kind === 'module' || kind === 'flow' ? 1.15 : 1;
    base.set(str(n.id), score);
    return score;
  });

  /** @type {Map<string, string[]>} */
  const near = new Map();
  for (const e of Array.isArray(edges) ? edges : []) {
    if (!e || (e.type !== 'parent' && e.type !== 'links')) continue;
    const a = str(e.source), b = str(e.target);
    (near.get(a) ?? near.set(a, []).get(a)).push(b);
    (near.get(b) ?? near.set(b, []).get(b)).push(a);
  }

  const results = [];
  list.forEach((n, i) => {
    if (!matched[i]) return;
    const id = str(n.id);
    let boost = 0;
    for (const other of near.get(id) ?? []) boost = Math.max(boost, base.get(other) ?? 0);
    results.push({
      id, title: str(n.title), score: Math.round((matched[i] + 0.15 * boost) * 1000) / 1000,
      coverage: Math.round(hits[i] / terms.length * 100) / 100, line: null, snippet: '', i,
    });
  });
  results.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const limit = options && Number.isSafeInteger(options.limit) && options.limit >= 0 ? options.limit : results.length;
  const out = results.slice(0, limit);
  const want = options && Number.isSafeInteger(options.snippets) && options.snippets >= 0 ? options.snippets : out.length;
  out.forEach((r, k) => {
    const { i } = r;
    delete r.i;
    if (k >= want) return;
    const lines = str(list[i].text).split('\n');
    let line = 1, best = 0;
    lines.forEach((value, li) => {
      const set = stemSet(value);
      const count = terms.reduce((c, t) => c + (set.has(t) ? 1 : 0), 0);
      if (count > best) { best = count; line = li + 1; }
    });
    r.line = line;
    r.snippet = str(lines[line - 1]).replace(/\r$/, '').trim().slice(0, 160);
  });
  return out;
}
