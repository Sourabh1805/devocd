// @ts-check
// Live checks against the real Claude Code. Skipped unless DEVOCD_LIVE=1. Never run in CI.
// Each check records what it saw to a JSON-lines file (see note()), because several of them record behaviour
// rather than expect one answer. The findings go into docs/research/claude-code.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, parse } from 'node:path';
import { fileURLToPath } from 'node:url';
import { liveEnabled, runClaude, defaultLedger } from '../helpers/claude.mjs';
import { makeCompany } from '../helpers/makeCompany.mjs';
import { makeTree } from '../helpers/tree.mjs';
import { tmp } from '../helpers/git.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const live = liveEnabled();
/** @param {string} name @param {(t: import('node:test').TestContext) => Promise<void>} fn */
const liveTest = (name, fn) => test(name, { skip: live ? false : 'set DEVOCD_LIVE=1 to run', timeout: 600_000 }, fn);

/** @param {string} p */
const fwd = (p) => p.split(String.fromCharCode(92)).join('/');
const obsFile = join(tmpdir(), `devocd-live-observations-${process.ppid}.jsonl`);

/** Record an observation: printed as a test diagnostic and appended to a file for the notes. */
function note(/** @type {import('node:test').TestContext} */ t, /** @type {string} */ key, /** @type {any} */ value) {
  const line = JSON.stringify({ key, value });
  t.diagnostic(line);
  appendFileSync(obsFile, line + '\n');
}

/** Run fn with a fresh temp folder that is always removed afterwards. */
async function withRoot(/** @type {(root: string) => Promise<void>} */ fn) {
  const root = tmp('devocd-live-');
  try { await fn(root); } finally { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
}

const ASK_CANARIES = 'Without using any tools, list every string starting with CANARY- that appears in the instructions or context you were given before this message. Output only those strings, one per line, or the single word NONE.';
/** @param {string} text */
const canaries = (text) => [...new Set(text.match(/CANARY-[A-Z0-9-]+/g) ?? [])].sort();

/** Prove the run loaded no plugin other than the requested ones (built-in ones are always listed). */
function assertIsolated(/** @type {{ events: any[] }} */ r, /** @type {string[]} */ expected = []) {
  const init = r.events.find((e) => e.type === 'system' && e.subtype === 'init');
  assert.ok(init, 'init event present');
  const external = (init.plugins ?? []).filter((/** @type {any} */ p) => p.path !== 'builtin').map((/** @type {any} */ p) => p.name).sort();
  assert.deepEqual(external, [...expected].sort(), 'only the requested plugins are loaded');
}

/** Tool results from a run: { isError, text }[] */
function toolResults(/** @type {any[]} */ events) {
  /** @type {{ isError: boolean, text: string }[]} */ const out = [];
  for (const e of events) {
    if (e.type !== 'user' || !Array.isArray(e.message?.content)) continue;
    for (const b of e.message.content) {
      if (b.type !== 'tool_result') continue;
      const text = typeof b.content === 'string' ? b.content : (b.content ?? []).map((/** @type {any} */ c) => c.text ?? '').join('\n');
      out.push({ isError: !!b.is_error, text });
    }
  }
  return out;
}

/** fs.cpSync on Node 22 on Windows creates a mis-encoded destination name when the path has a non-ASCII character, so copy by hand. */
function copyTree(/** @type {string} */ from, /** @type {string} */ to) {
  mkdirSync(to, { recursive: true });
  for (const e of readdirSync(from, { withFileTypes: true })) {
    if (e.isDirectory()) copyTree(join(from, e.name), join(to, e.name));
    else copyFileSync(join(from, e.name), join(to, e.name));
  }
}

// The probe plugin: a copy of plugin/scripts plus one skill, in a folder with a space and a non-ASCII character.
function makeProbePlugin(/** @type {string} */ root) {
  const dir = join(root, 'probe plugin ï');
  mkdirSync(join(dir, '.claude-plugin'), { recursive: true });
  writeFileSync(join(dir, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'devocd', version: '0.0.0', description: 'probe', author: { name: 'Test' } }));
  copyTree(join(repoRoot, 'plugin', 'scripts'), join(dir, 'scripts'));
  makeTree(join(dir, 'skills', 'probe'), {
    'SKILL.md': [
      '---',
      'name: probe',
      'description: Runs the devocd check command on a folder. For tests only.',
      'disable-model-invocation: true',
      'argument-hint: "[folder]"',
      'allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/devocd.mjs" *)',
      '---',
      '',
      'Run this exact command with the Bash tool, then show its full output and nothing else:',
      '',
      '    node "${CLAUDE_PLUGIN_ROOT}/scripts/devocd.mjs" check "$ARGUMENTS"',
      '',
    ].join('\n'),
  });
  return dir;
}

