// @ts-check
// T79: deterministically decide how much worker a unit of work needs, before any dispatch.
// Risk overrides size: a one-file concurrency change is heavy, not light. No model calls here.
import { codedError } from './fsutil.mjs';

/** Execution classes, cheapest first. */
export const CLASSES = Object.freeze(/** @type {const} */ (['deterministic', 'light', 'standard', 'heavy']));
/** Model per class when a company's state.json carries no `models`; deterministic runs in Node. */
export const DEFAULT_MODELS = Object.freeze({ light: 'haiku', standard: 'sonnet', heavy: 'opus' });

/** The documented override list, checked before size and kind. Each flag means heavy however few files it touches. */
const RISK_FLAGS = Object.freeze(['concurrency', 'destructive', 'architecture', 'conflicting-evidence', 'ambiguous-boundary']);
/** Kinds Node answers alone: no interpretation, no model. */
const NODE_KINDS = Object.freeze(['inventory', 'hash', 'schema-check', 'render', 'pr-select']);

/** @typedef {'deterministic'|'light'|'standard'|'heavy'} TaskClass */
/** @typedef {{ kind?: string, files?: readonly string[], risk?: string, flags?: readonly string[] }} Unit */
/** @typedef {{ class: TaskClass, model: string|null, reasons: string[] }} Classification */

/** The model the class runs on: explicit override first, default second, null for Node work.
 * @param {string} cls @param {unknown} models @returns {string|null} */
function resolveModel(cls, models) {
  if (cls === 'deterministic') return null;
  const supplied = models !== null && typeof models === 'object' ? /** @type {Record<string, unknown>} */ (models)[cls] : undefined;
  if (typeof supplied === 'string' && supplied.trim()) return supplied.trim();
  return DEFAULT_MODELS[/** @type {keyof typeof DEFAULT_MODELS} */ (cls)];
}

/**
 * Assign a unit its class and the explicit model that class resolves to.
 * Throws INHERIT_HEAVY instead of returning `inherit` for heavy work: refusing is the contract.
 * @param {Unit} unit @param {unknown} [models] @returns {Classification}
 */
export function classify(unit, models = {}) {
  const flags = new Set(Array.isArray(unit?.flags) ? unit.flags : []);
  const risks = RISK_FLAGS.filter((flag) => flags.has(flag));
  const files = Array.isArray(unit?.files) ? unit.files.length : 0;
  const kind = typeof unit?.kind === 'string' ? unit.kind : '';
  /** @type {TaskClass} */
  let cls;
  /** @type {string[]} */
  let reasons;
  if (unit?.risk === 'high' || risks.length > 0) {
    cls = 'heavy';
    reasons = [
      ...(unit?.risk === 'high' ? ['risk is high: risk overrides size'] : []),
      ...risks.map((flag) => `risk flag ${flag}: risk overrides size`),
    ];
  } else if (NODE_KINDS.includes(kind)) {
    cls = 'deterministic';
    reasons = [`${kind} runs in Node`];
  } else if (kind === 'pr-claims') {
    // T45's fixture has not shown light is reliable for claim extraction yet.
    cls = 'standard';
    reasons = ['PR claim extraction stays standard until the T45 fixture shows light is reliable'];
  } else if (kind === 'transform' && files <= 1) {
    cls = 'light';
    reasons = ['one fully specified transform, no interpretation'];
  } else if (files > 1) {
    cls = 'standard';
    reasons = [`${files} files need synthesis or integration`];
  } else {
    cls = 'standard';
    reasons = ['unrecognised work defaults to standard'];
  }
  const model = resolveModel(cls, models);
  if (cls === 'heavy' && typeof model === 'string' && model.toLowerCase() === 'inherit') {
    throw codedError('INHERIT_HEAVY', "heavy work cannot inherit the caller's model", "Set models.heavy in the company state.json to an explicit model name, for example 'opus'.");
  }
  return { class: cls, model, reasons };
}

/**
 * Classify and record the choice on the caller's unit. Only that object is touched: no files, no state.
 * @param {Record<string, any>} unit @param {unknown} [models] @returns {Classification}
 */
export function recordModel(unit, models = {}) {
  const result = classify(unit, models);
  unit.class = result.class;
  unit.model = result.model;
  return result;
}
