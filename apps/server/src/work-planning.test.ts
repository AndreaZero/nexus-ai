import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorkRequest } from '@nexus-ai/contracts';
import { workResponseSchema } from '@nexus-ai/contracts';
import { executePlanning } from './work-planning.js';
import { WorkError, type WorkAccess, type WorkDb } from './work-common.js';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const projectId = uuid(1); const taskId = uuid(2); const milestoneId = uuid(3); const now = new Date('2026-10-17T12:00:00Z');
const access: WorkAccess = { projectId, actor: { id: 'developer', email: 'qa@example.test' }, role: 'developer', team: true };
const list = (kind: 'task' | 'milestone' | 'comment'): WorkRequest => ({ operation: 'list', projectId, view: 'auto', kind, offset: 0, limit: 1, targetId: null, targetKind: null });
const read = (kind: 'task' | 'milestone' | 'comment', id: string): WorkRequest => ({ operation: 'read', projectId, view: 'auto', kind, id, revision: null });
const saveTask: WorkRequest = { operation: 'saveTask', projectId, requestId: uuid(10), id: null, expectedVersion: 0, title: 'Task',
  body: '<script>plain text</script>', visibility: 'client', status: 'todo', assigneeId: null, milestoneId: null, sourceSessionId: null };

/** Controlled DB boundary; the coordinator's verifier also executes this SQL against PostgreSQL. */
function fixture() {
  const calls: { sql: string; values: unknown[] }[] = [];
  let target: { id: string; title: string; visibility: 'client' | 'team'; version: number } | null = { id: taskId, title: 'Task', visibility: 'client', version: 2 };
  let member = true; let cas = true; let total = '101'; let counts = { total: '105', completed: '42', in_progress: '31', planned: '32' };
  const row = { id: taskId, project_id: projectId, title: 'Task', body: 'Full body', visibility: 'client', version: 2,
    created_by: 'developer', author_name: 'Developer', created_at: now, updated_at: now, assignee_id: null, milestone_id: null,
    source_session_id: null, status: 'review', due_at: null, target_kind: 'task', target_id: taskId };
  const db = { async query(sql: string, values: unknown[] = []) {
    calls.push({ sql, values });
    if (sql.startsWith('SELECT count(*)::text AS total')) return { rows: [{ total }] };
    if (sql.includes('FROM task t JOIN')) return { rows: values[0] === projectId && (values[3] === null || values[3] === taskId)
      ? [{ ...row, body: values[2] ? row.body : '' }] : [] };
    if (sql.includes('FROM milestone m JOIN')) return { rows: [{ ...row, id: milestoneId, ...counts, body: values[2] ? row.body : '' }] };
    if (sql.startsWith('SELECT u.id FROM')) return { rows: member ? [{ id: 'assignee' }] : [] };
    if (sql.startsWith('UPDATE task SET title') || sql.startsWith('UPDATE milestone SET title')) return { rows: cas ? [{ version: 3 }] : [] };
    if (sql.startsWith('DELETE FROM')) return { rows: cas ? [{ id: taskId }] : [] };
    if (sql.includes('FROM work_comment c JOIN')) return { rows: [{ ...row, body: sql.includes("'' AS body") ? '' : row.body }] };
    if (sql.startsWith('SELECT') && (sql.includes('FROM task') || sql.includes('FROM milestone'))) return { rows: target ? [target] : [] };
    // Event append queries only use their row count/cursor; no private payload enters the controlled event.
    if (sql.includes('RETURNING sequence')) return { rows: [{ sequence: '1' }] };
    return { rows: [] };
  } } as unknown as WorkDb;
  return { db, calls, target(value: typeof target) { target = value; }, member(value: boolean) { member = value; }, cas(value: boolean) { cas = value; },
    total(value: string) { total = value; }, counts(value: typeof counts) { counts = value; } };
}

async function denied(run: () => Promise<unknown>, code: string) {
  await assert.rejects(run, (error: unknown) => error instanceof WorkError && error.code === code);
}

