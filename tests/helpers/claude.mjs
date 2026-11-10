// @ts-check
// Live-test helper: runs the real `claude` CLI and parses its stream-json output.
// Live tests are gated by DEVOCD_LIVE=1 (see liveEnabled) and must never run in CI.
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

/**
 * Find how to start claude without a shell. On Windows the npm shim is claude.cmd, which Node 22 will not
 * spawn directly; the shim just calls a native claude.exe, so read its path out of the shim. Falls back to a
 * shell with explicit quoting when no .exe can be found.
 * @returns {{ file: string, shell: boolean }}
 */
export function resolveClaude() {
  if (process.platform !== 'win32') return { file: 'claude', shell: false };
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (!dir) continue;
    if (existsSync(join(dir, 'claude.exe'))) return { file: join(dir, 'claude.exe'), shell: false };
    const cmd = join(dir, 'claude.cmd');
    if (!existsSync(cmd)) continue;
    const m = /"%dp0%[\\/]+([^"]+?\.exe)"/i.exec(readFileSync(cmd, 'utf8'));
    if (m && existsSync(join(dir, m[1]))) return { file: join(dir, m[1]), shell: false };
    return { file: cmd, shell: true };
  }
  return { file: 'claude', shell: true };
}


/** @param {string} p */
const posix = (p) => p.split(String.fromCharCode(92)).join('/');

export const liveEnabled = () => process.env.DEVOCD_LIVE === '1' && !process.env.CI;

/** The spend ceiling in USD: DEVOCD_LIVE_CAP_USD, default 10. */
export function liveCap(/** @type {Record<string, string | undefined>} */ env = process.env) {
  const n = Number(env.DEVOCD_LIVE_CAP_USD);
  return Number.isFinite(n) && n > 0 ? n : 10;
}

/**
 * A spend ledger kept in a file so separate test processes share it. Each add is one appended line.
 * @param {string} file @param {number} capUsd
 */
export function createLedger(file, capUsd) {
  const total = () => {
    if (!existsSync(file)) return 0;
    // A line that does not parse as a non-negative number counts as the full cap, so corruption stops the suite.
    return readFileSync(file, 'utf8').split('\n').reduce((n, l) => {
      if (!l.trim()) return n;
      const v = Number(l);
      return n + (Number.isFinite(v) && v >= 0 ? v : capUsd);
    }, 0);
  };
  return {
    total,
    remaining: () => Math.max(0, capUsd - total()),
    add(/** @type {number} */ usd) { appendFileSync(file, `${usd}\n`); },
    assertRoom() {
      const t = total();
      if (t >= capUsd) throw new Error(`live cost ceiling reached: $${t.toFixed(4)} of $${capUsd}. Stop and report; do not raise it.`);
    },
  };
}

/** One ledger per `node --test` run: keyed by the runner's pid, which every test file's process shares. */
export function defaultLedger() {
  return createLedger(join(tmpdir(), `devocd-live-cost-${process.ppid}.txt`), liveCap());
}

/** Charge a finished run to the ledger. A timeout, or a run with no reported cost, is charged the whole per-run budget. */
export function chargeRun(/** @type {{ add(usd: number): void }} */ ledger, /** @type {{ costUsd: number, timedOut: boolean, budgetUsd: number }} */ o) {
  ledger.add(!o.timedOut && o.costUsd > 0 ? o.costUsd : o.budgetUsd);
}

/** Throw a clear error when a run failed, so a live test can never pass on a failed or empty run. */
export function assertRunOk(/** @type {{ exitCode: number|null, events: any[], stderr?: string }} */ r) {
  const tail = (r.stderr ?? '').trim().slice(-500);
  if (r.exitCode !== 0) throw new Error(`claude exited with exit code ${r.exitCode}. stderr: ${tail}`);
  if (r.events.length === 0) throw new Error(`claude produced no events. stderr: ${tail}`);
  const result = r.events.find((e) => e.type === 'result');
  if (!result) throw new Error(`claude produced no result event. stderr: ${tail}`);
  if (result.is_error) throw new Error(`claude result has is_error set (${result.subtype ?? 'unknown'}): ${String(result.result ?? '').slice(0, 300)}`);
}

/** Normalise for matching: forward slashes, and lower case on Windows (paths are case-insensitive there). */
const norm = (/** @type {string} */ x) => (process.platform === 'win32' ? posix(x).toLowerCase() : posix(x));

/**
 * Did the run touch something? Searches reads, Bash commands and tool-result text.
 * @param {{ reads: string[], bashCommands: string[], toolResults: { text: string }[] }} r
 * @param {string} substring
 */
export function touches(r, substring) {
  const needle = norm(substring);
  return [...r.reads, ...r.bashCommands, ...r.toolResults.map((x) => x.text)].some((h) => norm(h).includes(needle));
}

/**
 * Parse `--output-format stream-json` output. Tool calls inside subagents (events with parent_tool_use_id) count too.
 * @param {string} stdout
 * @param {string} [cwd] the run's folder: a Grep or Glob with no path searches here
 */
