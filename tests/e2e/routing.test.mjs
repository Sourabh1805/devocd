// @ts-check
// Live routing measurement against the real Claude Code. Skipped unless DEVOCD_LIVE=1. Never run in CI.
// One company, five projects, five read-only tasks, each run from the company folder and from the project's own
// folder, with DevOCD's files and again without (a baseline that is recorded, never asserted). One more run starts
// in a project, with no additionalDirectories, and must apply a parent key rule while reading the standards is denied.
// Observations go to a JSONL file for docs/release-readiness.md. The runs use no plugin: the files are on disk
// already, which is what the measurement is about, and it keeps each run cheap.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { liveEnabled, runClaude } from '../helpers/claude.mjs';
import { makeCompany } from '../helpers/makeCompany.mjs';
import { tmp } from '../helpers/git.mjs';
import { accessed, norm, unrelatedTouched } from '../helpers/routing.mjs';
import { makeTree } from '../helpers/tree.mjs';

/** @typedef {Awaited<ReturnType<typeof runClaude>>} Run */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const cli = join(repoRoot, 'plugin', 'scripts', 'devocd.mjs');
const SKIP = liveEnabled() ? false : 'set DEVOCD_LIVE=1 to run';
const obsFile = join(tmpdir(), `devocd-routing-observations-${process.ppid}.jsonl`);
const READ_ONLY = ['--allowedTools', 'Read,Glob,Grep'];
const EDITING = ['--allowedTools', 'Edit,Write']; // no bare Read: it would allow reading anywhere, the standards included
const FEE_TASK_PLAIN = 'In src/invoices.js, add a lateFee field to the invoice that buildInvoice returns: a flat late fee of two dollars fifty. Make the edit.';
// The standards file is named so every run attempts the read a project session denies: the case is about what
// happens after that denial, and when the prompt only said "follow the company's coding standards", 2 of 3 runs
// in the Task 10 full run never tried the read (each still used integer cents).
const FEE_TASK = `First read the company's coding standard at ../.devocd/standards/coding.md and follow it. ${FEE_TASK_PLAIN}`;

const KEY_RULES = [
  'Money is stored as integer cents, never as floats or decimal strings.',
  'Every database query passes its values as parameters.',
  'Never log personal data.',
];

