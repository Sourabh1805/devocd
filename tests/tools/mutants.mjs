// Do the tests notice a broken rule? Break one rule at a time in the modules whose rules matter
// most, run that module's tests, and put the file back. A mutant the tests miss is a rule nobody
// defends. Not wired into CI: `npm run mutants` is a spot-check, not a gate.
//
// Safety: refuses to start over uncommitted changes in a target file, restores in `finally` and
// on SIGINT, and verifies every file is byte-identical afterwards (exit 2 if not).
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
/** One mutant's tests take a few seconds; a mutant that makes them hang is ended here. */
const TIMEOUT_MS = 120_000;

/**
 * Three per module: a boundary, a dropped guard, and a wrong result.
 * `find` must occur exactly once in `file`.
 * @type {{ id: string, file: string, find: string, replace: string, rule: string, tests: string[], equivalent?: string }[]}
 */
const MUTANTS = [
  // claims
  {
    id: 'claims-statement-length',
    file: 'scripts/lib/claims.mjs',
    find: 'v.statement.length <= 300',
    replace: 'v.statement.length < 300',
    rule: 'a statement of exactly 300 characters is rejected as too long',
    tests: ['tests/unit/claims.test.mjs'],
  },
  {
    id: 'claims-source-fact-authority',
    file: 'scripts/lib/claims.mjs',
    find: "(!file || v.authority !== 'observed')",
    replace: '(!file)',
    rule: 'a source fact with team-accepted authority is accepted as observed',
    tests: ['tests/unit/claims.test.mjs'],
  },
  {
    id: 'claims-currentness-swapped',
    file: 'scripts/lib/claims.mjs',
    find: "? 'verified' : 'recorded-only'",
    replace: "? 'recorded-only' : 'verified'",
    rule: 'a verified claim is reported as recorded-only, and the reverse',
    tests: ['tests/unit/claims.test.mjs'],
  },
  // redundancy
  {
    id: 'redundancy-min-words',
    file: 'scripts/lib/redundancy.mjs',
    find: 'const MIN_WORDS = 8;',
    replace: 'const MIN_WORDS = 9;',
    rule: 'a sentence repeated with exactly eight words is never reported',
    tests: ['tests/unit/redundancy.test.mjs'],
  },
  {
    id: 'redundancy-scope-guard',
    file: 'scripts/lib/redundancy.mjs',
    find: 'if (u.scope !== seen[id].scope) continue;',
    replace: 'if (false) continue;',
    rule: 'a sentence scoped to test is matched to the same sentence scoped to production',
    tests: ['tests/unit/redundancy.test.mjs'],
  },
  {
    id: 'redundancy-severity-swapped',
    file: 'scripts/lib/redundancy.mjs',
    find: "? 'information' : 'warning'",
    replace: "? 'warning' : 'information'",
    rule: 'a near repeat is filed as information and a read-only duplicate as a warning to fix',
    tests: ['tests/unit/redundancy.test.mjs'],
  },
  // refresh
  {
    id: 'refresh-half-boundary',
    file: 'scripts/lib/refresh.mjs',
    find: 'affected.length * 2 > pages.length',
    replace: 'affected.length * 2 >= pages.length',
    rule: 'a plan affecting exactly half the pages escalates to a full rebuild',
    tests: ['tests/unit/refresh.test.mjs', 'tests/unit/refresh-impact.test.mjs'],
  },
  {
    id: 'refresh-dotdevocd-source',
    file: 'scripts/lib/refresh.mjs',
    find: " && f.path !== '.devocd'",
    replace: '',
    rule: '.devocd itself is counted as a source, so its own writes look like changed sources',
    tests: ['tests/unit/refresh.test.mjs', 'tests/unit/refresh-impact.test.mjs'],
  },
  {
    id: 'refresh-no-baseline-current',
    file: 'scripts/lib/refresh.mjs',
    find: 'const sourceChanged = !previous || !current.inventory.complete || previous.fingerprint !== current.fingerprint;',
    replace: 'const sourceChanged = previous ? !current.inventory.complete || previous.fingerprint !== current.fingerprint : false;',
    rule: 'a project with no baseline yet is reported as already current',
    tests: ['tests/unit/refresh.test.mjs', 'tests/unit/refresh-impact.test.mjs'],
  },
  // trace
  {
    id: 'trace-prefix-boundary',
    file: 'scripts/lib/trace.mjs',
    find: 'path.startsWith(`${p}/`)',
    replace: 'path.startsWith(p)',
    rule: 'a sibling folder sharing a name prefix (src/billing-other) is treated as in scope',
    tests: ['tests/unit/trace.test.mjs'],
  },
  {
    id: 'trace-skipped-evidence',
    file: 'scripts/lib/trace.mjs',
    find: "if (skipped.has(e.path)) unknown.push(e.path); else changed.push(e.path);",
    replace: 'changed.push(e.path);',
    rule: 'a page whose evidence file was skipped is reported stale instead of unknown',
    tests: ['tests/unit/trace.test.mjs'],
  },
  {
    id: 'trace-status-swapped',
    file: 'scripts/lib/trace.mjs',
    find: "changed.length ? 'stale' : unknown.length ? 'unknown' : 'current'",
    replace: "changed.length ? 'stale' : unknown.length ? 'current' : 'unknown'",
    rule: 'a page whose evidence could not be read is reported current',
    tests: ['tests/unit/trace.test.mjs'],
  },
];

