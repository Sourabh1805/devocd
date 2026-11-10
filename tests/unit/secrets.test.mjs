// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanSecrets } from '../../plugin/scripts/lib/secrets.mjs';

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
