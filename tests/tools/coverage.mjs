// Measured line coverage of scripts/lib, including code that only runs in child processes.
//
// `node --test --experimental-test-coverage` reports only what the test process itself ran and
// cannot see a `spawnSync` child, so a module exercised through the CLI reports like a module
// nobody tested. `NODE_V8_COVERAGE` makes every Node process write its own V8 coverage to a
// folder; this merges those results, so a line counts as covered if any process ran it.
//
// Usage: node tests/tools/coverage.mjs [--min <n>]
// Exit: 0 at or above the gate (or no gate), 1 below it, 2 on a bad argument.
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const libDir = join(root, 'scripts', 'lib');

/** One spelling for a path: absolute, forward slashes, drive letter upper case. */
function normal(/** @type {string} */ p) {
  const abs = resolve(p).split(sep).join('/');
  return /^[a-z]:\//i.test(abs) ? abs[0].toUpperCase() + abs.slice(1) : abs;
}

/** Every unit test file, so no shell has to expand a glob. */
function testFiles() {
  const out = [];
  const walk = (/** @type {string} */ dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.test.mjs')) out.push(full);
    }
  };
  walk(join(root, 'tests', 'unit'));
  return out.sort();
}

/** Merge one process's coverage of the library into the accumulators. */
function merge(/** @type {any} */ file, /** @type {Map<string, Set<number>>} */ covered, /** @type {Map<string, Set<number>>} */ executable) {
  for (const script of file.result ?? []) {
    const url = /** @type {string} */ (script.url);
    if (!url.startsWith('file:')) continue;
    const path = normal(fileURLToPath(url));
    if (!path.startsWith(normal(libDir) + '/')) continue;
    let text;
    try { text = readFileSync(path, 'utf8'); } catch { continue; }
    /** @type {{from: number, to: number, count: number}[]} */
    const ranges = [];
    for (const fn of script.functions ?? []) {
      for (const range of fn.ranges ?? []) {
        ranges.push({ from: range.startOffset ?? 0, to: range.endOffset ?? 0, count: range.count ?? 0 });
      }
    }
    const lines = text.split('\n');
    if (!covered.has(path)) { covered.set(path, new Set()); executable.set(path, new Set()); }
    const hit = /** @type {Set<number>} */ (covered.get(path));
    const all = /** @type {Set<number>} */ (executable.get(path));
    let offset = 0;
    for (let line = 0; line < lines.length; line += 1) {
      const indent = /^\s*/.exec(lines[line])?.[0].length ?? 0;
      const content = lines[line].trim();
      const at = offset + indent;
      offset += lines[line].length + 1;
      if (!content) continue;
      // The innermost range covering the line's first character decides: a zero-count block
      // inside a function that ran is a line that did not run.
      let best = null;
      for (const r of ranges) {
        if (r.from <= at && at < r.to && (best === null || r.to - r.from < best.to - best.from)) best = r;
      }
      if (best === null) continue;
      all.add(line);
      if (best.count > 0) hit.add(line);
    }
  }
}

/** The gate, when given: `--min <n>`, a whole number. */
function gate(/** @type {string[]} */ argv) {
  const at = argv.indexOf('--min');
  if (at < 0) return null;
  const value = argv[at + 1];
  if (!value || !/^\d+$/.test(value)) {
    console.error('coverage: --min needs a whole number');
    process.exit(2);
  }
  return Number(value);
}

const argv = process.argv.slice(2);
const min = gate(argv);
// Positional arguments limit the run to those test files, so one module's figure can be
// compared with the merged one under exactly the same rules.
const minAt = argv.indexOf('--min');
const only = argv.filter((a, i) => !a.startsWith('--') && !(minAt >= 0 && i === minAt + 1));
// A wall-clock assertion cannot hold under instrumentation and it exercises no library code,
// so it is skipped here; it still runs in npm test and in CI.
const SKIP_WALL_CLOCK = 'performance: each handler averages under 50 ms';
const dir = mkdtempSync(join(tmpdir(), 'devocd-coverage-'));
let result;
try {
  const files = only.length ? only.map((f) => resolve(f)) : testFiles();
  result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', `--test-skip-pattern=${SKIP_WALL_CLOCK}`, ...files], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, NODE_V8_COVERAGE: dir },
    maxBuffer: 64 * 1024 * 1024,
  });
  /** @type {Map<string, Set<number>>} */
  const covered = new Map();
  /** @type {Map<string, Set<number>>} */
  const executable = new Map();
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    let parsed;
    try { parsed = JSON.parse(readFileSync(join(dir, name), 'utf8')); } catch { continue; }
    merge(parsed, covered, executable);
  }
  // A library module no process loaded has no V8 record; count every non-blank line of it as
  // missed, so an untested new module lowers the figure instead of vanishing from it.
  for (const name of readdirSync(libDir)) {
    if (!name.endsWith('.mjs')) continue;
    const path = normal(join(libDir, name));
    if (executable.has(path)) continue;
    const lines = readFileSync(path, 'utf8').split('\n');
    executable.set(path, new Set(lines.flatMap((l, i) => (l.trim() ? [i] : []))));
    covered.set(path, new Set());
  }
  const rows = [...executable.keys()].map((path) => {
    const total = executable.get(path)?.size ?? 0;
    const hit = covered.get(path)?.size ?? 0;
    return { path, total, hit, percent: total ? (hit / total) * 100 : 100 };
  }).sort((a, b) => a.percent - b.percent || a.path.localeCompare(b.path));
  const totalLines = rows.reduce((n, r) => n + r.total, 0);
  const hitLines = rows.reduce((n, r) => n + r.hit, 0);
  const total = totalLines ? (hitLines / totalLines) * 100 : 100;
  for (const r of rows) {
    console.log(`${r.percent.toFixed(2).padStart(6)}%  ${String(r.hit).padStart(5)}/${String(r.total).padEnd(5)}  ${relative(root, r.path).split(sep).join('/')}`);
  }
  console.log(`${total.toFixed(2).padStart(6)}%  ${String(hitLines).padStart(5)}/${String(totalLines).padEnd(5)}  total`);
  // process.exitCode, not process.exit: exiting here would skip the finally that removes `dir`.
  if (result.error || result.status !== 0) {
    if (result.error) console.error(`coverage: could not run the unit suite: ${result.error.message}`);
    const failed = String(result.stdout ?? '').split('\n').filter((l) => /^not ok /.test(l)).map((l) => l.replace(/^not ok \d+ - /, ''));
    for (const name of failed) console.error(`coverage: failing test: ${name}`);
    console.error('coverage: the unit suite failed; the figure is not a gate');
    process.exitCode = 1;
  } else if (min !== null && total < min) {
    console.error(`coverage: ${total.toFixed(2)}% is below the gate of ${min}%; ${(min - total).toFixed(2)} points short`);
    process.exitCode = 1;
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
