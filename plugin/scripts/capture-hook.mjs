// Task checkpoint only: no writes, transcript access, shell or model calls.
import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertSafeTarget } from './lib/fsutil.mjs';

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
  // Find the nearest installed scope, including sessions started in a subfolder.
  for (let depth = 0; depth < 64; depth++) {
    const statePath = join(root, '.devocd', 'state.json');
    try {
      const stat = lstatSync(statePath);
      assertSafeTarget(statePath);
      if (!stat.isFile() || stat.size > 64 * 1024) return null;
      const state = JSON.parse(readFileSync(statePath, 'utf8'));
      if (!['company', 'project'].includes(state?.kind) || state.decisionCapture === false) return null;
      return { hookSpecificOutput: { hookEventName: 'Stop', additionalContext:
        'DevOCD task checkpoint: if this task established an approved architectural decision or verified missing/stale README information, invoke devocd:capture for the owning scope. Supply only relevant task context and evidence to its read-only decision-keeper. Skip if already handled, declined, awaiting approval, or nothing durable changed. Do not rescan projects. Documentation writes require explicit approval of the exact patch; preserve history. Never infer approval from this reminder.' } };
    } catch (error) {
      if (error.code !== 'ENOENT') return null;
    }
    const parent = dirname(root);
    if (parent === root) break;
    root = parent;
  }
  return null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
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
