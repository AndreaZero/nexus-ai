import assert from 'node:assert/strict';
import test from 'node:test';
import type { DatabaseBoundary } from '@nexus-ai/db';
import type { SessionsRequest, SharedMessage, SharedSession } from '@nexus-ai/contracts';
import { createSessionsService } from './sessions.js';

const workspaceId = '21a22c8f-2729-48bd-953d-8d6057ea6663';
const projectId = 'c588dc20-9f17-4f13-9354-8b7ed43be890';
const otherProject = '1feaee02-0125-4fba-bd34-375932c71876';
const sessionId = 'e2fbca14-d765-4707-8874-3aca6ef63317';
const secondSession = 'e4b5536f-6d74-411d-a165-0aa7d62d9245';
const deviceId = '791efca9-7b30-4b4f-b9d9-2da1ba182de7';
const actor = { id: 'account-a', email: 'a@example.test' };
const otherActor = { id: 'account-b', email: 'b@example.test' };
const now = new Date('2026-10-17T12:00:00.000Z');
type Stored = {
  id: string; project_id: string; created_by: string; driver_user_id: string; device_id: string;
  title: string; status: SharedSession['status']; visibility: SharedSession['visibility'];
  messages: SharedMessage[]; version: number; created_at: Date; updated_at: Date;
};
type Membership = { workspace: 'owner' | 'member' | null; project: 'owner' | 'developer' | 'client' | 'viewer' | null };
function stored(overrides: Partial<Stored> = {}): Stored {
  return { id: sessionId, project_id: projectId, created_by: actor.id, driver_user_id: actor.id, device_id: deviceId,
    title: 'Selected excerpt', status: 'completed', visibility: 'team',
    messages: [{ id: 'user-1', role: 'user', text: 'Selected question' }], version: 1, created_at: now, updated_at: now, ...overrides };
}
const publication = (overrides: Partial<Extract<SessionsRequest, { operation: 'publish' }>> = {}): Extract<SessionsRequest, { operation: 'publish' }> => ({
  operation: 'publish', projectId, sessionId, expectedVersion: 0, deviceId,
  title: 'Selected excerpt', status: 'completed', visibility: 'team', messages: [{ id: 'user-1', role: 'user', text: 'Selected question' }], ...overrides,
});

/** In-memory query boundary models container serialization, CAS, and transaction rollback. */
function fakeDatabase(options: { membership?: Membership; rows?: Stored[]; failAudit?: boolean } = {}) {
  const membership = options.membership ?? { workspace: 'member', project: 'developer' };
  let records = new Map((options.rows ?? []).map(row => [row.id, structuredClone(row)]));
  let events: Record<string, unknown>[] = [];
  const statements: { sql: string; values: readonly unknown[] }[] = [];
  let queue = Promise.resolve();
  let released = 0;
  const boundary = {
    pool: { connect: async () => {
      let unlock: (() => void) | undefined;
      let before: Map<string, Stored> | undefined;
      let beforeEvents = 0;
      return {
        async query(sql: string, values: readonly unknown[] = []) {
          statements.push({ sql, values });
          let rows: unknown[] = [];
          if (sql.includes('FOR UPDATE OF w')) {
            const previous = queue;
            queue = new Promise<void>(resolve => { unlock = resolve; });
            await previous;
            before = structuredClone(records);
            beforeEvents = events.length;
          } else if (sql === 'COMMIT' || sql === 'ROLLBACK') {
            if (sql === 'ROLLBACK' && before) { records = before; events = events.slice(0, beforeEvents); }
            unlock?.();
            unlock = undefined;
          } else if (sql.includes('wm.role AS workspace_role')) {
            if (values[0] === projectId && membership.workspace && (membership.workspace === 'owner' || membership.project)) {
              rows = [{ workspace_id: workspaceId, workspace_role: membership.workspace, project_role: membership.project }];
            }
          } else if (sql.includes('FROM ai_session s')) {
            rows = [...records.values()].filter(row => row.project_id === values[0]
              && (!sql.includes('s.id = $2') || row.id === values[1])
              && (!sql.includes("s.visibility = 'client'") || values[sql.includes('s.id = $2') ? 2 : 1] || row.visibility === 'client'))
              .slice(0, 100).map(row => ({ ...structuredClone(row), author_name: 'Author', message_count: row.messages.length }));
          } else if (sql.startsWith('INSERT INTO ai_session')) {
            const id = String(values[0]);
            if (!records.has(id)) {
              records.set(id, stored({ id, project_id: String(values[1]), created_by: String(values[2]), driver_user_id: String(values[2]),
                device_id: String(values[3]), title: String(values[4]), status: values[5] as Stored['status'], visibility: values[6] as Stored['visibility'],
                messages: JSON.parse(String(values[7])) as SharedMessage[] }));
              rows = [{ id }];
            }
          } else if (sql.startsWith('UPDATE ai_session')) {
            const current = records.get(String(values[0]));
            if (current && current.project_id === values[1] && current.version === values[6]) {
              records.set(current.id, { ...current, title: String(values[2]), status: values[3] as Stored['status'], visibility: values[4] as Stored['visibility'],
                messages: JSON.parse(String(values[5])) as SharedMessage[], version: current.version + 1 });
              rows = [{ id: current.id }];
            }
          } else if (sql.startsWith('INSERT INTO collaboration_event')) {
            if (options.failAudit) throw new Error('SQL secret SELECT question with DATABASE_URL password');
            events.push(JSON.parse(String(values[4])) as Record<string, unknown>);
          } else if (sql.includes('FROM task')) {
            rows = [{ id: sessionId, title: 'Team task', visibility: 'team', status: 'todo' },
              { id: secondSession, title: 'Client task', visibility: 'client', status: 'done' }]
              .filter(row => values[1] || row.visibility === 'client');
          }
          return { rows };
        },
        release() { released += 1; unlock?.(); },
      };
    } },
  } as unknown as DatabaseBoundary;
  return { boundary, statements, records: () => records, events: () => events, released: () => released };
}

