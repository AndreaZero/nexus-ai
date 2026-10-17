import assert from 'node:assert/strict';
import test from 'node:test';
import { requestSessions } from '../src/sessions-transport.ts';
const projectId = 'd309dd11-6d7e-4bc1-bd49-292bc50c2f74';
test('session transport accepts only its fixed authenticated domain and validated responses', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (input, options) => {
    calls++; assert.equal(String(input), 'http://127.0.0.1:3001/api/sessions');
    assert.equal(options?.redirect, 'error'); assert.equal(new Headers(options?.headers).get('Cookie'), 'test-cookie');
    assert.deepEqual(JSON.parse(String(options?.body)), { operation: 'list', projectId });
    return Response.json({ ok: true, kind: 'sessions', items: [] });
  };
  const result = await requestSessions('http://127.0.0.1:3001', 'test-cookie', { operation: 'list', projectId }, fetcher);
  assert.equal(result.ok, true); assert.equal(calls, 1);
  assert.equal((await requestSessions('http://127.0.0.1:3001', '', { operation: 'list', projectId }, fetcher)).ok, false);
  assert.equal(calls, 1);
});
test('session transport sanitizes broken and private server output', async () => {
  const result = await requestSessions('http://127.0.0.1:3001', 'test-cookie', { operation: 'list', projectId }, async () => { throw new Error('private-database-password'); });
  assert.equal(result.ok, false); assert.equal(JSON.stringify(result).includes('private'), false);
});
