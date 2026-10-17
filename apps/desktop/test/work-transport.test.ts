import test from 'node:test';
import assert from 'node:assert/strict';
import { workRequestSchema, type WorkRequest } from '@nexus-ai/contracts';
import { requestWork } from '../src/work-transport.ts';
const projectId = 'e92e89d0-953d-4334-96be-904ec84d66e2';
const input = workRequestSchema.parse({ operation: 'list', projectId, kind: 'task', view: 'client' });
const response = { ok: true, kind: 'list', projectId, entityKind: 'task', items: [], total: 0, nextOffset: null };
test('work transport has a fixed private endpoint and correlates project/entity/operation', async () => {
  const result = await requestWork('http://127.0.0.1:3001', 'qa-cookie', input, async (url, options) => {
    assert.equal(String(url), 'http://127.0.0.1:3001/api/work');
    assert.equal(options?.redirect, 'error'); assert.equal(options?.credentials, 'omit'); assert.equal(options?.cache, 'no-store');
    assert.equal(new Headers(options?.headers).get('Cookie'), 'qa-cookie'); assert.deepEqual(JSON.parse(String(options?.body)), input);
    return Response.json(response);
  });
  assert.equal(result.ok, true);
  for (const value of [{ ...response, entityKind: 'document' }, { ...response, projectId: 'ccad59df-9c3d-4ec7-92df-aae2a1d43c47' }, { ok: true, kind: 'saved', projectId, saved: true }]) {
    assert.equal((await requestWork('http://127.0.0.1:3001', 'qa-cookie', input, async () => Response.json(value))).ok, false);
  }
});
test('work rejects arbitrary headers/paths, non-success HTTP and oversized streamed files', async () => {
  let calls = 0; const fetcher: typeof fetch = async () => { calls++; return Response.json(response); };
  for (const request of [{ ...input, headers: { Cookie: 'private' } }, { ...input, path: 'C:/private' }]) {
    assert.equal((await requestWork('http://127.0.0.1:3001', 'qa-cookie', request as WorkRequest, fetcher)).ok, false);
  }
  assert.equal(calls, 0);
  assert.equal((await requestWork('http://127.0.0.1:3001', 'qa-cookie', input, async () => Response.json(response, { status: 403 }))).ok, false);
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(3 * 1048576 + 1)); }, cancel() { cancelled = true; } });
  assert.equal((await requestWork('http://127.0.0.1:3001', 'qa-cookie', input, async () => new Response(stream))).ok, false);
  assert.equal(cancelled, true);
});
