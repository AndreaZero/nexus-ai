import assert from 'node:assert/strict';
import test from 'node:test';
import { healthResponseSchema } from '@nexus-ai/contracts';
import { buildServer } from './app.js';
import { readServerConfig } from './config.js';

test('health describes process liveness without claiming a database or AI connection', async (context) => {
  const app = await buildServer(readServerConfig({ NEXUS_LOG_LEVEL: 'silent' }));
  context.after(() => app.close());
  const response = await app.inject({ method: 'GET', url: '/health' });
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['cache-control'], 'no-store');
  const health = healthResponseSchema.parse(response.json());
  assert.equal(health.status, 'ok');
  assert.equal(health.database, 'not_configured');
  assert.equal(health.codex, 'local_only');
});

test('a configured database URL is never reported as connected or exposed', async (context) => {
  const app = await buildServer(readServerConfig({
    NEXUS_LOG_LEVEL: 'silent',
    DATABASE_URL: 'postgresql://user:secret@127.0.0.1:1/nexus',
  }));
  context.after(() => app.close());
  const response = await app.inject({ method: 'GET', url: '/health' });
  assert.equal(response.json().database, 'unavailable');
  assert.equal(response.body.includes('secret'), false);
});

test('account setup status is sanitized and missing configuration never enables auth', async (context) => {
  const app = await buildServer(readServerConfig({ NEXUS_LOG_LEVEL: 'silent' }));
  context.after(() => app.close());
  const status = await app.inject({ method: 'GET', url: '/auth/status' });
  assert.deepEqual(status.json(), { configured: false, emailConfigured: false });
  assert.equal(status.headers['cache-control'], 'no-store');
  for (const request of [
    { method: 'GET' as const, url: '/auth/me' },
    { method: 'POST' as const, url: '/auth/sign-in/email', payload: { email: 'member@example.test', password: 'do-not-reflect-this' } },
  ]) {
    const response = await app.inject(request);
    assert.equal(response.statusCode, 503);
    assert.equal(response.json().error, 'auth_unavailable');
    assert.equal(response.body.includes('do-not-reflect-this'), false);
  }
});

test('credentialed auth CORS is restricted to exact account web and desktop origins', async (context) => {
  const app = await buildServer(readServerConfig({ NEXUS_LOG_LEVEL: 'silent', NEXUS_WEB_URL: 'http://127.0.0.1:5173' }));
  context.after(() => app.close());
  for (const origin of ['http://127.0.0.1:5173', 'http://127.0.0.1:3001', 'io.github.andreazero.nexusai:/']) {
    const response = await app.inject({
      method: 'OPTIONS', url: '/auth/sign-in/email',
      headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' },
    });
    assert.equal(response.statusCode, 204);
    assert.equal(response.headers['access-control-allow-origin'], origin);
    assert.equal(response.headers['access-control-allow-credentials'], 'true');
    assert.equal(response.headers['access-control-allow-methods'], 'GET, POST, OPTIONS');
  }
  for (const origin of ['nexus://app', 'null', 'https://untrusted.example', 'http://127.0.0.1:5173.evil.example']) {
    const response = await app.inject({ method: 'POST', url: '/auth/sign-in/email', headers: { origin }, payload: {} });
    assert.equal(response.statusCode, 403);
    assert.equal(response.headers['access-control-allow-credentials'], undefined);
  }
});

test('CORS uses exact allowlisted origins and rejects unknown or null origins', async (context) => {
  const app = await buildServer(readServerConfig({ NEXUS_LOG_LEVEL: 'silent' }));
  context.after(() => app.close());
  for (const origin of ['http://127.0.0.1:5173', 'nexus://app', 'http://127.0.0.1:3001']) {
    const response = await app.inject({ method: 'GET', url: '/health', headers: { origin } });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['access-control-allow-origin'], origin);
    assert.equal(response.headers['access-control-allow-credentials'], undefined);
  }
  for (const origin of ['https://untrusted.example', 'null', 'http://127.0.0.1:5173.evil.example']) {
    const response = await app.inject({ method: 'GET', url: '/health', headers: { origin } });
    assert.equal(response.statusCode, 403);
    assert.equal(response.headers['access-control-allow-origin'], undefined);
    assert.deepEqual(response.json(), { error: 'origin_not_allowed', message: 'Origin non consentita.' });
  }
});

test('preflight is allowed only for explicit supported origins and methods', async (context) => {
  const app = await buildServer(readServerConfig({ NEXUS_LOG_LEVEL: 'silent' }));
  context.after(() => app.close());
  const response = await app.inject({
    method: 'OPTIONS',
    url: '/health',
    headers: { origin: 'nexus://app', 'access-control-request-method': 'GET' },
  });
  assert.equal(response.statusCode, 204);
  assert.equal(response.headers['access-control-allow-origin'], 'nexus://app');
  assert.equal(response.headers['access-control-allow-methods'], 'GET, HEAD, OPTIONS');
});

test('unknown routes never echo requested paths or query strings', async (context) => {
  const app = await buildServer(readServerConfig({ NEXUS_LOG_LEVEL: 'silent' }));
  context.after(() => app.close());
  const response = await app.inject({ method: 'GET', url: '/not-implemented?token=secret' });
  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), { error: 'not_found', message: 'Risorsa non disponibile.' });
  assert.equal(response.body.includes('secret'), false);
});
