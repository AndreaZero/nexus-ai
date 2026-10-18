import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import type { DatabaseBoundary } from '@nexus-ai/db';
import type { DeploymentsRequest, HealthObservation } from '@nexus-ai/contracts';
import { createDeploymentsService } from './deployments.js';
import { computeEnvironmentHealth, thumbnailBytes, validateObservationTime } from './deployments-health.js';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const projectId = uuid(1); const actor = { id: 'developer', email: 'private@example.test' }; const now = new Date();
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const saveEnvironment = (): Extract<DeploymentsRequest, { operation: 'saveEnvironment' }> => ({ operation: 'saveEnvironment', projectId,
  requestId: uuid(2), id: null, expectedVersion: 0, name: 'Staging', kind: 'staging', visibility: 'client', previewUrl: null, requiredChecks: ['build', 'tests'] });
const saveDeployment = (): Extract<DeploymentsRequest, { operation: 'saveDeployment' }> => ({ operation: 'saveDeployment', projectId,
  requestId: uuid(3), id: null, expectedVersion: 0, environmentId: uuid(10), title: 'Release 1', status: 'succeeded', commitSha: null,
  branch: 'main', buildUrl: null, previewUrl: null, notes: '<script>plain only</script>', thumbnail: null, observedAt: now.toISOString() });
const saveObservation = (): Extract<DeploymentsRequest, { operation: 'saveObservation' }> => ({ operation: 'saveObservation', projectId,
  requestId: uuid(4), id: null, expectedVersion: 0, environmentId: uuid(10), check: 'build', status: 'pass', value: null, unit: null,
  summary: 'Manually verified', sourceUrl: null, observedAt: now.toISOString(), ttlSeconds: 60 });

type FixtureOptions = { role?: 'owner' | 'developer' | 'client' | 'viewer' | null; receipt?: { payload_hash: string; response: unknown };
  environmentCount?: number; deploymentCount?: number; thumbnailTotal?: number; staleCas?: boolean; currentObservation?: Record<string, unknown> };
/** Controlled SQL boundary; PostgreSQL integration is independently exercised by the coordinator. */
function fixture(options: FixtureOptions = {}) {
  const queries: { sql: string; values: unknown[] }[] = []; let released = false;
  const environment = { id: uuid(10), project_id: projectId, name: 'Staging', kind: 'staging', visibility: 'client', preview_url: null,
    required_checks: ['build', 'tests'], version: 1, created_at: now, updated_at: now };
  const deployment = { id: uuid(20), project_id: projectId, environment_id: environment.id, title: 'Real release', status: 'succeeded',
    commit_sha: null, branch: 'main', build_url: null, preview_url: null, notes: '<b>plain</b>', thumbnail: null, version: 1,
    created_by: actor.id, observed_at: now, created_at: now, updated_at: now };
  const db = { async query(sql: string, values: unknown[] = []) {
    queries.push({ sql, values }); let rows: unknown[] = [];
    if (sql.includes('wm.role AS workspace_role')) rows = options.role === null ? [] : [{ workspace_role: 'member', role: options.role ?? 'developer' }];
    else if (sql.startsWith('SELECT payload_hash,response')) rows = options.receipt ? [options.receipt] : [];
    else if (sql.includes('FROM deployment_receipt WHERE')) rows = [{ total: '0' }];
    else if (sql.startsWith('SELECT count(*)::text AS total FROM deployment_environment')) rows = [{ total: String(options.environmentCount ?? 1) }];
    else if (sql.includes('octet_length(decode(')) rows = [{ total: String(options.deploymentCount ?? 0), bytes: String(options.thumbnailTotal ?? 0) }];
    else if (sql.startsWith('SELECT * FROM deployment_environment')) rows = values[1] === uuid(999) ? [] : [environment];
    else if (sql.startsWith('SELECT d.* FROM project_deployment')) rows = values[1] === uuid(999) ? [] : [deployment];
    else if (sql.startsWith('SELECT count(*)::text AS total FROM project_deployment')) rows = [{ total: '1' }];
    else if (sql.startsWith('SELECT * FROM health_observation')) rows = options.currentObservation ? [options.currentObservation] : [];
    else if (sql.startsWith('UPDATE ')) rows = options.staleCas ? [] : [{ version: 2 }];
    else if (sql.startsWith('DELETE FROM project_deployment') || sql.startsWith('DELETE FROM deployment_environment')) rows = options.staleCas ? [] : [{ id: values[1] }];
    else if (sql.startsWith('INSERT INTO project_realtime_cursor')) rows = [{ sequence: '1' }];
    return { rows };
  }, release() { released = true; } };
  const database = { pool: { async connect() { return db; } } } as unknown as DatabaseBoundary;
  return { service: createDeploymentsService(database), queries, isReleased: () => released };
}