/** Each project: its code, a function the task asks about, and the question. A question never names the answer. */
const PROJECTS = {
  billing: {
    description: 'Invoices, payments and refunds.',
    part: ['refunds', 'src/refunds.js', 'refund and invoice logic'],
    files: {
      'src/refunds.js': "// CANARY-billing\nimport { findPayment, savePayment } from './ledger.js';\n\nexport function issueRefund(paymentId, amount, reason) {\n  const payment = findPayment(paymentId);\n  if (!payment || amount > payment.captured - payment.refunded) throw new Error('refund exceeds payment');\n  payment.refunded += amount;\n  payment.history.push({ type: 'refund', amount, reason });\n  return savePayment(payment);\n}\n",
      'src/invoices.js': "export function lineTotal(quantity, rate) {\n  return quantity * rate;\n}\n\nexport function buildInvoice(customerId, lines) {\n  const total = lines.reduce((sum, l) => sum + lineTotal(l.quantity, l.rate), 0);\n  return { customerId, lines, total, status: 'open' };\n}\n",
      'src/ledger.js': "const payments = new Map();\nexport const findPayment = (id) => payments.get(id);\nexport const savePayment = (p) => { payments.set(p.id, p); return p; };\n",
    },
    task: 'Where is the refund logic implemented? Give the file and the function name.',
    answer: [/refunds\.js/i, /issueRefund/],
  },
  auth: {
    description: 'Sign-in, passwords and sessions.',
    part: ['passwords', 'src/passwords.js', 'password hashing and checking'],
    files: {
      'src/passwords.js': "// CANARY-auth\nimport { scryptSync, timingSafeEqual, randomBytes } from 'node:crypto';\n\nexport function hashPassword(password) {\n  const salt = randomBytes(16);\n  return salt.toString('hex') + ':' + scryptSync(password, salt, 32).toString('hex');\n}\n\nexport function verifyPassword(password, stored) {\n  const [salt, hash] = stored.split(':');\n  const given = scryptSync(password, Buffer.from(salt, 'hex'), 32);\n  return timingSafeEqual(given, Buffer.from(hash, 'hex'));\n}\n",
      'src/sessions.js': "import { randomBytes } from 'node:crypto';\nconst sessions = new Map();\nexport function createSession(userId) {\n  const token = randomBytes(24).toString('base64url');\n  sessions.set(token, { userId, createdAt: Date.now() });\n  return token;\n}\n",
      'src/login.js': "import { verifyPassword } from './passwords.js';\nimport { createSession } from './sessions.js';\nexport function login(user, password) {\n  return verifyPassword(password, user.passwordHash) ? createSession(user.id) : null;\n}\n",
    },
    task: 'Which function checks whether a typed password is correct, and in which file?',
    answer: [/passwords\.js/i, /verifyPassword/],
  },
  catalog: {
    description: 'Products, categories and search.',
    part: ['search', 'src/search.js', 'search ranking'],
    files: {
      'src/search.js': "// CANARY-catalog\nexport function rankResults(products, query) {\n  const q = query.toLowerCase();\n  return products\n    .map((p) => ({ p, score: (p.name.toLowerCase().includes(q) ? 3 : 0) + (p.tags.includes(q) ? 1 : 0) }))\n    .filter((r) => r.score > 0)\n    .sort((a, b) => b.score - a.score)\n    .map((r) => r.p);\n}\n",
      'src/products.js': 'export const makeProduct = (name, tags = []) => ({ name, tags, active: true });\n',
      'src/categories.js': "export const CATEGORIES = ['tools', 'garden', 'kitchen'];\n",
    },
    task: 'Which function orders search matches by relevance, and in which file?',
    answer: [/search\.js/i, /rankResults/],
  },
  notifications: {
    description: 'Email and text messages to customers.',
    part: ['messages', 'src/sms.js', 'sending email and text messages'],
    files: {
      'src/sms.js': "// CANARY-notifications\nexport async function sendSms(phone, body) {\n  const res = await fetch(process.env.SMS_GATEWAY_URL, { method: 'POST', body: JSON.stringify({ to: phone, text: body }) });\n  return res.ok;\n}\n",
      'src/email.js': 'export async function sendEmail(address, subject, html) {\n  return { queued: true, address, subject, size: html.length };\n}\n',
      'src/templates.js': 'export const welcome = (name) => `Welcome, ${name}!`;\n',
    },
    task: 'Which function sends a text message to a phone number, and in which file?',
    answer: [/sms\.js/i, /sendSms/],
  },
  reports: {
    description: 'Scheduled sales reports and CSV exports.',
    part: ['export', 'src/csv.js', 'CSV export'],
    files: {
      'src/csv.js': "// CANARY-reports\nexport function exportCsv(rows, columns) {\n  const head = columns.join(',');\n  const body = rows.map((r) => columns.map((c) => JSON.stringify(r[c] ?? '')).join(','));\n  return [head, ...body].join('\\n');\n}\n",
      'src/aggregate.js': 'export const sumBy = (rows, key) => rows.reduce((n, r) => n + r[key], 0);\n',
      'src/schedule.js': "export const WEEKLY = { day: 'monday', hour: 6 };\n",
    },
    task: 'Which function writes report rows out as CSV, and in which file?',
    answer: [/csv\.js/i, /exportCsv/],
  },
};
const IDS = /** @type {(keyof typeof PROJECTS)[]} */ (Object.keys(PROJECTS));

const helper = (/** @type {string[]} */ args) => {
  const r = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
  assert.equal(r.status, 0, `devocd ${args.join(' ')}: ${r.stdout} ${r.stderr}`);
  return r.stdout;
};

