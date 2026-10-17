import assert from 'node:assert/strict';
import test from 'node:test';
import { buildServer } from './app.js';
import { readServerConfig } from './config.js';

test('Pulse HTTP requires allowed Origin, strict JSON schema and bounded body without reflecting input', async context => {
  const app = await buildServer(readServerConfig({ NEXUS_LOG_LEVEL: 'silent', NEXUS_WEB_URL: 'http://127.0.0.1:5173' })); context.after(() => app.close());
  const projectId = 'c588dc20-9f17-4f13-9354-8b7ed43be890';
  for (const input of [
    { headers: {}, payload: { operation: 'snapshot', projectId }, status: 403 },
    { headers: { origin: 'https://evil.example' }, payload: { operation: 'snapshot', projectId }, status: 403 },
    { headers: { origin: 'http://127.0.0.1:5173' }, payload: { operation: 'snapshot', projectId, token: 'not-reflected' }, status: 400 },
    { headers: { origin: 'http://127.0.0.1:5173' }, payload: { operation: 'snapshot', projectId, view: 'team' }, status: 400 },
    { headers: { origin: 'http://127.0.0.1:5173' }, payload: { operation: 'snapshot', projectId, before: '-1' }, status: 400 },
    { headers: { origin: 'http://127.0.0.1:5173', 'content-type': 'text/plain' }, payload: 'not-reflected', status: 400 },
    { headers: { origin: 'http://127.0.0.1:5173' }, payload: { operation: 'snapshot', projectId, secret: 'x'.repeat(17000) }, status: 413 },
    { headers: { origin: 'io.github.andreazero.nexusai:/' }, payload: { operation: 'snapshot', projectId }, status: 503 },
  ]) {
    const response = await app.inject({ method: 'POST', url: '/api/pulse', headers: input.headers, payload: input.payload });
    assert.equal(response.statusCode, input.status); assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers['referrer-policy'], 'no-referrer'); assert.equal(response.json().ok, false); assert.equal(response.body.includes('not-reflected'), false);
  }
});
