// Read-only detection of documented command NAMES from manifests. Script bodies
// are never returned: the output names what a developer would type, nothing more.
import { join } from 'node:path';
import { isRegularFile, readTextOrNull } from './fsutil.mjs';

/** Safe, boring script names only; anything else (deploy, release, shell metacharacters) is dropped. */
const SAFE_BASE = ['test', 'lint', 'typecheck', 'check', 'format'];
const SAFE_NAME = new RegExp(`^(${SAFE_BASE.join('|')})([:.][a-z0-9_.-]+)*$`);
/** The subset worth offering for PR-review approval. */
const SUGGEST = /^(test|lint|typecheck)([:.]|$)/;

/** @param {string} root @param {string} name */
const read = (root, name) => (isRegularFile(join(root, name)) ? readTextOrNull(join(root, name)) : null);

/** @param {string} root */
function packageManager(root) {
  if (isRegularFile(join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (isRegularFile(join(root, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

/**
 * Detect documented command names in a project folder. Names only, never bodies;
 * never executes anything.
 * @param {string} root
 * @returns {{ detected: { command: string, source: string }[], suggestedForApproval: string[] }}
 */
export function detectCommands(root) {
  /** @type {Map<string, { command: string, source: string, suggest: boolean }>} */
  const found = new Map();
  const add = (/** @type {string} */ command, /** @type {string} */ source, suggest = false) => {
    if (!found.has(command)) found.set(command, { command, source, suggest });
  };

  const pkgText = read(root, 'package.json');
  if (pkgText) {
    let scripts;
    try { scripts = JSON.parse(pkgText)?.scripts; } catch { scripts = null; }
    if (scripts && typeof scripts === 'object') {
      const pm = packageManager(root);
      for (const name of Object.keys(scripts)) {
        if (!SAFE_NAME.test(name)) continue;
        add(name === 'test' ? `${pm} test` : `${pm} run ${name}`, 'package.json', SUGGEST.test(name));
      }
    }
  }

  const makefile = read(root, 'Makefile');
  if (makefile) {
    for (const m of makefile.matchAll(/^([A-Za-z0-9_.-]+):(?!=)/gm)) {
      const target = m[1];
      if (SAFE_NAME.test(target)) add(`make ${target}`, 'Makefile', SUGGEST.test(target));
    }
  }

  if (read(root, 'pytest.ini') !== null) add('pytest', 'pytest.ini', true);
  else if ((read(root, 'pyproject.toml') ?? '').includes('[tool.pytest')) add('pytest', 'pyproject.toml', true);
  // Python lint and type commands are configured in pyproject.toml tool tables.
  const pyproject = read(root, 'pyproject.toml') ?? '';
  if (pyproject.includes('[tool.ruff')) add('ruff check .', 'pyproject.toml', true);
  if (pyproject.includes('[tool.black')) add('black --check .', 'pyproject.toml', false);
  if (pyproject.includes('[tool.mypy')) add('mypy .', 'pyproject.toml', true);
  // tox names its environments in [testenv:NAME] sections and an envlist; only allowlisted
  // names become commands, so a CI matrix entry never turns into something runnable here.
  const tox = read(root, 'tox.ini') ?? '';
  if (tox) {
    const envs = new Set();
    for (const m of tox.matchAll(/^\s*\[testenv:([A-Za-z0-9_.-]+)\]/gm)) envs.add(m[1]);
    const envlist = /^\s*envlist\s*=\s*(.+)$/m.exec(tox);
    if (envlist) for (const part of envlist[1].split(/[,\s]+/)) if (part) envs.add(part);
    for (const env of envs) if (SAFE_NAME.test(env)) add(`tox -e ${env}`, 'tox.ini', SUGGEST.test(env));
  }
  if (read(root, 'go.mod') !== null) add('go test ./...', 'go.mod', true);
  if (read(root, 'Cargo.toml') !== null) add('cargo test', 'Cargo.toml', true);

  const detected = [...found.values()].sort((a, b) => a.command.localeCompare(b.command));
  return {
    detected: detected.map(({ command, source }) => ({ command, source })),
    suggestedForApproval: detected.filter(d => d.suggest).map(d => d.command),
  };
}
