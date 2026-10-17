import assert from 'node:assert/strict';
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type WebSocket from 'ws';
import { codexStateSchema, type LiveMessage, type NexusAuthState, type RealtimeApiRequest, type RealtimeState } from '@nexus-ai/contracts';
import { DesktopRealtime } from '../src/realtime.ts';
import { EncryptedAuthStorage, type EncryptionProvider } from '../src/auth-storage.ts';
import { loadRealtimeQueue, realtimeQueueSchema, realtimeStorageKey, validRealtimeText } from '../src/realtime-queue.ts';

const projectId = 'd309dd11-6d7e-4bc1-bd49-292bc50c2f74';
const repositoryId = '02f71f6e-69b1-49b7-b6d8-df89167070b9';
const deviceId = '9b5bbbc2-e8c6-4cac-a46a-b358bb44ed71';
const user = (id = 'owner-a'): NexusAuthState => ({ status: 'signed_in', user: { id, name: 'Owner', email: 'owner@example.invalid', emailVerified: true, image: null }, expiresAt: '2099-01-01T00:00:00.000Z', persistent: true, message: null });
const message = (text = 'Selected answer'): LiveMessage => ({ id: 'answer', role: 'assistant', text, status: 'streaming' });
const observed = (messages: LiveMessage[]) => codexStateSchema.parse({ runtime: 'ready', version: '0.159.2', expectedVersion: '0.159.2', runtimePath: null, account: null, login: null, models: [], policy: 'readOnly', notice: null,
  session: { projectId, repositoryId, threadId: 'local-thread', turnId: 'local-turn', folderLabel: 'fixture', model: 'model', status: 'running', messages, activities: [], error: null } });
const settle = async () => { for (let index = 0; index < 4; index++) await new Promise<void>(resolve => setImmediate(resolve)); };
const wait = (milliseconds = 560) => new Promise<void>(resolve => setTimeout(resolve, milliseconds));