liveTest('isolation: a run lists no plugin except the requested one, and the temp folder inherits no CLAUDE.md', async (t) => {
  await withRoot(async (root) => {
    // No memory file may exist above the temp folder (the check below is deterministic).
    const strays = [];
    for (let d = tmpdir(); ; d = dirname(d)) {
      for (const f of ['CLAUDE.md', 'CLAUDE.local.md', 'AGENTS.md', join('.claude', 'CLAUDE.md')]) if (existsSync(join(d, f))) strays.push(fwd(join(d, f)));
      if (parse(d).root === d) break;
    }
    note(t, 'stray-memory-files-above-temp', strays);
    assert.deepEqual(strays, []);
    const plugin = makeProbePlugin(root);
    const cwd = join(root, 'empty'); mkdirSync(cwd);
    const r = await runClaude({ prompt: ASK_CANARIES, cwd, allowedTools: [], model: 'sonnet', pluginDir: plugin });
    assertIsolated(r, ['devocd']);
    const bare = await runClaude({ prompt: ASK_CANARIES, cwd, allowedTools: [], model: 'sonnet', withPlugin: false });
    assertIsolated(bare, []);
    note(t, 'init-plugins', r.events.find((e) => e.subtype === 'init').plugins);
    assert.deepEqual(canaries(r.text), []);
  });
});

liveTest('from a project folder: parent CLAUDE.md and the repo CLAUDE.local.md both load', async (t) => {
  await withRoot(async (root) => {
    const { company, repos } = makeCompany(root, { projects: ['api'] });
    makeTree(company, { 'CLAUDE.md': 'CANARY-PARENT-ONE\n' });
    makeTree(repos.api, { 'CLAUDE.local.md': 'CANARY-LOCAL-TWO\n' });
    const r = await runClaude({ prompt: ASK_CANARIES, cwd: repos.api, allowedTools: [], model: 'sonnet', withPlugin: false });
    assertIsolated(r, []);
    note(t, 'project-folder-canaries', canaries(r.text));
    assert.deepEqual(canaries(r.text), ['CANARY-LOCAL-TWO', 'CANARY-PARENT-ONE']);
  });
});

liveTest('from the company folder: a project CLAUDE.local.md does not load until a file there is touched', async (t) => {
  await withRoot(async (root) => {
    const { company, repos } = makeCompany(root, { projects: ['api'] });
    makeTree(company, { 'CLAUDE.md': 'CANARY-PARENT-ONE\n' });
    makeTree(repos.api, { 'CLAUDE.local.md': 'CANARY-SUBLOCAL-THREE\n', 'CLAUDE.md': 'CANARY-SUBTEAM-FOUR\n' });
    const before = await runClaude({ prompt: ASK_CANARIES, cwd: company, allowedTools: [], model: 'sonnet', withPlugin: false });
    note(t, 'company-folder-before-touch', canaries(before.text));
    assert.deepEqual(canaries(before.text), ['CANARY-PARENT-ONE']);
    const after = await runClaude({
      prompt: `Read the file ${fwd(join(repos.api, 'README.md'))} with the Read tool. Then list every string starting with CANARY- that appears anywhere in your instructions or context, one per line, or NONE.`,
      cwd: company, allowedTools: ['Read'], model: 'sonnet', withPlugin: false,
    });
    note(t, 'company-folder-after-touch', { canaries: canaries(after.text), reads: after.reads });
    assert.ok(after.reads.some((p) => p.endsWith('/api/README.md')), 'the file was read');
    for (const c of canaries(after.text)) assert.ok(['CANARY-PARENT-ONE', 'CANARY-SUBLOCAL-THREE', 'CANARY-SUBTEAM-FOUR'].includes(c));
  });
});

