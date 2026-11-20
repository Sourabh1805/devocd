import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { stateProblem } from './check.mjs';
import { assertSafeTarget, lstatOrNull } from './fsutil.mjs';

/** @typedef {{root: string, state: any}} ScopeInfo */

function readState(/** @type {string} */ root) {
  const path = join(root, '.devocd', 'state.json');
  assertSafeTarget(path);
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.size > 64 * 1024) throw new Error('Invalid state file');
  const state = JSON.parse(readFileSync(path, 'utf8'));
  // companyRel is needed only for inheritance, never for a local override.
  const schemaState = state?.kind === 'project' ? { ...state, companyRel: '' } : state;
  // stateProblem covers devocdHooks; decisionCapture is checked only here.
  if (state?.decisionCapture !== undefined && typeof state.decisionCapture !== 'boolean') throw new Error('Invalid preference');
  if (stateProblem(schemaState)) throw new Error('Invalid state');
  return state;
}

/**
 * Nearest `.devocd` scope for a host cwd. Resolves aliases once, stops at the first knowledge
 * boundary (even if its state is bad) and at a `.git` boundary without one. Never writes.
 * @param {unknown} cwd
 * @returns {{root: string, state: any, company: ScopeInfo|null}|null}
 */
export function findScope(cwd) {
  if (typeof cwd !== 'string' || !isAbsolute(cwd)) return null;
  let root;
  try {
    root = realpathSync(cwd);
    if (!lstatSync(root).isDirectory()) return null;
  } catch { return null; }
  try {
    for (let depth = 0; depth < 64; depth++) {
      if (lstatOrNull(join(root, '.devocd'))) {
        const state = readState(root);
        /** @type {ScopeInfo|null} */
        let company = null;
        if (state.kind === 'project') {
          try {
            if (typeof state.companyRel === 'string' && state.companyRel && !isAbsolute(state.companyRel)) {
              const companyRoot = resolve(root, state.companyRel);
              const rel = relative(companyRoot, root);
              if (rel && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel)) {
                const parent = readState(companyRoot);
                const matches = parent.kind === 'company' ? parent.projects.filter((/** @type {any} */ p) => p.id === state.id) : [];
                if (matches.length === 1 && !isAbsolute(matches[0].path) &&
                    relative(root, resolve(companyRoot, matches[0].path)) === '') company = { root: companyRoot, state: parent };
              }
            }
          } catch { company = null; }
        }
        return { root, state, company };
      }
      if (lstatOrNull(join(root, '.git'))) return null;
      const parent = dirname(root);
      if (parent === root) break;
      root = parent;
    }
  } catch { return null; }
  return null;
}

/**
 * Project value if boolean, else the registered company's value if boolean, else the default.
 * @param {{state: any, company: ScopeInfo|null}} scope @param {string} key @param {boolean} defaultValue
 */
export function preference(scope, key, defaultValue) {
  if (typeof scope.state?.[key] === 'boolean') return scope.state[key];
  if (typeof scope.company?.state?.[key] === 'boolean') return scope.company.state[key];
  return defaultValue;
}
