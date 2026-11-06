// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, lstatSync, existsSync } from 'node:fs';
import { join, dirname, basename, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pluginDir = join(root, 'plugin');
const readJson = (/** @type {string} */ p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

/** @param {string} dir @returns {string[]} every path under dir, without following links */
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    out.push(full);
    if (lstatSync(full).isDirectory()) out.push(...walk(full));
  }
  return out;
}

test('plugin.json has name devocd, version, description and author', () => {
  const m = readJson('plugin/.claude-plugin/plugin.json');
  assert.equal(m.name, 'devocd');
  assert.match(m.version, /^\d+\.\d+\.\d+$/);
  assert.equal(typeof m.description, 'string');
  assert.ok(m.description.length > 0);
  assert.equal(m.author?.name, 'Sourabh Gavali');
});

test('plugin tree respects directory limits', () => {
  assert.ok(existsSync(pluginDir), 'plugin/ exists');
  const all = walk(pluginDir);
  const files = [];
  for (const p of all) {
    const rel = relative(pluginDir, p).split(sep).join('/');
    const st = lstatSync(p);
    assert.ok(!st.isSymbolicLink(), `${rel} is a symlink`);
    assert.ok(!rel.split('/').includes('..'), `${rel} has ..`);
    if (st.isDirectory()) {
      assert.notEqual(basename(p), 'hooks', 'no hooks/ directory');
      continue;
    }
    assert.ok(st.isFile(), `${rel} is not a regular file`);
    files.push(p);
    const name = basename(p);
    assert.ok(!/^(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|\.npmrc)$/.test(name), `${rel} is a lockfile or .npmrc`);
    assert.ok(!/^(\.DS_Store|Thumbs\.db|desktop\.ini)$/i.test(name), `${rel} is OS junk`);
    assert.ok(!/\.min\.(js|mjs|css)$/.test(name), `${rel} looks minified`);
    if (!/\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf)$/i.test(name)) {
      assert.ok(st.size <= 256 * 1024, `${rel} is over 256 KiB`);
    }
  }
  assert.ok(files.length <= 512, 'at most 512 files');
});

test('marketplace.json lists devocd with source ./plugin', () => {
  const m = readJson('.claude-plugin/marketplace.json');
  const entry = m.plugins.find((/** @type {any} */ p) => p.name === 'devocd');
  assert.ok(entry, 'devocd is listed');
  assert.equal(entry.source, './plugin');
});

test('.gitattributes has no filter or export-* entries', () => {
  const text = readFileSync(join(root, '.gitattributes'), 'utf8');
  assert.doesNotMatch(text, /\bfilter\b/);
  assert.doesNotMatch(text, /\bexport-/);
});