test('planning lists omit bodies, count before page limits, and bind project/audience without transactions', async () => {
  const f = fixture(); const result = await executePlanning(f.db, { ...access, team: false, role: 'client' }, list('task'));
  assert.ok(result?.ok && result.kind === 'list'); workResponseSchema.parse(result);
  assert.equal(result.items[0]?.body, ''); assert.equal(result.total, 101); assert.equal(result.nextOffset, 1);
  assert.deepEqual(f.calls[0]?.values, [projectId, false]);
  const sql = f.calls.find(call => call.sql.includes('FROM task t JOIN'))!;
  assert.deepEqual(sql.values, [projectId, false, false, null, 1, 0]);
  assert.match(sql.sql, /m.project_id = t.project_id/); assert.match(sql.sql, /s.project_id = t.project_id/);
  assert.match(sql.sql, /m.visibility = 'client'/); assert.match(sql.sql, /s.visibility = 'client'/);
  assert.equal(f.calls.some(call => /^(BEGIN|COMMIT|ROLLBACK)$/.test(call.sql)), false);
});

test('milestone progress includes all visible tasks before pagination and empty progress stays unknown', async () => {
  const f = fixture(); const result = await executePlanning(f.db, { ...access, team: false }, list('milestone'));
  assert.ok(result?.ok && result.kind === 'list'); assert.deepEqual(result.items[0]?.progress,
    { total: 105, completed: 42, inProgress: 31, planned: 32, percent: 40, source: 'visible_tasks' });
  const aggregate = f.calls.find(call => call.sql.includes('LEFT JOIN LATERAL'))!;
  assert.match(aggregate.sql, /t.project_id = m.project_id/); assert.match(aggregate.sql, /t.visibility = 'client'/);
  assert.equal(aggregate.sql.indexOf('count(*)') < aggregate.sql.indexOf('LIMIT'), true);
  f.counts({ total: '0', completed: '0', in_progress: '0', planned: '0' });
  const empty = await executePlanning(f.db, access, read('milestone', milestoneId));
  assert.ok(empty?.ok && empty.kind === 'item'); assert.equal(empty.item.progress?.percent, null);
});

test('read has full text but rejects foreign identifiers and invented historical revisions', async () => {
  const f = fixture(); const result = await executePlanning(f.db, access, read('task', taskId));
  assert.ok(result?.ok && result.kind === 'item'); assert.equal(result.item.body, 'Full body');
  await denied(() => executePlanning(f.db, access, read('task', uuid(99))), 'not_found');
  await denied(() => executePlanning(f.db, access, { ...read('task', taskId), revision: 1 } as WorkRequest), 'not_found');
});

test('technical writes deny clients/viewers, reject inconsistent versions and nonmember assignees', async () => {
  for (const role of ['client', 'viewer'] as const) {
    const f = fixture(); await denied(() => executePlanning(f.db, { ...access, role, team: false }, saveTask), 'forbidden'); assert.equal(f.calls.length, 0);
  }
  const f = fixture();
  await denied(() => executePlanning(f.db, access, { ...saveTask, expectedVersion: 1 } as WorkRequest), 'invalid_request');
  f.member(false);
  await denied(() => executePlanning(f.db, access, { ...saveTask, assigneeId: 'foreign-account' } as WorkRequest), 'invalid_request');
  assert.equal(f.calls.some(call => call.sql.startsWith('INSERT')), false);
  const assignment = f.calls.find(call => call.sql.startsWith('SELECT u.id FROM'))!;
  assert.match(assignment.sql, /wm.role = 'owner' OR pm.user_id IS NOT NULL/); assert.deepEqual(assignment.values, [projectId, 'foreign-account']);
});

test('task and milestone creation preserve plain text and record authorized author plus atomic invalidation', async () => {
  const f = fixture(); const task = await executePlanning(f.db, access, { ...saveTask, assigneeId: 'member' } as WorkRequest);
  assert.ok(task?.ok && task.kind === 'changed'); assert.equal(task.version, 1); workResponseSchema.parse(task);
  const insert = f.calls.find(call => call.sql.startsWith('INSERT INTO task'))!;
  assert.equal(insert.values[3], '<script>plain text</script>'); assert.equal(insert.values[4], access.actor.id);
  assert.equal(insert.values[5], 'member');
  assert.equal(f.calls.some(call => call.sql.startsWith('INSERT INTO work_change')), true);
  assert.equal(f.calls.some(call => call.sql.startsWith('INSERT INTO realtime_event')), true);
  const milestone = await executePlanning(f.db, access, { operation: 'saveMilestone', projectId, requestId: uuid(30),
    id: null, expectedVersion: 0, title: 'Release', body: 'Acceptance criteria', visibility: 'client', dueAt: now.toISOString() });
  assert.ok(milestone?.ok && milestone.kind === 'changed'); assert.equal(milestone.entityKind, 'milestone');
  assert.equal(f.calls.find(call => call.sql.startsWith('INSERT INTO milestone'))?.values[6], now.toISOString());
});

