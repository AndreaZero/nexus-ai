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
import { overviewResponseSchema, realtimeApiResponseSchema, realtimeServerFrameSchema, sessionsResponseSchema } from '../packages/contracts/dist/index.js';

// Local integration QA only: actual accounts/PG/HTTP/WS; no personal AI inference.
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, '.nexus/visual/t09'); await mkdir(output, { recursive: true });
const requireDesktop = createRequire(path.join(root, 'apps/desktop/package.json'));
const WebSocket = requireDesktop('ws');
const env = parseEnv(await readFile(path.join(root, '.env'), 'utf8'));
const prefix = `nexus-t09-qa-${randomUUID()}`;
const users = [], mailIds = new Set(), checks = [], peers = [];
let app, database, base, workspaceId; let stage = 'local configuration';
async function post(route, body, cookie = '', origin = base) {
  return fetch(new URL(route, base), { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
}
async function account(label) {
  const email = `${prefix}-${label}@nexus.local`, password = randomBytes(32).toString('base64url'); users.push({ email });
  const signup = await post('/auth/sign-up/email', { name: `T09 QA ${label}`, email, password }); assert.equal(signup.status, 200);
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
async function overview(user, request) { return overviewResponseSchema.parse(await (await post('/api/overview', request, user.cookie)).json()); }
async function upload(user, projectId, change) { const result = realtimeApiResponseSchema.parse(await (await post('/api/realtime', { operation: 'upload', projectId, batchId: randomUUID(), change }, user.cookie)).json()); assert.equal(result.ok, true); return result; }
async function publish(user, projectId, title, visibility) {
  const deviceId = randomUUID();
  const result = sessionsResponseSchema.parse(await (await post('/api/sessions', { operation: 'publish', projectId, sessionId: randomUUID(), expectedVersion: 0, deviceId, title, status: 'completed', visibility, messages: [{ id: 'selected', role: 'assistant', text: 'Controlled selected excerpt, no personal inference.' }] }, user.cookie)).json());
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
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
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
  stage = 'verified accounts and current project'; const owner = await account('owner'), client = await account('client'), outsider = await account('outsider');
  workspaceId = (await collab(owner, { operation: 'createWorkspace', name: prefix })).item.id;
  const projectId = (await collab(owner, { operation: 'createProject', workspaceId, name: 'T09 QA project', description: '', defaultVisibility: 'team' })).item.id;
  await database.pool.query("INSERT INTO workspace_member(workspace_id,user_id,role) VALUES($1,$2,'member'),($1,$3,'member')", [workspaceId, client.id, outsider.id]);
  await database.pool.query("INSERT INTO project_member(project_id,user_id,role) VALUES($1,$2,'client')", [projectId, client.id]);
  const initial = await overview(client, { operation: 'snapshot', projectId }); assert.equal(initial.snapshot.activity.length, 0); assert.equal(initial.snapshot.unreadCount, 0); assert.equal(initial.snapshot.memberCount, 2);
  assert.equal((await overview(outsider, { operation: 'snapshot', projectId })).ok, false); checks.push('Current membership, deduplicated member total, empty real project and outsider denial');
  stage = 'authorized shared activity and tasks';
  const excerpt = await publish(owner, projectId, 'Client excerpt one', 'client'); await publish(owner, projectId, 'Internal excerpt hidden', 'team'); await publish(owner, projectId, 'Client excerpt two', 'client');
  await database.pool.query("INSERT INTO task(id,project_id,title,created_by,status,visibility) VALUES($1,$2,'QA client task',$3,'in_progress','client'),($4,$2,'Internal QA task',$3,'review','team')", [randomUUID(), projectId, owner.id, randomUUID()]);
  const full = (await overview(owner, { operation: 'snapshot', projectId })).snapshot;
  const visible = (await overview(client, { operation: 'snapshot', projectId })).snapshot;
  assert.equal(full.activity.length, 3); assert.equal(visible.activity.length, 2); assert.equal(visible.notifications.length, 2); assert.equal(visible.unreadCount, 2); assert.equal(visible.tasks.length, 1); assert.equal(full.tasks.length, 2); assert.equal(JSON.stringify(visible).includes('Internal'), false); assert.equal(full.notifications.length, 0);
  checks.push('Current audience filters feed, tasks, notifications and counts before pagination; no message text in metadata');
  stage = 'pagination and filters'; const first = (await overview(client, { operation: 'snapshot', projectId, limit: 1 })).snapshot;
  const second = (await overview(client, { operation: 'snapshot', projectId, limit: 1, before: first.nextBefore })).snapshot;
  assert.equal(first.activity.length, 1); assert.equal(second.activity.length, 1); assert.notEqual(first.activity[0].id, second.activity[0].id); assert.ok(BigInt(first.activity[0].sequence) > BigInt(second.activity[0].sequence)); assert.equal(second.nextBefore, null);
  const commits = (await overview(client, { operation: 'snapshot', projectId, filter: 'commits' })).snapshot; assert.equal(commits.activity.length, 0); assert.equal(commits.notifications.length, 2); checks.push('Cursor pagination, real empty unsupported filter and independent notifications');
  stage = 'coalesced live activity and websocket invalidation'; const liveId = randomUUID(), privateId = randomUUID(), deviceId = randomUUID(); const observer = await peer(client, projectId); await observer.wait(frame => frame.type === 'snapshot');
  await upload(owner, projectId, { type: 'start', shareId: liveId, deviceId, title: 'Selected live QA', visibility: 'client', messages: [{ id: 'selected', role: 'assistant', text: 'Hi', status: 'streaming' }] });
  await upload(owner, projectId, { type: 'append', shareId: liveId, deviceId, updates: [{ messageId: 'selected', offset: 2, text: ' there', status: 'complete' }] });
  await upload(owner, projectId, { type: 'start', shareId: privateId, deviceId, title: 'Internal live hidden', visibility: 'team', messages: [{ id: 'private', role: 'assistant', text: 'Not authorized for clients', status: 'complete' }] });
  const changed = (await overview(client, { operation: 'snapshot', projectId })).snapshot;
  assert.equal(changed.activity.filter(item => item.target.id === liveId).length, 1); assert.equal(changed.activeShares.length, 1); assert.equal(JSON.stringify(changed).includes('Internal'), false);
  await observer.wait(frame => (frame.type === 'events' && frame.events.some(item => item.entityId === liveId)) || (frame.type === 'snapshot' && BigInt(frame.snapshot.cursor) >= BigInt(changed.cursor)));
  checks.push('Repeated text deltas coalesce to one current entity; real WS signals refresh without exposing internal metadata');
  stage = 'persistent monotonic read cursor';
  assert.equal((await overview(client, { operation: 'markRead', projectId, through: first.cursor })).ok, true);
  let read = (await overview(client, { operation: 'snapshot', projectId })).snapshot; assert.equal(read.unreadCount, 1);
  assert.equal((await overview(client, { operation: 'markRead', projectId, through: '0' })).readThrough, first.cursor);
  assert.equal((await overview(client, { operation: 'markRead', projectId, through: '9999999999999999999' })).ok, false);
  await overview(client, { operation: 'markRead', projectId, through: changed.cursor });
  await upload(owner, projectId, { type: 'stop', shareId: liveId, deviceId });
  read = (await overview(client, { operation: 'snapshot', projectId })).snapshot; assert.equal(read.unreadCount, 1); assert.equal(read.activity.find(item => item.target.id === liveId).kind, 'live.stopped'); assert.equal(read.activeShares.length, 0);
  await app.close(); app = await buildServer(config); await app.listen({ host: '127.0.0.1', port });
  const restored = (await overview(client, { operation: 'snapshot', projectId })).snapshot; assert.equal(restored.readThrough, changed.cursor); assert.equal(restored.unreadCount, 1); checks.push('Monotonic persistent read cursor rejects future cursors and leaves later changes unread across backend restart');
  stage = 'current audience removal from held feed';
  assert.ok(restored.authorizedTargets.some(item => item.id === excerpt.item.id));
  const edited = await post('/api/sessions', { operation: 'publish', projectId, sessionId: excerpt.item.id, expectedVersion: 1, deviceId: excerpt.qaDeviceId, title: 'New internal title', status: 'completed', visibility: 'team', messages: [{ id: 'selected', role: 'assistant', text: 'Updated QA excerpt is now internal.' }] }, owner.cookie);
  assert.equal((await edited.json()).ok, true);
  const narrowed = (await overview(client, { operation: 'snapshot', projectId })).snapshot;
  assert.equal(narrowed.activity.some(item => item.target.id === excerpt.item.id), false); assert.equal(narrowed.authorizedTargets.some(item => item.id === excerpt.item.id), false);
  checks.push('Current authorized target set removes a newly internal excerpt from previously held feed rows');
  stage = 'live revocation and route boundaries'; const revoked = await peer(client, projectId); await revoked.wait(frame => frame.type === 'snapshot');
  await collab(owner, { operation: 'removeMember', scope: { kind: 'project', projectId }, userId: client.id }); await revoked.wait(frame => frame.type === 'denied');
  assert.equal((await overview(client, { operation: 'snapshot', projectId })).ok, false); assert.equal((await overview(client, { operation: 'markRead', projectId, through: read.cursor })).ok, false);
  const forbidden = await post('/api/overview', { operation: 'snapshot', projectId }, owner.cookie, 'https://invalid.example'); assert.equal(forbidden.status, 403); assert.equal(forbidden.headers.get('cache-control'), 'no-store'); checks.push('Open socket revocation denies overview and mark-read; exact Origin and no-store enforced');
  await writeFile(path.join(output, 'overview-report.json'), JSON.stringify({ passed: true, checks, transport: 'actual PostgreSQL/SMTP/HTTP/WebSocket', fixtures: 'own temporary accounts, project, selected text and tasks only', personalInference: false }, null, 2));
  console.log(`Overview verification passed: ${checks.length} actual PostgreSQL/HTTP/WebSocket scenarios; no personal inference or credential output.`);
} catch { console.error(`Overview verification failed at: ${stage}. No credentials or content printed.`); process.exitCode = 1; }
finally {
  for (const item of peers) item.close(); await app?.close();
  if (database?.pool) { if (workspaceId) await database.pool.query('DELETE FROM workspace WHERE id=$1 AND name=$2', [workspaceId, prefix]); for (const user of users) { await database.pool.query('DELETE FROM "user" WHERE email=$1', [user.email]); await database.pool.query('DELETE FROM verification WHERE identifier=$1', [user.email]); } }
  await database?.close();
  if (mailIds.size) await fetch('http://127.0.0.1:8025/api/v1/messages', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ IDs: [...mailIds] }), signal: AbortSignal.timeout(3000) }).catch(() => {});
}