class SocketFixture extends EventEmitter {
  readyState = 0;
  sent: unknown[] = [];
  send(text: string) { this.sent.push(JSON.parse(text) as unknown); }
  close() { this.readyState = 3; this.emit('close'); }
  terminate() { this.close(); }
  open() { this.readyState = 1; this.emit('open'); }
  frame(value: unknown) { this.emit('message', Buffer.from(JSON.stringify(value)), false); }
  client() { return this as unknown as WebSocket; }
}

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'nexus-realtime-'));
  const cwd = await realpath(directory);
  const filename = path.join(directory, 'realtime.bin');
  const key = randomBytes(32);
  const encryption: EncryptionProvider = {
    isEncryptionAvailable: () => true, getSelectedStorageBackend: () => 'test-encrypted-adapter',
    encryptString(value) { const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv);
      const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]); return Buffer.concat([iv, cipher.getAuthTag(), data]); },
    decryptString(value) { const decipher = createDecipheriv('aes-256-gcm', key, value.subarray(0, 12)); decipher.setAuthTag(value.subarray(12, 28));
      return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString('utf8'); },
  };
  const storage = new EncryptedAuthStorage(filename, encryption, 'win32');
  let account = user(); let bound = cwd; let allowed = true; let source = cwd; let dropAck = false; let conflict = false;
  let cursor = '9007199254740993';
  let service: DesktopRealtime;
  const states: RealtimeState[] = [];
  const progress = new EventEmitter();
  const sockets: SocketFixture[] = [];
  const requests: RealtimeApiRequest[] = [];
  const connections: { url: string; headers: Record<string, string> }[] = [];
  const receipts = new Map<string, unknown>();
  const remote = new Map<string, LiveMessage[]>();
  const fetch: typeof globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as RealtimeApiRequest; requests.push(body);
    assert.equal((init?.headers as Record<string, string>)['Cookie'], 'private-test-cookie');
    if (body.operation === 'snapshot') return Response.json({ ok: true, kind: 'snapshot', snapshot: { projectId: body.projectId, cursor, sessions: [], shares: [] } });
    if (body.operation !== 'upload') return Response.json({ ok: false, code: 'not_found', message: 'Missing share' });
    if (receipts.has(body.batchId)) return Response.json(receipts.get(body.batchId));
    if (conflict) return Response.json({ ok: false, code: 'conflict', message: 'Offset conflict' });
    const change = body.change;
    if (change.type === 'start') remote.set(change.shareId, structuredClone(change.messages));
    if (change.type === 'append') {
      const messages = remote.get(change.shareId)!;
      for (const update of change.updates) { const target = messages.find(message => message.id === update.messageId)!;
        assert.equal(target.text.length, update.offset); target.text += update.text; target.status = update.status; }
    }
    cursor = (BigInt(cursor) + 1n).toString();
    const receipt = { ok: true, kind: 'ack', batchId: body.batchId, shareId: change.shareId, cursor };
    receipts.set(body.batchId, receipt);
    if (dropAck) { dropAck = false; throw new Error('Connection lost after commit'); }
    return Response.json(receipt);
  };
  const create = () => {
    service = new DesktopRealtime({
      auth: { getState: async () => account, realtimeSession: async () => account.status === 'signed_in' ? { userId: account.user!.id, cookie: 'private-test-cookie', server: 'http://127.0.0.1:3001' } : null,
        authorizeRepository: async () => allowed ? { userId: account.user!.id } : { ok: false as const, code: 'forbidden', message: 'Revoked' } },
      bindings: { get: async (_user, project, repository) => ({ projectId: project, repositoryId: repository, rootPath: bound, label: 'fixture', deviceId, updatedAt: new Date().toISOString() }) },
      storage, fetch, publish: state => { states.push(state); progress.emit('state', state); }, verifySource: async () => ({ userId: account.user!.id, cwd: source }),
      createSocket: (url, headers) => { const socket = new SocketFixture(); sockets.push(socket); connections.push({ url, headers }); return socket.client(); },
    });
    service.nexusStateChanged(account);
    return service;
  };
  create();
  const online = async (operation: 'connect' | 'retry' = 'connect') => {
    const result = await service.request(operation === 'connect' ? { operation, projectId } : { operation }); assert.equal(result.ok, true);
    const socket = sockets.at(-1)!; socket.open(); socket.frame({ type: 'snapshot', snapshot: { projectId, cursor, sessions: [], shares: [] }, resync: false });
    await settle(); assert.equal((await service.request({ operation: 'getState' })).state.connection, 'online'); return socket;
  };
  const start = async (text = 'Selected answer') => { service.observeCodex(observed([message(text)]));
    const result = await service.request({ operation: 'startSharing', projectId, repositoryId, title: 'Selected work', visibility: 'team', messages: [message(text)] }); assert.equal(result.ok, true); return result; };
  const waitFor = (predicate: (state: RealtimeState) => boolean) => new Promise<void>((resolve, reject) => {
    if (states.at(-1) && predicate(states.at(-1)!)) { resolve(); return; }
    const timer = setTimeout(() => { progress.off('state', listener); reject(new Error('Expected realtime state did not arrive within 10 seconds.')); }, 10000);
    const listener = (state: RealtimeState) => { if (predicate(state)) { clearTimeout(timer); progress.off('state', listener); resolve(); } };
    progress.on('state', listener);
  });
  return { directory, filename, cwd, storage, states, sockets, requests, connections, receipts, remote, create, online, start, waitFor,
    get service() { return service; }, setAllowed: (value: boolean) => { allowed = value; }, setBound: (value: string) => { bound = value; }, setSource: (value: string) => { source = value; },
    setAccount: (value: NexusAuthState) => { account = value; service.nexusStateChanged(value); }, dropAck: () => { dropAck = true; }, conflict: () => { conflict = true; },
    setCursor: (value: string) => { cursor = value; },
    close: async () => { await service.dispose(); await rm(directory, { recursive: true, force: true }); } };
}

