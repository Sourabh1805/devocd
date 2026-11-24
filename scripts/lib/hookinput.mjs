// Read one hook input as it streams in. Only the fields the handlers use are kept; everything
// else — including a `Write`'s whole file body — is walked over without being stored, so a large
// edit still reaches the hook. Keys are compared after unescaping, so text inside a file's own
// content cannot redirect which path the hook records.
import { StringDecoder } from 'node:string_decoder';

const PROMPT_CAP = 256 * 1024;
const VALUE_CAP = 4 * 1024;
const MAX_DEPTH = 512;
const ROOT = Symbol('root');
const ELEMENT = '#';

/** The only paths captured, with the cap each keeps. Anything else is skipped, however long. */
const CAPTURES = new Map([
  ['hook_event_name', VALUE_CAP],
  ['session_id', VALUE_CAP],
  ['cwd', VALUE_CAP],
  ['tool_name', VALUE_CAP],
  ['prompt', PROMPT_CAP],
  ['tool_input.file_path', VALUE_CAP],
  ['tool_input.notebook_path', VALUE_CAP],
]);

const SPACE = new Set([' ', '\t', '\n', '\r']);
const ESCAPES = new Map([['"', '"'], ['\\', '\\'], ['/', '/'], ['b', '\b'], ['f', '\f'], ['n', '\n'], ['r', '\r'], ['t', '\t']]);

/** A JSON object scanner that keeps a handful of string fields and nothing else. */
class Reader {
  constructor() {
    /** @type {Map<string, string>} */
    this.values = new Map();
    /** @type {{ kind: 'object'|'array', key: string|symbol }[]} */
    this.frames = [];
    this.state = 'value';
    this.done = false;
    this.bad = false;
    /** The key of the current object member, once read. */
    this.member = null;
    /** The key being read. */
    this.keyText = '';
    /** While a captured string value is read: its path, cap and characters so far. */
    this.capture = null;
    this.esc = 0;
    this.hex = '';
    this.literal = '';
    this.number = '';
  }

  /** The dotted path of the value being parsed. */
  pathOf(/** @type {string|symbol|null} */ member) {
    const parts = [];
    for (const f of this.frames) if (typeof f.key === 'string' && f.key !== ELEMENT) parts.push(f.key);
    if (typeof member === 'string' && member !== ELEMENT) parts.push(member);
    return parts.join('.');
  }

  /** @returns {string|symbol|null} the key this value sits under, if it is an object member */
  currentMember() {
    const parent = this.frames[this.frames.length - 1];
    if (!parent) return ROOT;
    return parent.kind === 'array' ? ELEMENT : this.member;
  }

  /** @param {string} ch */
  push(ch) {
    if (this.bad || this.done) {
      if (!SPACE.has(ch)) this.bad = true;
      return;
    }
    switch (this.state) {
      case 'value': return this.value(ch);
      case 'keyOrEnd': return this.keyOrEnd(ch);
      case 'keyString': return this.keyString(ch);
      case 'colon': return this.colon(ch);
      case 'valueString': return this.valueString(ch);
      case 'number': return this.numberChar(ch);
      case 'literal': return this.literalChar(ch);
      case 'after': return this.after(ch);
      default: this.bad = true;
    }
  }

  /** @param {string} ch */
  value(ch) {
    if (SPACE.has(ch)) return;
    const parent = this.frames[this.frames.length - 1];
    if (ch === '}' || ch === ']') {
      // An empty container ends in the value state only for arrays: `{}` is handled in keyOrEnd.
      if (contentClosed(this)) return;
      this.bad = true;
      return;
    }
    if (ch === '{') {
      if (this.frames.length >= MAX_DEPTH) { this.bad = true; return; }
      this.frames.push({ kind: 'object', key: this.currentMember() });
      this.member = null;
      this.state = 'keyOrEnd';
      return;
    }
    if (ch === '[') {
      if (this.frames.length >= MAX_DEPTH) { this.bad = true; return; }
      this.frames.push({ kind: 'array', key: this.currentMember() });
      this.state = 'value';
      return;
    }
    if (ch === '"') {
      const path = this.pathOf(parent ? this.currentMember() : ROOT);
      this.capture = CAPTURES.has(path) ? { path, cap: CAPTURES.get(path), text: '', overflow: false } : null;
      this.keyText = '';
      this.esc = 0;
      this.state = 'valueString';
      return;
    }
    if (ch === '-' || (ch >= '0' && ch <= '9')) { this.number = ''; this.numberChar(ch); return; }
    if (ch === 't' || ch === 'f' || ch === 'n') { this.literal = ch; this.state = 'literal'; return; }
    this.bad = true;
  }

  /** @param {string} ch */
  keyOrEnd(ch) {
    if (SPACE.has(ch)) return;
    if (ch === '}') { contentClosed(this); return; }
    if (ch !== '"') { this.bad = true; return; }
    this.keyText = '';
    this.esc = 0;
    this.state = 'keyString';
  }

