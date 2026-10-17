import assert from 'node:assert/strict';
import test from 'node:test';
import { AuthAttempt, electronPendingVerifiers } from '../src/auth-attempt.ts';
import { publicServiceUrl } from '../src/auth-config.ts';

const state = '0123456789abcdef';
const tokenFor = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const callback = (value: unknown) => `io.github.andreazero.nexusai://auth/callback#token=${tokenFor(value)}`;
const credential = { state, identifier: '12345678901234567890123456789012' };

test('callbacks require the current plugin PKCE state and are consumed once', () => {
  const registry = new Map<string, string>();
  const attempt = new AuthAttempt(() => registry);
  assert.throws(() => attempt.consume(callback(credential)), /No active/);
  attempt.begin(100);
  registry.set(state, 'opaque-plugin-verifier');
  attempt.captureState();
  assert.throws(() => attempt.consume(callback({ ...credential, state: 'wrong-state' }), 200), /does not match/);
  assert.equal(attempt.consume(callback(credential), 200), tokenFor(credential));
  assert.throws(() => attempt.consume(callback(credential), 200), /No active/);
});

test('wrong origins, paths, duplicate fields and arbitrary tokens cannot exchange a session', () => {
  const registry = new Map<string, string>();
  const attempt = new AuthAttempt(() => registry);
  attempt.begin();
  registry.set(state, 'opaque-plugin-verifier');
  attempt.captureState();
  for (const url of [
    callback(credential).replace('://auth/', '://evil/'),
    callback(credential).replace('/callback#', '/other#'),
    callback(credential).replace('#token=', '?redirect=https://evil.test#token='),
    callback(credential).replace('://auth/', '://user@auth/'),
    callback(credential).replace('://auth/', ':/auth/'),
    callback({ ...credential, next: 'https://evil.test' }),
    callback({ state, identifier: '../../arbitrary' }),
    'io.github.andreazero.nexusai://auth/callback#token=invalid',
  ]) assert.throws(() => attempt.consume(url), Error, url);
  assert.equal(attempt.consume(callback(credential)), tokenFor(credential));
});

test('cancellation and timeout remove only the current plugin verifier', () => {
  const registry = new Map([['pre-existing-flow', 'unrelated']]);
  const attempt = new AuthAttempt(() => registry);
  attempt.begin(100);
  registry.set(state, 'opaque-plugin-verifier');
  attempt.captureState();
  assert.throws(() => attempt.consume(callback(credential), 300_100), /No active/);
  assert.equal(registry.has(state), false);
  assert.equal(registry.get('pre-existing-flow'), 'unrelated');
  attempt.begin();
  registry.set(state, 'new-plugin-verifier');
  attempt.cancel();
  assert.equal(registry.has(state), false);
  assert.throws(() => attempt.consume(callback(credential)), /No active/);
});

test('the isolated pinned integration reads the plugin global symbol without exporting verifiers', () => {
  const symbol = Symbol.for('better-auth:electron');
  const globals = globalThis as Record<symbol, unknown>;
  const previous = globals[symbol];
  try {
    const map = new Map([[state, 'plugin-private-verifier']]);
    globals[symbol] = map;
    assert.equal(electronPendingVerifiers(), map);
    globals[symbol] = {};
    assert.throws(electronPendingVerifiers, /Unsupported/);
  } finally {
    if (previous === undefined) delete globals[symbol];
    else globals[symbol] = previous;
  }
});

test('public endpoint configuration disallows credentials, paths and remote plaintext origins', () => {
  assert.equal(publicServiceUrl('http://127.0.0.1:3001'), 'http://127.0.0.1:3001');
  assert.equal(publicServiceUrl('https://nexus.example'), 'https://nexus.example');
  for (const value of ['http://nexus.example', 'https://user:secret@nexus.example', 'https://nexus.example/path', 'https://nexus.example?secret=value', 'file:///app']) {
    assert.throws(() => publicServiceUrl(value), Error);
  }
});
