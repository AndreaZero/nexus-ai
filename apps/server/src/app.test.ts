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
    DATABASE_URL: 'postgresql://user:secret@localhost/nexus',
  }));
  context.after(() => app.close());
  const response = await app.inject({ method: 'GET', url: '/health' });
  assert.equal(response.json().database, 'not_connected');
  assert.equal(response.body.includes('secret'), false);
});

test('CORS uses exact allowlisted origins and rejects unknown or null origins', async (context) => {
  const app = await buildServer(readServerConfig({ NEXUS_LOG_LEVEL: 'silent' }));
  context.after(() => app.close());
  for (const origin of ['http://127.0.0.1:5173', 'nexus://app']) {
    const response = await app.inject({ method: 'GET', url: '/health', headers: { origin } });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['access-control-allow-origin'], origin);
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