test('workspace membership alone and wrong project cannot reveal session metadata or bodies', async () => {
  for (const membership of [{ workspace: 'member', project: null }, { workspace: null, project: 'developer' }] as Membership[]) {
    const db = fakeDatabase({ membership, rows: [stored()] });
    const response = await createSessionsService(db.boundary).execute(actor, { operation: 'read', projectId, sessionId });
    assert.ok(!response.ok && response.code === 'not_found');
    assert.equal(JSON.stringify(response).includes('Selected'), false);
    assert.equal(db.statements.some(({ sql }) => sql.includes('FROM ai_session')), false);
  }
  const db = fakeDatabase({ rows: [stored({ project_id: otherProject })] });
  const response = await createSessionsService(db.boundary).execute(actor, { operation: 'read', projectId, sessionId });
  assert.ok(!response.ok && response.code === 'not_found');
});

test('client and viewer can list/read only client excerpts; task audience follows the same boundary', async () => {
  for (const role of ['client', 'viewer'] as const) {
    const db = fakeDatabase({ membership: { workspace: 'member', project: role }, rows: [stored(), stored({ id: secondSession, visibility: 'client' })] });
    const service = createSessionsService(db.boundary);
    const listed = await service.execute(actor, { operation: 'list', projectId });
    assert.ok(listed.ok && listed.kind === 'sessions');
    assert.deepEqual(listed.items.map(item => item.id), [secondSession]);
    const hidden = await service.execute(actor, { operation: 'read', projectId, sessionId });
    assert.ok(!hidden.ok && hidden.code === 'not_found');
    const visible = await service.execute(actor, { operation: 'read', projectId, sessionId: secondSession });
    assert.ok(visible.ok && visible.kind === 'session');
    const tasks = await service.execute(actor, { operation: 'listProjectTasks', projectId });
    assert.ok(tasks.ok && tasks.kind === 'tasks');
    assert.deepEqual(tasks.items.map(item => item.title), ['Client task']);
    const denied = await service.execute(actor, publication({ sessionId: secondSession }));
    assert.ok(!denied.ok && denied.code === 'forbidden');
    assert.equal(db.events().length, 0);
  }
});

test('workspace owner is effective project owner and developer sees team+client without private fields', async () => {
  for (const membership of [{ workspace: 'owner', project: null }, { workspace: 'member', project: 'developer' }] as Membership[]) {
    const db = fakeDatabase({ membership, rows: [stored(), stored({ id: secondSession, visibility: 'client' })] });
    const result = await createSessionsService(db.boundary).execute(actor, { operation: 'list', projectId });
    assert.ok(result.ok && result.kind === 'sessions');
    assert.equal(result.items.length, 2);
    const raw = JSON.stringify(result);
    for (const privateValue of ['Selected question', deviceId, actor.email, 'driver_user_id', 'messages']) assert.equal(raw.includes(privateValue), false);
    assert.deepEqual(result.items[0]?.author, { id: actor.id, name: 'Author' });
    assert.equal(db.statements.some(({ sql }) => sql.includes('LIMIT 100')), true);
    assert.equal(db.statements.filter(({ sql }) => sql.includes('FROM ai_session')).every(({ sql }) => !sql.includes('s.messages FROM')), true);
  }
});

