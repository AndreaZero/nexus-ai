import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createDatabaseBoundary, readDatabaseConfig } from '../packages/db/dist/index.js';
import { buildServer } from '../apps/server/dist/app.js';
import { readServerConfig } from '../apps/server/dist/config.js';
import { codexStateSchema, realtimeApiResponseSchema, realtimeServerFrameSchema } from '../packages/contracts/dist/index.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, '.nexus/visual/t08'); await mkdir(output, { recursive: true });
const directory = await mkdtemp(path.join(output, 'realtime-qa-'));
const requireDesktop = createRequire(path.join(root, 'apps/desktop/package.json'));
const WebSocket = requireDesktop('ws'); const { build } = requireDesktop('esbuild');
const env = parseEnv(await readFile(path.join(root, '.env'), 'utf8'));
const prefix = `nexus-t08-qa-${randomUUID()}`;
const users = [], mailIds = new Set(), checks = [], peers = [];
let app, database, base, workspaceId, desktop; let stage = 'local configuration';
async function post(route, body, cookie = '', origin = base) {
  return fetch(new URL(route, base), { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
}
async function account(label) {
  const email = `${prefix}-${label}@nexus.local`, password = randomBytes(32).toString('base64url'); users.push({ email });
  const signup = await post('/auth/sign-up/email', { name: `T08 QA ${label}`, email, password }); assert.equal(signup.status, 200);
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
async function api(user, request) { return realtimeApiResponseSchema.parse(await (await post('/api/realtime', request, user.cookie)).json()); }
async function peer(user, projectId, cursor = null, origin = base) {
  const socket = new WebSocket(base.replace('http:', 'ws:') + '/api/realtime', { headers: { Origin: origin, Cookie: user?.cookie ?? '' }, perMessageDeflate: false });
  const frames = []; const listeners = new Set();
  const wait = predicate => new Promise((resolve, reject) => {
    const check = () => { const found = frames.find(predicate); if (found) { clearTimeout(timer); listeners.delete(check); resolve(found); } };
    const timer = setTimeout(() => { listeners.delete(check); reject(new Error('Realtime frame not observed')); }, 12000); listeners.add(check); check();
  });
  socket.on('message', bytes => { const frame = realtimeServerFrameSchema.parse(JSON.parse(bytes.toString())); frames.push(frame); if (frame.type === 'snapshot' || frame.type === 'events') socket.send(JSON.stringify({ type: 'ack', cursor: frame.type === 'snapshot' ? frame.snapshot.cursor : frame.cursor })); for (const listener of listeners) listener(); });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  socket.send(JSON.stringify({ type: 'join', projectId, cursor, deviceId: randomUUID() }));
  const heartbeat = setInterval(() => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'heartbeat' })); }, 15000); heartbeat.unref();
  const value = { socket, frames, wait, close: () => { clearInterval(heartbeat); socket.terminate(); } }; peers.push(value); return value;
}
function untilState(service, predicate, timeout = 12000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { clearInterval(tick); reject(new Error('Desktop state not observed')); }, timeout);
    const tick = setInterval(() => { void service.request({ operation: 'getState' }).then(result => { if (predicate(result.state)) { clearTimeout(timer); clearInterval(tick); resolve(result.state); } }); }, 80);
  });
}
try {
  const target = new URL(env.DATABASE_URL); assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)); assert.equal(target.pathname, '/nexus_ai_dev'); assert.equal(env.SMTP_HOST, '127.0.0.1'); assert.equal(env.SMTP_PORT, '1025');
  database = createDatabaseBoundary(readDatabaseConfig(env)); assert.equal(await database.check(), 'connected');
  // Configure an exact ephemeral origin without touching the user's server port.
  const { createServer } = await import('node:net'); const probe = createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve)); const port = probe.address().port; await new Promise(resolve => probe.close(resolve)); base = `http://127.0.0.1:${port}`;
  const config = readServerConfig({ ...env, NEXUS_SERVER_PORT: String(port), BETTER_AUTH_URL: base, NEXUS_WEB_URL: base, NEXUS_LOG_LEVEL: 'silent' });
  app = await buildServer(config); await app.listen({ host: '127.0.0.1', port });
  stage = 'verified accounts and project'; const owner = await account('owner'), viewer = await account('viewer'), outsider = await account('outsider');
  workspaceId = (await collab(owner, { operation: 'createWorkspace', name: prefix })).item.id;
  const projectId = (await collab(owner, { operation: 'createProject', workspaceId, name: 'T08 QA project', description: '', defaultVisibility: 'team' })).item.id;
  await database.pool.query("INSERT INTO workspace_member(workspace_id,user_id,role) VALUES($1,$2,'member'),($1,$3,'member')", [workspaceId, viewer.id, outsider.id]);
  await database.pool.query("INSERT INTO project_member(project_id,user_id,role) VALUES($1,$2,'client')", [projectId, viewer.id]);
  stage = 'authenticated sockets and presence'; const ownerPeer = await peer(owner, projectId), viewerPeer = await peer(viewer, projectId);
  await ownerPeer.wait(frame => frame.type === 'snapshot'); await viewerPeer.wait(frame => frame.type === 'snapshot');
  await ownerPeer.wait(frame => frame.type === 'presence' && frame.members.length === 2); checks.push('Two authenticated accounts receive current-project presence');
  const strangerPeer = await peer(outsider, projectId); await strangerPeer.wait(frame => frame.type === 'denied'); checks.push('Ordinary workspace member cannot subscribe to unassigned project');
  stage = 'persisted upload and idempotent ACK'; const shareId = randomUUID(), deviceId = randomUUID();
  const start = { operation: 'upload', projectId, batchId: randomUUID(), change: { type: 'start', shareId, deviceId, title: 'QA selected text', visibility: 'client', messages: [{ id: 'selected', role: 'assistant', text: 'Hello', status: 'streaming' }] } };
  const accepted = await api(owner, start); assert.equal(accepted.ok, true); assert.equal(accepted.kind, 'ack'); assert.deepEqual(await api(owner, start), accepted);
  assert.equal((await api(owner, { ...start, change: { ...start.change, title: 'Changed retry' } })).ok, false);
  await viewerPeer.wait(frame => frame.type === 'events' && frame.events.some(event => event.entityId === shareId));
  const append = { ...start, batchId: randomUUID(), change: { type: 'append', shareId, deviceId, updates: [{ messageId: 'selected', offset: 5, text: ' world', status: 'complete' }] } };
  assert.equal((await api(owner, append)).ok, true); assert.equal((await api(owner, append)).ok, true);
  assert.equal((await api(owner, { ...append, batchId: randomUUID() })).ok, false);
  const selected = await api(viewer, { operation: 'readShare', projectId, shareId }); assert.equal(selected.share.messages[0].text, 'Hello world');
  assert.equal((await api(viewer, start)).ok, false); checks.push('Commit ACK, identical retry, offset conflict and no duplicate text');
  stage = 'audience and replay'; const privateId = randomUUID();
  assert.equal((await api(owner, { ...start, batchId: randomUUID(), change: { ...start.change, shareId: privateId, title: 'Private QA', visibility: 'team' } })).ok, true);
  const snapshot = await api(viewer, { operation: 'snapshot', projectId }); assert.equal(snapshot.snapshot.shares.some(item => item.id === privateId), false);
  assert.equal((await api(viewer, { operation: 'readShare', projectId, shareId: privateId })).ok, false);
  const replay = await peer(viewer, projectId, accepted.cursor); const replayed = await replay.wait(frame => frame.type === 'snapshot'); assert.equal(replayed.snapshot.shares.some(item => item.id === privateId), false);
  const future = await peer(viewer, projectId, '999999999999'); assert.equal((await future.wait(frame => frame.type === 'snapshot')).resync, true); checks.push('Reconnect snapshot/current audience and invalid cursor resync');
  stage = 'desktop queue with lost ACK';
  const repositoryId = randomUUID(); await database.pool.query("INSERT INTO repository(id,project_id,remote_url,default_branch) VALUES($1,$2,'https://github.com/example/qa','main')", [repositoryId, projectId]);
  const repo = path.join(directory, 'repository'); await mkdir(repo);
  const module = path.join(directory, 'desktop.cjs'); await build({ bundle: true, platform: 'node', target: 'node22', format: 'cjs', entryPoints: [path.join(root, 'apps/desktop/src/realtime.ts')], outfile: module, logLevel: 'silent' });
  const { DesktopRealtime } = requireDesktop(module); const memory = new Map(); let dropAck = true; const batchIds = [];
  const nexus = { status: 'signed_in', user: { id: owner.id, name: 'QA owner', email: owner.email, emailVerified: true, image: null }, expiresAt: '2099-01-01T00:00:00.000Z', persistent: false, message: null };
  desktop = new DesktopRealtime({ auth: { getState: async () => nexus, realtimeSession: async () => ({ userId: owner.id, cookie: owner.cookie, server: base }), authorizeRepository: async () => ({ userId: owner.id }) }, bindings: { get: async () => ({ projectId, repositoryId, deviceId, rootPath: repo, label: 'QA folder', updatedAt: new Date().toISOString() }) }, storage: { getItem: async key => memory.get(key) ?? null, setItem: async (key, value) => { memory.set(key, value); } }, verifySource: async () => ({ userId: owner.id, cwd: await (await import('node:fs/promises')).realpath(repo) }), publish: () => {}, fetch: async (url, options) => {
    const body = JSON.parse(options.body); const response = await fetch(url, options);
    if (body.operation === 'upload') { batchIds.push(body.batchId); if (dropAck) { dropAck = false; await response.arrayBuffer(); throw new TypeError('QA drops an already committed ACK'); } }
    return response;
  } });
  desktop.nexusStateChanged(nexus); assert.equal((await desktop.request({ operation: 'connect', projectId })).ok, true); await untilState(desktop, state => state.connection === 'online');
  const state = codexStateSchema.parse({ runtime: 'ready', version: '0.159.2', expectedVersion: '0.159.2', runtimePath: null, account: null, login: null, models: [], policy: 'readOnly', notice: null, session: { projectId, repositoryId, threadId: 'controlled-qa-thread', turnId: 'controlled-turn', folderLabel: 'QA folder', model: 'controlled', status: 'running', messages: [{ id: 'live-selected', role: 'assistant', text: 'Selected', status: 'streaming' }], activities: [], error: null } });
  desktop.observeCodex(state); assert.equal((await desktop.request({ operation: 'startSharing', projectId, repositoryId, title: 'Desktop QA selected', visibility: 'client', messages: state.session.messages })).ok, true);
  const drained = await untilState(desktop, value => value.pending === 0 && value.sharing !== null, 18000); assert.ok(batchIds.length >= 2); assert.equal(batchIds[0], batchIds[1]);
  state.session.messages[0].text = 'Selected text only'; state.session.messages.push({ id: 'not-selected', role: 'assistant', text: 'Unselected private fixture', status: 'complete' }); desktop.observeCodex(state);
  await untilState(desktop, value => value.pending === 0 && batchIds.length >= 3);
  const live = await api(viewer, { operation: 'readShare', projectId, shareId: drained.sharing.shareId }); assert.equal(live.share.messages.length, 1); assert.equal(live.share.messages[0].text, 'Selected text only'); checks.push('Actual desktop WS/HTTP queue retries same committed batch and captures selected IDs only');
  stage = 'backend restart and recovery'; await app.close(); app = undefined; await untilState(desktop, value => value.connection !== 'online');
  app = await buildServer(config); await app.listen({ host: '127.0.0.1', port }); await untilState(desktop, value => value.connection === 'online', 18000);
  assert.equal((await api(viewer, { operation: 'readShare', projectId, shareId: drained.sharing.shareId })).share.messages[0].text, 'Selected text only'); checks.push('Backend restart recovers accepted selected text through authoritative snapshot');
  stage = 'open-socket revocation'; const revoked = await peer(viewer, projectId); await revoked.wait(frame => frame.type === 'snapshot');
  await collab(owner, { operation: 'removeMember', scope: { kind: 'project', projectId }, userId: viewer.id }); await revoked.wait(frame => frame.type === 'denied');
  assert.equal((await api(viewer, { operation: 'readShare', projectId, shareId })).ok, false); checks.push('Revocation closes open subscription and denies detail/replay');
  stage = 'route and audit boundaries'; assert.equal((await post('/api/realtime', { operation: 'snapshot', projectId }, owner.cookie, 'https://invalid.example')).status, 403);
  const events = await database.pool.query('SELECT kind, entity_id FROM realtime_event WHERE project_id=$1', [projectId]); assert.ok(events.rows.length >= 5); assert.equal(JSON.stringify(events.rows).includes('Selected text'), false); checks.push('Strict HTTP Origin and metadata-only durable events');
  await writeFile(path.join(output, 'realtime-report.json'), JSON.stringify({ passed: true, checks, database: 'local dedicated', transport: 'actual PostgreSQL/HTTP/WebSocket + desktop service', storage: 'memory seam; OS encrypted adapter checked separately', codex: 'controlled source DTO, no inference', fixtureCleanup: 'finally' }, null, 2));
  console.log(`Realtime verification passed: ${checks.length} PostgreSQL/HTTP/WebSocket scenarios; no personal inference or credential output.`);
} catch { console.error(`Realtime verification failed at: ${stage}. No credentials or message content printed.`); process.exitCode = 1; }
finally {
  await desktop?.dispose(); for (const item of peers) item.close(); await app?.close();
  if (database?.pool) { if (workspaceId) await database.pool.query('DELETE FROM workspace WHERE id=$1 AND name=$2', [workspaceId, prefix]); for (const user of users) { await database.pool.query('DELETE FROM "user" WHERE email=$1', [user.email]); await database.pool.query('DELETE FROM verification WHERE identifier=$1', [user.email]); } }
  await database?.close();
  if (mailIds.size) await fetch('http://127.0.0.1:8025/api/v1/messages', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ IDs: [...mailIds] }), signal: AbortSignal.timeout(3000) }).catch(() => {});
  if (path.dirname(directory) === output && path.basename(directory).startsWith('realtime-qa-')) await rm(directory, { recursive: true, force: true });
}
