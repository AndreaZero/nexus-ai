import assert from 'node:assert/strict';
import test from 'node:test';
import type { DatabaseBoundary } from '@nexus-ai/db';
import type { LiveMessage, RealtimeApiRequest } from '@nexus-ai/contracts';
import { applyLiveUpdates, createRealtimeService } from './realtime.js';

const projectId = 'c588dc20-9f17-4f13-9354-8b7ed43be890';
const shareId = 'e2fbca14-d765-4707-8874-3aca6ef63317';
const batchId = 'e4b5536f-6d74-411d-a165-0aa7d62d9245';
const deviceId = '791efca9-7b30-4b4f-b9d9-2da1ba182de7';
const secondId = '21a22c8f-2729-48bd-953d-8d6057ea6663';
const actor = { id: 'account-a', email: 'never-shared@example.test' };
const date = new Date('2026-10-17T12:00:00Z');
const selected: LiveMessage[] = [{ id: 'm1', role: 'assistant', text: 'Chosen', status: 'streaming' }];
const start = (): Extract<RealtimeApiRequest, { operation: 'upload' }> => ({ operation: 'upload', projectId, batchId,
  change: { type: 'start', shareId, deviceId, title: 'Selected live excerpt', visibility: 'team', messages: selected } });
type Share = { id: string; project_id: string; author_id: string; device_id: string; title: string; visibility: string;
  messages: LiveMessage[]; status: string; updated_at: Date; author_name: string };
type Event = { event_id: string; sequence: string; kind: string; entity_id: string; occurred_at: Date; visible: boolean };

/** This query fixture tests transaction order/rollback; real PostgreSQL is verified by the task harness. */
function fixture() {
  let shareRows = new Map<string, Share>();
  let receipts = new Map<string, { author_id: string; share_id: string; payload_hash: string; sequence: string }>();
  let events: Event[] = [];
  let sequence = 0;
  let role: 'developer' | 'client' | null = 'developer';
  let failCommit = false;
  const statements: string[] = [];
  const database = { pool: { connect: async () => {
    const backup = structuredClone({ shareRows, receipts, events, sequence });
    return { async query(sql: string, values: unknown[] = []) {
      statements.push(sql);
      let rows: unknown[] = [];
      if (sql === 'COMMIT' && failCommit) throw new Error('SQL password deliberately private');
      if (sql === 'ROLLBACK') { shareRows = backup.shareRows; receipts = backup.receipts; events = backup.events; sequence = backup.sequence; }
      else if (sql.includes('wm.role AS workspace_role')) {
        if (values[0] === projectId && role) rows = [{ workspace_role: 'member', project_role: role, author_name: 'Person' }];
      } else if (sql.startsWith('SELECT author_id, share_id, payload_hash')) rows = receipts.has(String(values[1])) ? [receipts.get(String(values[1]))] : [];
      else if (sql.startsWith('INSERT INTO live_share')) {
        if (!shareRows.has(String(values[0]))) {
          shareRows.set(String(values[0]), { id: String(values[0]), project_id: String(values[1]), author_id: String(values[2]), device_id: String(values[3]),
            title: String(values[4]), visibility: String(values[5]), messages: JSON.parse(String(values[6])) as LiveMessage[], status: 'active', updated_at: date, author_name: 'Person' }); rows = [{ id: values[0] }];
        }
      } else if (sql.includes('FROM live_share s JOIN')) rows = [...shareRows.values()].filter(row => row.project_id === values[0]
        && (!sql.includes('s.id = $2') || row.id === values[1]) && (Boolean(values[sql.includes('s.id = $2') ? 2 : 1]) || row.visibility === 'client'));
      else if (sql.startsWith('UPDATE live_share')) {
        const row = shareRows.get(String(values[1])); if (row) shareRows.set(row.id, { ...row, messages: JSON.parse(String(values[2])) as LiveMessage[], status: String(values[3]) });
      } else if (sql.startsWith('INSERT INTO project_realtime_cursor')) rows = [{ sequence: String(++sequence) }];
      else if (sql.startsWith('SELECT sequence::text')) rows = [{ sequence: String(sequence) }];
      else if (sql.startsWith('INSERT INTO realtime_event')) events.push({ event_id: String(values[2]), sequence: String(values[1]), kind: String(values[3]), entity_id: String(values[4]), occurred_at: date, visible: true });
      else if (sql.startsWith('INSERT INTO realtime_upload')) receipts.set(String(values[1]), { author_id: String(values[2]), share_id: String(values[3]), payload_hash: String(values[4]), sequence: String(values[5]) });
      else if (sql.startsWith('SELECT min(sequence)')) rows = [{ first: events[0]?.sequence ?? null }];
      else if (sql.includes('FROM realtime_event e WHERE')) rows = events.filter(event => BigInt(event.sequence) > BigInt(String(values[1])))
        .slice(0, 100).map(event => ({ ...event, visible: values[2] || shareRows.get(event.entity_id)?.visibility === 'client' }));
      return { rows };
    }, release() {} };
  } } } as unknown as DatabaseBoundary;
  return { service: createRealtimeService(database), statements, shares: () => shareRows, events: () => events,
    role(value: typeof role) { role = value; }, failCommit() { failCommit = true; },
    retained(first: number, high: number) { sequence = high; events = [{ event_id: secondId, sequence: String(first), kind: 'live.changed', entity_id: shareId, occurred_at: date, visible: true }]; } };
}

