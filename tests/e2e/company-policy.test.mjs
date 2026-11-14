// @ts-check
// Live check of /devocd:company-policy against the real Claude Code. Skipped unless DEVOCD_LIVE=1. Never in CI.
// company-policy has no answers-file interface and approval is never fabricated, so a non-interactive run can
// only be asserted up to its gate: it reads the supplied policy, drafts the topic file, the index routing and
// the project routing changes, and writes nothing without approval. The approved write path stays manual.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { liveEnabled, runClaude } from '../helpers/claude.mjs';
import { makeCompany } from '../helpers/makeCompany.mjs';
import { tmp } from '../helpers/git.mjs';
import { makeTree } from '../helpers/tree.mjs';
import { toPosix, walkFiles } from '../../plugin/scripts/lib/fsutil.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pluginDir = join(repoRoot, 'plugin');
const cli = join(pluginDir, 'scripts', 'devocd.mjs');
const SKIP = liveEnabled() ? false : 'set DEVOCD_LIVE=1 to run';

const POLICY = `# PR description style (FAKE FIXTURE)

Every pull request description must name the change, the risk and the test run.
Acceptance criteria go in a checklist. Never merge with an empty description.
`;

/** @param {string} dir */
function snapshot(dir) {
  /** @type {Record<string, string>} */ const out = {};
  for (const f of walkFiles(dir, (_abs, name) => name === '.git')) out[toPosix(relative(dir, f))] = readFileSync(f).toString('hex');
  return out;
}

const run = (/** @type {string[]} */ args) => {
  const r = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
};

test('company-policy drafts the topic, routing and project changes, and writes nothing without approval', { skip: SKIP, timeout: 900_000 }, async () => {
  const root = tmp('devocd-policy-');
  try {
    const { company } = makeCompany(root, { projects: ['api'] });
    makeTree(company, {
      'setup/pr-style.md': POLICY,
      '.devocd/state.draft.json': JSON.stringify({ version: 1, kind: 'company', name: 'Acme', description: 'Fixture co.', parentFile: 'CLAUDE.md', keyRules: [], sources: [] }),
      'api/.devocd/state.json': JSON.stringify({ version: 1, kind: 'project', id: 'api', companyRel: '..', teamFiles: [], approvedCommands: [], sources: [] }),
      'api/.devocd/PROJECT.md': '# api\n\nFixture project.\n\n## Links\n- [Company rules](../../CLAUDE.md)\n',
      'api/.devocd/pointer.md': '# api: fixture\n\n- Start with `.devocd/PROJECT.md`.\n',
    });
    run([cli, 'render-parent', company, '.devocd/state.draft.json']);
    run([cli, 'register', company, 'api', 'api', 'Fixture project']);
    run([cli, 'write-block', join(company, 'api', 'CLAUDE.local.md'), join(company, 'api', '.devocd', 'pointer.md')]);
    const before = snapshot(company);

    const r = await runClaude({
      prompt: '/devocd:company-policy pr style ./setup/pr-style.md',
      cwd: company, pluginDir, model: 'sonnet', maxTurns: 30, timeoutMs: 600_000,
      extraArgs: ['--allowedTools', 'Write,Edit,Bash'],
    });
    const said = r.events.filter((e) => e.type === 'assistant')
      .flatMap((e) => (e.message?.content ?? []).filter((/** @type {any} */ b) => b.type === 'text').map((/** @type {any} */ b) => b.text))
      .concat(r.text).join('\n');

    assert.match(said, /pull request|PR description/i, 'the policy content was read and drafted');
    assert.match(said, /pr-style/i, 'the topic slug is named');
    assert.match(said, /index/i, 'the standards index routing is shown');
    assert.match(said, /approv/i, 'it says approval is needed or was not given');
    assert.deepEqual(snapshot(company), before, 'nothing was written without approval');
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
