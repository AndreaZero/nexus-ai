import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createDatabaseBoundary, readDatabaseConfig } from '../packages/db/dist/index.js';
import { buildServer } from '../apps/server/dist/app.js';
import { readServerConfig } from '../apps/server/dist/config.js';
import { pulseResponseSchema, realtimeServerFrameSchema, sessionsResponseSchema } from '../packages/contracts/dist/index.js';

// Local integration QA only: actual accounts/PG/HTTP/WS; no personal AI inference.
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, '.nexus/visual/t10'); await mkdir(output, { recursive: true });
const requireDesktop = createRequire(path.join(root, 'apps/desktop/package.json'));
const WebSocket = requireDesktop('ws');
const env = parseEnv(await readFile(path.join(root, '.env'), 'utf8'));
const prefix = `nexus-t10-qa-${randomUUID()}`;
const users = [], mailIds = new Set(), checks = [], peers = [];
let app, database, base, workspaceId; let stage = 'local configuration';
async function post(route, body, cookie = '', origin = base) {
  return fetch(new URL(route, base), { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
}
async function account(label) {
  const email = `${prefix}-${label}@nexus.local`, password = randomBytes(32).toString('base64url'); users.push({ email });
  const signup = await post('/auth/sign-up/email', { name: `T10 QA ${label}`, email, password }); assert.equal(signup.status, 200);
  const body = await signup.json(); let link;
  for (let attempt = 0; attempt < 4 && !link; attempt++) {
    const result = await (await fetch(`http://127.0.0.1:8025/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`, { signal: AbortSignal.timeout(3000) })).json();
    const id = result.messages?.[0]?.ID;
    if (id) { mailIds.add(id); const message = await (await fetch(`http://127.0.0.1:8025/api/v1/message/${id}`)).json(); link = message.Text?.match(/https?:\/\/[^\s<>"]+/)?.[0]; }
    else await new Promise(resolve => setTimeout(resolve, 150));
  }
  assert.ok(link); assert.equal(new URL(link).origin, base); assert.equal(new URL(link).pathname, '/auth/verify-email');
  assert.ok([200, 302, 303].includes((await fetch(link, { redirect: 'manual' })).status));
  const login = await post('/auth/sign-in/email', { email, password }); assert.equal(login.status, 200);
  const result = { id: body.user.id, email, cookie: login.headers.getSetCookie().map(value => value.split(';', 1)[0]).join('; ') }; users[users.length - 1] = result; return result;
}
async function collab(user, request) { const result = await (await post('/api/collaboration', request, user.cookie)).json(); assert.equal(result.ok, true); return result; }
async function pulse(user, request) { return pulseResponseSchema.parse(await (await post('/api/pulse', request, user.cookie)).json()); }
async function publish(user, projectId, title, visibility, status = 'completed') {
  const deviceId = randomUUID();
  const result = sessionsResponseSchema.parse(await (await post('/api/sessions', { operation: 'publish', projectId, sessionId: randomUUID(), expectedVersion: 0, deviceId, title, status, visibility, messages: [{ id: 'selected', role: 'assistant', text: 'T10 QA selected body MUST NOT appear in Pulse metadata.' }] }, user.cookie)).json());
  assert.equal(result.ok, true); return { ...result, qaDeviceId: deviceId };
}
async function peer(user, projectId) {
  const socket = new WebSocket(base.replace('http:', 'ws:') + '/api/realtime', { headers: { Origin: base, Cookie: user.cookie }, perMessageDeflate: false });
  const frames = []; const listeners = new Set();
  const wait = predicate => new Promise((resolve, reject) => {
    const check = () => { const found = frames.find(predicate); if (found) { clearTimeout(timer); listeners.delete(check); resolve(found); } };
    const timer = setTimeout(() => { listeners.delete(check); reject(new Error('Realtime frame not observed')); }, 12000); listeners.add(check); check();
  });
  socket.on('message', bytes => { const frame = realtimeServerFrameSchema.parse(JSON.parse(bytes.toString())); frames.push(frame); if (frame.type === 'snapshot' || frame.type === 'events') socket.send(JSON.stringify({ type: 'ack', cursor: frame.type === 'snapshot' ? frame.snapshot.cursor : frame.cursor })); for (const listener of listeners) listener(); });
  await new Promise((resolve, reject) => { const timer = setTimeout(() => { socket.terminate(); reject(new Error('Socket open deadline')); }, 10000); socket.once('open', () => { clearTimeout(timer); resolve(); }); socket.once('error', error => { clearTimeout(timer); reject(error); }); });
  socket.send(JSON.stringify({ type: 'join', projectId, cursor: null, deviceId: randomUUID() }));
  const heartbeat = setInterval(() => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'heartbeat' })); }, 15000); heartbeat.unref();
  const value = { wait, close: () => { clearInterval(heartbeat); socket.terminate(); } }; peers.push(value); return value;
}

try {
  const target = new URL(env.DATABASE_URL); assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)); assert.equal(target.pathname, '/nexus_ai_dev'); assert.equal(env.SMTP_HOST, '127.0.0.1'); assert.equal(env.SMTP_PORT, '1025');
  database = createDatabaseBoundary(readDatabaseConfig(env)); assert.equal(await database.check(), 'connected');
  const { createServer } = await import('node:net'); const probe = createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve)); const port = probe.address().port; await new Promise(resolve => probe.close(resolve)); base = `http://127.0.0.1:${port}`;
  const config = readServerConfig({ ...env, NEXUS_SERVER_PORT: String(port), BETTER_AUTH_URL: base, NEXUS_WEB_URL: base, NEXUS_LOG_LEVEL: 'silent' });
  app = await buildServer(config); await app.listen({ host: '127.0.0.1', port });
  stage = 'verified accounts and membership'; const owner = await account('owner'), client = await account('client'), outsider = await account('outsider');
  workspaceId = (await collab(owner, { operation: 'createWorkspace', name: prefix })).item.id;
  const projectId = (await collab(owner, { operation: 'createProject', workspaceId, name: 'T10 QA current project', description: '', defaultVisibility: 'team' })).item.id;
  const foreignProjectId = (await collab(owner, { operation: 'createProject', workspaceId, name: 'T10 QA other project', description: '', defaultVisibility: 'team' })).item.id;
  await database.pool.query("INSERT INTO workspace_member(workspace_id,user_id,role) VALUES($1,$2,'member'),($1,$3,'member')", [workspaceId, client.id, outsider.id]);
  await database.pool.query("INSERT INTO project_member(project_id,user_id,role) VALUES($1,$2,'client')", [projectId, client.id]);
  const snapshot = { operation: 'snapshot', projectId };
  const empty = await pulse(client, snapshot); assert.ok(empty.ok); assert.equal(empty.snapshot.audience, 'client'); assert.equal(empty.snapshot.progress.total, 0); assert.equal(empty.snapshot.progress.percent, null); assert.equal(empty.snapshot.milestoneCount, 0); assert.equal(empty.snapshot.outcomes.length, 0);
  assert.equal((await pulse(outsider, snapshot)).ok, false); assert.equal((await pulse(client, { ...snapshot, projectId: foreignProjectId })).ok, false);
  checks.push('Current membership, inaccessible project denial and real empty scope without invented progress');

  stage = 'visible task and milestone fixtures';
  const utcDay = (await database.pool.query("SELECT date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS start")).rows[0].start;
  const nextDay = new Date(utcDay.getTime() + 86400000), priorDay = new Date(utcDay.getTime() - 86400000);
  const publicMilestone = randomUUID(), privateMilestone = randomUUID();
  await database.pool.query("INSERT INTO milestone(id,project_id,title,created_by,visibility,due_at) VALUES($1,$2,'QA client milestone',$3,'client',$4),($5,$2,'Internal milestone hidden',$3,'team',NULL)", [publicMilestone, projectId, owner.id, nextDay, privateMilestone]);
  const emptyIds = Array.from({ length: 102 }, () => randomUUID());
  await database.pool.query("INSERT INTO milestone(id,project_id,title,created_by,visibility) SELECT id,$2,'QA empty milestone',$3,'client' FROM unnest($1::text[]) AS id", [emptyIds, projectId, owner.id]);
  const taskIds = Array.from({ length: 105 }, () => randomUUID());
  await database.pool.query(`INSERT INTO task(id,project_id,milestone_id,title,created_by,assignee_id,status,visibility,updated_at)
    SELECT id,$2,$3,'QA visible task ' || n,$4,CASE WHEN n % 2 = 0 THEN $4 ELSE $5 END,
      CASE WHEN n <= 60 THEN 'done' WHEN n <= 90 THEN 'review' ELSE 'todo' END,'client',
      CASE WHEN n <= 90 THEN $6::timestamptz ELSE $7::timestamptz END
    FROM unnest($1::text[]) WITH ORDINALITY AS ids(id,n)`, [taskIds, projectId, publicMilestone, owner.id, client.id, utcDay, priorDay]);
  await database.pool.query(`INSERT INTO task(id,project_id,milestone_id,title,created_by,assignee_id,status,visibility,updated_at)
    VALUES($1,$2,$3,'Internal child hidden',$4,$4,'todo','team',$5),
      ($6,$2,$7,'Internal task hidden',$4,$4,'review','team',$5),
      ($8,$9,$3,'Other project task must not count',$4,$4,'done','client',$5),
      ($10,$9,NULL,'Other project updated task must not count',$4,$4,'done','client',$5)`,
  [randomUUID(), projectId, publicMilestone, owner.id, utcDay, randomUUID(), privateMilestone, randomUUID(), foreignProjectId, randomUUID()]);
  const team = (await pulse(owner, snapshot)).snapshot, preview = (await pulse(owner, { ...snapshot, view: 'client' })).snapshot, visible = (await pulse(client, snapshot)).snapshot;
  assert.equal(team.audience, 'team'); assert.equal(team.progress.total, 107); assert.equal(team.progress.completed, 60); assert.equal(team.progress.inProgress, 31); assert.equal(team.progress.planned, 16);
  for (const projection of [preview, visible]) {
    assert.equal(projection.audience, 'client'); assert.equal(projection.overview.tasks.length, 100); assert.equal(projection.progress.total, 105);
    assert.equal(projection.progress.completed, 60); assert.equal(projection.progress.inProgress, 30); assert.equal(projection.progress.planned, 15); assert.equal(projection.progress.percent, 60 * 100 / 105);
    assert.equal(projection.milestoneCount, 103); assert.equal(projection.milestones.length, 100);
    assert.equal(projection.milestones.find(item => item.id === publicMilestone).progress.total, 105);
    assert.equal(projection.milestones.find(item => item.id !== publicMilestone).progress.percent, null);
    assert.equal(JSON.stringify(projection).includes('Internal'), false); assert.equal(JSON.stringify(projection).includes('Other project'), false);
  }
  assert.equal(team.milestoneCount, 104); assert.equal(team.milestones.find(item => item.id === publicMilestone).progress.total, 106);
  assert.equal(team.milestones.find(item => item.id === privateMilestone).progress.total, 1);
  checks.push('Global progress covers 105 visible tasks beyond overview100; hidden children and foreign-project tasks excluded before denominators; milestone count exceeds array limit');

  stage = 'UTC summary and personal assignee scope';
  const mine = (await pulse(owner, { ...snapshot, view: 'client', scope: 'mine', filter: 'files', before: '9999999999999999999' })).snapshot;
  const clientMine = (await pulse(client, { ...snapshot, scope: 'mine' })).snapshot;
  assert.equal(team.summary.tasksUpdated, 92); assert.equal(visible.summary.tasksUpdated, 90); assert.equal(mine.summary.tasksUpdated, 45); assert.equal(clientMine.summary.tasksUpdated, 45);
  assert.equal(mine.summary.dayStart, utcDay.toISOString()); assert.equal(mine.summary.dayEnd, nextDay.toISOString()); assert.equal(mine.progress.total, 105); assert.equal(mine.overview.activity.length, 0);
  for (const key of ['commits', 'buildsDeploys']) assert.equal(mine.summary[key], null);
  assert.equal(mine.summary.comments, 0); // T11 supplies retained comment/feedback counts; this fixture has none.
  checks.push('UTC [start,end) summary counts task records assigned to actor for mine, independent of feed filter; unsupported metrics stay null');

  stage = 'published completed outcomes and shared summary';
  const observer = await peer(client, projectId); await observer.wait(frame => frame.type === 'snapshot');
  const published = await publish(owner, projectId, 'QA public completed outcome', 'client');
  await publish(owner, projectId, 'Internal completed outcome hidden', 'team');
  // A technical participant publishes once, then current client privileges are restored.
  await database.pool.query("UPDATE project_member SET role='developer' WHERE project_id=$1 AND user_id=$2", [projectId, client.id]);
  await publish(client, projectId, 'QA colleague completed outcome', 'client');
  await database.pool.query("UPDATE project_member SET role='client' WHERE project_id=$1 AND user_id=$2", [projectId, client.id]);
  await publish(owner, projectId, 'QA running excerpt is not outcome', 'client', 'running');
  const afterTeam = (await pulse(owner, snapshot)).snapshot, afterClient = (await pulse(client, snapshot)).snapshot, afterPreview = (await pulse(owner, { ...snapshot, view: 'client', scope: 'mine' })).snapshot;
  assert.equal(afterTeam.outcomes.length, 3); assert.equal(afterClient.outcomes.length, 2); assert.equal(afterPreview.outcomes.length, 2);
  assert.equal(afterTeam.summary.sharedUpdates, 4); assert.equal(afterClient.summary.sharedUpdates, 3); assert.equal(afterPreview.summary.sharedUpdates, 2); assert.equal(afterPreview.summary.sharedSource, 'retained_entities');
  assert.equal(afterClient.outcomes.every(item => item.status === 'completed' && item.visibility === 'client'), true);
  for (const secret of ['Internal', 'MUST NOT', 'deviceId', 'messages', 'driverUserId']) assert.equal(JSON.stringify(afterClient).includes(secret), false);
  await observer.wait(frame => frame.type === 'events' && frame.events.some(item => item.entityId === published.item.id) || frame.type === 'snapshot' && BigInt(frame.snapshot.cursor) >= BigInt(afterClient.overview.cursor));
  checks.push('Only explicitly published completed excerpts become metadata outcomes; distinct retained shared entities and author mine; WS invalidates without transcript');

  stage = 'current audience narrowing and viewer role';
  const edit = await post('/api/sessions', { operation: 'publish', projectId, sessionId: published.item.id, expectedVersion: 1, deviceId: published.qaDeviceId, title: 'Internal moved outcome', status: 'completed', visibility: 'team', messages: [{ id: 'selected', role: 'assistant', text: 'T10 QA body remains protected.' }] }, owner.cookie); assert.equal((await edit.json()).ok, true);
  const narrowed = (await pulse(client, snapshot)).snapshot;
  assert.equal(narrowed.outcomes.some(item => item.id === published.item.id), false); assert.equal(narrowed.overview.authorizedTargets.some(item => item.id === published.item.id), false); assert.equal(narrowed.summary.sharedUpdates, 2);
  await database.pool.query("UPDATE project_member SET role='viewer' WHERE project_id=$1 AND user_id=$2", [projectId, client.id]);
  const viewer = (await pulse(client, snapshot)).snapshot; assert.equal(viewer.audience, 'client'); assert.equal(viewer.progress.total, 105); assert.equal(viewer.outcomes.length, 1);
  checks.push('Audience changes remove held outcomes/feed targets and summary entities; viewer cannot request team projection');

  stage = 'revocation and route boundaries';
  await collab(owner, { operation: 'removeMember', scope: { kind: 'project', projectId }, userId: client.id }); await observer.wait(frame => frame.type === 'denied');
  const denied = await pulse(client, snapshot); assert.equal(denied.ok, false); assert.equal(denied.code, 'forbidden');
  const forbidden = await post('/api/pulse', snapshot, owner.cookie, 'https://invalid.example'); assert.equal(forbidden.status, 403); assert.equal(forbidden.headers.get('cache-control'), 'no-store');
  const invalid = await post('/api/pulse', { ...snapshot, view: 'team' }, owner.cookie); assert.equal(invalid.status, 400);
  checks.push('Membership revocation denies open WS and subsequent Pulse snapshot; exact Origin/no-store and strict view schema enforced');
  await writeFile(path.join(output, 'pulse-report.json'), JSON.stringify({ passed: true, checks, transport: 'actual PostgreSQL/SMTP/HTTP/WebSocket', fixtures: 'own temporary accounts/workspace, task/milestone records and selected excerpt text', personalInference: false }, null, 2));
  console.log(`Pulse verification passed: ${checks.length} actual PostgreSQL/HTTP/WebSocket scenarios; no personal inference or credential output.`);
} catch { console.error(`Pulse verification failed at: ${stage}. No credentials or content printed.`); process.exitCode = 1; }
finally {
  for (const item of peers) item.close(); await app?.close();
  if (database?.pool) { if (workspaceId) await database.pool.query('DELETE FROM workspace WHERE id=$1 AND name=$2', [workspaceId, prefix]); for (const user of users) { await database.pool.query('DELETE FROM "user" WHERE email=$1', [user.email]); await database.pool.query('DELETE FROM verification WHERE identifier=$1', [user.email]); } }
  await database?.close();
  if (mailIds.size) await fetch('http://127.0.0.1:8025/api/v1/messages', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ IDs: [...mailIds] }), signal: AbortSignal.timeout(3000) }).catch(() => {});
}
