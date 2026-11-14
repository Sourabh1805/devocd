// @ts-check
// Static checks of the company-policy skill's text: read-only connectors, the draft
// approval gate, no source text to the shell, and routing that projects backtrack to.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { countLines } from '../../plugin/scripts/lib/fsutil.mjs';
import { LIMITS } from '../../plugin/scripts/lib/tokens.mjs';

const skillDir = fileURLToPath(new URL('../../plugin/skills/company-policy/', import.meta.url));
const skill = () => readFileSync(join(skillDir, 'SKILL.md'), 'utf8');
const ref = (/** @type {string} */ name) => readFileSync(join(skillDir, 'references', name), 'utf8');

test('the skill is named company-policy and accepts Jira links, files and descriptions', () => {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(skill());
  assert.ok(m);
  assert.match(m[1], /^name: company-policy$/m);
  assert.match(skill(), /Jira/);
  const sources = ref('sources.md');
  for (const s of ['Jira', 'Confluence', 'URL', 'PDF']) assert.ok(sources.includes(s), s);
});

test('connectors are read-only and a single issue never becomes a company-wide rule', () => {
  const sources = ref('sources.md');
  assert.match(sources, /read-only|read calls|never.*(create|update|delete|comment)/i);
  assert.match(sources, /never generalize a single issue/i);
});

test('the concrete draft is approved before any write, and approval is never inferred', () => {
  const text = skill();
  assert.match(text, /[Bb]efore any write/);
  assert.match(text, /[Aa]sk for approval/);
  assert.match(text, /[Nn]ever infer approval/);
});

test('source text and URLs never reach the shell', () => {
  assert.match(skill(), /[Nn]ever pass source text or URLs to\s*the shell/);
});

test('projects backtrack: routing goes through the standards index and project files', () => {
  const workflow = ref('workflow.md');
  assert.match(workflow, /index\.md/);
  assert.match(workflow, /PROJECT\.md|pointer/);
  assert.ok(countLines(workflow) <= LIMITS.reference.lines);
});

test('the pointer template makes recorded company rules required, not optional', () => {
  const template = readFileSync(join(skillDir, '..', 'add-project', 'references', 'project-template.md'), 'utf8');
  assert.doesNotMatch(template, /It is optional: if this repo is used alone/);
  assert.match(template, /required/);
  assert.match(template, /say so and ask before proceeding/);
});
