import assert from 'node:assert/strict';
import test from 'node:test';
import type { OverviewRequest } from '@nexus-ai/contracts';
import { requestOverview } from '../src/overview-transport.ts';
import { AUTH_SCHEME } from '../src/auth-config.ts';

const projectId = 'd309dd11-6d7e-4bc1-bd49-292bc50c2f74';
const otherProject = '02f71f6e-69b1-49b7-b6d8-df89167070b9';
const request: OverviewRequest = { operation: 'snapshot', projectId, filter: 'all', before: null, limit: 30 };
const snapshot = { projectId, cursor: '2', observedAt: '2026-10-17T00:00:00.000Z', activity: [], nextBefore: null,
  notifications: [], unreadCount: 0, readThrough: '0', tasks: [], activeShares: [], memberCount: 1, authorizedTargets: [] };

test('overview transport uses only its authenticated fixed endpoint and validates project/operation', async () => {
  let calls = 0;
  const result = await requestOverview('http://127.0.0.1:3001', 'qa-cookie', request, async (input, options) => {
    calls++;
    assert.equal(String(input), 'http://127.0.0.1:3001/api/overview');
    assert.equal(options?.method, 'POST'); assert.equal(options?.redirect, 'error'); assert.equal(options?.cache, 'no-store');
    assert.equal(options?.credentials, 'omit'); assert.ok(options?.signal instanceof AbortSignal);
    const headers = new Headers(options?.headers);
    assert.equal(headers.get('Cookie'), 'qa-cookie'); assert.equal(headers.get('Origin'), `${AUTH_SCHEME}:/`);
    assert.deepEqual(JSON.parse(String(options?.body)), request);
    return Response.json({ ok: true, kind: 'overview', snapshot });
  });
  assert.equal(calls, 1); assert.equal(result.ok, true);
  for (const value of [
    { ok: true, kind: 'overview', snapshot: { ...snapshot, projectId: otherProject } },
    { ok: true, kind: 'read', projectId, readThrough: '2', unreadCount: 0 },
    { ok: true, kind: 'overview', snapshot, unexpected: 'private' },
  ]) assert.equal((await requestOverview('http://127.0.0.1:3001', 'qa-cookie', request, async () => Response.json(value))).ok, false);
});

test('overview validates input, origin and credentials before fetching', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return Response.json({ ok: true, kind: 'overview', snapshot }); };
  for (const server of ['http://example.invalid', 'https://example.invalid/private', 'https://user:secret@example.invalid', 'https://example.invalid/?token=private']) {
    assert.equal((await requestOverview(server, 'qa-cookie', request, fetcher)).ok, false);
  }
  assert.equal((await requestOverview('http://127.0.0.1:3001', '', request, fetcher)).ok, false);
  assert.equal((await requestOverview('http://127.0.0.1:3001', 'qa-cookie', { ...request, url: 'https://example.invalid' } as OverviewRequest, fetcher)).ok, false);
  assert.equal(calls, 0);
});

test('overview bounds streamed/declared response size and does not surface private failures', async () => {
  let cancelled = false;
  const oversized = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new Uint8Array(1024 * 1024 + 1)); },
    cancel() { cancelled = true; },
  });
  const response = await requestOverview('http://127.0.0.1:3001', 'qa-cookie', request, async () => new Response(oversized));
  assert.equal(response.ok, false); assert.equal(cancelled, true);
  for (const fetcher of [
    async () => new Response('{}', { headers: { 'Content-Length': String(1024 * 1024 + 1) } }),
    async () => new Response(new Uint8Array([0xc3, 0x28])),
    async () => Response.json({ ok: true, kind: 'overview', snapshot }, { status: 403 }),
    async () => { throw new Error('private-database-password'); },
  ]) {
    const result = await requestOverview('http://127.0.0.1:3001', 'qa-cookie', request, fetcher);
    assert.equal(result.ok, false); assert.equal(JSON.stringify(result).includes('private'), false);
  }
});

test('overview returns validated permission failures and monotonic-read acknowledgement DTO', async () => {
  const forbidden = { ok: false, code: 'forbidden', message: 'Project access was revoked.' };
  assert.deepEqual(await requestOverview('https://example.invalid', 'qa-cookie', request, async () => Response.json(forbidden, { status: 403 })), forbidden);
  const ack = { ok: true, kind: 'read', projectId, readThrough: '9', unreadCount: 0 };
  assert.deepEqual(await requestOverview('https://example.invalid', 'qa-cookie', { operation: 'markRead', projectId, through: '9' }, async () => Response.json(ack)), ack);
});