/** One company of five projects. With devocd: standards, the parent file, and each project's .devocd and pointer, written by the helper commands from small templates. */
function buildCompany(/** @type {boolean} */ devocd) {
  const root = realpathSync.native(tmp('devocd-routing-'));
  const { company } = makeCompany(root, { projects: IDS });
  for (const id of IDS) makeTree(join(company, id), PROJECTS[id].files);
  if (!devocd) return { root, company };

  makeTree(company, {
    '.devocd/standards/coding.md': `# Coding standard\n\nCANARY-standards\n\n- ${KEY_RULES[0]} Convert at the edge only.\n- ${KEY_RULES[1]}\n`,
    '.devocd/company.draft.json': JSON.stringify({
      version: 1, kind: 'company', name: 'Acme Example Co', description: 'A made-up company with five services.',
      parentFile: 'CLAUDE.md', keyRules: KEY_RULES, projects: [], sources: [],
    }),
  });
  helper(['render-parent', company, join(company, '.devocd', 'company.draft.json')]);
  for (const id of IDS) {
    const p = join(company, id);
    const [part, file, what] = PROJECTS[id].part;
    const d = PROJECTS[id].description;
    helper(['protect', p]);
    makeTree(p, {
      '.devocd/PROJECT.md': `# ${id}\n\n${d}\n\n<!-- CANARY-${id} -->\n\n## Stack\n- JavaScript on Node, ES modules, no dependencies\n\n## Commands\n- \`npm test\`: unit tests\n\n## Parts of the code\n- [${part}](code/${part}.md): \`${file}\`, ${what}\n\n## Links\n- Company standards: \`../.devocd/standards/\` (reading them from here may need permission)\n`,
      [`.devocd/code/${part}.md`]: `# ${part}\n\n${what}.\n\n- Main file: \`${file}\`\n`,
      '.devocd/pointer.md': `# ${id}: ${d}\n\n- Start with \`.devocd/PROJECT.md\`: what this project is, its commands, and which file to open for each part of the code.\n- Company rules: the company folder's parent file loads at launch when this repo sits in that folder. It is optional: if this repo is used alone, carry on without it.\n`,
      '.devocd/state.json': JSON.stringify({ version: 1, kind: 'project', id, companyRel: '..', teamFiles: [], approvedCommands: ['npm test'], sources: [] }, null, 2) + '\n',
    });
    helper(['write-block', join(p, 'CLAUDE.local.md'), join(p, '.devocd', 'pointer.md')]);
    helper(['register', company, id, id, d]);
  }
  return { root, company };
}

/** Every tool_use of a name, with whether its result was an error and the result's text. */
function toolCalls(/** @type {Run} */ r, /** @type {string} */ name) {
  /** @type {Map<string, { failed: boolean, text: string }>} */ const results = new Map();
  for (const e of r.events) {
    if (e.type !== 'user' || !Array.isArray(e.message?.content)) continue;
    for (const b of e.message.content) {
      if (b.type !== 'tool_result') continue;
      const text = typeof b.content === 'string' ? b.content : (b.content ?? []).map((/** @type {any} */ c) => c.text ?? '').join('\n');
      results.set(b.tool_use_id, { failed: !!b.is_error, text });
    }
  }
  return r.events.filter((e) => e.type === 'assistant').flatMap((e) => e.message?.content ?? [])
    .filter((/** @type {any} */ b) => b.type === 'tool_use' && b.name === name)
    .map((/** @type {any} */ b) => ({ input: b.input ?? {}, failed: results.get(b.id)?.failed === true, text: results.get(b.id)?.text ?? '' }));
}

/** Claude Code's words for a read outside the granted folders (observed): "Claude requested permissions to read from <path>, but you haven't granted it yet." */
const PERMISSION_DENIED = /requested permissions? to read|haven't granted/i;