liveTest("claudeMdExcludes in settings.local.json stops the repo's own CLAUDE.md loading", async (t) => {
  await withRoot(async (root) => {
    const { repos } = makeCompany(root, { projects: ['api', 'ctl'], teamClaudeMd: { api: 'CANARY-TEAMFILE-API\n', ctl: 'CANARY-TEAMFILE-CTL\n' } });
    makeTree(repos.api, { '.claude/settings.local.json': JSON.stringify({ claudeMdExcludes: [fwd(join(repos.api, 'CLAUDE.md'))] }) });
    const control = await runClaude({ prompt: ASK_CANARIES, cwd: repos.ctl, allowedTools: [], model: 'sonnet', withPlugin: false });
    assert.deepEqual(canaries(control.text), ['CANARY-TEAMFILE-CTL'], 'control: without the setting the repo CLAUDE.md loads');
    const r = await runClaude({ prompt: ASK_CANARIES, cwd: repos.api, allowedTools: [], model: 'sonnet', withPlugin: false });
    note(t, 'claudeMdExcludes-own-repo-claude-md', canaries(r.text));
    assert.deepEqual(canaries(r.text), [], 'the excluded CLAUDE.md did not load');
  });
});

liveTest('a plugin skill runs node ${CLAUDE_PLUGIN_ROOT}/scripts/devocd.mjs with allowed-tools on Windows and from a path with spaces', async (t) => {
  await withRoot(async (root) => {
    const plugin = makeProbePlugin(root);
    const { repos } = makeCompany(root, { projects: ['api'] });
    const r = await runClaude({ prompt: `/devocd:probe ${fwd(repos.api)}`, cwd: repos.api, pluginDir: plugin, model: 'sonnet', maxTurns: 6 });
    assertIsolated(r, ['devocd']);
    note(t, 'skill-run', { bashCommands: r.bashCommands, results: toolResults(r.events).map((x) => ({ isError: x.isError, text: x.text.slice(0, 300) })), text: r.text.slice(0, 300) });
    assert.ok(r.bashCommands.some((c) => c.includes('devocd.mjs')), 'the script was run');
    const out = toolResults(r.events).find((x) => x.text.includes('devocd check'));
    // check exits 1 here (no state.json), so is_error is expected; what matters is that the script ran, not that approval was refused.
    assert.ok(out && !/requires approval|Cannot find module/.test(out.text), 'the script ran and printed its check output');
  });
});

liveTest('/devocd:<skill> with arguments runs under claude -p', async (t) => {
  await withRoot(async (root) => {
    const plugin = makeProbePlugin(root);
    const { repos } = makeCompany(root, { projects: ['api'] });
    const spaced = join(root, 'a folder with spaces'); mkdirSync(spaced);
    const r = await runClaude({ prompt: `/devocd:probe ${fwd(spaced)}`, cwd: repos.api, pluginDir: plugin, model: 'sonnet', maxTurns: 6 });
    note(t, 'skill-args-with-spaces', { bashCommands: r.bashCommands, results: toolResults(r.events).map((x) => ({ isError: x.isError, text: x.text.slice(0, 300) })) });
    const out = toolResults(r.events).find((x) => x.text.includes('devocd check'));
    assert.ok(out, 'the script ran with the argument');
    assert.ok(out.text.includes('a folder with spaces'), 'the whole argument reached the script');
  });
});

liveTest('reading the parent standards from a project session: record what happens', async (t) => {
  await withRoot(async (root) => {
    const { company, repos } = makeCompany(root, { projects: ['api'] });
    makeTree(company, { '.devocd/standards/rules.md': 'The standards secret is CANARY-STANDARDS-FIVE.\n' });
    const target = fwd(join(company, '.devocd', 'standards', 'rules.md'));
    const r = await runClaude({ prompt: `Use the Read tool to read ${target} and tell me the CANARY string in it.`, cwd: repos.api, allowedTools: ['Read'], model: 'sonnet', withPlugin: false });
    const res = toolResults(r.events);
    const outcome = r.text.includes('CANARY-STANDARDS-FIVE') ? 'allowed' : (res.some((x) => x.isError) ? 'denied' : 'unclear');
    note(t, 'read-parent-standards-from-project-session', { outcome, reads: r.reads, results: res.map((x) => ({ isError: x.isError, text: x.text.slice(0, 200) })) });
        // Same read with no allow rule for Read: what the default permission mode does under -p.
    const d = await runClaude({ prompt: `Use the Read tool to read ${target} and tell me the CANARY string in it.`, cwd: repos.api, model: 'sonnet', withPlugin: false });
    const dres = toolResults(d.events);
    const dOutcome = d.text.includes('CANARY-STANDARDS-FIVE') ? 'allowed' : (dres.some((x) => x.isError) ? 'denied' : 'unclear');
    note(t, 'read-parent-standards-default-permissions', { outcome: dOutcome, results: dres.map((x) => ({ isError: x.isError, text: x.text.slice(0, 200) })) });
    for (const o of [outcome, dOutcome]) assert.ok(['allowed', 'denied', 'unclear'].includes(o));
  });
});