test('publication persists only selected messages; audit has no transcript, title or device and is atomic', async () => {
  const db = fakeDatabase();
  const result = await createSessionsService(db.boundary).execute(actor, publication());
  assert.ok(result.ok && result.kind === 'session');
  assert.equal(result.item.version, 1);
  assert.deepEqual(result.messages, publication().messages);
  assert.deepEqual(db.events(), [{ sessionId, version: 1, status: 'completed', visibility: 'team', messageCount: 1 }]);
  assert.equal(db.released(), 1);
  const workspaceLock = db.statements.findIndex(({ sql }) => sql.includes('FOR UPDATE OF w'));
  const projectLock = db.statements.findIndex(({ sql }) => sql.includes('SELECT id FROM project'));
  const sessionLock = db.statements.findIndex(({ sql }) => sql.includes('FOR UPDATE OF s'));
  assert.ok(workspaceLock < projectLock && projectLock < sessionLock);
  const failed = fakeDatabase({ failAudit: true });
  const unavailable = await createSessionsService(failed.boundary).execute(actor, publication());
  assert.deepEqual(unavailable, { ok: false, code: 'unavailable', message: 'Operazione non disponibile. Riprova tra poco.' });
  assert.equal(failed.records().size, 0);
  assert.equal(failed.events().length, 0);
  assert.equal(failed.released(), 1);
});

test('replayed publication is idempotent; stale or changed creation cannot silently overwrite', async () => {
  const db = fakeDatabase();
  const service = createSessionsService(db.boundary);
  const first = await service.execute(actor, publication());
  const retry = await service.execute(actor, publication());
  assert.deepEqual(retry, first);
  assert.equal(db.events().length, 1);
  const changed = await service.execute(actor, publication({ title: 'Changed without version' }));
  assert.ok(!changed.ok && changed.code === 'conflict');
  const update = await service.execute(actor, publication({ expectedVersion: 1, title: 'Explicit update' }));
  assert.ok(update.ok && update.kind === 'session');
  assert.equal(update.item.version, 2);
  const updateRetry = await service.execute(actor, publication({ expectedVersion: 1, title: 'Explicit update' }));
  assert.deepEqual(updateRetry, update);
  const staleCreate = await service.execute(actor, publication({ title: 'Explicit update' }));
  assert.ok(!staleCreate.ok && staleCreate.code === 'conflict');
  assert.equal(db.events().length, 2);
});

test('concurrent different publications serialize and the losing expected version conflicts', async () => {
  const db = fakeDatabase({ rows: [stored()] });
  const service = createSessionsService(db.boundary);
  const responses = await Promise.all([
    service.execute(actor, publication({ expectedVersion: 1, title: 'First change' })),
    service.execute(actor, publication({ expectedVersion: 1, title: 'Second change' })),
  ]);
  assert.equal(responses.filter(result => result.ok).length, 1);
  assert.equal(responses.filter(result => !result.ok && result.code === 'conflict').length, 1);
  assert.equal(db.records().get(sessionId)?.version, 2);
  assert.equal(db.events().length, 1);
});

test('another author, driver, device or project cannot overwrite a publication', async () => {
  for (const overrides of [{ created_by: otherActor.id }, { driver_user_id: otherActor.id }, { device_id: secondSession }]) {
    const db = fakeDatabase({ rows: [stored(overrides)] });
    const response = await createSessionsService(db.boundary).execute(actor, publication({ expectedVersion: 1, title: 'Forbidden change' }));
    assert.ok(!response.ok && response.code === 'forbidden');
    assert.equal(db.records().get(sessionId)?.version, 1);
    assert.equal(db.events().length, 0);
  }
  const db = fakeDatabase({ rows: [stored({ project_id: otherProject })] });
  const hiddenCollision = await createSessionsService(db.boundary).execute(actor, publication());
  assert.ok(!hiddenCollision.ok && hiddenCollision.code === 'not_found');
  assert.equal(db.records().get(sessionId)?.project_id, otherProject);
});

test('invalid excerpt, duplicates and provider/path additions are rejected before the DB', async () => {
  const db = fakeDatabase();
  const service = createSessionsService(db.boundary);
  const oversized = Array.from({ length: 5 }, (_, i) => ({ id: `m-${i}`, role: 'user' as const, text: 'a'.repeat(32768) }));
  for (const request of [
    publication({ messages: oversized }), publication({ messages: [] }),
    publication({ messages: [publication().messages[0]!, publication().messages[0]!] }),
    { ...publication(), providerThreadId: 'not-shared' }, { ...publication(), cwd: 'C:\\private' },
  ]) {
    const response = await service.execute(actor, request as SessionsRequest);
    assert.ok(!response.ok && response.code === 'invalid_request');
  }
  assert.equal(db.statements.length, 0);
});

test('DB acquisition failure is sanitized and does not expose credentials or raw SQL', async () => {
  const db = { pool: { connect: async () => { throw new Error('postgres://user:secret@private/db SQL selected-body'); } } } as unknown as DatabaseBoundary;
  const response = await createSessionsService(db).execute(actor, { operation: 'list', projectId });
  assert.deepEqual(response, { ok: false, code: 'unavailable', message: 'Operazione non disponibile. Riprova tra poco.' });
});
