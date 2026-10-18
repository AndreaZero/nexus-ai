import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import type { NexusAuthState } from '@nexus-ai/contracts';
import { DesktopEnvironmentProbe } from '../src/environment-probe.ts';

const projectId = '4acb5a44-1020-4e24-a397-e3284462010a';
const observe = (url = 'http://localhost:3000/health') => ({ operation: 'observe', projectId, url, consent: true });
const account = (id: string): NexusAuthState => ({ status: 'signed_in', user: { id, name: 'Test', email: 'probe@example.test', emailVerified: true, image: null }, expiresAt: null, persistent: false, message: null });

test('probe accepts only explicit exact loopback HTTP authority before URL normalization', async () => {
  let connections = 0;
  const probe = new DesktopEnvironmentProbe({ authorize: async () => ({ userId: 'a' }), fetch: async () => { connections++; return new Response(null); } });
  for (const url of ['https://localhost/', 'http://example.test/', 'http://192.168.1.1/', 'http://127.1/', 'http://2130706433/', 'http://0177.0.0.1/', 'http://%31%32%37.0.0.1/', 'http://localhost.evil.test/', 'http://localhost./', 'http://user:pass@localhost/', 'http://localhost/?token=x', 'http://localhost/#fragment', 'http://localhost\\@evil.test/', 'http://local\nhost/', 'http://localhost:65536/', 'http://localhost:0/', 'http://[::ffff:127.0.0.1]/']) {
    const result = await probe.request(observe(url));
    assert.equal(result.ok, false, url);
    if (!result.ok) assert.equal(result.code, 'invalid_request', url);
  }
  for (const input of [{ ...observe(), consent: false }, { ...observe(), consent: undefined }, { ...observe(), operation: 'execute' }, { ...observe(), command: 'curl' }, { ...observe(), cookie: 'secret' }]) assert.equal((await probe.request(input)).ok, false);
  assert.equal(connections, 0);
});

test('probe sends one credential-free HEAD without DNS, redirects or response body reads', async () => {
  let authorizations = 0;
  const instant = Date.parse('2026-10-18T12:00:00Z');
  let tick = instant;
  const probe = new DesktopEnvironmentProbe({
    authorize: async id => { assert.equal(id, projectId); authorizations++; return { userId: 'a' }; },
    now: () => { tick += 7; return tick; },
    fetch: async (url, init) => {
      assert.equal(url, 'http://127.0.0.1:3000/health');
      assert.equal(init?.method, 'HEAD'); assert.equal(init?.redirect, 'error');
      assert.equal(init?.cache, 'no-store'); assert.equal(init?.credentials, 'omit');
      assert.equal(init?.headers, undefined); assert.equal(init?.body, undefined);
      return { status: 204, get headers() { throw new Error('must not inspect response headers'); }, get body() { throw new Error('must not read body'); } } as unknown as Response;
    },
  });
  const result = await probe.request(observe());
  assert.equal(authorizations, 2); assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.observation.url, 'http://127.0.0.1:3000/health');
    assert.equal(result.observation.status, 'reachable'); assert.equal(result.observation.httpStatus, 204);
    assert.equal(result.observation.latencyMs, 7); assert.equal(result.observation.source, 'local_http');
    assert.equal(Date.parse(result.observation.expiresAt) - Date.parse(result.observation.observedAt), 30000);
  }
});

test('probe reports HTTP failures and connection errors truthfully and reauthorizes failures', async () => {
  for (const httpStatus of [301, 401, 404, 500, null]) {
    let checks = 0;
    const probe = new DesktopEnvironmentProbe({ authorize: async () => { checks++; return { userId: 'a' }; }, fetch: async () => { if (httpStatus === null) throw new Error('sensitive internal details'); return new Response(null, { status: httpStatus }); } });
    const result = await probe.request(observe('http://[::1]:3000/'));
    assert.equal(result.ok, true); assert.equal(checks, 2);
    if (result.ok) { assert.equal(result.observation.status, 'unreachable'); assert.equal(result.observation.httpStatus, httpStatus); }
    assert.equal(JSON.stringify(result).includes('sensitive'), false);
  }
});

