import assert from 'node:assert/strict';
import test from 'node:test';
import type { DatabaseBoundary } from '@nexus-ai/db';
import type { PulseRequest } from '@nexus-ai/contracts';
import { createPulseService } from './pulse.js';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const projectId = uuid(1); const actor = { id: 'me', email: 'private@example.test' };
const today = new Date('2026-10-17T00:00:00Z'); const tomorrow = new Date('2026-10-18T00:00:00Z');
const request: PulseRequest = { operation: 'snapshot', projectId, view: 'auto', scope: 'project', filter: 'all', before: null, limit: 30 };
type Task = { id: string; milestone_id: string; title: string; status: 'todo' | 'done' | 'review'; visibility: 'team' | 'client'; assignee_id: string; updated_at: Date };
type Milestone = { id: string; title: string; visibility: 'team' | 'client'; due_at: Date | null };

/** Controlled query boundary; the integration verifier exercises the same SQL on local PostgreSQL. */
function fixture() {
  let role: 'developer' | 'client' | 'viewer' | null = 'developer'; let workspaceOwner = false; let commitFailure = false;
  let tasks: Task[] = [
    { id: uuid(10), milestone_id: uuid(100), title: 'Public completed', status: 'done', visibility: 'client', assignee_id: 'me', updated_at: today },
    { id: uuid(11), milestone_id: uuid(100), title: 'Private pending', status: 'todo', visibility: 'team', assignee_id: 'me', updated_at: today },
    { id: uuid(12), milestone_id: uuid(100), title: 'Public review', status: 'review', visibility: 'client', assignee_id: 'other', updated_at: tomorrow },
    { id: uuid(13), milestone_id: uuid(101), title: 'Private review', status: 'review', visibility: 'team', assignee_id: 'other', updated_at: today },
  ];
  let milestones: Milestone[] = [
    { id: uuid(100), title: 'Public milestone', visibility: 'client', due_at: tomorrow },
    { id: uuid(101), title: 'Private milestone', visibility: 'team', due_at: null },
    { id: uuid(102), title: 'Empty public milestone', visibility: 'client', due_at: null },
  ];
  const events = [
    { entity_id: uuid(200), visibility: 'client', actor_id: 'me', occurred_at: today },
    { entity_id: uuid(200), visibility: 'client', actor_id: 'me', occurred_at: today },
    { entity_id: uuid(201), visibility: 'team', actor_id: 'other', occurred_at: today },
    { entity_id: uuid(202), visibility: 'client', actor_id: 'other', occurred_at: tomorrow },
  ];
  const queries: { sql: string; values: unknown[] }[] = []; const errors: unknown[] = [];
  const counts = (rows: Task[]) => ({ total: String(rows.length), completed: String(rows.filter(row => row.status === 'done').length),
    in_progress: String(rows.filter(row => row.status === 'review').length), planned: String(rows.filter(row => row.status === 'todo').length) });
  const database = { pool: { async connect() { return { async query(sql: string, values: unknown[] = []) {
    queries.push({ sql, values }); let rows: unknown[] = [];
    const visibleTasks = tasks.filter(row => values[1] || row.visibility === 'client');
    if (sql === 'COMMIT' && commitFailure) throw new Error('SQL secret diagnostic');
    if (sql.includes('wm.role AS workspace_role')) {
      if (values[0] === projectId && (role || workspaceOwner)) rows = [{ workspace_role: workspaceOwner ? 'owner' : 'member', project_role: role }];
    } else if (sql.startsWith('SELECT sequence::text FROM project_realtime_cursor')) rows = [{ sequence: '50' }];
    else if (sql.startsWith('SELECT sequence::text FROM overview_read_cursor')) rows = [{ sequence: '0' }];
    else if (sql.startsWith('WITH latest')) rows = events.filter(row => values[1] || row.visibility === 'client').slice(0, 1).map(row => ({ ...row,
      event_id: uuid(300), sequence: '3', kind: 'session.changed', author_name: 'QA colleague', title: 'Published excerpt', status: 'completed' }));
    else if (sql.includes("date_trunc('day'")) rows = [{ day_start: today, day_end: tomorrow }];
    else if (sql.includes('AS tasks_updated')) rows = [{ ...counts(visibleTasks), tasks_updated: String(visibleTasks.filter(row => row.updated_at >= today && row.updated_at < tomorrow && (values[4] || row.assignee_id === values[5])).length) }];
    else if (sql.startsWith('WITH visible_milestones')) rows = milestones.filter(row => values[1] || row.visibility === 'client').slice(0, 100)
      .map(row => ({ ...row, ...counts(visibleTasks.filter(task => task.milestone_id === row.id)) }));
    else if (sql.includes('FROM milestone WHERE')) rows = [{ count: String(milestones.filter(row => values[1] || row.visibility === 'client').length) }];
    else if (sql.includes('count(DISTINCT (e.kind')) rows = [{ count: String(new Set(events.filter(row => (values[1] || row.visibility === 'client') && row.occurred_at >= today && row.occurred_at < tomorrow && (values[4] || row.actor_id === values[5])).map(row => row.entity_id)).size) }];
    else if (sql.includes('FROM ai_session s JOIN')) rows = ['client', 'team'].filter(visibility => values[1] || visibility === 'client').map((visibility, index) => ({
      id: uuid(400 + index), project_id: projectId, title: `${visibility} published outcome`, status: 'completed', visibility,
      created_by: 'me', author_name: 'QA author', version: 1, message_count: 2, created_at: today, updated_at: today,
    }));
    else if (sql.includes('FROM task')) rows = visibleTasks.slice(0, 100);
    else if (sql.startsWith('SELECT count(*)')) rows = [{ count: '3' }];
    return { rows };
  }, release() {} }; } } } as unknown as DatabaseBoundary;
  return { service: createPulseService(database, error => errors.push(error)), queries, errors,
    role(value: typeof role) { role = value; }, owner() { workspaceOwner = true; }, failCommit() { commitFailure = true; },
    tasks(value: Task[]) { tasks = value; }, milestones(value: Milestone[]) { milestones = value; } };
}