export function parseStream(stdout, cwd = '.') {
  /** @type {any[]} */ const events = [];
  /** @type {string[]} */ const reads = [];
  /** @type {string[]} */ const writes = [];
  /** @type {string[]} */ const bashCommands = [];
  const assistantText = [];
  /** @type {{ isError: boolean, text: string }[]} */ const toolResults = [];
  /** @type {any[]} */ let permissionDenials = [];
  let result = null;
  let costUsd = 0;
  for (const l of stdout.split('\n')) {
    if (!l.trim()) continue;
    let ev;
    try { ev = JSON.parse(l); } catch { continue; }
    events.push(ev);
    if (ev.type === 'result') {
      result = typeof ev.result === 'string' ? ev.result : result;
      if (typeof ev.total_cost_usd === 'number') costUsd = ev.total_cost_usd;
      if (Array.isArray(ev.permission_denials)) permissionDenials = ev.permission_denials;
    }
    if (ev.type === 'user' && Array.isArray(ev.message?.content)) {
      for (const b of ev.message.content) {
        if (b.type !== 'tool_result') continue;
        const text = typeof b.content === 'string' ? b.content : (b.content ?? []).map((/** @type {any} */ c) => c.text ?? '').join('\n');
        toolResults.push({ isError: !!b.is_error, text });
      }
    }
    if (ev.type !== 'assistant' || !Array.isArray(ev.message?.content)) continue;
    for (const b of ev.message.content) {
      if (b.type === 'text') assistantText.push(b.text);
      if (b.type !== 'tool_use') continue;
      const inp = b.input ?? {};
      if (b.name === 'Read' && typeof inp.file_path === 'string') reads.push(posix(inp.file_path));
      else if (b.name === 'Grep' || b.name === 'Glob') reads.push(posix(typeof inp.path === 'string' ? inp.path : cwd));
      else if ((b.name === 'Write' || b.name === 'Edit' || b.name === 'NotebookEdit') && typeof inp.file_path === 'string') writes.push(posix(inp.file_path));
      else if ((b.name === 'Bash' || b.name === 'PowerShell') && typeof inp.command === 'string') bashCommands.push(inp.command);
    }
  }
  return { events, text: result ?? assistantText.join('\n'), reads, writes, bashCommands, costUsd, toolResults, permissionDenials };
}

/**
 * Run the real Claude Code once, non-interactively.
 * Isolation: --setting-sources project,local drops the owner's user settings (their installed plugins and
 * hooks) but keeps login and the project/local settings (claudeMdExcludes lives in settings.local.json).
 * @param {{ prompt: string, cwd: string, allowedTools?: string[], withPlugin?: boolean, pluginDir?: string,
 *   addDirs?: string[], maxTurns?: number, model?: string, env?: Record<string, string | undefined>,
 *   timeoutMs?: number, extraArgs?: string[], budgetUsd?: number }} o
 * @returns {Promise<{ exitCode: number|null, text: string, events: any[], reads: string[], writes: string[], bashCommands: string[], costUsd: number, toolResults: { isError: boolean, text: string }[], permissionDenials: any[], stderr: string }>}
 */
export async function runClaude(o) {
  const ledger = defaultLedger();
  ledger.assertRoom();
  const withPlugin = o.withPlugin ?? true;
  const budgetUsd = Math.min(o.budgetUsd ?? 1, ledger.remaining());
  const args = ['-p', '--output-format', 'stream-json', '--verbose',
    '--setting-sources', 'project,local', '--strict-mcp-config', '--no-session-persistence',
    '--max-budget-usd', budgetUsd.toFixed(4),
    '--model', o.model ?? 'sonnet',
    '--max-turns', String(o.maxTurns ?? 6)];
  if (o.allowedTools) args.push('--tools', o.allowedTools.length ? o.allowedTools.map((t) => t.replace(/\(.*$/, '')).join(',') : '');
  if (o.allowedTools?.length) args.push('--allowedTools', o.allowedTools.join(','));
  if (withPlugin && o.pluginDir) args.push('--plugin-dir', o.pluginDir);
  for (const d of o.addDirs ?? []) args.push('--add-dir', d);
  args.push(...(o.extraArgs ?? []));

  const env = { ...process.env, ...o.env };
  // Nested runs: if a parent Claude Code session is detected in the environment, claude -p might refuse to
  // start. It did not on 2.1.319 (observed), so nothing is removed; see docs/research/claude-code.md.
  // The prompt goes through stdin, never argv. claude resolves to a .cmd on Windows, which Node cannot spawn
  // without a shell, and shell quoting would alter the prompt.
  const { file, shell } = resolveClaude();
  const argv = shell ? args.map((a) => (a === '' || /[\s&|<>^"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)) : args;
  const child = spawn(file, argv, { cwd: o.cwd, env, shell, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', (d) => { stdout += d; });
  child.stderr.setEncoding('utf8').on('data', (d) => { stderr += d; });
  child.stdin.end(o.prompt);
  const timeoutMs = o.timeoutMs ?? 240_000;
  let timedOut = false;
  let exitCode = null;
  try {
    exitCode = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        timedOut = true;
        if (process.platform === 'win32' && child.pid) spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
        else child.kill('SIGKILL');
        reject(new Error(`claude run timed out after ${timeoutMs} ms`));
      }, timeoutMs);
      child.on('error', (e) => { clearTimeout(timer); reject(e); });
      child.on('close', (code) => { clearTimeout(timer); resolve(code); });
    });
  } finally {
    // Always record spend, including after a timeout or a failure to start.
    chargeRun(ledger, { costUsd: parseStream(stdout, o.cwd).costUsd, timedOut: timedOut || stdout === '', budgetUsd });
  }
  const parsed = parseStream(stdout, o.cwd);
  assertRunOk({ exitCode, events: parsed.events, stderr });
  ledger.assertRoom();
  return { exitCode: /** @type {number|null} */ (exitCode), ...parsed, stderr };
}
