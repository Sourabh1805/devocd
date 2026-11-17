// @ts-check
// Read-only detection of artifacts a project pulls (consumes) or publishes (produces): container images,
// S3 objects, package registries, Terraform modules and Helm charts, each with file and line.
// Credentials never leave this module: userinfo and token-like query parameters are removed and a ref
// that still looks like a secret is dropped. Nothing is fetched or executed; .env files are never read.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { lstatOrNull, readTextOrNull } from './fsutil.mjs';
import { scanSecrets } from './secrets.mjs';

export const ARTIFACT_CAP = 300;
const MAX_ENTRIES = 5000;
/** `aws s3 cp|sync` options that take no value; every other `--option` consumes the next word. */
const S3_SWITCHES = new Set(['--recursive', '--delete', '--dryrun', '--quiet', '--no-progress', '--only-show-errors', '--follow-symlinks', '--no-follow-symlinks', '--exact-timestamps', '--size-only', '--no-guess-mime-type', '--force-glacier-transfer', '--ignore-glacier-warnings', '--no-sign-request', '--debug', '--no-paginate', '--no-verify-ssl']);
const MAX_BYTES = 256 * 1024;
const EXCLUDED = new Set(['.git', '.devocd', 'node_modules', 'vendor', 'dist', 'build', 'coverage', '.next', '.venv', 'venv', '__pycache__', '.terraform']);
const CI_NAMES = new Set(['.gitlab-ci.yml', 'Jenkinsfile', 'buildspec.yml', 'azure-pipelines.yml', 'bitbucket-pipelines.yml']);

/** @typedef {{
 * kind: 'image'|'s3'|'registry'|'tf-module'|'helm-chart', ref: string,
 * direction: 'consumes'|'produces', level: 'declared'|'built'|'published', source: string, line: number,
 * flavor?: string, ci?: true, templated?: true, account?: string, region?: string, host?: string, environment?: string
 * }} Artifact */
