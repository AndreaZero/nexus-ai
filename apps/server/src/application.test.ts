import assert from 'node:assert/strict';
import test from 'node:test';
import type { DatabaseBoundary } from '@nexus-ai/db';
import { defaultApplicationPreferences, type ApplicationRequest } from '@nexus-ai/contracts';
import { createApplicationService } from './application.js';
import { searchSql } from './application-search.js';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const actor = { id: 'account-a', email: 'a@example.test' };
function fixture(options: { absent?: boolean; scopedDenied?: boolean; failWrite?: boolean; version?: number } = {}) {
  const queries: { sql: string; values: unknown[] }[] = [];
  let stored: { version: number; preferences: unknown; updated_at: Date } | undefined = options.version ? { version: options.version, preferences: structuredClone(defaultApplicationPreferences), updated_at: new Date() } : undefined;
  let released = false;
  const db = { async query(sql: string, values: unknown[] = []) {
    queries.push({ sql, values }); let rows: unknown[] = [];
    if (sql.startsWith('SELECT name FROM')) rows = options.absent ? [] : [{ name: 'Original' }];
    else if (sql.startsWith('SELECT version,preferences')) rows = stored ? [stored] : [];
    else if (sql.startsWith('INSERT INTO user_preferences')) { if (options.failWrite) throw new Error('private database detail'); stored = { version: (stored?.version ?? 0) + 1, preferences: JSON.parse(String(values[1])), updated_at: new Date() }; }
    else if (sql.startsWith('SELECT p.id')) rows = options.scopedDenied ? [] : [{ id: values[1] }];
    else if (sql === searchSql) rows = [1, 2, 3].map(n => ({ id: id(n), workspace_id: id(100), project_id: id(200), project_name: 'Project', kind: 'document', title: 'Match', excerpt: '<script>literal</script>' }));
    return { rows };
  }, release() { released = true; } };
  return { service: createApplicationService({ pool: { async connect() { return db; } } } as unknown as DatabaseBoundary), queries, released: () => released };
}
const save = (expectedVersion = 0): ApplicationRequest => ({ operation: 'saveSettings', expectedVersion, name: 'Updated', preferences: structuredClone(defaultApplicationPreferences) });

test('settings absent state is version zero and independent defaults; account required before reads', async () => {
  const f = fixture(), result = await f.service.execute(actor, { operation: 'getSettings' });
  assert.ok(result.ok && result.kind === 'settings'); assert.equal(result.settings.version, 0); assert.equal(result.settings.updatedAt, null);
  result.settings.preferences.notificationCategories.length = 0;
  assert.equal(defaultApplicationPreferences.notificationCategories.length, 6);
  const denied = fixture({ absent: true }); const response = await denied.service.execute(actor, { operation: 'getSettings' });
  assert.ok(!response.ok && response.code === 'auth_required'); assert.equal(denied.queries.length, 3); assert.equal(denied.released(), true);
});
test('settings save locks account and atomically stores name/preferences; stale CAS never writes', async () => {
  const f = fixture(), result = await f.service.execute(actor, save()); assert.ok(result.ok && result.kind === 'settings');
  assert.equal(result.settings.version, 1); assert.equal(result.settings.name, 'Updated');
  assert.ok(f.queries[1]?.sql.endsWith('FOR UPDATE')); assert.equal(f.queries.at(-1)?.sql, 'COMMIT');
  assert.equal(f.queries.find(q => q.sql.startsWith('INSERT INTO user_preferences'))?.values[0], actor.id);
  const stale = fixture({ version: 2 }), response = await stale.service.execute(actor, save(1));
  assert.ok(!response.ok && response.code === 'conflict'); assert.equal(stale.queries.some(q => /^(UPDATE|INSERT)/.test(q.sql)), false);
});
test('duplicate categories and strict unknown settings fields cannot update the profile', async () => {
  const request = save(); assert.equal(request.operation, 'saveSettings'); if (request.operation !== 'saveSettings') return;
  const duplicate = fixture(); const result = await duplicate.service.execute(actor, { ...request, preferences: { ...request.preferences, notificationCategories: ['tasks', 'tasks'] } });
  assert.ok(!result.ok && result.code === 'invalid_request'); assert.equal(duplicate.queries.some(q => q.sql.startsWith('UPDATE')), false);
  const strict = await fixture().service.execute(actor, { ...request, userId: 'other-account' } as ApplicationRequest); assert.ok(!strict.ok && strict.code === 'invalid_request');
});
test('write failure rolls back profile and returns fixed text without database contents', async () => {
  const f = fixture({ failWrite: true }), result = await f.service.execute(actor, save());
  assert.ok(!result.ok && result.code === 'unavailable'); assert.equal(JSON.stringify(result).includes('private database'), false);
  assert.equal(f.queries.at(-1)?.sql, 'ROLLBACK'); assert.equal(f.released(), true);
});
test('search uses literal parameters, an extra authorized row for pagination and no inaccessible scoped query', async () => {
  const f = fixture(), response = await f.service.execute(actor, { operation: 'search', query: ' %_ ', projectId: null, kind: null, offset: 3, limit: 2 });
  assert.ok(response.ok && response.kind === 'search'); assert.equal(response.query, '%_'); assert.equal(response.items.length, 2); assert.equal(response.nextOffset, 5);
  assert.equal(response.items[0]?.excerpt, '<script>literal</script>'); assert.deepEqual(f.queries.find(q => q.sql === searchSql)?.values, [actor.id, null, '%_', null, 3, 3]);
  const denied = fixture({ scopedDenied: true }), result = await denied.service.execute(actor, { operation: 'search', query: 'match', projectId: id(999), kind: null, offset: 0, limit: 30 });
  assert.ok(!result.ok && result.code === 'forbidden'); assert.equal(denied.queries.some(q => q.sql === searchSql), false);
});
