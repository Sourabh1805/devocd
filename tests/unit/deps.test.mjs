import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { detectDependencies } from '../../scripts/lib/deps.mjs';
import { makeTree } from '../helpers/tree.mjs';

/** @param {import('node:test').TestContext} t @param {Record<string, string>} files */
function fixture(t, files) {
  const root = mkdtempSync(join(tmpdir(), 'devocd-deps-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return makeTree(root, files);
}

test('finds git, workspace and local-path imports across manifests, never registry noise', t => {
  const root = fixture(t, {
    'package.json': JSON.stringify({ dependencies: {
      express: '^4.0.0',
      'our-shared': 'git+https://user:SECRETTOKEN@git.example.com/org/shared.git#v2',
      'ui-kit': 'workspace:*',
      'local-lib': 'file:../local-lib',
    } }),
    'requirements.txt': 'requests==2.31.0\nourlib @ git+https://git.example.com/org/ourlib.git@main\n',
    'Cargo.toml': '[dependencies]\nserde = "1"\ncore-utils = { git = "https://git.example.com/org/core-utils.git" }\nsibling = { path = "../sibling" }\n',
    'go.mod': 'module example.com/app\nrequire example.com/other v1.0.0\nreplace example.com/other => ../other\n',
    '.gitmodules': '[submodule "proto"]\n\tpath = third_party/proto\n\turl = https://git.example.com/org/proto.git\n',
  });
  const r = detectDependencies(root);
  const byName = Object.fromEntries(r.dependencies.map(d => [d.name, d]));
  assert.equal(byName['our-shared'].kind, 'git-dep');
  assert.equal(byName['ui-kit'].kind, 'workspace');
  assert.equal(byName['local-lib'].kind, 'local-path');
  assert.equal(byName['ourlib'].kind, 'git-dep');
  assert.equal(byName['core-utils'].kind, 'git-dep');
  assert.equal(byName['sibling'].kind, 'local-path');
  assert.equal(byName['example.com/other'].kind, 'local-path');
  assert.equal(byName['proto'].kind, 'submodule');
  // Registry dependencies are derivable from the manifest itself and stay out.
  for (const name of ['express', 'requests', 'serde']) assert.ok(!byName[name], name);
  // Credentials in a git URL are stripped from the recorded ref.
  const text = JSON.stringify(r);
  assert.ok(!text.includes('SECRETTOKEN'));
  assert.ok(byName['our-shared'].ref.includes('git.example.com/org/shared.git'));
});

test('nested repositories are reported as dependencies instead of silently dropped', t => {
  const root = fixture(t, { 'vendor-fork/.git/HEAD': 'ref: refs/heads/main', 'vendor-fork/lib.js': 'x', 'src/a.js': 'ok' });
  const r = detectDependencies(root);
  assert.ok(r.dependencies.some(d => d.kind === 'nested-repo' && d.path === 'vendor-fork'));
});

test('distinct nested repositories with the same folder name are each reported, by path', t => {
  const root = fixture(t, {
    'one/common/.git/HEAD': 'ref: refs/heads/main', 'one/common/a.js': 'x',
    'two/common/.git/HEAD': 'ref: refs/heads/main', 'two/common/b.js': 'x',
    'src/a.js': 'ok',
  });
  const nested = detectDependencies(root).dependencies.filter(d => d.kind === 'nested-repo');
  assert.deepEqual(nested.map(d => d.path).sort(), ['one/common', 'two/common']);
});

test('the same dependency declared in two manifests is still reported once', t => {
  const root = fixture(t, {
    'package.json': JSON.stringify({ dependencies: { shared: 'git+https://git.example.com/org/shared.git' }, devDependencies: { shared: 'git+https://git.example.com/org/shared.git' } }),
  });
  assert.equal(detectDependencies(root).dependencies.filter(d => d.name === 'shared').length, 1);
});

test('hostile manifest values are sanitized text and the CLI matches the library', t => {
  const root = fixture(t, {
    'package.json': JSON.stringify({ dependencies: { evil: 'git+https://x.example/a.git#$(touch pwned)`whoami`' } }),
  });
  const r = detectDependencies(root);
  const text = JSON.stringify(r);
  assert.ok(!text.includes('$(') && !text.includes('`'), text);
  const cli = fileURLToPath(new URL('../../scripts/devocd.mjs', import.meta.url));
  const run = spawnSync(process.execPath, [cli, 'detect-dependencies', root, '--json'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), r);
});

test('an empty project has no dependencies', t => {
  const root = fixture(t, { 'README.md': 'nothing' });
  assert.deepEqual(detectDependencies(root), { dependencies: [], artifacts: [], artifactsTruncated: false });
});