/** @typedef {(kind: Artifact['kind'], raw: string, dir: Artifact['direction'], source: string, line: number, flavor?: string, level?: Artifact['level']) => void} Add */
const LEVELS = { declared: 0, built: 1, published: 2 };
const isCI = (/** @type {string} */ source) => (/\.ya?ml$/i.test(source) && /^\.github\/workflows\//.test(source)) || CI_NAMES.has(source.split('/').at(-1) ?? '');

/** Identity comes only from sanitized refs. Source scope wins; otherwise use the first ref token. */
function identity(/** @type {string} */ ref, /** @type {string} */ source) {
  const url = /(?:^|::|@)([\w+.-]+):\/\/([^/?#]+)([^?#]*)/.exec(ref);
  const scp = /^(?:git::)?git@([^/:]+):(.+)/.exec(ref);
  const bare = ref.replace(/^git@/, '').split(/[?#]/)[0];
  const first = bare.split('/')[0];
  const registry = bare.includes('/') && /[.:]|^localhost$/.test(first);
  const host = url ? (url[1] === 's3' ? undefined : url[2]) : scp ? scp[1] : registry ? first : undefined;
  const path = url ? (url[1] === 's3' ? url[2] : '') + url[3] : scp ? scp[2] : registry ? bare.slice(first.length + 1) : bare;
  const ecr = host && /^(\d{12})\.dkr\.ecr\.([a-z0-9-]+)\.amazonaws\.com(?:\.cn)?$/.exec(host);
  const env = (/** @type {string} */ s) => s.replace(/%[^%]*%/g, 'VARIABLE').split(/[\/_.-]+/)
    .find(p => /^(prod|production|staging|stage|dev|development|qa|test)$/.test(p));
  const token = env(source) ?? env(path.split(/[?#:@]/)[0]);
  const environment = token === 'production' ? 'prod' : token === 'development' ? 'dev' : token === 'stage' ? 'staging' : token;
  return { ...(ecr ? { account: ecr[1], region: ecr[2] } : {}), ...(host ? { host } : {}), ...(environment ? { environment } : {}) };
}

/** Template and shell variables become %NAME%. */
const vars = (/** @type {string} */ s) => s
  .replace(/\$?\{\{\s*(.*?)\s*\}\}/g, '%$1%')
  .replace(/\$\{([A-Za-z_][\w.]*)[^}]*\}/g, '%$1%')
  .replace(/\$([A-Za-z_]\w*)/g, '%$1%');

/** Drop token-like query parameters; keep the rest (a version ref is not a credential). */
function cleanQuery(/** @type {string} */ ref) {
  const i = ref.indexOf('?');
  if (i < 0) return ref;
  const kept = ref.slice(i + 1).split('&').filter(p => p && !/token|sig|signature|auth|key|password|secret|^x-amz-/i.test(p.split('=')[0]));
  return ref.slice(0, i) + (kept.length ? `?${kept.join('&')}` : '');
}

/** @param {string} ref */
function flavorOf(ref) {
  const body = ref.replace(/^[^@/:]*@(?=\w+:\/\/)/, '').replace(/^\w[\w+.-]*:{1,2}\/\//, '');
  const slash = body.indexOf('/');
  const host = (slash < 0 ? body : body.slice(0, slash)).toLowerCase();
  const path = (slash < 0 ? '' : body.slice(slash)).toLowerCase();
  if (/\.dkr\.ecr\.[^.]+\.amazonaws\.com/.test(host)) return 'ecr';
  if (/\.d\.codeartifact\.[^.]+\.amazonaws\.com/.test(host)) return 'codeartifact';
  if (host.includes('artifactory') || path.includes('artifactory') || host.endsWith('jfrog.io')) return 'artifactory';
  if (host.includes('nexus') || path.includes('/repository/')) return 'nexus';
  return undefined;
}

/** Bounded walk: no links, no excluded folders, no .env files. Posix paths from root. */
function walk(/** @type {string} */ root) {
  /** @type {string[]} */
  const files = [];
  const pending = ['.'];
  let seen = 0;
  while (pending.length) {
    const dir = /** @type {string} */ (pending.pop());
    let entries;
    try { entries = readdirSync(join(root, dir), { withFileTypes: true }); } catch { continue; }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of entries) {
      if (++seen > MAX_ENTRIES || e.isSymbolicLink()) continue;
      const rel = dir === '.' ? e.name : `${dir}/${e.name}`;
      if (e.isDirectory()) { if (!EXCLUDED.has(e.name)) pending.push(rel); }
      else if (e.isFile() && e.name !== '.env' && !e.name.startsWith('.env.')) files.push(rel);
    }
  }
  return files.sort();
}

/**
 * @param {string} root
 * @returns {{ artifacts: Artifact[], truncated: boolean }}
 */
export function detectArtifacts(root) {
  /** @type {Map<string, Artifact>} */
  const found = new Map();

  /** @type {Add} */
  const add = (kind, raw, direction, source, line, flavor, level = direction === 'produces' ? 'published' : 'declared') => {
    let ref = cleanQuery(vars(raw.trim()).replace(/\/\/[^@/\s]+@/, '//'));
    if (scanSecrets(ref).length) return;
    ref = ref.replace(/[^\x20-\x7E]/g, '').replace(/["'`$\\;|<>(){}]/g, '').trim().slice(0, 200);
    if (!ref) return;
    const details = identity(ref, source);
    const key = `${kind}\0${ref}\0${direction}\0${source}\0${details.account ?? ''}\0${details.environment ?? ''}`;
    const prior = found.get(key);
    // Keep the original first citation, while accumulating the strongest evidence in this file.
    if (prior) {
      if (LEVELS[level] > LEVELS[prior.level]) prior.level = level;
      prior.line = Math.min(prior.line, line);
      return;
    }
    const fl = flavor ?? (kind === 's3' ? undefined : flavorOf(ref));
    found.set(key, { kind, ref, direction, level, source, line,
      ...(fl ? { flavor: fl } : {}), ...(isCI(source) ? { ci: /** @type {true} */ (true) } : {}),
      ...(/%[^% ]+%/.test(ref) ? { templated: /** @type {true} */ (true) } : {}), ...details });
  };

  const unq = (/** @type {string} */ s) => s.replace(/^["']+|["']+$/g, '');

  for (const source of walk(root)) {
    const name = source.slice(source.lastIndexOf('/') + 1);
    if ((lstatOrNull(join(root, source))?.size ?? 0) > MAX_BYTES) continue;
    const text = readTextOrNull(join(root, source));
    if (text === null) continue;
    const lines = text.split(/\r?\n/);
    /** @param {(l: string, n: number) => void} fn */
    const each = fn => lines.forEach((l, i) => fn(l, i + 1));
    const isYaml = /\.ya?ml$/i.test(name);
    const ci = isCI(source);

    if (/^dockerfile(\..*)?$/i.test(name) || /\.dockerfile$/i.test(name)) {
      const stages = new Set(['scratch']);
      each((l, n) => {
        const m = /^\s*FROM\s+(?:--platform=\S+\s+)?(\S+)(?:\s+AS\s+(\S+))?/i.exec(l);
        if (!m) return;
        if (!stages.has(m[1].toLowerCase())) add('image', m[1], 'consumes', source, n);
        if (m[2]) stages.add(m[2].toLowerCase());
      });
    }

    if (isYaml) {
      each((l, n) => {
        const m = /^\s*(?:-\s+)?image:\s*(.+?)\s*(?:\s#.*)?$/.exec(l);
        const v = m && unq(m[1]);
        if (v && !/^\$?\{\{.*\}\}$/.test(v)) add('image', v, 'consumes', source, n);
      });
    }

    if (ci || name === 'Makefile' || /\.(mk|sh|bash|ps1)$/i.test(name)) {
      each((l, n) => {
        const line = vars(l);
        const build = /\bdocker\s+(?:buildx\s+)?build\b(.*)/.exec(line);
        if (build) for (const m of build[1].matchAll(/(?:^|\s)(?:-t|--tag)(?:=|\s+)(\S+)/g)) add('image', unq(m[1]), 'produces', source, n, undefined, 'built');
        const dk = /\bdocker\s+(?:image\s+)?(push|pull)\s+(?:-\S+\s+)*([^\s-]\S*)/.exec(line);
        if (dk) add('image', unq(dk[2]), dk[1] === 'push' ? 'produces' : 'consumes', source, n);
        const s3 = /\baws\s+s3\s+(?:cp|sync)\s+(.*)/.exec(line);
        if (s3) {
          // Positional arguments only: a `--flag value` pair (other than the known switches) is skipped whole.
          /** @type {string[]} */ const pos = [];
          const toks = s3[1].split(/\s*(?:&&|\|\||[|;])/)[0].split(/\s+/).filter(Boolean);
          for (let i = 0; i < toks.length; i++) {
            const tk = toks[i];
            if (!tk.startsWith('-')) { pos.push(unq(tk)); continue; }
            if (!tk.includes('=') && !S3_SWITCHES.has(tk) && i + 1 < toks.length && !toks[i + 1].startsWith('-')) i++;
          }
          pos.slice(0, 2).forEach((t, i) => { if (t.startsWith('s3://')) add('s3', t, i === 1 ? 'produces' : 'consumes', source, n); });
        }
        const helm = /\bhelm\s+push\s+(\S+)\s+(oci:\/\/[^\s"']+)/.exec(line);
        if (helm) add('helm-chart', helm[2], 'produces', source, n);
        const proxy = /GOPROXY\s*[:=]\s*["']?([^\s"']+)/.exec(line);
        const url = proxy?.[1].split(/[,|]/).find(u => /^https?:\/\//.test(u));
        if (url) add('registry', url, 'consumes', source, n);
      });
    }

    if (name === 'Chart.yaml') {
      let inDeps = false;
      /** @type {{ name?: string, repo?: string, line: number }} */
      let item = { line: 0 };
      const flush = () => { if (item.name && item.repo) add('helm-chart', `${item.name}@${item.repo}`, 'consumes', source, item.line); item = { line: 0 }; };
      each((l, n) => {
        if (/^\S/.test(l)) { flush(); inDeps = /^dependencies:/.test(l); return; }
        if (!inDeps) return;
        if (/^\s*-\s/.test(l)) flush();
        const nm = /^\s*(?:-\s+)?name:\s*(\S.*?)\s*$/.exec(l);
        if (nm) item.name = unq(nm[1]);
        const rp = /^\s*(?:-\s+)?repository:\s*(\S.*?)\s*$/.exec(l);
        if (rp) { item.repo = unq(rp[1]); item.line = n; }
      });
      flush();
    }

    if (name.endsWith('.tf')) scanTerraform(lines, source, add);

    if (name === '.npmrc') {
      each((l, n) => {
        if (/_auth|_password|token|password/i.test(l)) return;
        const m = /^\s*(?:@[\w.-]+:)?registry\s*=\s*(\S+)/.exec(l);
        if (m) add('registry', m[1], 'consumes', source, n);
      });
    }

    if (name === 'package.json') {
      let reg;
      try { reg = JSON.parse(text)?.publishConfig?.registry; } catch { reg = undefined; }
      if (typeof reg === 'string') add('registry', reg, 'produces', source, Math.max(1, lines.findIndex(l => l.includes(reg)) + 1));
    }

    if (/^requirements.*\.txt$/i.test(name)) {
      each((l, n) => { const m = /^\s*(?:--extra-index-url|--index-url|-i)[\s=]+(\S+)/.exec(l); if (m) add('registry', m[1], 'consumes', source, n); });
    }
    if (name === 'pip.conf' || name === 'pip.ini') {
      each((l, n) => { const m = /^\s*(?:extra-)?index-url\s*[=:]\s*(\S+)/.exec(l); if (m) add('registry', m[1], 'consumes', source, n); });
    }
    if (name === 'pyproject.toml') {
      let inSource = false;
      each((l, n) => {
        if (/^\s*\[/.test(l)) { inSource = /^\s*\[\[tool\.poetry\.source\]\]/.test(l); return; }
        const m = inSource && /^\s*url\s*=\s*["']([^"']+)["']/.exec(l);
        if (m) add('registry', m[1], 'consumes', source, n);
      });
    }

    if (name === 'pom.xml' || name === 'settings.xml') {
      /** @type {'consumes'|'produces'|null} */
      let ctx = null;
      each((l, n) => {
        for (const m of l.matchAll(/<(\/?)(repositories|pluginRepositories|mirrors|distributionManagement)>|<url>\s*([^<]*?)\s*<\/url>/g)) {
          if (m[2]) ctx = m[1] ? null : m[2] === 'distributionManagement' ? 'produces' : 'consumes';
          else if (ctx && m[3]) add('registry', m[3], ctx, source, n);
        }
      });
    }

    if (/^(build|settings)\.gradle(\.kts)?$/.test(name)) {
      let depth = 0, mavenAt = -1;
      each((l, n) => {
        if (mavenAt < 0 && /\bmaven\s*\{/.test(l)) mavenAt = depth;
        const m = mavenAt >= 0 && /\burl\s*(?:=\s*)?(?:uri\()?\s*["']([^"']+)["']/.exec(l);
        if (m) add('registry', m[1], 'consumes', source, n);
        depth += (l.match(/\{/g) ?? []).length - (l.match(/\}/g) ?? []).length;
        if (mavenAt >= 0 && depth <= mavenAt) mavenAt = -1;
      });
    }
  }

  const all = [...found.values()].sort((a, b) => (a.source < b.source ? -1 : a.source > b.source ? 1 : 0) || a.line - b.line || a.kind.localeCompare(b.kind));
  return { artifacts: all.slice(0, ARTIFACT_CAP), truncated: all.length > ARTIFACT_CAP };
}

/**
 * Module sources, the S3 state backend and terraform_remote_state, tracked by block nesting.
 * @param {string[]} lines @param {string} source @param {Add} add
 */
function scanTerraform(lines, source, add) {
  /** @type {{ kw: string, label: string, depth: number, bucket?: string, key?: string, line: number }[]} */
  const stack = [];
  let depth = 0;
  const close = () => {
    while (stack.length && depth <= stack[stack.length - 1].depth) {
      const b = /** @type {NonNullable<typeof stack[number]>} */ (stack.pop());
      if (!b.bucket || !b.key) continue;
      const parent = stack[stack.length - 1];
      if (b.kw === 'backend' && b.label === 's3') add('s3', `s3://${b.bucket}/${b.key}`, 'produces', source, b.line, 'tf-state');
      else if (b.kw === 'config' && parent?.kw === 'data' && parent.label === 'terraform_remote_state') add('s3', `s3://${b.bucket}/${b.key}`, 'consumes', source, b.line, 'tf-state');
    }
  };
  lines.forEach((raw, i) => {
    const l = raw.replace(/\s(#|\/\/).*$/, '');
    const open = (l.match(/\{/g) ?? []).length, shut = (l.match(/\}/g) ?? []).length;
    const h = /^\s*([A-Za-z_]\w*)((?:\s+"[^"]*")*)\s*=?\s*\{/.exec(l);
    const top = stack[stack.length - 1];
    if (h) stack.push({ kw: h[1], label: /"([^"]*)"/.exec(h[2])?.[1] ?? '', depth, line: i + 1 });
    else if (top) {
      const v = /^\s*(source|bucket|key)\s*=\s*"([^"]*)"/.exec(l);
      if (v?.[1] === 'bucket' && top.bucket === undefined) { top.bucket = v[2]; top.line = i + 1; }
      else if (v?.[1] === 'key') top.key = v[2];
      else if (v?.[1] === 'source' && top.kw === 'module') {
        const s = v[2];
        if (s.startsWith('./') || s.startsWith('../')) return void (depth += open - shut, close()); // local module: internal
        if (s.startsWith('s3::')) add('s3', s, 'consumes', source, i + 1);
        else if (s.startsWith('git::') || /^(?:git@)?github\.com[/:]/.test(s)) add('tf-module', s, 'consumes', source, i + 1, 'git');
        else if (/^(?:[\w-]+(?:\.[\w-]+)+\/)?[\w-]+\/[\w-]+\/[\w-]+(?:\/\/.*)?$/.test(s)) add('tf-module', s, 'consumes', source, i + 1, 'terraform-registry');
      }
    }
    depth += open - shut;
    close();
  });
}