test('task edits are CAS and client publication refuses an internal or foreign milestone', async () => {
  const f = fixture(); f.target({ id: milestoneId, title: 'Internal milestone', visibility: 'team', version: 2 });
  await denied(() => executePlanning(f.db, access, { ...saveTask, milestoneId } as WorkRequest), 'invalid_request');
  f.target(null); await denied(() => executePlanning(f.db, access, { ...saveTask, milestoneId } as WorkRequest), 'invalid_request');
  f.target({ id: taskId, title: 'Task', visibility: 'client', version: 2 });
  await denied(() => executePlanning(f.db, access, { ...saveTask, id: taskId, expectedVersion: 1 } as WorkRequest), 'conflict');
  f.cas(false); await denied(() => executePlanning(f.db, access, { ...saveTask, id: taskId, expectedVersion: 2 } as WorkRequest), 'conflict');
  assert.equal(f.calls.some(call => call.sql.startsWith('INSERT INTO work_change')), false);
});

test('deleting a milestone detaches tasks and invalidates their editors before removing the parent', async () => {
  const f = fixture(); f.target({ id: milestoneId, title: 'Milestone', visibility: 'client', version: 2 });
  const result = await executePlanning(f.db, access, { operation: 'delete', projectId, requestId: uuid(22), kind: 'milestone', id: milestoneId, expectedVersion: 2 });
  assert.ok(result?.ok && result.kind === 'changed'); assert.equal(result.version, 3);
  const detach = f.calls.findIndex(call => call.sql.startsWith('UPDATE task SET milestone_id=NULL'));
  const remove = f.calls.findIndex(call => call.sql.startsWith('DELETE FROM milestone'));
  assert.ok(detach >= 0 && detach < remove); assert.match(f.calls[detach]!.sql, /version=version\+1/);
  assert.deepEqual(f.calls[remove]!.values, [projectId, milestoneId, 2]);
});

test('comments require an authorized current parent; viewer cannot post and narrowed/deleted parents hide children', async () => {
  const f = fixture();
  await denied(() => executePlanning(f.db, access, list('comment')), 'invalid_request');
  const command: WorkRequest = { operation: 'addComment', projectId, requestId: uuid(23), targetKind: 'task', targetId: taskId, body: 'Client comment' };
  await denied(() => executePlanning(f.db, { ...access, role: 'viewer', team: false }, command), 'forbidden');
  f.target(null);
  await denied(() => executePlanning(f.db, { ...access, role: 'client', team: false }, command), 'not_found');
  await denied(() => executePlanning(f.db, { ...access, role: 'client', team: false }, read('comment', uuid(24))), 'not_found');
  assert.equal(f.calls.some(call => call.sql.startsWith('INSERT')), false);
});

test('client comments inherit current parent audience and page without exposing full comment bodies', async () => {
  const f = fixture(); const client: WorkAccess = { ...access, role: 'client', team: false };
  const result = await executePlanning(f.db, client, { operation: 'addComment', projectId, requestId: uuid(31), targetKind: 'task', targetId: taskId, body: 'Ready for review' });
  assert.ok(result?.ok && result.kind === 'changed'); assert.equal(result.entityKind, 'comment');
  assert.deepEqual(f.calls.find(call => call.sql.startsWith('INSERT INTO work_comment'))?.values.slice(1),
    [projectId, 'task', taskId, 'Ready for review', access.actor.id]);
  const page = await executePlanning(f.db, client, { ...list('comment'), targetKind: 'task', targetId: taskId } as WorkRequest);
  assert.ok(page?.ok && page.kind === 'list'); assert.equal(page.items[0]?.body, ''); assert.equal(page.items[0]?.visibility, 'client');
  const detail = await executePlanning(f.db, client, read('comment', uuid(24)));
  assert.ok(detail?.ok && detail.kind === 'item'); assert.equal(detail.item.body, 'Full body');
  assert.equal(detail.item.targetId, taskId); workResponseSchema.parse(detail);
});

test('unowned operations pass through to the content/attachment service', async () => {
  const f = fixture(); assert.equal(await executePlanning(f.db, access, { ...list('task'), kind: 'document' } as WorkRequest), null);
  assert.equal(f.calls.length, 0);
});
