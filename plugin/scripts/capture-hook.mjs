// Optional end-of-response reminder only: no writes, transcript access, shell or model calls.
import { existsSync, readFileSync, lstatSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { stateProblem } from './lib/check.mjs';
import { assertSafeTarget, lstatOrNull } from './lib/fsutil.mjs';

function readState(root) {
  const path = join(root, '.devocd', 'state.json');
  assertSafeTarget(path);
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.size > 64 * 1024) throw new Error('Invalid state file');
  const state = JSON.parse(readFileSync(path, 'utf8'));
  if (stateProblem(state)) throw new Error('Invalid state');
  return state;
}

export function captureCheckpoint(input) {
  if (input?.hook_event_name !== 'Stop' || input.stop_hook_active !== false ||
      typeof input.cwd !== 'string' || !isAbsolute(input.cwd)) return null;
  // Resolve host cwd aliases (macOS /var -> /private/var) once. Knowledge paths
  // below the canonical scope still reject links; the hook never writes.
  let root;
  try {
    root = realpathSync(input.cwd);
    if (!lstatSync(root).isDirectory()) return null;
  } catch { return null; }
  // Stop at the first knowledge boundary, even if its state is missing/bad.
  // A repository boundary without installation must not inherit an unrelated company.
  try {
    for (let depth = 0; depth < 64; depth++) {
      if (lstatOrNull(join(root, '.devocd'))) {
        const state = readState(root);
        let enabled = state.decisionCapture;
        if (state.kind === 'project') {
          if (!state.companyRel || isAbsolute(state.companyRel)) return null;
          const company = resolve(root, state.companyRel);
          const rel = relative(company, root);
          if (!rel || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) return null;
          // Reject aliases in the registered relationship, not canonical host cwd.
          for (let dir = root; relative(company, dir) !== ''; dir = dirname(dir)) {
            if (lstatSync(dir).isSymbolicLink()) return null;
          }
          const parent = readState(company);
          if (parent.kind !== 'company') return null;
          const matches = parent.projects.filter(p => p.id === state.id || relative(root, resolve(company, p.path)) === '');
          if (matches.length !== 1 || matches[0].id !== state.id ||
              isAbsolute(matches[0].path) || relative(root, resolve(company, matches[0].path)) !== '') return null;
          if (enabled === undefined) enabled = parent.decisionCapture;
        }
        if (enabled !== true) return null;
        return { hookSpecificOutput: { hookEventName: 'Stop', additionalContext:
          'DevOCD end-of-response reminder (not proof of task completion): if this task established an approved architectural decision or verified missing/stale README information, invoke devocd:capture for the owning scope. Supply only relevant task context and evidence to its read-only decision-keeper. Skip if already handled, declined, awaiting approval, or nothing durable changed. Do not rescan projects. Documentation writes require explicit approval of the exact patch; preserve history. Never infer approval from this reminder.' } };
      }
      if (lstatOrNull(join(root, '.git'))) return null;
      const parent = dirname(root);
      if (parent === root) break;
      root = parent;
    }
  } catch { return null; }
  return null;
}

if (process.argv[1] && existsSync(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    process.stdin.setEncoding('utf8');
    let data = '';
    for await (const chunk of process.stdin) {
      data += chunk;
      if (Buffer.byteLength(data) > 256 * 1024) process.exit(0);
    }
    const result = captureCheckpoint(JSON.parse(data));
    if (result) process.stdout.write(JSON.stringify(result));
  } catch { /* Optional reminder: malformed input must not interrupt work. */ }
}
