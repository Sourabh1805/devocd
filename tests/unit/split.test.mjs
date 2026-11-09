// @ts-check
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { splitTeam } from '../../plugin/scripts/lib/split.mjs';
import { walkFiles } from '../../plugin/scripts/lib/fsutil.mjs';
import { makeTree } from '../helpers/tree.mjs';
import { tmp as newTmp, tryLink } from '../helpers/git.mjs';

const cli = fileURLToPath(new URL('../../plugin/scripts/devocd.mjs', import.meta.url));
const made = /** @type {string[]} */ ([]);
const tmp = () => { const d = join(newTmp('devocd-split-'), 'my api ï'); made.push(d); mkdirSync(d, { recursive: true }); return d; };
after(() => { for (const d of made) rmSync(join(d, '..'), { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });

const BOM = '\uFEFF';
const TEAM = `${BOM}# Team\r\n\r\n- Never push to main.\r\n- For installs, use pnpm. café ☕\r\n\r\n## Tests\r\n- Every fix needs a test.\r\nno final newline`;
const plan = (/** @type {string} */ dir) => join(dir, '.devocd', 'split.draft.json');
const put = (/** @type {string} */ dir, /** @type {any} */ p, team = TEAM) => {
  makeTree(dir, { 'CLAUDE.md': team });
  writeFileSync(join(dir, 'CLAUDE.md'), team);
  makeTree(dir, { '.devocd/split.draft.json': JSON.stringify({ teamFile: 'CLAUDE.md', inline: [], flagged: [], files: [], ...p }) });
};
const run = (/** @type {string} */ dir, /** @type {string} */ file = plan(dir)) => spawnSync(process.execPath, [cli, 'split-team', dir, file], { encoding: 'utf8' });
const teamFiles = (/** @type {string} */ dir) => walkFiles(join(dir, '.devocd', 'team')).map((f) => f.slice(join(dir, '.devocd', 'team').length + 1));
/** A plan covering TEAM (8 lines): 1-2 and 5-8 moved, 3 inline, 4 flagged. */
const GOOD = { inline: [3], flagged: [4], files: [{ name: 'intro', topic: 'Start', from: 1, to: 2 }, { name: 'tests', topic: 'Tests', from: 5, to: 8 }] };

test('copies the ranges byte for byte, keeping CRLF, the BOM and a missing final newline, with a header', () => {
  const d = tmp();
  put(d, GOOD);
  const r = run(d);
  assert.equal(r.status, 0, r.stderr);
  const lines = TEAM.split(/(?<=\n)/);
  assert.equal(readFileSync(join(d, '.devocd', 'team', 'intro.md'), 'utf8'), `From CLAUDE.md lines 1-2; the team file is the source.\n${lines.slice(0, 2).join('')}`);
  assert.equal(readFileSync(join(d, '.devocd', 'team', 'tests.md'), 'utf8'), `From CLAUDE.md lines 5-8; the team file is the source.\n${lines.slice(4, 8).join('')}`);
  assert.ok(readFileSync(join(d, '.devocd', 'team', 'intro.md'), 'utf8').includes(`\n${BOM}# Team\r\n`), 'the BOM survives');
  const out = JSON.parse(r.stdout);
  assert.deepEqual(out.inline, [{ line: 3, text: '- Never push to main.' }]);
  assert.deepEqual(out.flagged, [4]);
  assert.deepEqual(out.files.map((/** @type {any} */ f) => [f.name, f.path, f.topic, f.lines]), [['intro', '.devocd/team/intro.md', 'Start', 2], ['tests', '.devocd/team/tests.md', 'Tests', 4]]);
  assert.equal(readFileSync(join(d, 'CLAUDE.md'), 'utf8'), TEAM, 'the team file is untouched');
});

test('the plan is deleted after a success and after a refusal, but a wrong file is never deleted', () => {
  const ok = tmp();
  put(ok, GOOD);
  assert.equal(run(ok).status, 0);
  assert.ok(!existsSync(plan(ok)));
  const bad = tmp();
  put(bad, { inline: [3] });
  assert.equal(run(bad).status, 1);
  assert.ok(!existsSync(plan(bad)), 'deleted after a refusal');
  const other = tmp();
  put(other, GOOD);
  writeFileSync(join(other, 'elsewhere.json'), '{}');
  assert.equal(run(other, join(other, 'elsewhere.json')).status, 2);
  assert.ok(existsSync(join(other, 'elsewhere.json')) && existsSync(plan(other)), 'nothing removed');
  assert.deepEqual(teamFiles(other), []);
});

/** Each refusal exits 1, writes no team file and still deletes the plan. */
for (const [name, p, match] of /** @type {[string, any, RegExp][]} */ ([
  ['a non-blank line in no list', { inline: [3], files: [{ name: 'a', topic: 't', from: 1, to: 2 }] }, /3 non-blank lines.*first: 4, 5, 6|first: 4/],
  ['overlapping ranges', { ...GOOD, files: [{ name: 'a', topic: 't', from: 1, to: 4 }, { name: 'b', topic: 't', from: 4, to: 8 }] }, /more than one file/],
  ['a range outside the file', { ...GOOD, files: [{ name: 'a', topic: 't', from: 1, to: 99 }] }, /outside 1-8/],
  ['a range backwards', { ...GOOD, files: [{ name: 'a', topic: 't', from: 5, to: 2 }] }, /outside 1-8/],
  ['an inline line outside the file', { ...GOOD, inline: [9] }, /outside 1-8/],
  ['a bad name', { ...GOOD, files: [{ name: 'Bad_Name', topic: 't', from: 1, to: 8 }] }, /lowercase/],
  ['a repeated name', { ...GOOD, files: [{ name: 'a', topic: 't', from: 1, to: 2 }, { name: 'a', topic: 't', from: 5, to: 8 }] }, /twice/],
  ['a team file that escapes the folder', { ...GOOD, teamFile: '../CLAUDE.md' }, /not inside/],
  ['an absolute team file', { ...GOOD, teamFile: process.platform === 'win32' ? 'C:/Windows/win.ini' : '/etc/hosts' }, /not inside/],
  ['a multi-line topic', { ...GOOD, files: [{ name: 'a', topic: 'x\ny', from: 1, to: 8 }] }, /one line/],
])) {
  test(`refuses ${name}, writes nothing and still deletes the plan`, () => {
    const d = tmp();
    put(d, p);
    const r = run(d);
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, match);
    assert.deepEqual(teamFiles(d), []);
    assert.ok(!existsSync(plan(d)));
  });
}

test('refuses a moved file over 200 lines with its header, and accepts 199 lines', () => {
  const d = tmp();
  const team = Array.from({ length: 300 }, (_, i) => `- rule ${i + 1}`).join('\n') + '\n';
  put(d, { files: [{ name: 'big', topic: 't', from: 1, to: 200 }, { name: 'rest', topic: 't', from: 201, to: 300 }] }, team);
  const r = run(d);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /201 lines with its header/);
  assert.deepEqual(teamFiles(d), []);
  put(d, { files: [{ name: 'big', topic: 't', from: 1, to: 199 }, { name: 'rest', topic: 't', from: 200, to: 300 }] }, team);
  assert.equal(run(d).status, 0);
  assert.equal(readFileSync(join(d, '.devocd', 'team', 'big.md'), 'utf8').split('\n').length - 1, 200);
});

