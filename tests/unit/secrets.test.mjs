import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanSecrets } from '../../scripts/lib/secrets.mjs';

test('scanSecrets finds AKIAIOSFODNN7EXAMPLE and names no false positive on a git sha', () => {
  const hits = scanSecrets('ok\nkey AKIAIOSFODNN7EXAMPLE here\n');
  assert.deepEqual(hits, [{ line: 2, kind: 'aws-access-key' }]);
  assert.deepEqual(scanSecrets('commit 3f786850e387550fdab836ed7e6dc881de23001b fixed it'), []);
});

test('scanSecrets finds github, slack, private key and generic assignments', () => {
  const kinds = scanSecrets([
    'ghp_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8',
    'xoxb-1234567890-abcdefghij',
    '-----BEGIN RSA PRIVATE KEY-----',
    'api_key = "Zx9Qw3Lk8Vb2Nm7Pr4Td6Hy1"',
    'password: short',
  ].join('\n')).map((h) => `${h.line}:${h.kind}`);
  assert.deepEqual(kinds, ['1:github-token', '2:slack-token', '3:private-key', '4:high-entropy-assignment']);
});

// --- T75: every detected kind, and the false-positive guard -------------------

/** A value of exactly n characters, so a length-sensitive pattern cannot pass on a typo. */
const filler = (n, seed = 'aB3xY9zQ7wV5uT2rS8nM4kL1pJ6hG0fD') => seed.repeat(Math.ceil(n / seed.length)).slice(0, n);
const HEX = '0123456789abcdef';

/** One case per newly added kind. Values are invented but have the shape the pattern requires. */
const NEW_KINDS = [
  { kind: 'gitlab-token', value: 'glpat-' + filler(24) },
  { kind: 'openai-key', value: 'sk-' + filler(48) },
  { kind: 'openai-key', value: 'sk-proj-' + filler(40), note: 'project key' },
  { kind: 'anthropic-key', value: 'sk-ant-api03-' + filler(24) },
  { kind: 'google-api-key', value: 'AIza' + filler(35) },
  { kind: 'stripe-key', value: 'sk_live_' + filler(24) },
  { kind: 'stripe-key', value: 'rk_live_' + filler(24), note: 'restricted key' },
  { kind: 'slack-webhook', value: 'https://hooks.slack.com/services/T03ABCDEF/B03GHIJKL/' + filler(24) },
  { kind: 'sendgrid-key', value: 'SG.' + filler(24) + '.' + filler(44) },
  { kind: 'twilio-key', value: 'SK' + filler(32, HEX) },
  { kind: 'npm-token', value: 'npm_' + filler(36) },
  { kind: 'pypi-token', value: 'pypi-' + filler(24) },
  { kind: 'azure-storage-key', value: 'AccountKey=' + filler(40, 'Wm9zU3cXp0Y2F4dVF5QmFzZTY0S2V5Mg==') },
  { kind: 'connection-string-password', value: 'Server=db;Password=S3cr3tP4ss;' },
  { kind: 'connection-string-password', value: 'Server=db;pwd=S3cr3tP4ss;', note: 'pwd alias' },
  { kind: 'jwt', value: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk' },
  { kind: 'url-credentials', value: 'postgres://app:S3cr3tP4ss@db.internal:5432/orders' },
  { kind: 'auth-header', value: 'Authorization: Bearer ' + filler(24) },
  { kind: 'auth-header', value: 'Authorization: Basic ' + filler(24, 'Wm9zU3cXp0Y2F4dVF5'), note: 'basic' },
  { kind: 'pgp-private-key', value: '-----BEGIN PGP PRIVATE KEY BLOCK-----' },
  { kind: 'docker-auth', value: '{"auths":{"registry.internal":{"auth":"Wm9zU3cXp0Y2F4dVF5"}}}' },
];

for (const c of NEW_KINDS) {
  test(`detects ${c.kind}${c.note ? ` (${c.note})` : ''}`, () => {
    const text = `before\nconst x = 1;\n${c.value}\nafter\n`;
    assert.deepEqual(scanSecrets(text), [{ line: 3, kind: c.kind }]);
  });
}

/** Values that must never be reported. */
const NOT_SECRETS = [
  { why: 'a sha256 evidence line', text: `- src/a.js#L1 sha256:${filler(64, HEX)} 2026-11-01` },
  { why: 'a bare 40-hex git SHA', text: 'commit 3f786850e387550fdab836ed7e6dc881de23001b fixed it' },
  { why: 'a bare 64-hex hash', text: `digest ${filler(64, HEX)}` },
  { why: 'a hash assigned to a secret-shaped name', text: `api_key = "${filler(64, HEX)}"` },
  { why: 'a UUID', text: 'request 123e4567-e89b-12d3-a456-426614174000 failed' },
  { why: 'a UUID assigned to a secret-shaped name', text: `password = "123e4567-e89b-12d3-a456-426614174000"` },
  { why: 'the placeholder xxx…', text: `api_key = "${'x'.repeat(24)}"` },
  { why: 'the placeholder <token>', text: 'api_key = "<token>"' },
  { why: 'the placeholder ${VAR}', text: 'password = "${DB_PASSWORD}"' },
  { why: 'the placeholder %VAR%', text: 'password = "%DB_PASSWORD%"' },
  { why: 'the placeholder changeme', text: 'password = "changeme123456789012345"' },
  { why: 'the placeholder example', text: 'api_key = "example"' },
  { why: 'the placeholder your-…-here', text: 'api_key = "your-api-key-here"' },
  { why: 'the placeholder dummy', text: 'token = "dummy-token-value-0123456789"' },
  { why: 'the placeholder fake', text: 'secret = "fake-secret-value-0123456789"' },
  { why: 'the placeholder test', text: 'token = "test-token-0123456789abcdef"' },
  { why: 'a Stripe test key', text: 'sk_test_' + filler(24) },
  { why: 'ordinary code calling a function', text: 'const token = getToken();' },
  { why: 'ordinary code reading the environment', text: 'const apiKey = process.env.API_KEY;' },
  { why: 'a long base64 image in a data: URI', text: 'background: url(data:image/png;base64,' + filler(600, 'iVBORw0KGgoAAAANSUhEUg') + ')' },
];
for (const c of NOT_SECRETS) {
  test(`never reports ${c.why}`, () => {
    assert.deepEqual(scanSecrets(c.text), []);
  });
}

test('no hit ever carries the matched value, and the shape stays line and kind', () => {
  const text = NEW_KINDS.map((c) => c.value).join('\n');
  const hits = scanSecrets(text);
  assert.equal(hits.length, NEW_KINDS.length, 'one hit per line');
  assert.deepEqual(hits.map((h) => h.line), NEW_KINDS.map((_, i) => i + 1));
  for (const hit of hits) {
    assert.deepEqual(Object.keys(hit).sort(), ['kind', 'line'], 'the shape is unchanged');
    assert.equal(typeof hit.line, 'number');
    assert.equal(typeof hit.kind, 'string');
  }
  const dump = JSON.stringify(hits);
  for (const c of NEW_KINDS) assert.ok(!dump.includes(c.value), `a hit echoed ${c.kind}`);
});