const observe = (/** @type {Record<string, unknown>} */ o) => appendFileSync(obsFile, JSON.stringify(o) + '\n');
/** The code lines (comments cut off) of src/invoices.js that mention the fee or its amount, wherever the agent put the constant. */
const feeLines = (/** @type {string} */ cwd) => readFileSync(join(cwd, 'src', 'invoices.js'), 'utf8').split('\n')
  .map((l) => l.replace(/\/\/.*$/, ''))
  .filter((l) => /late|fee|\b250\b|2\.5/i.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

/** One read-only run of a project's task, observed. `problems` lists what a DevOCD run must not do or must do. */
async function routeRun(/** @type {string} */ company, /** @type {keyof typeof PROJECTS} */ id, /** @type {'company'|'project'} */ from, /** @type {boolean} */ devocd) {
  const cwd = from === 'company' ? company : join(company, id);
  const t = PROJECTS[id];
  const r = await runClaude({ prompt: t.task, cwd, withPlugin: false, maxTurns: 12, budgetUsd: 0.4, timeoutMs: 300_000, extraArgs: READ_ONLY });
  const a = accessed(r.events, cwd, company);
  const own = norm(join(company, id));
  const unrelated = unrelatedTouched(IDS, id, company, a);
  const readProjectMd = a.paths.includes(norm(join(company, id, '.devocd', 'PROJECT.md')));
  const readsInside = a.paths.filter((p) => p === own || p.startsWith(own + '/')).length;
  const sawOtherCanary = IDS.filter((x) => x !== id && r.toolResults.some((tr) => tr.text.includes(`CANARY-${x}`)));
  const right = t.answer.every((re) => re.test(r.text));
  const usage = r.events.find((e) => e.type === 'result')?.usage ?? {};
  /** @type {string[]} */ const problems = [];
  if (unrelated.length) problems.push(`touched ${unrelated.join(', ')}${a.broad ? ' (a search of the whole company folder)' : ''}`);
  if (sawOtherCanary.length) problems.push(`saw files of ${sawOtherCanary.join(', ')}`);
  if (!readProjectMd) problems.push('did not read its .devocd/PROJECT.md');
  if (readsInside < 1) problems.push('read nothing inside its project');
  if (!right) problems.push(`wrong answer: ${r.text.slice(0, 120)}`);
  const o = {
    kind: 'route', devocd, id, from,
    reads: [...a.paths, ...(a.broad ? ['<whole company folder>'] : [])].map((p) => p.replace(norm(company), '<company>')),
    unrelated, readProjectMd, readsInside, sawOtherCanary, right, problems,
    reportedInputTokens: (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0),
    reportedOutputTokens: usage.output_tokens ?? 0,
    costUsd: r.costUsd, answer: r.text.slice(0, 200),
  };
  observe(o);
  return o;
}

/** One key-rule run in a fresh billing project: the agent is told to read the company standard, which a project session can't read. */
async function keyRuleRun() {
  const env = buildCompany(true);
  try {
    const cwd = join(env.company, 'billing');
    const r = await runClaude({ prompt: FEE_TASK, cwd, withPlugin: false, maxTurns: 14, budgetUsd: 0.6, timeoutMs: 400_000, extraArgs: EDITING });
    const line = feeLines(cwd);
    const target = (/** @type {string} */ p) => norm(resolve(cwd, p));
    const std = (/** @type {string} */ p) => target(p).includes('/.devocd/standards');
    const exact = [norm(join(env.company, '.devocd', 'standards')), norm(join(env.company, '.devocd', 'standards', 'coding.md'))];
    const attempts = [
      ...toolCalls(r, 'Read').map((c) => ({ ...c, path: String(c.input.file_path ?? '') })),
      ...toolCalls(r, 'Glob').concat(toolCalls(r, 'Grep')).map((c) => ({ ...c, path: String(c.input.path ?? '') })),
    ].filter((c) => std(c.path));
    // A failed attempt counts as denied only when its error is the permission refusal, or it named the standards folder or
    // file exactly: those exist, so the error can't be a "not found" from a mistyped path.
    const denied = attempts.filter((c) => c.failed && (PERMISSION_DENIED.test(c.text) || exact.includes(target(c.path))));
    const denials = r.permissionDenials.filter((d) => norm(JSON.stringify(d.tool_input ?? {})).includes('/.devocd/standards'));
    const canary = r.toolResults.some((t) => t.text.includes('CANARY-standards'));
    /** @type {string[]} */ const problems = [];
    if (attempts.length === 0) problems.push('never tried to read the standards');
    if (attempts.some((c) => !c.failed)) problems.push('a standards read succeeded');
    if (attempts.length && denied.length === 0 && denials.length === 0) problems.push(`no standards read was refused for permission; errors: ${attempts.map((c) => c.text.slice(0, 80)).join(' | ')}`);
    if (canary) problems.push('standards text reached the agent');
    if (!/lateFee/.test(line)) problems.push('no lateFee added');
    if (!/\b250\b/.test(line)) problems.push(`not integer cents: ${line}`);
    if (/2\.5/.test(line)) problems.push(`decimal dollars: ${line}`);
    const o = { kind: 'keyrule', devocd: true, lateFeeLine: line, standardsAttempts: attempts.length, standardsAttemptsFailed: attempts.filter((c) => c.failed).length,
      standardsAttemptsDenied: denied.length, permissionDenials: denials.length, canarySeen: canary, problems, costUsd: r.costUsd };
    observe(o);
    return o;
  } finally { rmSync(env.root, { recursive: true, force: true, maxRetries: 3 }); }
}

describe('routing, live', { skip: SKIP }, () => {
  /** @type {{ root: string, company: string }} */ let withFiles;
  /** @type {{ root: string, company: string }} */ let without;
  before(() => {
    writeFileSync(obsFile, '');
    withFiles = buildCompany(true);
    without = buildCompany(false);
    for (const id of IDS) helper(['check', join(withFiles.company, id)]);
    helper(['check', withFiles.company]);
  });
  after(() => {
    for (const f of [withFiles, without]) if (f) rmSync(f.root, { recursive: true, force: true, maxRetries: 3 });
    console.log(`routing observations: ${obsFile}`);
  });

  test('a real agent routes to its own project and reads no file from an unrelated one', { timeout: 3_600_000 }, async () => {
    /** @type {string[]} */ const failures = [];
    for (const id of IDS) for (const from of /** @type {const} */ (['company', 'project'])) {
      const o = await routeRun(withFiles.company, id, from, true);
      if (o.problems.length) failures.push(`${id} from ${from}: ${o.problems.join('; ')}`);
    }
    assert.deepEqual(failures, []);
  });

  test('with key rules inline, a project session still applies them when its read of the standards is denied (2 of 3 runs)', { timeout: 1_800_000 }, async () => {
    /** @type {string[]} */ const failures = [];
    let passed = 0;
    for (let i = 1; i <= 3; i++) {
      const o = await keyRuleRun();
      if (o.problems.length === 0) passed++;
      else failures.push(`run ${i}: ${o.problems.join('; ')}`);
    }
    assert.ok(passed >= 2, `${passed} of 3 passed: ${failures.join(' | ')}`);
  });

  test('baseline without DevOCD files: recorded, never failed', { timeout: 3_600_000 }, async () => {
    for (const id of IDS) for (const from of /** @type {const} */ (['company', 'project'])) {
      try { await routeRun(without.company, id, from, false); } catch (e) {
        observe({ kind: 'route', devocd: false, id, from, error: String(/** @type {Error} */ (e).message).slice(0, 300) });
      }
    }
    const env = buildCompany(false);
    try {
      const cwd = join(env.company, 'billing');
      const r = await runClaude({ prompt: FEE_TASK_PLAIN, cwd, withPlugin: false, maxTurns: 14, budgetUsd: 0.6, timeoutMs: 400_000, extraArgs: EDITING });
      observe({ kind: 'keyrule', devocd: false, lateFeeLine: feeLines(cwd), costUsd: r.costUsd });
    } catch (e) {
      observe({ kind: 'keyrule', devocd: false, error: String(/** @type {Error} */ (e).message).slice(0, 300) });
    } finally { rmSync(env.root, { recursive: true, force: true, maxRetries: 3 }); }
  });
});