test('Pulse composes one authorized transaction, UTC summary and completed excerpt metadata', async () => {
  const db = fixture(); const result = await db.service.execute(actor, request); assert.ok(result.ok);
  assert.equal(result.snapshot.audience, 'team'); assert.deepEqual(result.snapshot.progress, { total: 4, completed: 1, inProgress: 2, planned: 1, percent: 25, source: 'visible_tasks' });
  assert.equal(result.snapshot.milestoneCount, 3); assert.equal(result.snapshot.summary.tasksUpdated, 3); assert.equal(result.snapshot.summary.sharedUpdates, 2);
  assert.equal(result.snapshot.summary.dayStart, today.toISOString()); assert.equal(result.snapshot.summary.dayEnd, tomorrow.toISOString());
  assert.equal(result.snapshot.summary.commits, null); assert.equal(result.snapshot.summary.comments, null); assert.equal(result.snapshot.summary.buildsDeploys, null);
  assert.equal(result.snapshot.outcomes.length, 2); assert.equal(result.snapshot.outcomes[0]?.messageCount, 2);
  assert.equal(JSON.stringify(result).includes(actor.email), false); assert.equal(JSON.stringify(result).includes('messages'), false);
  assert.deepEqual(db.queries.filter(row => ['BEGIN', 'COMMIT', 'ROLLBACK'].includes(row.sql)).map(row => row.sql), ['BEGIN', 'COMMIT']);
  assert.match(db.queries[1]!.sql, /FOR UPDATE OF w/); assert.match(db.queries[2]!.sql, /FOR UPDATE/);
});

