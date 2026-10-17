import assert from 'node:assert/strict';
import test from 'node:test';
import type { CollaborationRequest } from '@nexus-ai/contracts';
import { requestCollaboration } from '../src/collaboration-transport.ts';

test('collaboration uses only the fixed server route, native cookie and exact desktop origin', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (url, options) => {
    calls++;
    assert.equal(String(url), 'http://127.0.0.1:3001/api/collaboration');
    assert.equal(options?.method, 'POST');
    assert.equal(options?.credentials, 'omit');
    assert.equal(options?.redirect, 'error');
    assert.equal(options?.cache, 'no-store');
    const headers = new Headers(options?.headers);
    assert.equal(headers.get('cookie'), 'session=test-only');
    assert.equal(headers.get('origin'), 'io.github.andreazero.nexusai:/');
    assert.deepEqual(JSON.parse(String(options?.body)), { operation: 'listWorkspaces' });
    assert.ok(options?.signal);
    return Response.json({ ok: true, kind: 'workspaces', items: [] });
  };
  assert.deepEqual(await requestCollaboration('http://127.0.0.1:3001', 'session=test-only', { operation: 'listWorkspaces' }, fetcher), { ok: true, kind: 'workspaces', items: [] });
  for (const input of [
    { operation: 'listWorkspaces', url: 'https://invalid.example' },
    { operation: 'listWorkspaces', headers: { cookie: 'injected' } },
    { operation: 'execute', command: 'arbitrary' },
  ]) {
    const result = await requestCollaboration('http://127.0.0.1:3001', 'session=test-only', input as CollaborationRequest, fetcher);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, 'invalid_request');
  }
  assert.equal(calls, 1);
});

test('transport denies missing sessions, credentials in endpoint, redirects and unexpected response fields', async () => {
  const request = { operation: 'listWorkspaces' } as const;
  const invalid: typeof fetch = async () => Response.json({ ok: true, kind: 'workspaces', items: [], cookie: 'private' });
  const redirect: typeof fetch = async () => { throw new TypeError('Redirect denied'); };
  const denied: typeof fetch = async () => Response.json({ ok: false, code: 'forbidden', message: 'Access denied.' }, { status: 403 });
  const missing = await requestCollaboration('http://127.0.0.1:3001', '', request, invalid);
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.code, 'auth_required');
  for (const result of [
    await requestCollaboration('https://private:secret@example.test', 'test', request, denied),
    await requestCollaboration('http://127.0.0.1:3001', 'test', request, invalid),
    await requestCollaboration('http://127.0.0.1:3001', 'test', request, redirect),
  ]) {
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, 'unavailable');
    assert.equal(JSON.stringify(result).includes('secret'), false);
  }
  assert.deepEqual(await requestCollaboration('http://127.0.0.1:3001', 'test', request, denied), { ok: false, code: 'forbidden', message: 'Access denied.' });
});