test('a refusal leaves earlier team files alone, and a rerun removes ones the plan no longer names', () => {
  const d = tmp();
  put(d, GOOD);
  assert.equal(run(d).status, 0);
  makeTree(d, { '.devocd/team/stale.md': 'old\n', '.devocd/team/notes.txt': 'mine\n' });
  put(d, { inline: [3] });
  assert.equal(run(d).status, 1);
  assert.deepEqual(teamFiles(d).sort(), ['intro.md', 'notes.txt', 'stale.md', 'tests.md'], 'a refused plan changes nothing');
  put(d, { inline: [3, 4], files: [{ name: 'all', topic: 'rest', from: 1, to: 2 }, { name: 'tests', topic: 'Tests', from: 5, to: 8 }] });
  assert.equal(run(d).status, 0);
  assert.deepEqual(teamFiles(d).sort(), ['all.md', 'notes.txt', 'tests.md'], 'intro.md and stale.md removed; a non-.md file kept');
});

test('usage errors exit 2, and a missing or non-JSON plan exits 1', () => {
  const d = tmp();
  assert.equal(spawnSync(process.execPath, [cli, 'split-team', d], { encoding: 'utf8' }).status, 2);
  assert.equal(run(d).status, 1, 'no plan file');
  makeTree(d, { '.devocd/split.draft.json': '{nope', 'CLAUDE.md': 'x\n' });
  assert.equal(run(d).status, 1);
  assert.ok(!existsSync(plan(d)));
});

test('never writes through a link: a linked .devocd/team and a missing team file are refused', () => {
  const d = tmp();
  put(d, GOOD);
  const outside = newTmp('devocd-outside-');
  made.push(join(outside, 'x'));
  if (tryLink(outside, join(d, '.devocd', 'team'))) {
    const r = run(d);
    assert.equal(r.status, 1, r.stderr);
    assert.deepEqual(readdirSync(outside), [], 'nothing written outside');
  }
  const e = tmp();
  put(e, { ...GOOD, teamFile: 'MISSING.md' });
  assert.equal(run(e).status, 1);
});

test('splitTeam works on an empty-line-only gap and a plan that lists a line twice', () => {
  const d = tmp();
  put(d, { inline: [3, 3], flagged: [4, 4], files: [{ name: 'a', topic: 't', from: 1, to: 2 }, { name: 'b', topic: 't', from: 5, to: 8 }] });
  const r = splitTeam(d, plan(d));
  assert.deepEqual(r.inline.map((x) => x.line), [3]);
  assert.deepEqual(r.flagged, [4]);
});
