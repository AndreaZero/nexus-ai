import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import { WebSocket } from 'ws';
import { realtimeServerFrameSchema, type RealtimeServerFrame, type RealtimePresence } from '@nexus-ai/contracts';
import { installRealtimeSocket } from './realtime-socket.js';
import { RealtimeError, type RealtimeService } from './realtime.js';

const projectId = 'c588dc20-9f17-4f13-9354-8b7ed43be890';
const deviceId = '791efca9-7b30-4b4f-b9d9-2da1ba182de7';
const origin = 'http://127.0.0.1:5173';
const join = { type: 'join', projectId, cursor: null, deviceId };
async function harness() {
  let role: RealtimePresence['role'] | null = 'developer';
  let authenticated = true;
  const app = Fastify();
  const service = {
    async access() { if (!role) throw new RealtimeError('forbidden', 'Revoked'); return { role, name: 'Member' }; },
    async delivery(_actor, requestedProject, cursor, force) {
      if (requestedProject !== projectId || !role) throw new RealtimeError('forbidden', 'Revoked');
      return { access: { role, name: 'Member' }, frame: cursor === null || force
        ? { type: 'snapshot', snapshot: { projectId, cursor: '0', shares: [], sessions: [] }, resync: force ?? false }
        : { type: 'events', projectId, cursor: '0', events: [] } };
    },
    async execute() { return { ok: false, code: 'unavailable', message: 'Not used by WS test' }; },
  } as RealtimeService;
  const realtime = installRealtimeSocket(app, { service, origins: [origin], report() {},
    async authorize(request) { return authenticated && request.headers.cookie === 'qa=fixture' ? { id: 'member-a', email: 'never-exposed@example.test' } : null; } });
  app.addHook('preClose', () => realtime.close());
  const url = (await app.listen({ host: '127.0.0.1', port: 0 })).replace('http:', 'ws:') + '/api/realtime';
  const sockets: WebSocket[] = [];
  function connect(suffix = '', requestOrigin = origin, cookie = 'qa=fixture') {
    const socket = new WebSocket(url + suffix, { origin: requestOrigin, headers: { cookie } });
    sockets.push(socket); socket.on('error', () => undefined);
    const frames: RealtimeServerFrame[] = [];
    const waiters = new Set<() => void>();
    socket.on('message', data => { frames.push(realtimeServerFrameSchema.parse(JSON.parse(data.toString()) as unknown)); for (const wake of waiters) wake(); });
    return { socket, frames,
      open: new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); }),
      async wait(predicate: (frame: RealtimeServerFrame) => boolean) {
        const existing = frames.find(predicate); if (existing) return existing;
        return new Promise<RealtimeServerFrame>((resolve, reject) => {
          const check = () => { const result = frames.find(predicate); if (result) { clearTimeout(timer); waiters.delete(check); resolve(result); } };
          const timer = setTimeout(() => { waiters.delete(check); reject(new Error('Expected frame not received')); }, 5000);
          waiters.add(check);
        });
      },
    };
  }
  return { app, connect, setRole(value: typeof role) { role = value; }, revokeAuth() { authenticated = false; },
    async close() { for (const socket of sockets) socket.terminate(); await app.close(); } };
}

test('WS handshake enforces exact origin, no query credential, verified account and no bearer subprotocol', async context => {
  const h = await harness(); context.after(() => h.close());
  for (const [suffix, requestOrigin, cookie, status] of [
    ['?token=secret', origin, 'qa=fixture', 403], ['', 'null', 'qa=fixture', 403], ['', origin + '.evil', 'qa=fixture', 403], ['', origin, 'wrong', 401],
  ] as const) {
    const connection = h.connect(suffix, requestOrigin, cookie); void connection.open.catch(() => undefined);
    const rejected = await new Promise<number>(resolve => connection.socket.once('unexpected-response', (_request, response) => { response.resume(); resolve(response.statusCode ?? 0); }));
    assert.equal(rejected, status); connection.socket.terminate();
  }
});

test('WS shares deduplicated presence and current roles, clears demoted projection and closes revoked auth', async context => {
  const h = await harness(); context.after(() => h.close());
  const first = h.connect(), second = h.connect(); await Promise.all([first.open, second.open]);
  first.socket.send(JSON.stringify(join)); second.socket.send(JSON.stringify(join));
  await first.wait(frame => frame.type === 'snapshot'); await second.wait(frame => frame.type === 'snapshot');
  const presence = await first.wait(frame => frame.type === 'presence' && frame.members[0]?.connections === 2);
  assert.ok(presence.type === 'presence'); assert.equal(presence.members.length, 1);
  const serialized = JSON.stringify(presence);
  for (const value of ['never-exposed', deviceId, 'cookie', 'email']) assert.equal(serialized.includes(value), false);
  const previousSnapshots = first.frames.filter(frame => frame.type === 'snapshot').length;
  h.setRole('client'); first.socket.send(JSON.stringify({ type: 'heartbeat' }));
  await first.wait(frame => frame.type === 'snapshot' && frame.resync);
  assert.equal(first.frames.filter(frame => frame.type === 'snapshot').length, previousSnapshots + 1);
  h.revokeAuth(); first.socket.send(JSON.stringify({ type: 'heartbeat' }));
  const revoked = await first.wait(frame => frame.type === 'denied'); assert.ok(revoked.type === 'denied' && revoked.code === 'auth_required');
});

test('WS rejects impossible acknowledgements and malformed privileged frames', async context => {
  const h = await harness(); context.after(() => h.close());
  for (const frame of [{ type: 'ack', cursor: '1' }, { type: 'execute', command: 'not-an-operation' }]) {
    const connection = h.connect(); await connection.open;
    connection.socket.send(JSON.stringify(join)); await connection.wait(value => value.type === 'snapshot');
    connection.socket.send(JSON.stringify(frame));
    const denied = await connection.wait(value => value.type === 'denied'); assert.ok(denied.type === 'denied' && denied.code === 'invalid_request');
  }
});
