import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptSnapshot, cursorAfter, disconnected, emptyRealtime, liveSelectionValid, retryDelay, selectedLiveMessages } from '../src/realtime/state.ts';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
// Resolve production .js specifiers to the same source modules without writing build fixtures.
const browserSource = stripTypeScriptTypes(readFileSync(new URL('../src/realtime/browser.ts', import.meta.url), 'utf8')).replaceAll("'@nexus-ai/contracts'", JSON.stringify(import.meta.resolve('@nexus-ai/contracts'))).replaceAll("'./state.js'", JSON.stringify(new URL('../src/realtime/state.ts', import.meta.url).href));
const { BrowserRealtime } = await import('data:text/javascript;base64,' + Buffer.from(browserSource).toString('base64'));
const project = '8f835b67-ffb9-48b7-9341-ab96adbf0a26';
const other = 'ee0ab564-2399-49de-8fc7-c5af32599837';
const snapshot = (cursor = '0') => ({ projectId: project, cursor, shares: [], sessions: [] });
test('realtime cursors compare beyond Number precision; replay and old snapshots never roll back projections', () => {
  const state = { ...emptyRealtime(), projectId: project, cursor: '9007199254740992', connection: 'online', snapshot: snapshot('9007199254740992') };
  assert.equal(cursorAfter('9007199254740993', state.cursor), true);
  assert.equal(cursorAfter(state.cursor, state.cursor), false);
  assert.equal(acceptSnapshot(state, snapshot('9007199254740991'), 'now'), state);
  assert.equal(acceptSnapshot(state, { ...snapshot('9007199254740993'), projectId: other }, 'now'), state);
  assert.equal(acceptSnapshot(state, snapshot('9007199254740993'), 'now').cursor, '9007199254740993');
});
test('disconnect and denied projections immediately hide presence and private summaries', () => {
  const state = { ...emptyRealtime(), projectId: project, snapshot: { ...snapshot(), shares: [{ title: 'Private project' }] }, presence: [{ name: 'Private member' }] };
  for (const connection of ['offline', 'denied', 'reconnecting']) { const next = disconnected(state, connection, 'Retry'); assert.equal(next.snapshot, null); assert.deepEqual(next.presence, []); assert.equal(next.projectId, project); }
});
test('reconnection is bounded to eight attempts with capped jitter and explicit manual restart', () => {
  assert.equal(retryDelay(0, 0), 750); assert.equal(retryDelay(0, 1), 1250);
  assert.equal(retryDelay(7, .5), 30000); assert.equal(retryDelay(8), null); assert.equal(retryDelay(9), null);
});
test('live sharing is explicit, frozen and bounded; streaming selection does not enroll later messages', () => {
  const source = [{ id: 'a', role: 'assistant', text: 'First', status: 'streaming' }, { id: 'b', role: 'user', text: 'Private', status: 'complete' }];
  assert.deepEqual(selectedLiveMessages(source, []), []);
  const frozen = selectedLiveMessages(source, ['a']); source[0].text += ' later'; source.push({ id: 'c', role: 'assistant', text: 'Not selected', status: 'complete' });
  assert.equal(frozen[0].text, 'First'); assert.deepEqual(frozen.map(item => item.id), ['a']);
  assert.equal(liveSelectionValid(frozen), true); assert.equal(liveSelectionValid([]), false); assert.equal(liveSelectionValid([...frozen, ...frozen]), false);
  assert.equal(liveSelectionValid([{ ...frozen[0], text: 'x'.repeat(131073) }]), false);
});
class FakeSocket {
  static OPEN = 1; static instances = [];
  readyState = 0; sent = [];
  constructor(url) { this.url = url; FakeSocket.instances.push(this); }
  open() { this.readyState = 1; this.onopen?.(); }
  send(raw) { this.sent.push(JSON.parse(raw)); }
  frame(value) { this.onmessage?.({ data: JSON.stringify(value) }); }
  close() { this.readyState = 3; this.onclose?.(); }
}
async function observer(run) {
  const previousSocket = globalThis.WebSocket; const previousFetch = globalThis.fetch; FakeSocket.instances = [];
  globalThis.WebSocket = FakeSocket;
  const states = []; let reads = 0;
  globalThis.fetch = async (_url, options) => { assert.equal(options.credentials, 'include'); assert.equal(options.redirect, 'error'); assert.equal(JSON.parse(options.body).operation, 'snapshot'); ++reads; return { json: async () => ({ ok: true, kind: 'snapshot', snapshot: snapshot('9007199254740993') }) }; };
  const client = new BrowserRealtime(new URL('https://nexus.example/'), project, state => states.push(state));
  try { await run(client, states, () => reads); } finally { client.stop(); globalThis.WebSocket = previousSocket; globalThis.fetch = previousFetch; }
}
test('browser subscribes only to fixed WSS path without credentials in URL and hides projections on revocation', async () => observer(async (client, states) => {
  client.connect(); const socket = FakeSocket.instances.at(-1); assert.equal(socket.url.href, 'wss://nexus.example/api/realtime'); socket.open();
  assert.equal(socket.sent[0].type, 'join'); assert.equal(socket.sent[0].projectId, project);
  socket.frame({ type: 'snapshot', snapshot: snapshot(), resync: false });
  socket.frame({ type: 'presence', projectId: project, members: [{ userId: 'member', name: 'Member', role: 'developer', connections: 1, lastSeenAt: new Date().toISOString() }] });
  assert.equal(states.at(-1).presence.length, 1);
  socket.frame({ type: 'denied', code: 'forbidden', message: 'Project access revoked.' });
  assert.equal(states.at(-1).connection, 'denied'); assert.equal(states.at(-1).snapshot, null); assert.deepEqual(states.at(-1).presence, []);
  socket.frame({ type: 'snapshot', snapshot: snapshot('4'), resync: false }); assert.equal(states.at(-1).connection, 'denied');
}));
test('browser event replay is deduplicated and ACK follows authoritative HTTP projection', async () => observer(async (client, states, reads) => {
  client.connect(); const socket = FakeSocket.instances.at(-1); socket.open(); socket.frame({ type: 'snapshot', snapshot: snapshot('9007199254740992'), resync: false });
  const event = { type: 'events', projectId: project, cursor: '9007199254740993', events: [{ eventId: other, projectId: project, sequence: '9007199254740993', type: 'live.changed', entityId: other, occurredAt: new Date().toISOString() }] };
  socket.frame(event); socket.frame(event);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(states.at(-1).cursor, '9007199254740993'); assert.ok(reads() <= 2);
  const before = reads(); socket.frame(event); await new Promise(resolve => setImmediate(resolve)); assert.equal(reads(), before);
  assert.equal(socket.sent.at(-1).cursor, '9007199254740993');
}));
test('browser rejects cross-project frames and clears projections on malformed protocol data', async () => observer(async (client, states) => {
  client.connect(); const socket = FakeSocket.instances.at(-1); socket.open(); socket.frame({ type: 'snapshot', snapshot: snapshot(), resync: false });
  socket.frame({ type: 'snapshot', snapshot: { ...snapshot('3'), projectId: other }, resync: true }); assert.equal(states.at(-1).cursor, '0');
  socket.frame({ type: 'approval', command: 'forbidden' }); assert.equal(states.at(-1).connection, 'denied'); assert.equal(states.at(-1).snapshot, null);
}));
test('repeated short-lived browser sockets stop after eight reconnects; manual retry starts one new socket', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  await observer(async (client, states) => {
    client.connect();
    for (let attempt = 0; attempt <= 8; attempt++) { const socket = FakeSocket.instances.at(-1); socket.open(); socket.frame({ type: 'snapshot', snapshot: snapshot(), resync: false }); socket.close(); if (attempt < 8) t.mock.timers.tick(40000); }
    assert.equal(states.at(-1).connection, 'offline'); assert.equal(FakeSocket.instances.length, 9);
    t.mock.timers.tick(600000); assert.equal(FakeSocket.instances.length, 9);
    client.retry(); assert.equal(FakeSocket.instances.length, 10); assert.equal(states.at(-1).connection, 'connecting');
  });
});
test('an old in-flight snapshot cannot replace a new connection projection', async () => observer(async (client, states) => {
  let resolveSnapshot; globalThis.fetch = () => new Promise(resolve => { resolveSnapshot = resolve; });
  client.connect(); const old = FakeSocket.instances.at(-1); old.open(); old.frame({ type: 'snapshot', snapshot: snapshot('1'), resync: false });
  old.frame({ type: 'events', projectId: project, cursor: '2', events: [] });
  client.retry(); const current = FakeSocket.instances.at(-1); current.open(); current.frame({ type: 'snapshot', snapshot: snapshot('3'), resync: true });
  resolveSnapshot({ json: async () => ({ ok: true, kind: 'snapshot', snapshot: snapshot('2') }) }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(states.at(-1).cursor, '3'); assert.equal(states.at(-1).connection, 'online');
}));
test('HTTP projection ahead of WS delivery never ACKs an undelivered cursor', async () => observer(async (client, states) => {
  globalThis.fetch = async () => ({ json: async () => ({ ok: true, kind: 'snapshot', snapshot: snapshot('4') }) });
  client.connect(); const socket = FakeSocket.instances.at(-1); socket.open(); socket.frame({ type: 'snapshot', snapshot: snapshot('1'), resync: false });
  socket.frame({ type: 'events', projectId: project, cursor: '2', events: [] }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(states.at(-1).cursor, '4'); assert.equal(socket.sent.at(-1).cursor, '2');
  assert.equal(socket.sent.some(frame => frame.type === 'ack' && frame.cursor === '4'), false);
  socket.frame({ type: 'events', projectId: project, cursor: '3', events: [] }); assert.equal(socket.sent.at(-1).cursor, '3');
  socket.frame({ type: 'events', projectId: project, cursor: '4', events: [] }); assert.equal(socket.sent.at(-1).cursor, '4'); assert.equal(states.at(-1).connection, 'online');
  client.retry(); const next = FakeSocket.instances.at(-1); next.open(); assert.equal(next.sent.filter(frame => frame.type === 'ack').length, 0);
}));
test('browser denies event frames whose entities escape the project or exceed the delivered sequence', async () => observer(async (client, states) => {
  client.connect(); const socket = FakeSocket.instances.at(-1); socket.open(); socket.frame({ type: 'snapshot', snapshot: snapshot('1'), resync: false });
  socket.frame({ type: 'events', projectId: project, cursor: '2', events: [{ eventId: other, projectId: other, sequence: '2', type: 'live.changed', entityId: other, occurredAt: new Date().toISOString() }] });
  assert.equal(states.at(-1).connection, 'denied');
  client.retry(); const next = FakeSocket.instances.at(-1); next.open(); next.frame({ type: 'snapshot', snapshot: snapshot('1'), resync: false });
  next.frame({ type: 'events', projectId: project, cursor: '2', events: [{ eventId: other, projectId: project, sequence: '3', type: 'live.changed', entityId: other, occurredAt: new Date().toISOString() }] });
  assert.equal(states.at(-1).connection, 'denied'); assert.equal(states.at(-1).snapshot, null);
}));
