import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createDatabaseBoundary, readDatabaseConfig } from '../packages/db/dist/index.js';
import { buildServer } from '../apps/server/dist/app.js';
import { readServerConfig } from '../apps/server/dist/config.js';
import { applicationResponseSchema, defaultApplicationPreferences } from '../packages/contracts/dist/index.js';

// Actual loopback PostgreSQL/Mailpit/HTTP. Fixture content is confined to owned QA workspaces.
const root = fileURLToPath(new URL('../', import.meta.url)), output = path.join(root, '.nexus/visual/t14');
await mkdir(output, { recursive: true });
const env = parseEnv(await readFile(path.join(root, '.env'), 'utf8'));
const prefix = `nexus-t14-qa-${randomUUID()}`, users = [], mailIds = new Set(), workspaceIds = [], checks = [];
let app, database, base, stage = 'configuration';
async function post(route, body, cookie = '', origin = base) {
  return fetch(new URL(route, base), { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(15000), headers: {
    'Content-Type': 'application/json', Origin: origin, ...(cookie ? { Cookie: cookie } : {}),
  }, body: JSON.stringify(body) });
}
async function account(label) {
  const email = `${prefix}-${label}@nexus.local`, password = randomBytes(32).toString('base64url'); users.push({ email });
  const signup = await post('/auth/sign-up/email', { name: `T14 QA ${label}`, email, password }); assert.equal(signup.status, 200);
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
async function application(user, request) { return applicationResponseSchema.parse(await (await post('/api/application', request, user.cookie)).json()); }
function success(value, kind) { assert.equal(value.ok, true); if (kind) assert.equal(value.kind, kind); return value; }
function denied(value, code) { assert.equal(value.ok, false); assert.equal(value.code, code); }
const search = (user, query, fields = {}) => application(user, { operation: 'search', query, ...fields });

try {
  const target = new URL(env.DATABASE_URL); assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)); assert.equal(target.pathname, '/nexus_ai_dev');
  assert.equal(env.SMTP_HOST, '127.0.0.1'); assert.equal(env.SMTP_PORT, '1025');
  database = createDatabaseBoundary(readDatabaseConfig(env)); assert.equal(await database.check(), 'connected');
  const { createServer } = await import('node:net'); const probe = createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve)); base = `http://127.0.0.1:${port}`;
  app = await buildServer(readServerConfig({ ...env, NEXUS_SERVER_PORT: String(port), BETTER_AUTH_URL: base, NEXUS_WEB_URL: base, NEXUS_LOG_LEVEL: 'silent' })); await app.listen({ host: '127.0.0.1', port });
  stage = 'verified accounts and request boundary';
  const owner = await account('owner'), client = await account('client'), outsider = await account('outsider');
  const workspaceId = (await collab(owner, { operation: 'createWorkspace', name: prefix })).item.id; workspaceIds.push(workspaceId);
  const secondWorkspace = (await collab(owner, { operation: 'createWorkspace', name: `${prefix}-other` })).item.id; workspaceIds.push(secondWorkspace);
  const projectId = (await collab(owner, { operation: 'createProject', workspaceId, name: 'Beacon project', description: 'Visible project description', defaultVisibility: 'team' })).item.id;
  const otherProjectId = (await collab(owner, { operation: 'createProject', workspaceId: secondWorkspace, name: 'Beacon distant project', description: 'Cross workspace result', defaultVisibility: 'team' })).item.id;
  await database.pool.query("INSERT INTO workspace_member(workspace_id,user_id,role) VALUES($1,$2,'member'),($1,$3,'member')", [workspaceId, client.id, outsider.id]);
  await database.pool.query("INSERT INTO project_member(project_id,user_id,role) VALUES($1,$2,'client')", [projectId, client.id]);
  assert.equal((await post('/api/application', { operation: 'getSettings' })).status, 401);
  const wrongOrigin = await post('/api/application', { operation: 'getSettings' }, owner.cookie, 'https://invalid.example'); assert.equal(wrongOrigin.status, 403); assert.equal(wrongOrigin.headers.get('cache-control'), 'no-store');
  assert.equal((await post('/api/application', { operation: 'getSettings', userId: client.id }, owner.cookie)).status, 400);
  assert.equal((await post('/api/application', { operation: 'search', query: 'x' }, owner.cookie)).status, 400);
  checks.push('Three verified local accounts, actual PG/HTTP/Mailpit, authenticated strict Origin/no-store/schema boundary');

  stage = 'account preferences CAS and profile isolation';
  const initial = success(await application(owner, { operation: 'getSettings' }), 'settings').settings; assert.equal(initial.version, 0); assert.equal(initial.updatedAt, null);
  const preferences = { ...defaultApplicationPreferences, notificationsEnabled: false, notificationCategories: ['tasks'], defaultVisibility: 'client', defaultModelId: 'controlled-catalog-model', defaultEffort: 'high' };
  const save = { operation: 'saveSettings', expectedVersion: 0, name: 'QA profile <escaped>', preferences };
  const saved = success(await application(owner, save), 'settings').settings; assert.equal(saved.version, 1); assert.equal(saved.name, save.name); assert.deepEqual(saved.preferences, preferences);
  denied(await application(owner, save), 'conflict');
  const own = success(await application(client, { operation: 'getSettings' }), 'settings').settings; assert.equal(own.version, 0); assert.equal(own.name, 'T14 QA client'); assert.deepEqual(own.preferences, defaultApplicationPreferences);
  const races = await Promise.all([application(owner, { ...save, expectedVersion: 1, name: 'First editor' }), application(owner, { ...save, expectedVersion: 1, name: 'Second editor' })]);
  assert.equal(races.filter(value => value.ok).length, 1); assert.equal(races.filter(value => !value.ok && value.code === 'conflict').length, 1);
  const read = success(await application(owner, { operation: 'getSettings' }), 'settings').settings; assert.equal(read.version, 2);
  const user = (await database.pool.query('SELECT name FROM "user" WHERE id=$1', [owner.id])).rows[0]; assert.equal(user.name, read.name);
  denied(await application(owner, { ...save, expectedVersion: 2, preferences: { ...preferences, notificationCategories: ['tasks', 'tasks'] } }), 'invalid_request');
  assert.equal(success(await application(owner, { operation: 'getSettings' }), 'settings').settings.version, 2);
  checks.push('Absent preferences version0/default, atomic profile + preferences persistence, isolated account, duplicate category denial, simultaneous CAS one winner and stale retry conflict');

  stage = 'current audience and published-message search';
  const ids = Object.fromEntries(['task', 'privateTask', 'milestone', 'document', 'update', 'deliverable', 'privateVersion', 'session', 'privateSession', 'live', 'environment', 'privateEnvironment', 'deployment', 'privateDeployment'].map(key => [key, randomUUID()]));
  await database.pool.query(`INSERT INTO task(id,project_id,title,description,visibility,created_by) VALUES($1,$3,'Beacon task','Public task body','client',$4),($2,$3,'Beacon internal task','privateonlyneedle','team',$4)`, [ids.task, ids.privateTask, projectId, owner.id]);
  await database.pool.query("INSERT INTO milestone(id,project_id,title,description,visibility,created_by) VALUES($1,$2,'Beacon milestone','Milestone body','client',$3)", [ids.milestone, projectId, owner.id]);
  for (const [table, id, title] of [['project_document', ids.document, 'Beacon document'], ['project_update', ids.update, 'Beacon update']]) {
    await database.pool.query(`INSERT INTO ${table}(id,project_id,title,body,visibility,created_by) VALUES($1,$2,$3,$4,'client',$5)`, [id, projectId, title, 'z'.repeat(900) + ' needlebody beyond initial excerpt <script>plain text</script>', owner.id]);
  }
  for (const [id, versionVisibility] of [[ids.deliverable, 'client'], [ids.privateVersion, 'team']]) {
    await database.pool.query("INSERT INTO deliverable(id,project_id,title,visibility,version,created_by) VALUES($1,$2,'Beacon deliverable','client',1,$3)", [id, projectId, owner.id]);
    await database.pool.query("INSERT INTO deliverable_version(deliverable_id,version,title,body,visibility,created_by) VALUES($1,1,'Beacon deliverable','Beacon revision body',$2,$3)", [id, versionVisibility, owner.id]);
  }
  const messages = JSON.stringify([{ id: 'selected', role: 'assistant', text: 'z'.repeat(900) + ' beaconmessage selected shared text', status: 'complete' }]);
  for (const [id, visibility] of [[ids.session, 'client'], [ids.privateSession, 'team']]) await database.pool.query(`INSERT INTO ai_session(id,project_id,created_by,driver_user_id,device_id,title,visibility,messages) VALUES($1,$2,$3,$3,$4,'Shared title unrelated',$5,$6::jsonb)`, [id, projectId, owner.id, randomUUID(), visibility, messages]);
  await database.pool.query(`INSERT INTO live_share(id,project_id,author_id,device_id,title,visibility,messages) VALUES($1,$2,$3,$4,'Live title unrelated','client',$5::jsonb)`, [ids.live, projectId, owner.id, randomUUID(), messages]);
  for (const [id, visibility] of [[ids.environment, 'client'], [ids.privateEnvironment, 'team']]) await database.pool.query("INSERT INTO deployment_environment(id,project_id,name,kind,visibility,created_by) VALUES($1,$2,'Beacon staging','staging',$3,$4)", [id, projectId, visibility, owner.id]);
  for (const [id, parent] of [[ids.deployment, ids.environment], [ids.privateDeployment, ids.privateEnvironment]]) await database.pool.query("INSERT INTO project_deployment(id,project_id,environment_id,title,status,notes,created_by,observed_at) VALUES($1,$2,$3,'Beacon deployment','succeeded','Published deployment note',$4,now())", [id, projectId, parent, owner.id]);
  const publicSearch = success(await search(client, 'beacon', { projectId }), 'search').items;
  for (const id of [ids.privateTask, ids.privateSession, ids.privateEnvironment, ids.privateDeployment, ids.privateVersion]) assert.equal(publicSearch.some(item => item.id === id), false);
  assert.equal(publicSearch.some(item => item.id === ids.task), true); assert.equal(publicSearch.some(item => item.id === ids.deliverable), true);
  const allKinds = new Set(success(await search(owner, 'beacon', { projectId }), 'search').items.map(item => item.kind)); assert.equal(allKinds.size, 10);
  const messageHits = success(await search(client, 'beaconmessage'), 'search').items; assert.equal(messageHits.length, 2); assert.ok(messageHits.every(item => item.excerpt.includes('beaconmessage')));
  const bodyHits = success(await search(client, 'needlebody'), 'search').items; assert.equal(bodyHits.length, 2); assert.ok(bodyHits.every(item => item.excerpt.length <= 500 && item.excerpt.includes('needlebody')));
  assert.equal(success(await search(client, 'privateonlyneedle'), 'search').items.length, 0); assert.equal(success(await search(owner, 'privateonlyneedle'), 'search').items.length, 1);
  assert.equal(success(await search(outsider, 'beacon'), 'search').items.length, 0); denied(await search(outsider, 'beacon', { projectId }), 'forbidden');
  assert.equal(success(await search(client, 'beacon', { kind: 'task' }), 'search').items.length, 1);
  checks.push('All10types, SQL audience before match/snippet, published shared/live text with body-centered bounded excerpt, current deliverable revision and environment parent, outsider/project/kind scope');

  stage = 'literal query stable pages and cross-workspace';
  const cross = success(await search(owner, 'Beacon distant'), 'search').items; assert.equal(cross.length, 1); assert.equal(cross[0].workspaceId, secondWorkspace); assert.equal(cross[0].projectId, otherProjectId);
  assert.equal(success(await search(client, 'Beacon distant'), 'search').items.length, 0);
  await database.pool.query("UPDATE task SET description='Literal %_ query' WHERE id=$1", [ids.task]);
  const literal = success(await search(client, '%_'), 'search').items; assert.equal(literal.length, 1); assert.equal(literal[0].id, ids.task);
  const paged = Array.from({ length: 56 }, () => randomUUID());
  await database.pool.query(`INSERT INTO project_document(id,project_id,title,body,visibility,created_by) SELECT x,$2,'Pagefixture document','Published pagefixture','client',$3 FROM unnest($1::text[]) x`, [paged, projectId, owner.id]);
  const first = success(await search(client, 'Pagefixture', { limit: 50 }), 'search'); assert.equal(first.items.length, 50); assert.equal(first.nextOffset, 50);
  const last = success(await search(client, 'Pagefixture', { offset: first.nextOffset, limit: 50 }), 'search'); assert.equal(last.items.length, 6); assert.equal(last.nextOffset, null);
  const ordered = [...first.items, ...last.items].map(item => item.id); assert.equal(new Set(ordered).size, 56); assert.deepEqual(ordered, [...paged].sort());
  checks.push('Literal percent/underscore query, cross-workspace authorized results, stable 50+6 pages with no duplicates and no inaccessible total leakage');

  stage = 'current parent narrowing roles and revocation';
  await database.pool.query("UPDATE deployment_environment SET visibility='team' WHERE id=$1", [ids.environment]);
  const narrowed = success(await search(client, 'Beacon'), 'search').items; assert.equal(narrowed.some(item => item.id === ids.environment || item.id === ids.deployment), false);
  await database.pool.query("UPDATE project_member SET role='viewer' WHERE project_id=$1 AND user_id=$2", [projectId, client.id]);
  assert.equal(success(await search(client, 'privateonlyneedle'), 'search').items.length, 0);
  await database.pool.query("UPDATE project_member SET role='developer' WHERE project_id=$1 AND user_id=$2", [projectId, client.id]);
  assert.equal(success(await search(client, 'privateonlyneedle'), 'search').items.length, 1);
  await database.pool.query('DELETE FROM workspace_member WHERE workspace_id=$1 AND user_id=$2', [workspaceId, client.id]);
  assert.equal(success(await search(client, 'beacon'), 'search').items.length, 0); denied(await search(client, 'beacon', { projectId }), 'forbidden');
  checks.push('Current environment narrowing removes both parent/child; viewer restricted, developer sees team; workspace membership revocation overrides remaining project membership');

  await writeFile(path.join(output, 'application-report.json'), JSON.stringify({ task: 'T14', passed: true, checks, controlledFixtures: true, actual: 'PostgreSQL18/HTTP/Mailpit; three verified QA accounts; only explicitly shared DB content' }, null, 2));
  console.log(`T14 application verification passed (${checks.length} scenarios).`);
} catch (error) {
  await writeFile(path.join(output, 'application-report.json'), JSON.stringify({ task: 'T14', passed: false, stage, checks, error: error instanceof Error ? error.name : 'UnknownError' }, null, 2));
  console.error(`T14 application verification failed at ${stage}; report contains no credentials.`); process.exitCode = 1;
} finally {
  await app?.close();
  if (database?.pool) {
    for (const id of workspaceIds) await database.pool.query('DELETE FROM workspace WHERE id=$1 AND name LIKE $2', [id, prefix + '%']);
    for (const user of users) {
      await database.pool.query('DELETE FROM "user" WHERE email=$1', [user.email]);
      await database.pool.query('DELETE FROM verification WHERE identifier=$1 OR value LIKE $2', [user.email, '%' + user.email + '%']);
    }
  }
  for (const id of mailIds) await fetch('http://127.0.0.1:8025/api/v1/messages', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ IDs: [id] }) }).catch(() => undefined);
  await database?.close();
}