test('probe refuses network work without authorization and rejects late revocation', async () => {
  let connections = 0;
  const denied = new DesktopEnvironmentProbe({ authorize: async () => null, fetch: async () => { connections++; return new Response(); } });
  assert.deepEqual(await denied.request(observe()), { ok: false, code: 'forbidden', message: 'Your current account cannot observe this project environment.' });
  assert.equal(connections, 0);
  let checks = 0;
  const revoked = new DesktopEnvironmentProbe({ authorize: async () => ++checks === 1 ? { userId: 'a' } : null, fetch: async () => new Response() });
  const result = await revoked.request(observe()); assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'auth_required');
  assert.equal('observation' in result, false);
});

test('probe discards pending account changes, denies a second connection and recovers', async () => {
  let release: (() => void) | undefined;
  let pendingSignal: AbortSignal | undefined;
  let connections = 0;
  let userId = 'a';
  const probe = new DesktopEnvironmentProbe({ authorize: async () => ({ userId }), fetch: async (_url, init) => {
    connections++; pendingSignal = init?.signal ?? undefined;
    if (connections === 1) await new Promise<void>(resolve => { release = resolve; });
    return new Response(null, { status: 204 });
  } });
  probe.nexusStateChanged(account('a'));
  const first = probe.request(observe());
  await new Promise(resolve => setImmediate(resolve));
  const second = await probe.request(observe()); assert.equal(second.ok, false);
  if (!second.ok) assert.equal(second.code, 'unavailable');
  assert.equal(connections, 1);
  userId = 'b'; probe.nexusStateChanged(account('b'));
  assert.equal(pendingSignal?.aborted, true); release!();
  const late = await first; assert.equal(late.ok, false);
  if (!late.ok) assert.equal(late.code, 'auth_required');
  assert.equal('observation' in late, false);
  assert.equal((await probe.request(observe())).ok, true);
});

test('probe rejects account changes while initial authorization is pending before connecting', async () => {
  let release: (() => void) | undefined;
  let connections = 0;
  const probe = new DesktopEnvironmentProbe({ authorize: async () => { await new Promise<void>(resolve => { release = resolve; }); return { userId: 'a' }; }, fetch: async () => { connections++; return new Response(); } });
  const pending = probe.request(observe());
  await new Promise(resolve => setImmediate(resolve));
  probe.invalidate(); release!();
  const result = await pending; assert.equal(result.ok, false); assert.equal(connections, 0);
  if (!result.ok) assert.equal(result.code, 'auth_required');
});

test('probe timeout aborts after five seconds and remains a private unreachable observation', async () => {
  const probe = new DesktopEnvironmentProbe({ authorize: async () => ({ userId: 'a' }), fetch: async (_url, init) => new Promise<Response>((_resolve, reject) => {
    init!.signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  }) });
  const result = await probe.request(observe()); assert.equal(result.ok, true);
  if (result.ok) { assert.equal(result.observation.status, 'unreachable'); assert.equal(result.observation.httpStatus, null); assert.ok(result.observation.latencyMs >= 4900); }
});

test('actual loopback probe uses HEAD and never follows a redirect to a second endpoint', async () => {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(`${request.method} ${request.url}`);
    if (request.url === '/redirect') { response.writeHead(302, { Location: '/forbidden' }); response.end(); }
    else { response.writeHead(request.url === '/fail' ? 503 : 204); response.end(); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    const probe = new DesktopEnvironmentProbe({ authorize: async () => ({ userId: 'a' }) });
    for (const [path, expected] of [['/ok', 204], ['/fail', 503], ['/redirect', null]] as const) {
      const result = await probe.request(observe(`http://localhost:${address.port}${path}`));
      assert.equal(result.ok, true); if (result.ok) assert.equal(result.observation.httpStatus, expected);
    }
    assert.deepEqual(requests, ['HEAD /ok', 'HEAD /fail', 'HEAD /redirect']);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
