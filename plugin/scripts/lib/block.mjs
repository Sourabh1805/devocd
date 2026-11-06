// @ts-check
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { codedError, lstatOrNull, toPosix } from './fsutil.mjs';

export const BEGIN = '<!-- devocd:begin -->';
export const END = '<!-- devocd:end -->';

/**
 * Locate the managed block. Returns null when there is none; throws BLOCK_MALFORMED
 * for a lone, reversed or repeated marker.
 * @param {string} text
 * @returns {{ begin: number, end: number, beginIndex: number, endIndex: number, inner: string } | null}
 *   begin/end are 0-based line numbers of the markers; beginIndex/endIndex are character offsets
 *   (start of the begin line, end of the end marker).
 */
export function findBlock(text) {
  const lines = text.split('\n');
  /** @type {number[]} */ const begins = [];
  /** @type {number[]} */ const ends = [];
  let offset = 0;
  /** @type {number[]} */ const offsets = [];
  lines.forEach((line, i) => {
    offsets.push(offset);
    offset += line.length + 1;
    const l = (i === 0 ? line.replace(/^﻿/, '') : line).replace(/\r$/, '');
    if (l === BEGIN) begins.push(i);
    else if (l === END) ends.push(i);
  });
  if (begins.length === 0 && ends.length === 0) return null;
  if (begins.length !== 1 || ends.length !== 1) {
    throw codedError('BLOCK_MALFORMED', `expected one ${BEGIN} and one ${END}, found ${begins.length} and ${ends.length}`,
      'Fix or remove the stray devocd marker lines by hand, then run again.');
  }
  const [b] = begins;
  const [e] = ends;
  if (e < b) throw codedError('BLOCK_MALFORMED', `${END} comes before ${BEGIN}`, 'Put the end marker after the begin marker.');
  const inner = lines.slice(b + 1, e).map((l) => l.replace(/\r$/, '')).join('\n');
  return { begin: b, end: e, beginIndex: offsets[b] + (b === 0 && lines[0].startsWith('﻿') ? 1 : 0), endIndex: offsets[e] + END.length, inner };
}

/**
 * Put `inner` in the managed block of `existing`. Text outside the block is untouched.
 * @param {string} existing
 * @param {string} inner
 * @returns {string}
 */
export function upsertBlock(existing, inner) {
  const found = findBlock(existing);
  const eol = existing.includes('\r\n') ? '\r\n' : '\n';
  const body = inner.replace(/\s+$/, '').split(/\r?\n/);
  const blockText = [BEGIN, ...body, END].join(eol);
  if (found) return existing.slice(0, found.beginIndex) + blockText + existing.slice(found.endIndex);

  const bom = existing.startsWith('﻿') ? 1 : 0;
  const fm = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(existing.slice(bom));
  let at = bom;
  let lead = '';
  if (fm) {
    at = bom + fm[0].length;
    if (!/\n$/.test(fm[0])) lead = eol;
  }
  const before = existing.slice(0, at) + lead;
  const after = existing.slice(at);
  return before + blockText + eol + (after === '' ? '' : eol + after);
}

/** Decode strictly so bytes outside the block are never rewritten as U+FFFD. */
function decodeUtf8(/** @type {Buffer} */ buf, /** @type {string} */ name) {
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buf); } catch {
    throw codedError('NOT_UTF8', `${toPosix(name)} is not valid UTF-8; nothing was written`, 'Convert the file to UTF-8, then run again.');
  }
}

/**
 * Read innerFile and write it as the managed block of file. Refuses links.
 * @param {string} file
 * @param {string} innerFile
 */
export function writeBlock(file, innerFile) {
  const target = resolve(file);
  // Refuse links in every folder from the target up to the nearest ancestor holding .devocd or
  // .git (that one is checked too), so system links like macOS /var are never reached. With no
  // such ancestor, only the immediate parent is checked.
  const folders = [];
  for (let d = dirname(target); ; d = dirname(d)) {
    folders.push(d);
    if (lstatOrNull(resolve(d, '.devocd')) || lstatOrNull(resolve(d, '.git'))) break;
    if (dirname(d) === d) { folders.length = 1; break; }
  }
  for (const d of folders) {
    const fst = lstatOrNull(d);
    if (!fst || fst.isSymbolicLink() || !fst.isDirectory()) {
      throw codedError('NO_DIR', `folder ${toPosix(d)} is missing or is a link`, 'Write inside a real folder, not through a symlink or junction.');
    }
  }
  const st = lstatOrNull(target);
  if (st && !st.isFile()) {
    throw codedError('NOT_REGULAR', `${toPosix(target)} is a link or not a regular file`, 'devocd never writes through symlinks. Point at a real file.');
  }
  const existing = st ? decodeUtf8(readFileSync(target), target) : '';
  const out = upsertBlock(existing, decodeUtf8(readFileSync(resolve(innerFile)), innerFile));
  writeFileSync(target, out);
  return toPosix(target);
}