test('main-only socket keeps credentials out of URL and rejects invented messages/commands', async () => {
  const f = await fixture();
  try {
    const socket = await f.online();
    assert.equal(f.connections[0]!.url, 'ws://127.0.0.1:3001/api/realtime');
    assert.equal(f.connections[0]!.headers['Origin'], 'io.github.andreazero.nexusai:/');
    assert.equal(JSON.stringify(f.states).includes('private-test-cookie'), false);
    assert.equal(f.requests.some(request => request.operation === 'upload'), false);
    f.service.observeCodex(observed([message()]));
    for (const selected of [[{ ...message(), text: 'Invented content' }], [{ ...message(), role: 'user' as const }]]) {
      const result = await f.service.request({ operation: 'startSharing', projectId, repositoryId, title: 'Review', visibility: 'team', messages: selected }); assert.equal(result.ok, false);
    }
    const injection = await f.service.request({ operation: 'startSharing', projectId, repositoryId, title: 'Review', visibility: 'team', messages: [message()], command: 'execute' } as never);
    assert.equal(injection.ok, false);
    socket.frame({ type: 'presence', projectId, members: [{ userId: 'other', name: 'Other', role: 'client', connections: 1, lastSeenAt: new Date().toISOString() }] }); await settle();
    assert.equal((await f.service.request({ operation: 'getState' })).state.presence[0]?.userId, 'other');
    socket.close();
    assert.equal((await f.service.request({ operation: 'getState' })).state.presence.length, 0);
    assert.equal((await f.service.request({ operation: 'getState' })).state.snapshot, null);
  } finally { await f.close(); }
});

test('WebSocket ACK uses delivered cursor even when an HTTP projection has advanced further', async () => {
  const f = await fixture();
  try {
    f.setCursor('80'); const socket = await f.online();
    f.setCursor('100'); socket.frame({ type: 'events', projectId, cursor: '85', events: [] });
    await f.waitFor(state => state.cursor === '100');
    socket.frame({ type: 'events', projectId, cursor: '90', events: [] }); await settle();
    assert.deepEqual(socket.sent.at(-1), { type: 'ack', cursor: '90' });
    assert.equal((await f.service.request({ operation: 'getState' })).state.cursor, '100');
    const sent = socket.sent.length;
    socket.frame({ type: 'events', projectId, cursor: '89', events: [] }); await settle();
    assert.equal(socket.sent.length, sent);
    socket.frame({ type: 'snapshot', snapshot: { projectId, cursor: '101', sessions: [], shares: [] }, resync: true }); await settle();
    assert.deepEqual(socket.sent.at(-1), { type: 'ack', cursor: '101' });
  } finally { await f.close(); }
});

test('selected IDs alone stream in bounded ordered batches and stop after pending text', async () => {
  const f = await fixture();
  try {
    await f.online(); await f.start();
    const text = `Selected answer${'x'.repeat(16383)}😀${'x'.repeat(23615)}`;
    f.service.observeCodex(observed([{ ...message(text), status: 'complete' }, { id: 'unselected', role: 'assistant', text: 'NEVER UPLOAD', status: 'complete' }]));
    await wait(); await settle();
    const stopping = await f.service.request({ operation: 'stopSharing' }); assert.equal(stopping.ok, true); assert.equal(stopping.state.sharing, null);
    await f.waitFor(state => state.pending === 0); await settle();
    const uploads = f.requests.filter(request => request.operation === 'upload');
    assert.equal(JSON.stringify(uploads).includes('NEVER UPLOAD'), false);
    assert.equal(uploads.at(-1)?.change.type, 'stop');
    assert.equal(f.remote.values().next().value?.[0]?.text.length, text.length);
    assert.equal(f.remote.values().next().value?.[0]?.text === text, true);
    assert.equal(f.remote.values().next().value?.[0]?.status, 'complete');
    for (const upload of uploads) if (upload.change.type === 'append') {
      assert.ok(upload.change.updates.reduce((sum, update) => sum + update.text.length, 0) <= 16384);
      assert.ok(upload.change.updates.every(update => validRealtimeText(update.text)));
    }
    assert.equal((await f.service.request({ operation: 'getState' })).state.pending, 0);
  } finally { await f.close(); }
});