test('live upload acknowledges after commit and exact retry does not append an event', async () => {
  const db = fixture();
  const first = await db.service.execute(actor, start());
  assert.ok(first.ok && first.kind === 'ack' && first.cursor === '1');
  assert.deepEqual(await db.service.execute(actor, start()), first);
  assert.equal(db.events().length, 1);
  assert.equal(db.statements.at(-1), 'COMMIT');
  const changed = start(); changed.change = { type: 'stop', shareId, deviceId };
  const conflict = await db.service.execute(actor, changed);
  assert.ok(!conflict.ok && conflict.code === 'conflict');
  assert.equal(db.events().length, 1);
  const failed = fixture(); failed.failCommit();
  const unavailable = await failed.service.execute(actor, start());
  assert.ok(!unavailable.ok && unavailable.code === 'unavailable');
  assert.equal(failed.shares().size, 0); assert.equal(failed.events().length, 0);
  assert.equal(JSON.stringify(unavailable).includes('SQL'), false);
});

test('offsets are exact and only selected streaming messages can extend or terminate', () => {
  const update = { messageId: 'm1', offset: 6, text: ' answer', status: 'complete' as const };
  const messages = applyLiveUpdates(selected, [update]);
  assert.equal(messages[0]?.text, 'Chosen answer'); assert.equal(selected[0]?.text, 'Chosen');
  for (const invalid of [{ ...update, offset: 5 }, { ...update, messageId: 'not-selected' }]) assert.throws(() => applyLiveUpdates(selected, [invalid]));
  assert.throws(() => applyLiveUpdates(messages, [{ messageId: 'm1', offset: 13, text: 'restart', status: 'streaming' }]));
  assert.throws(() => applyLiveUpdates([{ ...selected[0]!, text: 'x'.repeat(131072) }], [{ ...update, offset: 131072 }]));
});

