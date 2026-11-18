// Optional end-of-response reminder only: no writes, transcript access, shell or model calls.
import { existsSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { findScope, preference } from './lib/scope.mjs';

export function captureCheckpoint(input) {
  if (input?.hook_event_name !== 'Stop' || input.stop_hook_active !== false) return null;
  const scope = findScope(input.cwd);
  if (!scope || preference(scope, 'decisionCapture', false) !== true) return null;
  return { hookSpecificOutput: { hookEventName: 'Stop', additionalContext:
    'DevOCD end-of-response reminder (not proof of task completion): if this task established an approved architectural decision or verified missing/stale README information, invoke devocd:capture for the owning scope. Supply only relevant task context and evidence to its read-only decision-keeper. Skip if already handled, declined, awaiting approval, or nothing durable changed. Do not rescan projects. Documentation writes require explicit approval of the exact patch; preserve history. Never infer approval from this reminder.' } };
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