test('a lost ACK retries identical batchId after commit without duplicating accepted text', async () => {
  const f = await fixture();
  try {
    await f.online(); f.dropAck(); await f.start(); await wait(); await settle();
    const first = f.requests.find(request => request.operation === 'upload'); assert.ok(first?.operation === 'upload');
    assert.equal(f.receipts.size, 1);
    const before = await f.service.request({ operation: 'getState' }); assert.equal(before.state.pending, 1);
    assert.equal((await readFile(f.filename)).includes('Selected answer'), false);
    await f.online('retry'); await wait(); await settle();
    const uploads = f.requests.filter(request => request.operation === 'upload');
    assert.equal(uploads.length, 2); assert.equal(uploads[0]!.batchId, uploads[1]!.batchId);
    assert.equal(f.receipts.size, 1); assert.equal(f.remote.values().next().value?.[0]?.text, 'Selected answer');
    assert.equal((await f.service.request({ operation: 'getState' })).state.pending, 0);
    assert.equal(first.change.type, 'start'); assert.equal(JSON.stringify(first).includes('local-thread'), false); assert.equal(JSON.stringify(first).includes(f.cwd), false);
  } finally { await f.close(); }
});

test('restart restores encrypted jobs suspended until explicit Retry and never resumes capture', async () => {
  const f = await fixture();
  try {
    await f.online(); await f.start(); await f.service.dispose();
    f.create(); await f.online();
    const restored = await f.service.request({ operation: 'getState' }); assert.equal(restored.state.pending, 1); assert.ok(restored.state.sharing);
    await wait(); assert.equal(f.requests.filter(request => request.operation === 'upload').length, 0);
    f.service.observeCodex(observed([message('Selected answer must not append after restart')]));
    await f.online('retry'); await wait(); await settle();
    assert.equal(f.requests.filter(request => request.operation === 'upload').length, 1);
    assert.equal(f.remote.values().next().value?.[0]?.text, 'Selected answer');
  } finally { await f.close(); }
});

test('revocation and changed binding clear projections and do not release queued text', async () => {
  const f = await fixture();
  try {
    await f.online(); await f.start(); f.setAllowed(false); await wait(); await settle();
    const denied = await f.service.request({ operation: 'getState' }); assert.equal(denied.state.connection, 'denied'); assert.equal(denied.state.snapshot, null); assert.equal(denied.state.sharing, null);
    assert.equal(f.requests.filter(request => request.operation === 'upload').length, 0);
    f.setAllowed(true); f.setBound(path.dirname(f.cwd)); await f.online('retry'); await wait(); await settle();
    const current = await f.service.request({ operation: 'getState' }); assert.equal(current.state.pending, 1); assert.ok(current.state.sharing);
    assert.equal(f.requests.filter(request => request.operation === 'upload').length, 0);
    assert.match(current.state.notice ?? '', /binding changed/);
  } finally { await f.close(); }
});

test('offset conflicts freeze the exact pending queue; discard and account transitions remain isolated', async () => {
  const f = await fixture();
  try {
    await f.online(); f.conflict(); await f.start(); await wait(); await settle();
    const queue = await loadRealtimeQueue(f.storage, 'owner-a', projectId); assert.equal(queue?.blocked, true); assert.equal(queue?.jobs.length, 1);
    await f.online('retry'); await wait();
    assert.equal(f.requests.filter(request => request.operation === 'upload').length, 1);
    f.setAccount(user('owner-b')); await f.online();
    assert.equal((await f.service.request({ operation: 'getState' })).state.pending, 0);
    assert.equal(await f.storage.getItem(realtimeStorageKey('owner-b', projectId)), null);
    f.setAccount(user()); await f.online(); assert.equal((await f.service.request({ operation: 'getState' })).state.pending, 1);
    await f.service.request({ operation: 'discardPending' });
    assert.equal(await f.storage.getItem(realtimeStorageKey('owner-a', projectId)), '');
  } finally { await f.close(); }
});