/** @type {Map<string, string>} */
const originals = new Map();
const files = [...new Set(MUTANTS.map((m) => m.file))];
for (const file of files) originals.set(file, readFileSync(join(root, file), 'utf8'));

/** Put every target back exactly as it was read. */
function restoreAll() {
  for (const [file, text] of originals) writeFileSync(join(root, file), text);
}

// Ctrl+C leaves no half-mutated file behind.
process.on('SIGINT', () => {
  restoreAll();
  console.error('mutants: interrupted; every target file restored');
  process.exit(130);
});

/** Refuse to run over work in progress: a restore would throw that work away. */
function refuseWhenDirty() {
  const dirty = files.filter((file) => {
    const r = spawnSync('git', ['status', '--porcelain', '--', file], { cwd: root, encoding: 'utf8' });
    return r.status === 0 && r.stdout.trim() !== '';
  });
  if (dirty.length) {
    console.error(`mutants: refusing to run; uncommitted changes in ${dirty.join(', ')}`);
    process.exit(2);
  }
}

// Self-check for the SIGINT path: Windows cannot deliver a real Ctrl+C to a child, so
// --interrupt-after <id> raises the same signal the handler restores on.
const interruptAt = (() => { const at = process.argv.indexOf('--interrupt-after'); return at < 0 ? null : process.argv[at + 1]; })();
const ids = process.argv.slice(2).filter((a) => !a.startsWith('-') && a !== interruptAt);
const selected = ids.length ? MUTANTS.filter((m) => ids.includes(m.id)) : MUTANTS;
const unknown = ids.filter((id) => !MUTANTS.some((m) => m.id === id));
if (unknown.length) {
  console.error(`mutants: no such mutant: ${unknown.join(', ')}`);
  process.exit(2);
}

refuseWhenDirty();
const results = [];
try {
  for (const m of selected) {
    const path = join(root, m.file);
    const text = originals.get(m.file) ?? '';
    const count = text.split(m.find).length - 1;
    if (count !== 1) {
      console.error(`mutants: ${m.id}: find occurs ${count} times in ${m.file}, expected 1`);
      results.push({ m, outcome: 'error' });
      continue;
    }
    let outcome;
    try {
      writeFileSync(path, text.replace(m.find, m.replace));
      if (interruptAt === m.id) process.emit('SIGINT');
      // A mutant that loops forever counts as killed once the timeout ends it. A Ctrl+C also reaches
      // the child, and a child that died of it says nothing about the mutant: stop the run.
      const run = spawnSync(process.execPath, ['--test', ...m.tests], { cwd: root, encoding: 'utf8', timeout: TIMEOUT_MS });
      if (run.signal === 'SIGINT' || (run.signal && !run.error)) {
        writeFileSync(path, text);
        restoreAll();
        console.error(`mutants: interrupted during ${m.id} (${run.signal}); every target file restored`);
        process.exit(130);
      }
      outcome = run.status === 0 ? 'survived' : 'killed';
      if (run.error && /** @type {any} */ (run.error).code === 'ETIMEDOUT') console.log(`timeout  ${m.id}: the tests did not finish in ${TIMEOUT_MS / 1000} s`);
    } finally {
      writeFileSync(path, text);
    }
    results.push({ m, outcome });
    console.log(`${outcome.padEnd(8)} ${m.id.padEnd(28)} ${m.rule}`);
  }
} finally {
  restoreAll();
}

const damaged = files.filter((file) => readFileSync(join(root, file), 'utf8') !== originals.get(file));
if (damaged.length) {
  console.error(`mutants: ${damaged.join(', ')} did not come back byte-identical; written back`);
  restoreAll();
  process.exit(2);
}

const survived = results.filter((r) => r.outcome === 'survived');
const ignored = survived.filter((r) => r.m.equivalent);
const real = survived.filter((r) => !r.m.equivalent);
for (const r of survived) {
  console.log(`survived ${r.m.id}${r.m.equivalent ? ` (equivalent: ${r.m.equivalent})` : ''}`);
}
for (const r of results.filter((x) => x.outcome === 'error')) console.error(`mutants: ${r.m.id} could not be applied`);
const killed = results.filter((r) => r.outcome === 'killed').length;
console.log(`\nmutants: ${killed} killed, ${real.length} survived, ${ignored.length} equivalent, ${results.length} run`);
console.log(`scripts/ is ${damaged.length ? 'NOT ' : ''}byte-identical to before the run`);
if (real.length || results.some((r) => r.outcome === 'error')) process.exit(1);
