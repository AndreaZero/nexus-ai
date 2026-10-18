import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createDatabaseBoundary, readDatabaseConfig } from '../packages/db/dist/index.js';
import { buildServer } from '../apps/server/dist/app.js';
import { readServerConfig } from '../apps/server/dist/config.js';
import { deploymentsResponseSchema, overviewResponseSchema, pulseResponseSchema } from '../packages/contracts/dist/index.js';

// Actual loopback PostgreSQL/Mailpit/HTTP QA. No remote deploy or provider connection.
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, '.nexus/visual/t13'); await mkdir(output, { recursive: true });
const env = parseEnv(await readFile(path.join(root, '.env'), 'utf8'));
const prefix = `nexus-t13-qa-${randomUUID()}`, users = [], mailIds = new Set(), checks = [];
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
let app, database, base, workspaceId, stage = 'configuration';
async function post(route, body, cookie = '', origin = base) {
  return fetch(new URL(route, base), { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(15000), headers: {
    'Content-Type': 'application/json', Origin: origin, ...(cookie ? { Cookie: cookie } : {}),
  }, body: JSON.stringify(body) });
}
async function account(label) {
  const email = `${prefix}-${label}@nexus.local`, password = randomBytes(32).toString('base64url'); users.push({ email });
  const signup = await post('/auth/sign-up/email', { name: `T13 QA ${label}`, email, password }); assert.equal(signup.status, 200);
  const data = await signup.json(); let link;
  for (let attempt = 0; attempt < 4 && !link; attempt++) {
    const messages = await (await fetch(`http://127.0.0.1:8025/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`, { signal: AbortSignal.timeout(3000) })).json();
    const id = messages.messages?.[0]?.ID;
    if (id) { mailIds.add(id); const message = await (await fetch(`http://127.0.0.1:8025/api/v1/message/${id}`, { signal: AbortSignal.timeout(3000) })).json(); link = message.Text?.match(/https?:\/\/[^\s<>"]+/)?.[0]; }
    else await new Promise(resolve => setTimeout(resolve, 150));
  }
  assert.ok(link); assert.equal(new URL(link).origin, base); assert.ok([200, 302, 303].includes((await fetch(link, { redirect: 'manual' })).status));
  const login = await post('/auth/sign-in/email', { email, password }); assert.equal(login.status, 200);
  const user = { id: data.user.id, email, cookie: login.headers.getSetCookie().map(row => row.split(';', 1)[0]).join('; ') }; users[users.length - 1] = user; return user;
}
async function collab(user, request) { const value = await (await post('/api/collaboration', request, user.cookie)).json(); assert.equal(value.ok, true); return value; }
async function deploy(user, request) { return deploymentsResponseSchema.parse(await (await post('/api/deployments', request, user.cookie)).json()); }
async function overview(user, projectId) { return overviewResponseSchema.parse(await (await post('/api/overview', { operation: 'snapshot', projectId, filter: 'deployments' }, user.cookie)).json()); }
async function pulse(user, projectId, scope = 'project') { return pulseResponseSchema.parse(await (await post('/api/pulse', { operation: 'snapshot', projectId, scope }, user.cookie)).json()); }
function success(value, kind) { assert.equal(value.ok, true); if (kind) assert.equal(value.kind, kind); return value; }
function denied(value, code) { assert.equal(value.ok, false); assert.equal(value.code, code); }
const mutation = (projectId, operation, fields) => ({ projectId, operation, requestId: randomUUID(), ...fields });
const environmentFields = { id: null, expectedVersion: 0, name: 'QA staging', kind: 'staging', visibility: 'client', previewUrl: 'http://127.0.0.1:3000/', requiredChecks: ['build', 'tests'] };
const deploymentFields = { id: null, expectedVersion: 0, title: 'QA registered release', status: 'succeeded', commitSha: 'a'.repeat(40), branch: 'main',
  buildUrl: 'https://example.com/build/1', previewUrl: null, notes: '<script>plain user notes</script>', thumbnail: png };
const observationFields = { id: null, expectedVersion: 0, check: 'build', status: 'pass', value: null, unit: null, summary: 'Manual QA observation', sourceUrl: null, ttlSeconds: 600 };
function crc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }
function pngChunk(kind, bytes) { const type = Buffer.from(kind), chunk = Buffer.alloc(bytes.length + 12); chunk.writeUInt32BE(bytes.length); type.copy(chunk, 4); bytes.copy(chunk, 8); chunk.writeUInt32BE(crc32(Buffer.concat([type, bytes])), bytes.length + 8); return chunk; }
function largePng() { const bytes = Buffer.from(png.split(',')[1], 'base64'); const extra = pngChunk('tEXt', Buffer.from('Comment\0' + 'x'.repeat(240000))); return 'data:image/png;base64,' + Buffer.concat([bytes.subarray(0, bytes.length - 12), extra, bytes.subarray(bytes.length - 12)]).toString('base64'); }

try {
  const target = new URL(env.DATABASE_URL); assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)); assert.equal(target.pathname, '/nexus_ai_dev');
  assert.equal(env.SMTP_HOST, '127.0.0.1'); assert.equal(env.SMTP_PORT, '1025');
  database = createDatabaseBoundary(readDatabaseConfig(env)); assert.equal(await database.check(), 'connected');
  const { createServer } = await import('node:net'); const probe = createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve)); base = `http://127.0.0.1:${port}`;
  app = await buildServer(readServerConfig({ ...env, NEXUS_SERVER_PORT: String(port), BETTER_AUTH_URL: base, NEXUS_WEB_URL: base, NEXUS_LOG_LEVEL: 'silent' })); await app.listen({ host: '127.0.0.1', port });
  stage = 'verified accounts and current roles';
  const owner = await account('owner'), client = await account('client'), outsider = await account('outsider');
  workspaceId = (await collab(owner, { operation: 'createWorkspace', name: prefix })).item.id;
  const projectId = (await collab(owner, { operation: 'createProject', workspaceId, name: 'T13 isolated environment QA', description: '', defaultVisibility: 'team' })).item.id;
  const otherProjectId = (await collab(owner, { operation: 'createProject', workspaceId, name: 'T13 other project', description: '', defaultVisibility: 'team' })).item.id;
  await database.pool.query("INSERT INTO workspace_member(workspace_id,user_id,role) VALUES($1,$2,'member'),($1,$3,'member')", [workspaceId, client.id, outsider.id]);
  await database.pool.query("INSERT INTO project_member(project_id,user_id,role) VALUES($1,$2,'client')", [projectId, client.id]);
  const readSnapshot = (user = owner, fields = {}) => deploy(user, { operation: 'snapshot', projectId, ...fields });
  const empty = success(await readSnapshot(), 'snapshot').snapshot; assert.equal(empty.total, 0); assert.deepEqual(empty.environments, []);
  denied(await readSnapshot(outsider), 'forbidden'); denied(await deploy(client, { operation: 'snapshot', projectId: otherProjectId }), 'forbidden');
  assert.equal((await post('/api/deployments', { operation: 'snapshot', projectId }, '', base)).status, 401);
  const origin = await post('/api/deployments', { operation: 'snapshot', projectId }, owner.cookie, 'https://invalid.example'); assert.equal(origin.status, 403); assert.equal(origin.headers.get('cache-control'), 'no-store');
  assert.equal((await post('/api/deployments', { operation: 'snapshot', projectId, url: 'https://invalid.example' }, owner.cookie)).status, 400);
  checks.push('Three verified local accounts, real PG/HTTP, empty project, current outsider/cross-project denial, Origin/no-store/strict schema');

  stage = 'environments deployments receipts and CAS';
  const publicEnv = success(await deploy(owner, mutation(projectId, 'saveEnvironment', environmentFields)), 'changed');
  const privateEnv = success(await deploy(owner, mutation(projectId, 'saveEnvironment', { ...environmentFields, name: 'QA private environment', visibility: 'team' })), 'changed');
  const now = new Date(); const observedAt = now.toISOString();
  const create = mutation(projectId, 'saveDeployment', { ...deploymentFields, environmentId: publicEnv.id, observedAt });
  const first = success(await deploy(owner, create), 'changed'); assert.deepEqual(await deploy(owner, create), first);
  denied(await deploy(owner, { ...create, title: 'Changed receipt payload' }), 'conflict');
  const second = success(await deploy(owner, mutation(projectId, 'saveDeployment', { ...deploymentFields, environmentId: privateEnv.id, title: 'QA private release', observedAt })), 'changed');
  const updated = success(await deploy(owner, mutation(projectId, 'saveDeployment', { ...deploymentFields, environmentId: publicEnv.id, id: first.id, expectedVersion: 1, title: 'QA release revised', observedAt })), 'changed'); assert.equal(updated.version, 2);
  denied(await deploy(owner, mutation(projectId, 'saveDeployment', { ...deploymentFields, environmentId: publicEnv.id, id: first.id, expectedVersion: 1, observedAt })), 'conflict');
  const actual = success(await deploy(client, { operation: 'readDeployment', projectId, id: first.id }), 'deployment').item; assert.equal(actual.thumbnail, png); assert.equal(actual.notes, deploymentFields.notes); assert.equal(actual.source, 'manual');
  denied(await deploy(client, { operation: 'readDeployment', projectId, id: second.id }), 'not_found');
  for (const role of ['client', 'viewer']) {
    await database.pool.query('UPDATE project_member SET role=$3 WHERE project_id=$1 AND user_id=$2', [projectId, client.id, role]);
    denied(await deploy(client, mutation(projectId, 'saveEnvironment', environmentFields)), 'forbidden');
    const snapshot = success(await readSnapshot(client), 'snapshot').snapshot; assert.equal(snapshot.canManage, false); assert.equal(snapshot.total, 1); assert.equal(snapshot.environments.length, 1);
  }
  await database.pool.query("UPDATE project_member SET role='client' WHERE project_id=$1 AND user_id=$2", [projectId, client.id]);
  const preview = success(await readSnapshot(owner, { view: 'client' }), 'snapshot').snapshot; assert.equal(preview.canManage, false); assert.equal(preview.total, 1);
  checks.push('Explicit public/private environments, manual succeeded build + PNG, nullable preview, exact receipt replay/hash conflict, CAS and actual client/viewer/preview audience');

  stage = 'health requirements timestamps and expiry';
  const getHealth = async () => success(await readSnapshot(client), 'snapshot').snapshot.health.find(item => item.environmentId === publicEnv.id);
  assert.equal((await getHealth()).status, 'unknown');
  const build = success(await deploy(owner, mutation(projectId, 'saveObservation', { ...observationFields, environmentId: publicEnv.id, observedAt })), 'changed');
  assert.equal((await getHealth()).score, null);
  const staleAt = new Date(now.getTime() - 7200_000).toISOString();
  const tests = success(await deploy(owner, mutation(projectId, 'saveObservation', { ...observationFields, check: 'tests', environmentId: publicEnv.id, observedAt: staleAt, ttlSeconds: 60 })), 'changed');
  let health = await getHealth(); assert.equal(health.status, 'unknown'); assert.equal(health.observations.find(item => item.check === 'tests').stale, true);
  const refreshed = success(await deploy(owner, mutation(projectId, 'saveObservation', { ...observationFields, check: 'tests', environmentId: publicEnv.id, id: tests.id, expectedVersion: 1, observedAt })), 'changed');
  health = await getHealth(); assert.equal(health.status, 'healthy'); assert.equal(health.score, 100);
  success(await deploy(owner, mutation(projectId, 'saveObservation', { ...observationFields, check: 'tests', status: 'warn', environmentId: publicEnv.id, id: tests.id, expectedVersion: refreshed.version, observedAt })), 'changed');
  health = await getHealth(); assert.equal(health.status, 'degraded'); assert.equal(health.score, 50);
  success(await deploy(owner, mutation(projectId, 'saveObservation', { ...observationFields, status: 'fail', environmentId: publicEnv.id, id: build.id, expectedVersion: 1, observedAt })), 'changed');
  assert.equal((await getHealth()).status, 'unhealthy');
  denied(await deploy(owner, mutation(projectId, 'saveObservation', { ...observationFields, environmentId: publicEnv.id, id: build.id, expectedVersion: 2, observedAt: staleAt })), 'conflict');
  denied(await deploy(owner, mutation(projectId, 'saveObservation', { ...observationFields, check: 'security', environmentId: publicEnv.id, observedAt: new Date(Date.now() + 600_000).toISOString() })), 'invalid_request');
  success(await deploy(owner, mutation(projectId, 'saveObservation', { ...observationFields, check: 'security', environmentId: privateEnv.id, observedAt })), 'changed');
  checks.push('Missing required evidence is unknown/null; expiry derives from observedAt; all-pass healthy/100, warn degraded/50, fail unhealthy, older CAS and future timestamps denied');

  stage = 'Pulse real observed UTC counts and feed coalescence';
  const yesterday = new Date(now.getTime() - 86400_000).toISOString();
  success(await deploy(owner, mutation(projectId, 'saveDeployment', { ...deploymentFields, environmentId: publicEnv.id, title: 'QA yesterday release', observedAt: yesterday })), 'changed');
  const ownerPulse = success(await pulse(owner, projectId)).snapshot; assert.equal(ownerPulse.summary.buildsDeploys, 2);
  assert.equal(success(await pulse(owner, projectId, 'mine')).snapshot.summary.buildsDeploys, 2);
  assert.equal(success(await pulse(client, projectId)).snapshot.summary.buildsDeploys, 1);
  assert.equal(success(await pulse(client, projectId, 'mine')).snapshot.summary.buildsDeploys, 0);
  let feed = success(await overview(owner, projectId), 'overview').snapshot.activity;
  assert.equal(feed.filter(item => item.target.id === first.id).length, 1); assert.equal(feed.some(item => item.target.id === second.id), true);
  const heldIds = success(await overview(client, projectId), 'overview').snapshot.activity.map(item => item.target.id); assert.equal(heldIds.includes(second.id), false);
  const pagination = success(await readSnapshot(owner, { offset: 0, limit: 1 }), 'snapshot').snapshot; assert.equal(pagination.total, 3); assert.equal(pagination.nextOffset, 1);
  const page2 = success(await readSnapshot(owner, { offset: 1, limit: 1 }), 'snapshot').snapshot; assert.notEqual(page2.deployments[0].id, pagination.deployments[0].id);
  checks.push('Real observed UTC build counts before page limits, Mine by author, client-visible counts, stable ordered pagination and coalesced feed targets');

  stage = 'PNG URL future timestamp and quota boundaries';
  for (const previewUrl of ['https://user:pass@example.com/', 'https://example.com/?token=private', 'https://example.com/#token', 'http://example.com/'])
    assert.equal((await post('/api/deployments', mutation(projectId, 'saveEnvironment', { ...environmentFields, previewUrl }), owner.cookie)).status, 400);
  denied(await deploy(owner, mutation(projectId, 'saveDeployment', { ...deploymentFields, environmentId: publicEnv.id, thumbnail: 'data:image/png;base64,' + Buffer.from('not png').toString('base64'), observedAt })), 'invalid_request');
  denied(await deploy(owner, mutation(projectId, 'saveDeployment', { ...deploymentFields, environmentId: publicEnv.id, observedAt: new Date(Date.now() + 600_000).toISOString() })), 'invalid_request');
  const large = largePng(), seededIds = Array.from({ length: 43 }, () => randomUUID());
  await database.pool.query(`INSERT INTO project_deployment(id,project_id,environment_id,title,status,thumbnail,created_by,observed_at)
    SELECT id,$2,$3,'QA thumbnail quota fixture','succeeded',$4,$5,$6 FROM unnest($1::text[]) id`, [seededIds, projectId, privateEnv.id, large, owner.id, observedAt]);
  denied(await deploy(owner, mutation(projectId, 'saveDeployment', { ...deploymentFields, environmentId: privateEnv.id, thumbnail: large, observedAt })), 'invalid_request');
  await database.pool.query('DELETE FROM project_deployment WHERE project_id=$1 AND id=ANY($2::text[])', [projectId, seededIds]);
  const envIds = Array.from({ length: 28 }, () => randomUUID());
  await database.pool.query(`INSERT INTO deployment_environment(id,project_id,name,kind,visibility,created_by)
    SELECT id,$2,'QA environment quota fixture','development','team',$3 FROM unnest($1::text[]) id`, [envIds, projectId, owner.id]);
  denied(await deploy(owner, mutation(projectId, 'saveEnvironment', environmentFields)), 'invalid_request');
  await database.pool.query('DELETE FROM deployment_environment WHERE project_id=$1 AND id=ANY($2::text[])', [projectId, envIds]);
  checks.push('No server URL fetch: credential/query/hash/plain-HTTP remote URLs denied; malformed PNG/future deployment denied; actual PG 10MiB thumbnails and 30-environment quotas enforced');

  stage = 'parent narrowing revocation and deletion cascade';
  success(await deploy(owner, mutation(projectId, 'saveEnvironment', { ...environmentFields, id: publicEnv.id, expectedVersion: 1, visibility: 'team' })), 'changed');
  const narrowed = success(await readSnapshot(client), 'snapshot').snapshot; assert.equal(narrowed.total, 0); assert.deepEqual(narrowed.environments, []); assert.deepEqual(narrowed.health, []);
  denied(await deploy(client, { operation: 'readDeployment', projectId, id: first.id }), 'not_found');
  assert.deepEqual(success(await overview(client, projectId), 'overview').snapshot.activity, []); assert.equal(success(await pulse(client, projectId)).snapshot.summary.buildsDeploys, null);
  denied(await deploy(owner, mutation(projectId, 'deleteEnvironment', { id: publicEnv.id, expectedVersion: 1 })), 'conflict');
  success(await deploy(owner, mutation(projectId, 'deleteEnvironment', { id: publicEnv.id, expectedVersion: 2 })), 'changed');
  const residue = (await database.pool.query(`SELECT (SELECT count(*) FROM project_deployment WHERE environment_id=$1)::text AS deployments,
    (SELECT count(*) FROM health_observation WHERE environment_id=$1)::text AS observations`, [publicEnv.id])).rows[0]; assert.deepEqual(residue, { deployments: '0', observations: '0' });
  await database.pool.query('DELETE FROM project_member WHERE project_id=$1 AND user_id=$2', [projectId, client.id]); denied(await readSnapshot(client), 'forbidden');
  feed = success(await overview(owner, projectId), 'overview').snapshot.activity; assert.equal(feed.some(item => item.target.id === first.id || item.target.id === publicEnv.id), false);
  checks.push('Current parent visibility immediately removes build/health/feed/Pulse from client; CAS protects delete; cascade removes child rows, revoked membership denied');
  await writeFile(path.join(output, 'deployments-report.json'), JSON.stringify({ passed: true, checks, completedAt: new Date().toISOString(), transport: 'Actual local PostgreSQL/Mailpit/HTTP', remoteDeployments: false }, null, 2));
  console.log(`Deployments verification passed: ${checks.length} real PG/HTTP scenarios; no remote deploy or provider.`);
} catch (error) {
  const location = error?.stack?.split('\n').find(line => line.includes('verify-deployments.mjs:'))?.trim();
  console.error(`Deployments verification failed at ${stage}.${location ? ' ' + location : ''} No private values printed.`);
  await writeFile(path.join(output, 'deployments-report.json'), JSON.stringify({ passed: false, stage, location, checks }, null, 2)); process.exitCode = 1;
} finally {
  await app?.close();
  if (database?.pool) {
    if (workspaceId) await database.pool.query('DELETE FROM workspace WHERE id=$1 AND name=$2', [workspaceId, prefix]);
    for (const user of users) { await database.pool.query('DELETE FROM "user" WHERE email=$1', [user.email]); await database.pool.query('DELETE FROM verification WHERE identifier=$1', [user.email]); }
  }
  await database?.close();
  if (mailIds.size) await fetch('http://127.0.0.1:8025/api/v1/messages', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ IDs: [...mailIds] }), signal: AbortSignal.timeout(3000) }).catch(() => {});
}