  /** @param {string} ch */
  colon(ch) {
    if (SPACE.has(ch)) return;
    if (ch !== ':') { this.bad = true; return; }
    this.state = 'value';
  }

  /** @param {string} ch */
  keyString(ch) {
    if (this.escape(ch)) return;
    if (ch === '"') {
      this.member = this.keyText;
      this.state = 'colon';
      return;
    }
    this.keyText += ch;
  }

  /** @param {string} ch */
  valueString(ch) {
    if (this.escape(ch)) return;
    if (ch === '"') {
      if (this.capture) {
        const { path, cap, text, overflow } = this.capture;
        // The prompt keeps its first 256 KiB; any other capped value is dropped when over.
        if (!overflow || path === 'prompt') this.values.set(path, text.slice(0, cap));
      }
      this.capture = null;
      this.state = 'after';
      return;
    }
    const c = this.capture;
    if (c) {
      if (c.text.length < c.cap) c.text += ch;
      else c.overflow = true;
    }
  }

  /** Escape handling shared by keys and string values. @param {string} ch @returns {boolean} consumed */
  escape(ch) {
    if (this.esc === 1) {
      if (ch === 'u') { this.esc = 2; this.hex = ''; return true; }
      const mapped = ESCAPES.get(ch);
      if (mapped === undefined) { this.bad = true; return true; }
      this.emit(mapped);
      this.esc = 0;
      return true;
    }
    if (this.esc >= 2) {
      this.hex += ch;
      if (this.hex.length < 4) return true;
      if (!/^[0-9a-fA-F]{4}$/.test(this.hex)) { this.bad = true; return true; }
      this.emit(String.fromCharCode(parseInt(this.hex, 16)));
      this.esc = 0;
      return true;
    }
    if (ch === '\\') { this.esc = 1; return true; }
    return false;
  }

  /** @param {string} ch */
  emit(ch) {
    if (this.state === 'keyString') this.keyText += ch;
    else if (this.capture) {
      const c = this.capture;
      if (c.text.length < c.cap) c.text += ch;
      else c.overflow = true;
    }
  }

  /** @param {string} ch */
  numberChar(ch) {
    if (/[-+0-9.eE]/.test(ch)) { this.number += ch; return; }
    if (!/^[-+]?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(this.number)) { this.bad = true; return; }
    this.state = 'after';
    this.after(ch);
  }

  /** @param {string} ch */
  literalChar(ch) {
    if (/[a-z]/.test(ch)) { this.literal += ch; return; }
    if (!['true', 'false', 'null'].includes(this.literal)) { this.bad = true; return; }
    this.state = 'after';
    this.after(ch);
  }

  /** @param {string} ch */
  after(ch) {
    if (SPACE.has(ch)) return;
    const top = this.frames[this.frames.length - 1];
    if (!top) { this.bad = true; return; }
    if (ch === ',') {
      this.member = null;
      this.state = top.kind === 'object' ? 'keyOrEnd' : 'value';
      return;
    }
    if (ch === '}') { if (top.kind !== 'object') { this.bad = true; return; } contentClosed(this); return; }
    if (ch === ']') { if (top.kind !== 'array') { this.bad = true; return; } contentClosed(this); return; }
    this.bad = true;
  }

  /** The input the handlers expect, holding only the fields that were captured. */
  input() {
    /** @type {Record<string, any>} */
    const out = {};
    for (const [path, value] of this.values) {
      if (path.startsWith('tool_input.')) {
        out.tool_input ??= {};
        out.tool_input[path.slice('tool_input.'.length)] = value;
      } else out[path] = value;
    }
    return out;
  }
}

/** Close the innermost container; the top level closing finishes the input. @param {Reader} r */
function contentClosed(r) {
  r.frames.pop();
  if (!r.frames.length) { r.done = true; return; }
  r.member = null;
  r.state = 'after';
}

/**
 * Read one hook input from a stream.
 * @param {AsyncIterable<Buffer|string>} stream
 * @param {{ maxBytes?: number }} [options]
 * @returns {Promise<{ input: Record<string, any>, complete: boolean }>}
 */
export async function readHookInput(stream, { maxBytes = 64 * 1024 * 1024 } = {}) {
  const r = new Reader();
  const decoder = new StringDecoder('utf8');
  let bytes = 0;
  let tooBig = false;
  for await (const chunk of stream) {
    const buf = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
    bytes += buf.length;
    if (bytes > maxBytes) { tooBig = true; break; }
    for (const ch of decoder.write(buf)) r.push(ch);
    if (r.bad) break;
  }
  if (!tooBig && !r.bad) for (const ch of decoder.end()) r.push(ch);
  return { input: r.input(), complete: !tooBig && !r.bad && r.done };
}