liveTest("which of CLAUDE.md and CLAUDE.local.md turn off a repo's AGENTS.md", async (t) => {
  await withRoot(async (root) => {
    /** @type {Record<string, string[]>} */ const seen = {};
    const ask = async (/** @type {string} */ key, /** @type {string} */ cwd) => {
      const r = await runClaude({ prompt: ASK_CANARIES, cwd, allowedTools: [], model: 'sonnet', withPlugin: false });
      seen[key] = canaries(r.text);
    };
    const { repos } = makeCompany(root, { projects: ['plain', 'teamfile', 'localfile', 'excluded'], teamAgentsMd: { excluded: 'CANARY-AGENTS-EXCLUDED\n', plain: 'CANARY-AGENTS-PLAIN\n', teamfile: 'CANARY-AGENTS-TEAMFILE\n', localfile: 'CANARY-AGENTS-LOCALFILE\n' } });
    makeTree(repos.teamfile, { 'CLAUDE.md': 'CANARY-CLAUDE-TEAMFILE\n' });
    makeTree(repos.localfile, { 'CLAUDE.local.md': 'CANARY-CLAUDELOCAL-LOCALFILE\n' });
    makeTree(repos.excluded, { 'CLAUDE.md': 'CANARY-CLAUDE-EXCLUDED\n', '.claude/settings.local.json': JSON.stringify({ claudeMdExcludes: [fwd(join(repos.excluded, 'CLAUDE.md'))] }) });
    await ask('repo-CLAUDE.md-excluded', repos.excluded);
    await ask('agents-only', repos.plain);
    await ask('repo-CLAUDE.md', repos.teamfile);
    await ask('repo-CLAUDE.local.md', repos.localfile);
    // A CLAUDE.md in the parent folder, with AGENTS.md in the repo below it.
    const other = join(root, 'other');
    const o = makeCompany(other, { projects: ['below'], teamAgentsMd: { below: 'CANARY-AGENTS-BELOW\n' } });
    makeTree(o.company, { 'CLAUDE.md': 'CANARY-PARENTCLAUDE-ABOVE\n' });
    await ask('parent-CLAUDE.md', o.repos.below);
    note(t, 'agents-md-loading', seen);
    assert.deepEqual(Object.keys(seen).sort(), ['agents-only', 'parent-CLAUDE.md', 'repo-CLAUDE.local.md', 'repo-CLAUDE.md', 'repo-CLAUDE.md-excluded']);
  });
});

liveTest('a pointer line telling the agent to read AGENTS.md gets it read', async (t) => {
  await withRoot(async (root) => {
    const { repos } = makeCompany(root, { projects: ['api'], teamClaudeMd: { api: 'Team notes.\n' }, teamAgentsMd: { api: 'The build code word is CANARY-POINTER-SIX.\n' } });
    makeTree(repos.api, { 'CLAUDE.local.md': 'Also read ./AGENTS.md in this folder before you start; it holds the build notes.\n' });
    const r = await runClaude({ prompt: 'What is the build code word for this repo? Answer with the CANARY string.', cwd: repos.api, allowedTools: ['Read'], model: 'sonnet', withPlugin: false });
    note(t, 'pointer-line', { reads: r.reads, text: r.text.slice(0, 200) });
    assert.ok(r.reads.some((p) => p.endsWith('/api/AGENTS.md')), 'AGENTS.md was read');
    assert.ok(r.text.includes('CANARY-POINTER-SIX'));
  });
});

liveTest('runClaude reads catches a real read', async () => {
  await withRoot(async (root) => {
    makeTree(root, { 'notes.txt': 'The first word is pelican.\n' });
    const file = fwd(join(root, 'notes.txt'));
    const r = await runClaude({ prompt: `Read the file ${file} with the Read tool and tell me its last word.`, cwd: root, allowedTools: ['Read'], model: 'sonnet', withPlugin: false });
    assert.ok(r.reads.some((p) => p.toLowerCase() === file.toLowerCase()), `reads should include ${file}, got ${JSON.stringify(r.reads)}`);
  });
});

liveTest('total live spend is within the ceiling', async (t) => {
  const l = defaultLedger();
  note(t, 'live-spend-usd', l.total());
  l.assertRoom();
});
