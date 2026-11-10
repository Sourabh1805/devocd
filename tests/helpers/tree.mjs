// @ts-check
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Write a map of relative path -> content under root, creating folders.
 * @param {string} root
 * @param {Record<string, string>} files
 * @returns {string} root
 */
export function makeTree(root, files) {
  mkdirSync(root, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, ...rel.split('/'));
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}