test('author and device scope enforce append; stop is terminal and no new IDs are admitted', async () => {
  const db = fixture(); await db.service.execute(actor, start());
  const append: Extract<RealtimeApiRequest, { operation: 'upload' }> = { operation: 'upload', projectId, batchId: secondId,
    change: { type: 'append', shareId, deviceId, updates: [{ messageId: 'm1', offset: 6, text: '!', status: 'streaming' }] } };
  const other = await db.service.execute({ ...actor, id: 'other' }, append);
  assert.ok(!other.ok && other.code === 'forbidden');
  const wrongDevice = await db.service.execute(actor, { ...append, change: { type: 'append', shareId, deviceId: secondId, updates: [{ messageId: 'm1', offset: 6, text: '!', status: 'streaming' }] } });
  assert.ok(!wrongDevice.ok && wrongDevice.code === 'forbidden');
  assert.ok((await db.service.execute(actor, append)).ok);
  const stopped = await db.service.execute(actor, { ...append, batchId: 'a54da012-dafe-4fb6-9fac-e7d8e34be53c', change: { type: 'stop', shareId, deviceId } });
  assert.ok(stopped.ok);
  const resumed = await db.service.execute(actor, { ...append, batchId: 'b54da012-dafe-4fb6-9fac-e7d8e34be53c' });
  assert.ok(!resumed.ok && resumed.code === 'conflict');
  assert.equal(db.shares().get(shareId)?.messages[0]?.status, 'interrupted');
});

test('current membership and visibility gate snapshot, read, historical replay and even retries', async () => {
  const db = fixture(); await db.service.execute(actor, start());
  db.role('client');
  const snap = await db.service.execute(actor, { operation: 'snapshot', projectId });
  assert.ok(snap.ok && snap.kind === 'snapshot'); assert.equal(snap.snapshot.shares.length, 0);
  for (const field of [actor.email, deviceId, 'Chosen', shareId]) assert.equal(JSON.stringify(snap).includes(field), false);
  const detail = await db.service.execute(actor, { operation: 'readShare', projectId, shareId });
  assert.ok(!detail.ok && detail.code === 'not_found');
  const replay = await db.service.delivery(actor, projectId, '0');
  assert.equal(replay.frame.type, 'snapshot'); assert.equal(JSON.stringify(replay).includes(shareId), false);
  const retry = await db.service.execute(actor, start()); assert.ok(!retry.ok && retry.code === 'forbidden');
  db.role(null);
  const revoked = await db.service.execute(actor, { operation: 'snapshot', projectId }); assert.ok(!revoked.ok && revoked.code === 'forbidden');
  await assert.rejects(db.service.delivery(actor, projectId, '0'));
});

test('ordered replay contains metadata only; expired/future cursors receive coherent resync snapshots', async () => {
  const db = fixture(); await db.service.execute(actor, start());
  const replay = await db.service.delivery(actor, projectId, '0');
  assert.equal(replay.frame.type, 'events');
  if (replay.frame.type === 'events') { assert.equal(replay.frame.cursor, '1'); assert.equal(replay.frame.events[0]?.entityId, shareId); }
  for (const field of [deviceId, actor.email, 'Chosen', 'payload_hash', 'author_id']) assert.equal(JSON.stringify(replay.frame).includes(field), false);
  for (const previous of ['2', '1000']) {
    const future = await db.service.delivery(actor, projectId, previous); assert.ok(future.frame.type === 'snapshot' && future.frame.resync);
  }
  db.retained(10, 1009);
  const expired = await db.service.delivery(actor, projectId, '1'); assert.ok(expired.frame.type === 'snapshot' && expired.frame.resync && expired.frame.snapshot.cursor === '1009');
});

test('unvalidated or oversized uploads are rejected before database work', async () => {
  const db = fixture();
  for (const input of [{ ...start(), token: 'private' }, { ...start(), change: { ...start().change, messages: [...selected, ...selected] } },
    { ...start(), change: { ...start().change, messages: [{ ...selected[0], text: '\u0000' }] } },
    { ...start(), change: { ...start().change, messages: [{ ...selected[0], text: '\uD800' }] } },
    { ...start(), change: { type: 'append', shareId, deviceId, updates: [{ messageId: 'm1', offset: 0, text: 'x'.repeat(16385), status: 'streaming' }] } }]) {
    const result = await db.service.execute(actor, input as RealtimeApiRequest); assert.ok(!result.ok && result.code === 'invalid_request');
  }
  assert.equal(db.statements.length, 0);
});