test('deployments reject current client/viewer mutations and revoked receipt replays before any write', async () => {
  for (const role of ['client', 'viewer', null] as const) {
    const f = fixture({ role }); const result = await f.service.execute(actor, saveEnvironment());
    assert.equal(result.ok, false); if (!result.ok) assert.equal(result.code, 'forbidden');
    assert.ok(f.queries.some(q => q.sql === 'ROLLBACK')); assert.equal(f.queries.some(q => q.sql.startsWith('INSERT')), false); assert.equal(f.isReleased(), true);
  }
});

test('environment CAS, quotas and unique requirements prevent stale/ambiguous writes', async () => {
  const stale = fixture({ staleCas: true }); const result = await stale.service.execute(actor, { ...saveEnvironment(), id: uuid(10), expectedVersion: 1 });
  assert.ok(!result.ok && result.code === 'conflict');
  const quota = await fixture({ environmentCount: 30 }).service.execute(actor, saveEnvironment()); assert.ok(!quota.ok && quota.code === 'invalid_request');
  const duplicate = await fixture().service.execute(actor, { ...saveEnvironment(), requiredChecks: ['build', 'build'] }); assert.ok(!duplicate.ok && duplicate.code === 'invalid_request');
});

test('receipts replay only exact payload and mutation, receipt and invalidation share a transaction', async () => {
  const request = saveEnvironment(); const response = { ok: true, kind: 'changed', id: uuid(10), version: 1 };
  const receipt = { payload_hash: createHash('sha256').update(JSON.stringify(request)).digest('hex'), response };
  const f = fixture({ receipt }); assert.deepEqual(await f.service.execute(actor, request), response);
  assert.equal(f.queries.some(q => q.sql.startsWith('INSERT INTO deployment_environment')), false);
  const conflict = await fixture({ receipt }).service.execute(actor, { ...request, name: 'Other' }); assert.ok(!conflict.ok && conflict.code === 'conflict');
  const written = fixture(); const result = await written.service.execute(actor, request); assert.ok(result.ok);
  const sql = written.queries.map(q => q.sql); assert.equal(sql[0], 'BEGIN'); assert.equal(sql.at(-1), 'COMMIT');
  assert.ok(sql.some(q => q.startsWith('INSERT INTO deployment_receipt')));
  assert.equal(written.queries.find(q => q.sql.startsWith('INSERT INTO realtime_event'))?.values[3], 'deployment.changed');
});

test('client preview enforces parent audience on environment, deployment, count and health queries', async () => {
  for (const role of ['owner', 'developer', 'client', 'viewer'] as const) {
    const f = fixture({ role }); const result = await f.service.execute(actor, { operation: 'snapshot', projectId, view: 'client', offset: 0, limit: 1 });
    assert.ok(result.ok && result.kind === 'snapshot'); assert.equal(result.snapshot.canManage, false); assert.equal(result.snapshot.audience, 'client');
    for (const query of f.queries.filter(q => q.sql.includes("visibility='client'"))) assert.equal(query.values[1], false);
    assert.ok(f.queries.some(q => q.sql.includes('ORDER BY d.observed_at DESC,d.id DESC LIMIT $3 OFFSET $4')));
  }
});

