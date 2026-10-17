import test from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from './app.js';
import { readServerConfig } from './config.js';

test('session HTTP reads keep a bounded gate while unrelated auth paths keep their behavior', async context => {
  const app = await buildServer(readServerConfig({ NEXUS_LOG_LEVEL: 'silent' }));
  context.after(() => app.close());
  for (let request = 0; request < 100; request++) {
    assert.equal((await app.inject({ method: 'GET', url: '/auth/get-session', remoteAddress: '127.0.0.42' })).statusCode, 503);
  }
  const limited = await app.inject({ method: 'GET', url: '/auth/get-session', remoteAddress: '127.0.0.42' });
  assert.equal(limited.statusCode, 429);
  assert.ok(Number(limited.headers['retry-after']) >= 1);
  assert.equal(limited.headers['cache-control'], 'no-store');
  assert.equal((await app.inject({ method: 'GET', url: '/auth/get-session/', remoteAddress: '127.0.0.42' })).statusCode, 429);
  assert.equal((await app.inject({ method: 'POST', url: '/auth/get-session', remoteAddress: '127.0.0.42', payload: {} })).statusCode, 429);
  assert.equal((await app.inject({ method: 'GET', url: '/auth/get-session', remoteAddress: '127.0.0.43' })).statusCode, 503);
  assert.equal((await app.inject({ method: 'POST', url: '/auth/sign-in/email', remoteAddress: '127.0.0.42', payload: {} })).statusCode, 503);
});
