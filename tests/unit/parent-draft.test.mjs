// @ts-check
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeTree } from '../helpers/tree.mjs';
import { git, makeRepo as newRepo, tmp as newTmp, tryLink } from '../helpers/git.mjs';

const cli = fileURLToPath(new URL('../../plugin/scripts/devocd.mjs', import.meta.url));

/** Every temp folder made here, removed when this file's tests end. */
const made = /** @type {string[]} */ ([]);
const tmp = () => { const d = newTmp(); made.push(d); return d; };
const makeRepo = () => { const d = newRepo(); made.push(d); return d; };
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
const DRAFT = '.devocd/state.draft.json';

/** @param {Partial<any>} over */
const company = (over = {}) => ({
  version: 1, kind: 'company', name: 'Acme', description: 'Acme builds anvils.', parentFile: 'CLAUDE.md',
  keyRules: ['Never deploy on Friday.'], projects: [], sources: [{ type: 'file', ref: 'a.md', readAt: '2026-11-07' }], ...over,
});
const render = (/** @type {string} */ dir, /** @type {string[]} */ ...args) => spawnSync(process.execPath, [cli, 'render-parent', dir, ...args], { encoding: 'utf8' });

/** A company folder that already has good state and a parent with the user's own text outside the block. */
function installed() {
  const dir = tmp();
  makeTree(dir, { '.devocd/state.json': JSON.stringify(company(), null, 2) + '\n', 'CLAUDE.md': 'my own notes\r\n' });
  assert.equal(render(dir).status, 0);
  return { dir, state: readFileSync(join(dir, '.devocd', 'state.json')), parent: readFileSync(join(dir, 'CLAUDE.md')) };
}

test('a draft that fits writes state and the parent, then removes the draft', () => {
  const { dir } = installed();
  const next = company({ keyRules: ['Ask before touching billing.'] });
  makeTree(dir, { [DRAFT]: JSON.stringify(next) });
  const r = render(dir, join(dir, DRAFT));
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, '.devocd', 'state.json'), 'utf8')), next);
  const parent = readFileSync(join(dir, 'CLAUDE.md'), 'utf8');
  assert.ok(parent.includes('- Ask before touching billing.') && !parent.includes('Never deploy on Friday.'));
  assert.ok(parent.endsWith('my own notes\r\n'), 'text outside the block is kept');
  assert.ok(!existsSync(join(dir, DRAFT)), 'draft removed');
});

test('a draft works on a fresh folder with a relative path', () => {
  const dir = tmp();
  makeTree(dir, { [DRAFT]: JSON.stringify(company()) });
  const r = spawnSync(process.execPath, [cli, 'render-parent', '.', DRAFT], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(dir, '.devocd', 'state.json')) && existsSync(join(dir, 'CLAUDE.md')));
  assert.ok(!existsSync(join(dir, DRAFT)));
});

const BAD_DRAFTS = /** @type {[string, string, RegExp][]} */ ([
  ['key rules too long', JSON.stringify(company({ keyRules: ['x'.repeat(1300)] })), /estimated tokens/],
  ['not JSON', '{ nope', /not valid JSON/],
  ['the wrong kind', JSON.stringify({ ...company(), kind: 'project' }), /kind must be company/],
  ['a missing field', JSON.stringify({ ...company(), keyRules: undefined }), /keyRules/],
  ['a bad source', JSON.stringify(company({ sources: [{ type: 'file', ref: 'a.md' }] })), /sources/],
  ['a bad parent file name', JSON.stringify(company({ parentFile: 'OTHER.md' })), /parentFile/],
  ['a parent that cannot fit', JSON.stringify(company({ keyRules: Array.from({ length: 70 }, (_, i) => `r${i}`) })), /over its limit/],
]);

for (const [name, text, message] of BAD_DRAFTS) {
  test(`a draft with ${name}: state and parent stay byte-identical, the draft goes, exit 1`, () => {
    const { dir, state, parent } = installed();
    makeTree(dir, { [DRAFT]: text });
    const r = render(dir, join(dir, DRAFT));
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, message);
    assert.deepEqual(readFileSync(join(dir, '.devocd', 'state.json')), state);
    assert.deepEqual(readFileSync(join(dir, 'CLAUDE.md')), parent);
    assert.ok(!existsSync(join(dir, DRAFT)), 'draft removed');
  });
}

/** The Projects section of the parent block. */
function projectsSection(/** @type {string} */ dir) {
  const text = readFileSync(join(dir, 'CLAUDE.md'), 'utf8');
  return text.slice(text.indexOf('## Projects'), text.indexOf('## Guidance'));
}
const stateOf = (/** @type {string} */ dir) => JSON.parse(readFileSync(join(dir, '.devocd', 'state.json'), 'utf8'));

test("a draft's projects are ignored: they stay as register wrote them", () => {
  const { dir } = installed();
  const reg = spawnSync(process.execPath, [cli, 'register', dir, 'api', 'repos/api', 'The API'], { encoding: 'utf8' });
  assert.equal(reg.status, 0, reg.stderr);
  const registered = stateOf(dir).projects;
  const section = projectsSection(dir);
  assert.ok(section.includes('- api: The API — repos/api/.devocd/PROJECT.md'));
  for (const projects of [[], [{ id: 'x', path: '../outside', description: 'd' }]]) {
    makeTree(dir, { [DRAFT]: JSON.stringify(company({ keyRules: ['New rule.'], projects })) });
    const r = render(dir, join(dir, DRAFT));
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(stateOf(dir).projects, registered, `state.projects after a draft with ${JSON.stringify(projects)}`);
    assert.equal(projectsSection(dir), section, `the parent's projects after a draft with ${JSON.stringify(projects)}`);
    assert.ok(readFileSync(join(dir, 'CLAUDE.md'), 'utf8').includes('- New rule.'), 'the rest of the draft was applied');
  }
});

