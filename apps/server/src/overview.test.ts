import assert from 'node:assert/strict';
import test from 'node:test';
import type { DatabaseBoundary } from '@nexus-ai/db';
import { createOverviewService } from './overview.js';

const projectId = 'c588dc20-9f17-4f13-9354-8b7ed43be890';
const otherProject = 'c588dc20-9f17-4f13-9354-8b7ed43be891';
const actor = { id: 'me', email: 'private@example.test' };
const date = new Date('2026-10-17T12:00:00Z');
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const snapshot = { operation: 'snapshot' as const, projectId, filter: 'all' as const, before: null, limit: 30 };
type EventRow = { event_id: string; sequence: string; kind: 'session.changed' | 'live.changed'; entity_id: string; actor_id: string; author_name: string; title: string; visibility: 'team' | 'client'; status: string; occurred_at: Date };
const event = (n: number, entity = n, author = 'other', visibility: EventRow['visibility'] = 'client'): EventRow => ({
  event_id: uuid(n), sequence: String(n), kind: 'live.changed', entity_id: uuid(entity), actor_id: author,
  author_name: 'Actual colleague', title: `Selected excerpt ${entity}`, visibility, status: 'active', occurred_at: date,
});

/** Bounded projection fixture; the coordinator also exercises the SQL against PostgreSQL. */
function fixture() {
  let role: 'owner' | 'developer' | 'client' | 'viewer' | null = 'developer';
  let workspaceOwner = false;
  let failCommit = false;
  let high = '50';
  let read = '0';
  let rows: EventRow[] = [];
  const queries: { sql: string; values: unknown[] }[] = [];
  const errors: unknown[] = [];
  const database = { pool: { async connect() {
    const previousRead = read;
    return { async query(sql: string, values: unknown[] = []) {
      queries.push({ sql, values });
      if (sql.startsWith('WITH work_targets')) return { rows: [] };
      let result: unknown[] = [];
      if (sql === 'COMMIT' && failCommit) throw new Error('SQL password should remain private');
      if (sql === 'ROLLBACK') read = previousRead;
      else if (sql.includes('wm.role AS workspace_role')) {
        if (values[0] === projectId && (role || workspaceOwner)) result = [{ workspace_role: workspaceOwner ? 'owner' : 'member', project_role: role }];
      } else if (sql.startsWith('SELECT sequence::text FROM project_realtime_cursor')) result = [{ sequence: high }];
      else if (sql.startsWith('SELECT sequence::text FROM overview_read_cursor')) result = [{ sequence: read }];
      else if (sql.startsWith('INSERT INTO overview_read_cursor')) { read = String(BigInt(read) > BigInt(String(values[2])) ? read : values[2]); result = [{ sequence: read }]; }
      else if (sql.startsWith('WITH latest')) {
        const latest = new Map<string, EventRow>();
        for (const row of rows) {
          const key = `${row.kind}:${row.entity_id}`;
          if (BigInt(latest.get(key)?.sequence ?? '0') < BigInt(row.sequence)) latest.set(key, row);
        }
        result = [...latest.values()].filter(row => values[1] || row.visibility === 'client')
          .sort((a, b) => BigInt(a.sequence) > BigInt(b.sequence) ? -1 : 1);
      } else if (sql.includes('FROM task')) result = [{ id: uuid(500), title: 'Current authorized task', status: 'review', visibility: 'client' }];
      else if (sql.includes('FROM live_share s JOIN')) result = rows.filter(row => row.status === 'active' && (values[1] || row.visibility === 'client'))
        .slice(0, 100).map(row => ({ id: row.entity_id, project_id: projectId, title: row.title, visibility: row.visibility, status: 'active', author_id: row.actor_id, author_name: row.author_name, updated_at: date }));
      else if (sql.startsWith('SELECT count(*)')) result = [{ count: '3' }];
      return { rows: result };
    }, release() {} };
  } } } as unknown as DatabaseBoundary;
  return { service: createOverviewService(database, error => errors.push(error)), queries, errors,
    events(value: EventRow[]) { rows = value; }, role(value: typeof role) { role = value; }, owner() { workspaceOwner = true; },
    high(value: string) { high = value; }, read: () => read, failCommit() { failCommit = true; } };
}

test('overview coalesces entities before paging and notifications ignore feed filter, pagination and own actions', async () => {
  const db = fixture(); db.events([event(1, 1), event(2, 1), event(3, 3, 'me'), event(4, 4), event(5, 5)]);
  const first = await db.service.execute(actor, { ...snapshot, limit: 2 });
  assert.ok(first.ok && first.kind === 'overview');
  assert.deepEqual(first.snapshot.activity.map(row => row.sequence), ['5', '4']); assert.equal(first.snapshot.nextBefore, '4');
  assert.deepEqual(first.snapshot.notifications.map(row => row.sequence), ['5', '4', '2']); assert.equal(first.snapshot.unreadCount, 3);
  const next = await db.service.execute(actor, { ...snapshot, before: '4', limit: 2 });
  assert.ok(next.ok && next.kind === 'overview'); assert.deepEqual(next.snapshot.activity.map(row => row.sequence), ['3', '2']);
  assert.equal(next.snapshot.nextBefore, null); assert.equal(next.snapshot.unreadCount, 3);
  const empty = await db.service.execute(actor, { ...snapshot, filter: 'commits', before: '1' });
  assert.ok(empty.ok && empty.kind === 'overview'); assert.deepEqual(empty.snapshot.activity, []); assert.equal(empty.snapshot.notifications.length, 3);
  assert.equal(empty.snapshot.tasks[0]?.status, 'review'); assert.equal(empty.snapshot.memberCount, 3);
  assert.equal(db.queries.at(-1)?.sql, 'COMMIT');
});