test('explicit disconnect suspends capture and canonical source proof rejects a stale provider thread', async () => {
  const f = await fixture();
  try {
    await f.online(); f.setSource(path.dirname(f.cwd)); f.service.observeCodex(observed([message()]));
    const invalid = await f.service.request({ operation: 'startSharing', projectId, repositoryId, title: 'Review', visibility: 'team', messages: [message()] }); assert.equal(invalid.ok, false);
    f.setSource(f.cwd); await f.start(); await f.service.request({ operation: 'disconnect' });
    f.service.observeCodex(observed([message('Selected answer after disconnect')])); await wait();
    const state = await f.service.request({ operation: 'getState' }); assert.equal(state.state.connection, 'idle'); assert.ok(state.state.sharing); assert.equal(state.state.pending, 1);
    assert.equal(f.requests.filter(request => request.operation === 'upload').length, 0);
  } finally { await f.close(); }
});

test('queue rejects executable fields, mixed scopes and overflow without plaintext fallback', async () => {
  const f = await fixture();
  try {
    await f.online(); await f.start();
    const queue = await loadRealtimeQueue(f.storage, 'owner-a', projectId); assert.ok(queue);
    assert.equal(realtimeQueueSchema.safeParse({ ...queue, command: 'execute' }).success, false);
    for (const text of ['bad\0text', 'bad\uD800text', 'bad\uDC00text']) assert.equal(realtimeQueueSchema.safeParse({ ...queue, selected: [message(text)] }).success, false);
    assert.equal(realtimeQueueSchema.safeParse({ ...queue, jobs: Array.from({ length: 101 }, () => queue.jobs[0]) }).success, false);
    assert.equal(realtimeQueueSchema.safeParse({ ...queue, jobs: [{ ...queue.jobs[0], change: { ...queue.jobs[0]!.change, shareId: randomUUID() } }] }).success, false);
    const serialized = JSON.stringify({ ...queue, userId: 'other-account' });
    await f.storage.setItem(realtimeStorageKey('owner-a', projectId), serialized);
    await assert.rejects(loadRealtimeQueue(f.storage, 'owner-a', projectId), /another scope/);
    assert.equal((await readFile(f.filename)).includes('Selected answer'), false);
  } finally { await f.close(); }
});

test('Stop remains durable at the 100-job limit and is appended after the first acknowledged job', async () => {
  const f = await fixture();
  try {
    await f.online(); await f.start(); await f.service.dispose();
    const record = await loadRealtimeQueue(f.storage, 'owner-a', projectId); assert.ok(record);
    for (let index = 1; index < 100; index++) record.jobs.push({ batchId: randomUUID(), change: { type: 'append', shareId: record.shareId, deviceId: record.deviceId,
      updates: [{ messageId: 'answer', offset: 'Selected answer'.length, text: '', status: 'streaming' }] } });
    await f.storage.setItem(realtimeStorageKey('owner-a', projectId), JSON.stringify(record));
    f.create(); await f.online();
    const stop = await f.service.request({ operation: 'stopSharing' }); assert.equal(stop.ok, true); assert.equal(stop.state.pending, 100); assert.equal(stop.state.sharing, null);
    assert.equal((await loadRealtimeQueue(f.storage, 'owner-a', projectId))?.stopRequested, true);
    await f.online('retry'); await wait(); await settle();
    const current = await loadRealtimeQueue(f.storage, 'owner-a', projectId); assert.equal(current?.jobs.length, 100); assert.equal(current?.stopRequested, false);
    assert.equal(current?.jobs.at(-1)?.change.type, 'stop');
  } finally { await f.close(); }
});

test('heartbeat expiry and bounded backoff stop repeated automatic reconnect attempts', async t => {
  const f = await fixture();
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: Date.now() });
  try {
    const socket = await f.online();
    t.mock.timers.tick(15000); assert.equal((socket.sent.at(-1) as { type: string }).type, 'heartbeat');
    t.mock.timers.tick(45001); await settle();
    assert.equal((await f.service.request({ operation: 'getState' })).state.connection, 'offline');
    for (let index = 0; index < 9; index++) {
      t.mock.timers.tick(31000); await settle();
      const current = f.sockets.at(-1)!; current.open(); current.close(); await settle();
    }
    const count = f.sockets.length;
    t.mock.timers.tick(1000000); await settle();
    assert.equal(f.sockets.length, count); assert.ok(count <= 9);
    assert.match((await f.service.request({ operation: 'getState' })).state.notice ?? '', /8 attempts/);
  } finally { t.mock.timers.reset(); await f.close(); }
});
