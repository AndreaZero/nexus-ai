import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { createServer } from 'node:net';
import { createDatabaseBoundary, readDatabaseConfig } from '../packages/db/dist/index.js';
import { buildServer } from '../apps/server/dist/app.js';
import { readServerConfig } from '../apps/server/dist/config.js';
import { sessionsResponseSchema } from '../packages/contracts/dist/index.js';

const env = parseEnv(await readFile(new URL('../.env', import.meta.url), 'utf8'));
const prefix = `nexus-t06-qa-${randomUUID()}`;
const users = [], emails = new Set(), checks = [];
let app, database, base, workspaceId;
let stage = 'local configuration';
async function post(route, body, cookie = '', origin = base) {
  return fetch(new URL(route, base), { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json', Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
}
async function createAccount(label) {
  const email = `${prefix}-${label}@nexus.local`, password = randomBytes(32).toString('base64url');
  users.push({ email });
  const signup = await post('/auth/sign-up/email', { name: `T06 QA ${label}`, email, password });
  assert.equal(signup.status, 200, 'QA signup failed.');
  let link;
  for (let attempt = 0; attempt < 4 && !link; attempt++) {
    const search = await fetch(`http://127.0.0.1:8025/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`, { signal: AbortSignal.timeout(3000) });
    const id = (await search.json()).messages?.[0]?.ID;
    if (id) { emails.add(id); const content = await (await fetch(`http://127.0.0.1:8025/api/v1/message/${id}`)).json(); link = content.Text?.match(/https?:\/\/[^\s<>"]+/)?.[0]; }
    else await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.ok(link, 'QA verification email missing.');
  const url = new URL(link); assert.equal(url.origin, base); assert.equal(url.pathname, '/auth/verify-email');
  assert.ok([200, 302, 303].includes((await fetch(url, { redirect: 'manual' })).status));
  const login = await post('/auth/sign-in/email', { email, password }); assert.equal(login.status, 200);
  const user = { email, id: (await signup.json()).user.id, cookie: login.headers.getSetCookie().map(value => value.split(';', 1)[0]).join('; ') };
  users[users.length - 1] = user; return user;
}
async function collab(user, request) {
  const response = await post('/api/collaboration', request, user.cookie);
  const result = await response.json(); assert.equal(result.ok, true, 'Fixture collaboration failed.'); return result;
}
async function sessions(user, request) {
  return sessionsResponseSchema.parse(await (await post('/api/sessions', request, user?.cookie ?? '')).json());
}
try {
  const target = new URL(env.DATABASE_URL);
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)); assert.equal(target.pathname, '/nexus_ai_dev');
  assert.equal(env.SMTP_HOST, '127.0.0.1'); assert.equal(env.SMTP_PORT, '1025');
  database = createDatabaseBoundary(readDatabaseConfig(env)); assert.equal(await database.check(), 'connected');
  const probe = createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve)); base = `http://127.0.0.1:${port}`;
  app = await buildServer(readServerConfig({ ...env, NEXUS_SERVER_PORT: String(port), BETTER_AUTH_URL: base, NEXUS_WEB_URL: base, NEXUS_LOG_LEVEL: 'silent' }));
  await app.listen({ host: '127.0.0.1', port });
  stage = 'verified accounts';
  const owner = await createAccount('owner'), client = await createAccount('client'), outsider = await createAccount('outsider');
  workspaceId = (await collab(owner, { operation: 'createWorkspace', name: prefix })).item.id;
  const projectId = (await collab(owner, { operation: 'createProject', workspaceId, name: 'T06 QA project', description: '', defaultVisibility: 'team' })).item.id;
  await database.pool.query("INSERT INTO workspace_member (workspace_id,user_id,role) VALUES ($1,$2,'member'),($1,$3,'member')", [workspaceId, client.id, outsider.id]);
  await database.pool.query("INSERT INTO project_member (project_id,user_id,role) VALUES ($1,$2,'client')", [projectId, client.id]);
  stage = 'explicit publish and idempotency';
  const body = { operation: 'publish', projectId, sessionId: randomUUID(), expectedVersion: 0, deviceId: randomUUID(), title: 'QA internal excerpt', status: 'completed', visibility: 'team', messages: [{ id: 'qa-message', role: 'assistant', text: 'Internal QA excerpt.' }] };
  const first = await sessions(owner, body); assert.equal(first.ok, true); assert.equal(first.item.version, 1);
  const retry = await sessions(owner, body); assert.equal(retry.ok, true); assert.equal(retry.item.version, 1);
  assert.equal((await sessions(owner, { ...body, title: 'Different retry' })).ok, false);
  checks.push('explicit bounded snapshot and idempotent create');
  stage = 'audience and membership';
  const publicBody = { ...body, sessionId: randomUUID(), title: 'QA client excerpt', visibility: 'client', messages: [{ id: 'qa-client-message', role: 'assistant', text: 'Reviewed QA client excerpt.' }] };
  assert.equal((await sessions(owner, publicBody)).ok, true);
  const visible = await sessions(client, { operation: 'list', projectId }); assert.equal(visible.ok, true); assert.equal(visible.items.length, 1); assert.equal(visible.items[0].id, publicBody.sessionId);
  assert.equal((await sessions(client, { operation: 'read', projectId, sessionId: body.sessionId })).ok, false);
  const detail = await sessions(client, { operation: 'read', projectId, sessionId: publicBody.sessionId }); assert.equal(detail.ok, true); assert.equal(detail.messages[0].text, publicBody.messages[0].text);
  assert.equal((await sessions(outsider, { operation: 'list', projectId })).ok, false);
  assert.equal((await sessions(null, { operation: 'list', projectId })).ok, false);
  checks.push('client audience projection and ordinary workspace/anonymous denial');
  stage = 'driver and compare-and-swap';
  assert.equal((await sessions(client, { ...publicBody, expectedVersion: 1 })).ok, false);
  assert.equal((await sessions(owner, { ...body, expectedVersion: 1, deviceId: randomUUID() })).ok, false);
  const updates = ['A', 'B'].map(text => ({ ...body, expectedVersion: 1, messages: [{ id: 'qa-message', role: 'assistant', text }] }));
  const results = await Promise.all(updates.map(request => sessions(owner, request))); assert.equal(results.filter(result => result.ok).length, 1);
  const winner = updates[results.findIndex(result => result.ok)]; assert.equal((await sessions(owner, winner)).item.version, 2);
  checks.push('author/device control and concurrent version update');
  stage = 'tasks and revocation';
  await database.pool.query("INSERT INTO task(id,project_id,title,created_by,visibility) VALUES ($1,$2,'QA internal task',$3,'team'),($4,$2,'QA client task',$3,'client')", [randomUUID(), projectId, owner.id, randomUUID()]);
  const tasks = await sessions(client, { operation: 'listProjectTasks', projectId }); assert.equal(tasks.ok, true); assert.equal(tasks.items.length, 1); assert.equal(tasks.items[0].visibility, 'client');
  await collab(owner, { operation: 'removeMember', scope: { kind: 'project', projectId }, userId: client.id });
  assert.equal((await sessions(client, { operation: 'read', projectId, sessionId: publicBody.sessionId })).ok, false);
  checks.push('task audience and current membership revocation');
  stage = 'audit and route boundaries';
  const audit = await database.pool.query("SELECT payload FROM collaboration_event WHERE project_id=$1 AND event_type='publishSession'", [projectId]);
  assert.equal(audit.rows.length, 3); assert.equal(JSON.stringify(audit.rows).includes('excerpt'), false); assert.equal(JSON.stringify(audit.rows).includes('messages'), false);
  assert.equal((await post('/api/sessions', { operation: 'list', projectId }, owner.cookie, 'https://invalid.example')).status, 403);
  assert.equal((await post('/api/sessions', { operation: 'list', projectId, cookie: 'arbitrary' }, owner.cookie)).status, 400);
  checks.push('atomic non-content audit and strict HTTP/origin boundary');
  await mkdir(new URL('../.nexus/visual/t06/', import.meta.url), { recursive: true });
  await writeFile(new URL('../.nexus/visual/t06/sessions-report.json', import.meta.url), JSON.stringify({ passed: true, checks, fixtureCleanup: 'finally', inferenceExecuted: false }, null, 2));
  console.log(`Session verification passed: ${checks.length} PostgreSQL/SMTP/HTTP scenarios; no inference or credential output.`);
} catch { console.error(`Session verification failed at: ${stage}. No credentials or excerpts printed.`); process.exitCode = 1; }
finally {
  await app?.close();
  if (database?.pool) {
    if (workspaceId) await database.pool.query('DELETE FROM workspace WHERE id=$1 AND name=$2', [workspaceId, prefix]);
    for (const user of users) { await database.pool.query('DELETE FROM "user" WHERE email=$1', [user.email]); await database.pool.query('DELETE FROM verification WHERE identifier=$1', [user.email]); }
  }
  await database?.close();
  if (emails.size) await fetch('http://127.0.0.1:8025/api/v1/messages', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ IDs: [...emails] }), signal: AbortSignal.timeout(3000) }).catch(() => {});
}