test('deployment parent, thumbnail quota and stale delete cannot be bypassed', async () => {
  const missing = await fixture().service.execute(actor, { ...saveDeployment(), environmentId: uuid(999) }); assert.ok(!missing.ok && missing.code === 'not_found');
  const quota = await fixture({ thumbnailTotal: 10 * 1024 * 1024 }).service.execute(actor, { ...saveDeployment(), thumbnail: png }); assert.ok(!quota.ok && quota.code === 'invalid_request');
  const count = await fixture({ deploymentCount: 1000 }).service.execute(actor, saveDeployment()); assert.ok(!count.ok && count.code === 'invalid_request');
  const stale = await fixture({ staleCas: true }).service.execute(actor, { operation: 'deleteDeployment', projectId, requestId: uuid(5), id: uuid(20), expectedVersion: 1 });
  assert.ok(!stale.ok && stale.code === 'conflict');
});

test('older health cannot replace newer evidence and expiry comes from observation, not ingestion', async () => {
  const old = new Date(now.getTime() - 3600_000);
  const current = { id: uuid(30), version: 2, observed_at: now };
  const blocked = await fixture({ currentObservation: current }).service.execute(actor, { ...saveObservation(), id: uuid(30), expectedVersion: 2, observedAt: old.toISOString() });
  assert.ok(!blocked.ok && blocked.code === 'conflict');
  const f = fixture(); const response = await f.service.execute(actor, { ...saveObservation(), observedAt: old.toISOString() }); assert.ok(response.ok);
  const inserted = f.queries.find(q => q.sql.startsWith('INSERT INTO health_observation'))!;
  assert.equal(inserted.values[10], new Date(old.getTime() + 60_000).toISOString());
  const future = await fixture().service.execute(actor, { ...saveObservation(), observedAt: new Date(Date.now() + 600_000).toISOString() }); assert.ok(!future.ok && future.code === 'invalid_request');
});

function observation(check: HealthObservation['check'], status: HealthObservation['status'], expiresAt = new Date(now.getTime() + 1000).toISOString()): HealthObservation {
  return { id: uuid(30), projectId, environmentId: uuid(10), check, status, value: null, unit: null, summary: 'Manual', sourceUrl: null,
    source: 'manual', observedAt: new Date(now.getTime() - 1000).toISOString(), expiresAt, version: 1, stale: false, createdAt: now.toISOString(), updatedAt: now.toISOString() };
}

test('health is unknown until every explicit requirement is fresh; no numeric success is invented', () => {
  const environment = { id: uuid(10), requiredChecks: ['build', 'tests'] as const };
  const calculate = (items: HealthObservation[]) => computeEnvironmentHealth({ ...environment, requiredChecks: [...environment.requiredChecks] }, items, now);
  assert.equal(calculate([observation('build', 'pass')]).score, null);
  assert.equal(calculate([observation('build', 'pass'), observation('tests', 'pass', now.toISOString())]).status, 'unknown');
  assert.equal(calculate([observation('build', 'pass'), observation('tests', 'fail')]).status, 'unhealthy');
  assert.equal(calculate([observation('build', 'pass'), observation('tests', 'warn')]).score, 50);
  assert.equal(calculate([observation('build', 'pass'), observation('tests', 'warn')]).status, 'degraded');
  assert.equal(calculate([observation('build', 'pass'), observation('tests', 'pass')]).status, 'healthy');
  assert.equal(computeEnvironmentHealth({ id: uuid(10), requiredChecks: [] }, [observation('build', 'pass')], now).score, null);
});

test('PNG validates signature, bounded dimensions, CRC and complete chunks; URLs forbid credential/query leakage', async () => {
  assert.ok(thumbnailBytes(png) > 0); assert.equal(thumbnailBytes(null), 0);
  assert.throws(() => thumbnailBytes('data:image/svg+xml;base64,PHN2Zz4='));
  const data = Buffer.from(png.split(',')[1]!, 'base64'); data[16] = 255;
  assert.throws(() => thumbnailBytes('data:image/png;base64,' + data.toString('base64')));
  assert.throws(() => thumbnailBytes(png.slice(0, -4))); assert.throws(() => validateObservationTime(new Date(Date.now() + 600_000).toISOString()));
  for (const previewUrl of ['https://user:pass@example.com/', 'https://example.com/?token=private', 'https://example.com/#token', 'http://example.com/']) {
    const f = fixture(); const result = await f.service.execute(actor, { ...saveEnvironment(), previewUrl }); assert.ok(!result.ok && result.code === 'invalid_request'); assert.equal(f.queries.length, 0);
  }
});