test('client and viewer cannot elevate; technical preview filters milestones, denominators, overview and outcomes', async () => {
  for (const role of ['client', 'viewer', 'developer'] as const) {
    const db = fixture(); db.role(role);
    const result = await db.service.execute(actor, { ...request, view: role === 'developer' ? 'client' : 'auto' }); assert.ok(result.ok);
    assert.equal(result.snapshot.audience, 'client'); assert.equal(result.snapshot.progress.total, 2); assert.equal(result.snapshot.progress.percent, 50);
    assert.equal(result.snapshot.milestoneCount, 2); assert.equal(result.snapshot.milestones[0]?.progress.total, 2);
    assert.equal(result.snapshot.milestones[1]?.progress.percent, null); assert.equal(result.snapshot.milestones[1]?.state, 'planned');
    assert.equal(result.snapshot.summary.tasksUpdated, 1); assert.equal(result.snapshot.summary.sharedUpdates, 1);
    assert.equal(result.snapshot.overview.tasks.length, 2); assert.equal(result.snapshot.outcomes.length, 1);
    for (const secret of ['Private', 'team published outcome', uuid(101), uuid(11), uuid(13)]) assert.equal(JSON.stringify(result).includes(secret), false);
  }
  const owner = fixture(); owner.role(null); owner.owner(); const allowed = await owner.service.execute(actor, request); assert.ok(allowed.ok); assert.equal(allowed.snapshot.audience, 'team');
});

test('mine counts UTC task records assigned to actor and retained shared entities authored by actor, independent of feed filter', async () => {
  const db = fixture(); const result = await db.service.execute(actor, { ...request, scope: 'mine', filter: 'files', before: '9999999999999999999' }); assert.ok(result.ok);
  assert.equal(result.snapshot.summary.tasksUpdated, 2); assert.equal(result.snapshot.summary.sharedUpdates, 1);
  assert.equal(result.snapshot.progress.total, 4); assert.equal(result.snapshot.overview.activity.length, 0);
  const query = db.queries.find(row => row.sql.includes('AS tasks_updated'))!; assert.equal(query.values[4], false); assert.equal(query.values[5], actor.id);
  assert.match(query.sql, /updated_at >= \$3 AND updated_at < \$4/);
  assert.equal(db.queries.some(row => row.values.includes('9999999999999999999')), false);
});

test('global progress and milestone totals cover all visible rows beyond bounded overview and milestone arrays', async () => {
  const db = fixture(); db.tasks(Array.from({ length: 105 }, (_, index) => ({ id: uuid(1000 + index), milestone_id: uuid(100), title: 'Visible task', status: 'done', visibility: 'client', assignee_id: 'me', updated_at: today })));
  db.milestones(Array.from({ length: 103 }, (_, index) => ({ id: uuid(100 + index), title: 'Visible milestone', visibility: 'client', due_at: null })));
  const result = await db.service.execute(actor, request); assert.ok(result.ok);
  assert.equal(result.snapshot.overview.tasks.length, 100); assert.equal(result.snapshot.progress.total, 105); assert.equal(result.snapshot.progress.percent, 100);
  assert.equal(result.snapshot.milestoneCount, 103); assert.equal(result.snapshot.milestones.length, 100); assert.equal(result.snapshot.milestones[0]?.state, 'completed');
  const aggregate = db.queries.find(row => row.sql.includes('AS tasks_updated'))!; assert.equal(aggregate.sql.includes('LIMIT'), false);
});

test('empty task scope yields null percentage and no invented activity; membership and project changes deny every snapshot', async () => {
  const db = fixture(); db.tasks([]); const empty = await db.service.execute(actor, request); assert.ok(empty.ok); assert.equal(empty.snapshot.progress.percent, null);
  assert.equal(empty.snapshot.summary.tasksUpdated, 0); assert.equal(empty.snapshot.milestones[0]?.state, 'planned');
  db.role(null); const denied = await db.service.execute(actor, request); assert.ok(!denied.ok && denied.code === 'forbidden'); assert.equal(db.queries.at(-1)?.sql, 'ROLLBACK');
  db.role('developer'); const foreign = await db.service.execute(actor, { ...request, projectId: uuid(999) }); assert.ok(!foreign.ok && foreign.code === 'forbidden');
});

test('invalid input never reaches DB; commit failure rolls back and redacts diagnostics', async () => {
  const db = fixture(); const invalid = await db.service.execute(actor, { ...request, limit: 0 }); assert.ok(!invalid.ok && invalid.code === 'invalid_request'); assert.equal(db.queries.length, 0);
  db.failCommit(); const failed = await db.service.execute(actor, request); assert.ok(!failed.ok && failed.code === 'unavailable');
  assert.equal(db.errors.length, 1); assert.equal(db.queries.at(-1)?.sql, 'ROLLBACK'); assert.equal(JSON.stringify(failed).includes('SQL'), false);
});
