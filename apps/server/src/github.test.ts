import assert from 'node:assert/strict';
import test from 'node:test';
import { encryptGithubSecret, decryptGithubSecret, validGithubSignature } from './github-crypto.js';
import { createGithubClient, GithubError, parseGithubRepository, parseGithubPull, parseGithubReview, parseGithubFile } from './github-client.js';

test('GitHub AES-GCM encrypts with fresh nonce and authenticates actor/repository/key/ciphertext', () => {
  const secret = 'nexus-owned-server-key'.repeat(3); const value = 'private-github-token'; const context = 'connection:repository:account';
  const first = encryptGithubSecret(secret, context, value); const second = encryptGithubSecret(secret, context, value);
  assert.notEqual(first, second); assert.equal(first.includes(value), false); assert.equal(decryptGithubSecret(secret, context, first), value);
  assert.throws(() => decryptGithubSecret(secret, 'connection:other:account', first), /unavailable/);
  assert.throws(() => decryptGithubSecret('other-key', context, first), /unavailable/);
  const parts = first.split('.'); const encrypted = Buffer.from(parts[3]!, 'base64url'); encrypted[0] = encrypted[0]! ^ 1; parts[3] = encrypted.toString('base64url');
  assert.throws(() => decryptGithubSecret(secret, context, parts.join('.')), /unavailable/);
  assert.throws(() => decryptGithubSecret(secret, context, 'v1.invalid.invalid.invalid'), /unavailable/);
});
test('webhook HMAC matches the official GitHub test vector and rejects changed bytes/legacy/truncated signatures', () => {
  // https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
  const secret = "It's a Secret to Everybody"; const body = Buffer.from('Hello, World!');
  const signature = 'sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17';
  assert.equal(validGithubSignature(secret, body, signature), true);
  for (const invalid of [signature.slice(0, -1), signature.replace('sha256', 'sha1'), '', `sha256=${'x'.repeat(64)}`]) assert.equal(validGithubSignature(secret, body, invalid), false);
  assert.equal(validGithubSignature(secret, Buffer.from('Hello, world!'), signature), false);
});
test('GitHub repository URL parser accepts exact HTTPS github.com repositories and rejects credentials, ports, host tricks and extra paths', () => {
  assert.equal(parseGithubRepository('https://github.com/nexus/App.git').path, '/repos/nexus/App');
  for (const url of ['http://github.com/a/b', 'https://github.com.evil.test/a/b', 'https://github.com@evil.test/a/b', 'https://token@github.com/a/b', 'https://github.com:443/a/b?token=x', 'https://github.com/a/b/tree/main', 'https://github.com/a/b#tag', 'file:///a/b', 'https://github.com/a/%2Fb', 'https://github.com/a/..']) assert.throws(() => parseGithubRepository(url), GithubError);
});
test('GitHub API sends official headers to a fixed origin and never follows redirects or leaks upstream details', async () => {
  const seen: { url: string; options: RequestInit }[] = [];
  const api = createGithubClient('write-only-test-token', (async (url, options) => { seen.push({ url: String(url), options: options! }); return new Response(JSON.stringify({ login: 'developer' }), { status: 200 }); }) as typeof fetch);
  assert.deepEqual(await api.request('/user'), { login: 'developer' });
  assert.equal(seen[0]!.url, 'https://api.github.com/user'); assert.equal(seen[0]!.options.redirect, 'error');
  assert.equal((seen[0]!.options.headers as Record<string, string>)['X-GitHub-Api-Version'], '2026-03-10');
  await assert.rejects(api.request('https://evil.test/user'), (error: unknown) => error instanceof GithubError && error.code === 'invalid_request');
  const failure = createGithubClient('sensitive-token', (async () => { throw new Error('sensitive-token transport details'); }) as typeof fetch);
  await assert.rejects(failure.request('/user'), (error: unknown) => error instanceof GithubError && !error.definite && !error.message.includes('sensitive-token'));
});
test('GitHub API bounds responses and maps token, permission, rate, validation and unknown outcomes', async () => {
  for (const [status, code] of [[401, 'not_connected'], [403, 'forbidden'], [404, 'not_found'], [422, 'conflict'], [429, 'rate_limited'], [503, 'unavailable']] as const) {
    const api = createGithubClient('private-token', (async () => new Response('private upstream diagnostics', { status })) as typeof fetch);
    await assert.rejects(api.request('/repos/owner/repo'), (error: unknown) => error instanceof GithubError && error.code === code && !error.message.includes('private'));
  }
  const limited = createGithubClient('private-token', (async () => new Response('{}', { status: 403, headers: { 'x-ratelimit-remaining': '0' } })) as typeof fetch);
  await assert.rejects(limited.request('/user'), (error: unknown) => error instanceof GithubError && error.code === 'rate_limited');
  const large = createGithubClient('private-token', (async () => new Response('x'.repeat(2 * 1024 * 1024 + 1))) as typeof fetch);
  await assert.rejects(large.request('/user'), /too large/);
  const malformed = createGithubClient('private-token', (async () => new Response('{broken')) as typeof fetch);
  await assert.rejects(malformed.request('/user'), (error: unknown) => error instanceof GithubError && !error.definite);
});
test('GitHub projections derive safe repository links and bound PR review/file content', () => {
  const repo = parseGithubRepository('https://github.com/owner/repo');
  const sha = 'a'.repeat(40);
  const pull = parseGithubPull({ number: 3, title: 'Actual PR', body: '<script>escaped by renderer</script>', state: 'closed', merged_at: '2026-10-18T10:00:00Z', head: { ref: 'feature', sha }, base: { ref: 'main' }, user: { login: 'dev' }, updated_at: '2026-10-18T10:00:00Z', html_url: 'https://evil.test' }, repo);
  assert.equal(pull.url, 'https://github.com/owner/repo/pull/3'); assert.equal(pull.state, 'merged');
  const review = parseGithubReview({ id: 9, user: { login: 'dev' }, body: 'Review', state: 'APPROVED', commit_id: sha, submitted_at: null, html_url: 'https://evil.test' }, repo, 3);
  assert.equal(review.url, 'https://github.com/owner/repo/pull/3#pullrequestreview-9');
  const file = parseGithubFile({ filename: '../metadata-only.txt', status: 'modified', additions: 2, deletions: 1, patch: 'x'.repeat(70000) });
  assert.equal(file.patch?.length, 65536); assert.equal(file.path, '../metadata-only.txt');
});