test("on a fresh folder a draft's projects are ignored, and a draft may leave them out", () => {
  const dir = tmp();
  makeTree(dir, { [DRAFT]: JSON.stringify(company({ projects: [{ id: 'x', path: '../outside', description: 'd' }] })) });
  assert.equal(render(dir, join(dir, DRAFT)).status, 0);
  assert.deepEqual(stateOf(dir).projects, []);
  assert.ok(projectsSection(dir).includes('- none registered yet'));
  makeTree(dir, { [DRAFT]: JSON.stringify({ ...company(), projects: undefined }) });
  const r = render(dir, join(dir, DRAFT));
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(stateOf(dir).projects, []);
});

test('a draft is refused when the folder holds state that is not company state', () => {
  const dir = tmp();
  const project = JSON.stringify({ version: 1, kind: 'project', id: 'api', companyRel: '..', teamFiles: [], approvedCommands: [], sources: [] }) + '\n';
  makeTree(dir, { '.devocd/state.json': project, [DRAFT]: JSON.stringify(company()) });
  const r = render(dir, join(dir, DRAFT));
  assert.equal(r.status, 1, r.stderr);
  assert.equal(readFileSync(join(dir, '.devocd', 'state.json'), 'utf8'), project);
  assert.ok(!existsSync(join(dir, 'CLAUDE.md')));
  assert.ok(!existsSync(join(dir, DRAFT)));
});

test('a rejected draft on a fresh folder creates no state and no parent', () => {
  const dir = tmp();
  makeTree(dir, { [DRAFT]: JSON.stringify(company({ keyRules: ['x'.repeat(1300)] })) });
  assert.equal(render(dir, join(dir, DRAFT)).status, 1);
  assert.ok(!existsSync(join(dir, '.devocd', 'state.json')));
  assert.ok(!existsSync(join(dir, 'CLAUDE.md')));
  assert.ok(!existsSync(join(dir, DRAFT)));
});

test('a malformed parent refuses the draft: state and parent stay, the draft goes', () => {
  const { dir, state } = installed();
  writeFileSync(join(dir, 'CLAUDE.md'), 'notes\n<!-- devocd:begin -->\nhalf\n');
  makeTree(dir, { [DRAFT]: JSON.stringify(company({ keyRules: ['New rule.'] })) });
  assert.equal(render(dir, join(dir, DRAFT)).status, 1);
  assert.deepEqual(readFileSync(join(dir, '.devocd', 'state.json')), state);
  assert.equal(readFileSync(join(dir, 'CLAUDE.md'), 'utf8'), 'notes\n<!-- devocd:begin -->\nhalf\n');
  assert.ok(!existsSync(join(dir, DRAFT)));
});

test('inside a git repo: the parent is CLAUDE.local.md whatever the draft says, and git stays clean', () => {
  const repo = makeRepo();
  makeTree(repo, { [DRAFT]: JSON.stringify(company({ parentFile: 'CLAUDE.md' })) });
  const r = render(repo, join(repo, DRAFT));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(readFileSync(join(repo, '.devocd', 'state.json'), 'utf8')).parentFile, 'CLAUDE.local.md');
  assert.ok(existsSync(join(repo, 'CLAUDE.local.md')) && !existsSync(join(repo, 'CLAUDE.md')));
  assert.equal(git(repo, 'status', '--porcelain'), '');
});

test('only a file named *.draft.json is taken as a draft, so a wrong path cannot delete a real file', () => {
  const { dir, state, parent } = installed();
  for (const name of ['CLAUDE.md', join('.devocd', 'state.json')]) {
    const r = render(dir, join(dir, name));
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /\.draft\.json/);
  }
  makeTree(dir, { 'package.json': '{}\n' });
  assert.equal(render(dir, join(dir, 'package.json')).status, 2);
  assert.ok(existsSync(join(dir, 'package.json')));
  assert.deepEqual(readFileSync(join(dir, '.devocd', 'state.json')), state);
  assert.deepEqual(readFileSync(join(dir, 'CLAUDE.md')), parent);
});

test('a missing draft or a linked draft is refused, and a link is not removed', (t) => {
  const { dir, state } = installed();
  const missing = render(dir, join(dir, DRAFT));
  assert.equal(missing.status, 1, missing.stderr);
  assert.match(missing.stderr, /^error: /m);
  assert.deepEqual(readFileSync(join(dir, '.devocd', 'state.json')), state);
  const link = join(dir, 'link.draft.json');
  if (!tryLink(tmp(), link)) return t.skip('cannot create links here');
  assert.equal(render(dir, link).status, 1);
  assert.ok(existsSync(link), 'the link stays');
  rmSync(link, { recursive: false, force: true });
});

test('render-parent with too many arguments is a usage error', () => {
  const dir = tmp();
  assert.equal(render(dir, 'a.draft.json', 'b').status, 2);
});