test('current membership and visibility apply before projection, counts and notifications; workspace owner remains authorized', async () => {
  const db = fixture(); db.events([event(1), event(2, 2, 'other', 'team')]); db.role('client');
  const allowed = await db.service.execute(actor, snapshot); assert.ok(allowed.ok && allowed.kind === 'overview');
  assert.equal(allowed.snapshot.activity.length, 1); assert.equal(allowed.snapshot.unreadCount, 1); assert.equal(allowed.snapshot.activeShares.length, 1);
  for (const secret of [uuid(2), actor.email, 'device_id', 'messages']) assert.equal(JSON.stringify(allowed).includes(secret), false);
  db.role('viewer'); const viewer = await db.service.execute(actor, snapshot); assert.ok(viewer.ok && viewer.kind === 'overview'); assert.equal(viewer.snapshot.activity.length, 1);
  db.role(null);
  for (const input of [snapshot, { operation: 'markRead' as const, projectId, through: '1' }, { ...snapshot, projectId: otherProject }]) {
    const denied = await db.service.execute(actor, input); assert.ok(!denied.ok && denied.code === 'forbidden');
  }
  db.owner(); const owner = await db.service.execute(actor, snapshot); assert.ok(owner.ok && owner.kind === 'overview'); assert.equal(owner.snapshot.activity.length, 2);
});

test('markRead is monotonic, cannot consume future events and a later update becomes unread again', async () => {
  const db = fixture(); db.events([event(1, 1), event(4, 4)]);
  const read = await db.service.execute(actor, { operation: 'markRead', projectId, through: '4' });
  assert.ok(read.ok && read.kind === 'read'); assert.equal(read.unreadCount, 0); assert.equal(read.readThrough, '4');
  const older = await db.service.execute(actor, { operation: 'markRead', projectId, through: '2' });
  assert.ok(older.ok && older.kind === 'read'); assert.equal(older.readThrough, '4');
  const future = await db.service.execute(actor, { operation: 'markRead', projectId, through: '9999999999999999999' });
  assert.ok(!future.ok && future.code === 'invalid_request'); assert.equal(db.read(), '4');
  db.events([event(1, 1), event(4, 4), event(6, 1)]);
  const newer = await db.service.execute(actor, snapshot); assert.ok(newer.ok && newer.kind === 'overview'); assert.equal(newer.snapshot.unreadCount, 1);
  const huge = await db.service.execute(actor, { ...snapshot, before: '9999999999999999999' }); assert.ok(huge.ok);
  const cursorQueries = db.queries.filter(query => query.sql.includes('$3::bigint'));
  assert.equal(cursorQueries.some(query => query.values.includes('9999999999999999999')), false);
});

test('notification page is capped while unread count covers all current retained entities', async () => {
  const db = fixture(); db.events(Array.from({ length: 45 }, (_, index) => event(index + 1)));
  const result = await db.service.execute(actor, { ...snapshot, limit: 1, filter: 'files' });
  assert.ok(result.ok && result.kind === 'overview');
  assert.equal(result.snapshot.activity.length, 0); assert.equal(result.snapshot.notifications.length, 30); assert.equal(result.snapshot.unreadCount, 45);
  const read = await db.service.execute(actor, { operation: 'markRead', projectId, through: '40' });
  assert.ok(read.ok && read.kind === 'read'); assert.equal(read.unreadCount, 5);
});

test('SQL selects metadata only, bounds authorized rows and locks containers before projection', async () => {
  const db = fixture(); await db.service.execute(actor, snapshot);
  assert.ok(db.queries[1]?.sql.includes('FOR UPDATE OF w')); assert.ok(db.queries[2]?.sql.includes('FOR UPDATE'));
  const query = db.queries.find(item => item.sql.startsWith('WITH latest'))!;
  assert.ok(query.sql.includes('DISTINCT ON (kind, entity_id)')); assert.ok(query.sql.includes("COALESCE(s.visibility, l.visibility) = 'client'"));
  assert.ok(query.sql.includes('LIMIT 1000')); assert.equal(query.sql.includes('messages'), false); assert.equal(query.sql.includes('email'), false);
  assert.deepEqual(query.values, [projectId, true]);
});

test('validation rejects invalid input and failed commit rolls back read state without exposing SQL details', async () => {
  const db = fixture();
  const invalid = await db.service.execute(actor, { ...snapshot, limit: 0 }); assert.ok(!invalid.ok && invalid.code === 'invalid_request'); assert.equal(db.queries.length, 0);
  db.failCommit();
  const failed = await db.service.execute(actor, { operation: 'markRead', projectId, through: '20' });
  assert.ok(!failed.ok && failed.code === 'unavailable'); assert.equal(db.read(), '0'); assert.equal(db.errors.length, 1);
  assert.equal(JSON.stringify(failed).includes('SQL'), false); assert.equal(db.queries.at(-1)?.sql, 'ROLLBACK');
});
