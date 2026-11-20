// @ts-check
// T27: a dependency declared before its project was registered gains the cross-project link when
// the dependent project is set up again. Re-resolution is deterministic in Node (link-projects),
// adds only a missing link to a dependency bullet, and never points outside the company folder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveProjectLinks } from '../../scripts/lib/deps.mjs';
import { workspace } from '../helpers/workspace.mjs';
import { makeTree } from '../helpers/tree.mjs';

const cli = fileURLToPath(new URL('../../scripts/devocd.mjs', import.meta.url));
const projectMd = (/** @type {string} */ dir) => resolve(dir, '.devocd', 'PROJECT.md');
const read = (/** @type {string} */ file) => readFileSync(file, 'utf8');

/** Run a helper command as the skill does. */
function helper(/** @type {string[]} */ ...args) {
  const r = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
  assert.equal(r.status, 0, `devocd ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
}

/** A company with project a registered and project b set up but not yet registered. */
function companyWithA(/** @type {import('node:test').TestContext} */ t, aFiles, { bProjectMd = '# b\n\nThe b project.\n' } = {}) {
  const ws = workspace(t, {
    company: { projects: ['a'], files: { 'CLAUDE.md': '# Test\n' } },
    projects: {
      a: {
        files: aFiles,
        pages: {
          'PROJECT.md': '# a\n\nProject a.\n\n## Dependencies\n- `b` (local path): the shared library\n\n## Links\n- [Company rules](../../CLAUDE.md)\n',
          'pointer.md': '# a\n',
          'decisions.md': '# Decisions\n\n- A durable decision that must survive.\n',
        },
      },
      b: { pages: bProjectMd === null ? {} : { 'PROJECT.md': bProjectMd } },
    },
  });
  return { ws, a: ws.project('a'), b: ws.project('b') };
}

/** Register b the way the helper would, without a child process in every test. */
function registerB(/** @type {string} */ company) {
  const file = resolve(company, '.devocd', 'state.json');
  const state = JSON.parse(read(file));
  state.projects.push({ id: 'b', path: 'b', description: 'The b project' });
  makeTree(company, { '.devocd/state.json': JSON.stringify(state, null, 2) + '\n' });
}

test('a dependency registered since the last run gains a company-relative link, and only that', t => {
  const { ws, a } = companyWithA(t, { 'package.json': JSON.stringify({ dependencies: { b: 'file:../b' } }) });
  const file = projectMd(a);
  const before = read(file);
  const decisionsBefore = read(resolve(a, '.devocd', 'decisions.md'));

  // First run: b is set up but not registered, so nothing links yet.
  const first = resolveProjectLinks(a);
  assert.equal(first.changed, false);
  assert.deepEqual(first.links, []);
  assert.equal(read(file), before, 'an unresolved dependency changes nothing');

  // Onboard b, then set a up again.
  registerB(ws.company);
  const again = resolveProjectLinks(a);
  assert.equal(again.changed, true);
  assert.equal(again.links.length, 1);
  assert.deepEqual(
    { dependency: again.links[0].dependency, kind: again.links[0].kind, project: again.links[0].project, link: again.links[0].link },
    { dependency: 'b', kind: 'local-path', project: 'b', link: '../../b/.devocd/PROJECT.md' },
  );
  assert.ok(existsSync(resolve(a, '.devocd', again.links[0].link)), 'the link stays inside the company folder');

  const after = read(file);
  assert.ok(after.includes('- `b` (local path): the shared library — [b project](../../b/.devocd/PROJECT.md)'), after);
  assert.ok(after.includes('## Links\n- [Company rules](../../CLAUDE.md)'), 'other sections are kept');
  assert.equal(read(resolve(a, '.devocd', 'decisions.md')), decisionsBefore, 'decisions are kept');
  assert.ok(after.startsWith('# a\n\nProject a.\n'), 'the text before the section is kept');
});

test('a second rerun is idempotent: no duplicate link and no byte changes', t => {
  const { ws, a } = companyWithA(t, { 'package.json': JSON.stringify({ dependencies: { b: 'file:../b' } }) });
  registerB(ws.company);
  assert.equal(resolveProjectLinks(a).changed, true);
  const settled = read(projectMd(a));

  const second = resolveProjectLinks(a);
  assert.equal(second.changed, false);
  assert.deepEqual(second.links, []);
  assert.equal(read(projectMd(a)), settled, 'a second run changes nothing');
  assert.equal((settled.match(/\[b project\]\(\.\.\/\.\.\/b\/\.devocd\/PROJECT\.md\)/g) ?? []).length, 1);
});

test('the CLI writes the same link the library resolves', t => {
  const { ws, a } = companyWithA(t, { 'package.json': JSON.stringify({ dependencies: { b: 'file:../b' } }) });
  registerB(ws.company);
  const out = JSON.parse(helper('link-projects', a));
  assert.equal(out.changed, true);
  assert.equal(out.links[0].link, '../../b/.devocd/PROJECT.md');
  assert.ok(read(projectMd(a)).includes('../../b/.devocd/PROJECT.md'));
});

test('a git dependency matches a registered project by repository name', t => {
  const { ws, a } = companyWithA(t, {
    'package.json': JSON.stringify({ dependencies: { 'b-client': 'git+https://git.example.com/org/b.git' } }),
  });
  makeTree(a, {
    '.devocd/PROJECT.md': '# a\n\nProject a.\n\n## Dependencies\n- `b-client` (git): the client from b\n',
  });
  registerB(ws.company);
  const r = resolveProjectLinks(a);
  assert.equal(r.changed, true);
  assert.equal(r.links[0].project, 'b');
  assert.ok(read(projectMd(a)).includes('[b project](../../b/.devocd/PROJECT.md)'));
});

test('no link when the registered project has no PROJECT.md', t => {
  const { ws, a } = companyWithA(t, { 'package.json': JSON.stringify({ dependencies: { b: 'file:../b' } }) }, { bProjectMd: null });
  registerB(ws.company);
  const before = read(projectMd(a));
  const r = resolveProjectLinks(a);
  assert.equal(r.changed, false);
  assert.equal(read(projectMd(a)), before);
});

test('no link when the registry points outside the company folder', t => {
  const { ws, a } = companyWithA(t, { 'package.json': JSON.stringify({ dependencies: { b: 'file:../../outside-b' } }) });
  const outside = resolve(ws.company, '..', 'outside-b');
  makeTree(outside, { '.devocd/PROJECT.md': '# outside\n' });
  // A hand-edited registry entry: register refuses this, so write the state straight.
  const state = JSON.parse(read(resolve(ws.company, '.devocd', 'state.json')));
  state.projects.push({ id: 'outside-b', path: '../outside-b', description: 'outside' });
  makeTree(ws.company, { '.devocd/state.json': JSON.stringify(state, null, 2) + '\n' });

  const before = read(projectMd(a));
  const r = resolveProjectLinks(a);
  assert.equal(r.changed, false, 'a pointer that leaves the company is ignored');
  assert.equal(read(projectMd(a)), before);
});

test('an existing dependency link is kept and never duplicated', t => {
  const { ws, a } = companyWithA(t, { 'package.json': JSON.stringify({ dependencies: { b: 'file:../b' } }) });
  makeTree(a, {
    '.devocd/PROJECT.md': '# a\n\n## Dependencies\n- `b` (local path): the shared library — [b project](../../b/.devocd/PROJECT.md)\n',
  });
  registerB(ws.company);
  const before = read(projectMd(a));
  const r = resolveProjectLinks(a);
  assert.equal(r.changed, false);
  assert.equal(read(projectMd(a)), before);
});

test('a project without a Dependencies section is left alone', t => {
  const { ws, a } = companyWithA(t, { 'package.json': JSON.stringify({ dependencies: { b: 'file:../b' } }) });
  makeTree(a, { '.devocd/PROJECT.md': '# a\n\nProject a with no dependency section.\n' });
  registerB(ws.company);
  const before = read(projectMd(a));
  const r = resolveProjectLinks(a);
  assert.equal(r.changed, false);
  assert.deepEqual(r.links, []);
  assert.equal(read(projectMd(a)), before);
});

test('a project with no state is refused, so the command cannot run before setup', t => {
  const ws = workspace(t, {});
  assert.throws(() => resolveProjectLinks(ws.root), /state\.json/);
});
