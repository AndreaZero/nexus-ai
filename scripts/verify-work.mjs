import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createDatabaseBoundary, readDatabaseConfig } from '../packages/db/dist/index.js';
import { buildServer } from '../apps/server/dist/app.js';
import { readServerConfig } from '../apps/server/dist/config.js';
import { overviewResponseSchema, pulseResponseSchema, workResponseSchema, realtimeServerFrameSchema, sessionsResponseSchema } from '../packages/contracts/dist/index.js';

// Local integration QA only: actual accounts/PG/HTTP/WS; no personal AI inference.
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, '.nexus/visual/t11'); await mkdir(output, { recursive: true });
const requireDesktop = createRequire(path.join(root, 'apps/desktop/package.json'));
const WebSocket = requireDesktop('ws');
const env = parseEnv(await readFile(path.join(root, '.env'), 'utf8'));
const prefix = `nexus-t11-qa-${randomUUID()}`;
const users = [], mailIds = new Set(), checks = [], peers = [];
let app, database, base, workspaceId; let stage = 'local configuration'; let boundary = null;
async function post(route, body, cookie = '', origin = base) {
  const response = await fetch(new URL(route, base), { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  boundary = { route, status: response.status }; return response;
}
async function account(label) {
  const email = `${prefix}-${label}@nexus.local`, password = randomBytes(32).toString('base64url'); users.push({ email });
  const signup = await post('/auth/sign-up/email', { name: `T11 QA ${label}`, email, password }); assert.equal(signup.status, 200);
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
async function overview(user, request) { return overviewResponseSchema.parse(await (await post('/api/overview', request, user.cookie)).json()); }
async function publish(user, projectId, title, visibility, status = 'completed') {
  const deviceId = randomUUID();
  const result = sessionsResponseSchema.parse(await (await post('/api/sessions', { operation: 'publish', projectId, sessionId: randomUUID(), expectedVersion: 0, deviceId, title, status, visibility, messages: [{ id: 'selected', role: 'assistant', text: 'T11 QA selected body MUST NOT appear in Pulse metadata.' }] }, user.cookie)).json());
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
  const value = { wait, frames, close: () => { clearInterval(heartbeat); socket.terminate(); } }; peers.push(value); return value;
}

async function work(user, request) { return workResponseSchema.parse(await (await post('/api/work', request, user.cookie)).json()); }
const provenance = { sourceSessionId: null, taskId: null, documentId: null };
const mutation = (projectId, operation, fields = {}) => ({ operation, projectId, requestId: randomUUID(), ...fields });
function success(result, kind) { assert.equal(result.ok, true); assert.equal(result.kind, kind); return result; }
function rejected(result, code) { assert.equal(result.ok, false); assert.equal(result.code, code); }
async function read(user, projectId, kind, id, options = {}) { return work(user, { operation: 'read', projectId, kind, id, ...options }); }
async function list(user, projectId, kind, options = {}) { return work(user, { operation: 'list', projectId, kind, ...options }); }

try {
  const target = new URL(env.DATABASE_URL); assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)); assert.equal(target.pathname, '/nexus_ai_dev');
  assert.equal(env.SMTP_HOST, '127.0.0.1'); assert.equal(env.SMTP_PORT, '1025');
  database = createDatabaseBoundary(readDatabaseConfig(env)); assert.equal(await database.check(), 'connected');
  const { createServer } = await import('node:net'); const probe = createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve)); base = `http://127.0.0.1:${port}`;
  const config = readServerConfig({ ...env, NEXUS_SERVER_PORT: String(port), BETTER_AUTH_URL: base, NEXUS_WEB_URL: base, NEXUS_LOG_LEVEL: 'silent' });
  app = await buildServer(config); await app.listen({ host: '127.0.0.1', port });
  stage = 'verified accounts and role boundaries';
  // Keep signup within its actual three/minute budget. The client's current role
  // is changed explicitly below to exercise viewer/developer authority on every read.
  const owner = await account('owner'), client = await account('client'), outsider = await account('outsider'); const viewer = client;
  workspaceId = (await collab(owner, { operation: 'createWorkspace', name: prefix })).item.id;
  const projectId = (await collab(owner, { operation: 'createProject', workspaceId, name: 'T11 QA current project', description: '', defaultVisibility: 'team' })).item.id;
  const foreignProjectId = (await collab(owner, { operation: 'createProject', workspaceId, name: 'T11 QA other project', description: '', defaultVisibility: 'team' })).item.id;
  await database.pool.query("INSERT INTO workspace_member(workspace_id,user_id,role) VALUES($1,$2,'member'),($1,$3,'member')", [workspaceId, client.id, outsider.id]);
  await database.pool.query("INSERT INTO project_member(project_id,user_id,role) VALUES($1,$2,'client')", [projectId, client.id]);
  const empty = success(await list(client, projectId, 'task'), 'list'); assert.equal(empty.total, 0); assert.equal(empty.items.length, 0);
  rejected(await list(outsider, projectId, 'task'), 'forbidden'); rejected(await list(client, foreignProjectId, 'document'), 'forbidden');
  const badOrigin = await post('/api/work', { operation: 'list', projectId, kind: 'task' }, owner.cookie, 'https://invalid.example');
  assert.equal(badOrigin.status, 403); assert.equal(badOrigin.headers.get('cache-control'), 'no-store');
  assert.equal((await post('/api/work', { operation: 'list', projectId, kind: 'task', cookie: 'arbitrary' }, owner.cookie)).status, 400);
  checks.push('Verified local accounts, empty real project, outsider/cross-project denial, strict Origin/no-store/schema');

  stage = 'task to selected session to document and published update';
  const milestoneFields = { id: null, expectedVersion: 0, title: 'QA public roadmap milestone', body: 'Scope explicitly published', visibility: 'client', dueAt: '2026-12-01T10:00:00Z' };
  const milestone = success(await work(owner, mutation(projectId, 'saveMilestone', milestoneFields)), 'changed');
  const taskFields = { id: null, expectedVersion: 0, title: 'QA task linked to result', body: 'Work requirement', visibility: 'client', status: 'todo', assigneeId: owner.id, milestoneId: milestone.id, sourceSessionId: null };
  const task = success(await work(owner, mutation(projectId, 'saveTask', taskFields)), 'changed');
  const excerpt = await publish(owner, projectId, 'QA explicitly selected completed result', 'client');
  const linkedTask = success(await work(owner, mutation(projectId, 'saveTask', { ...taskFields, id: task.id, expectedVersion: 1, sourceSessionId: excerpt.item.id, status: 'done' })), 'changed');
  assert.equal(linkedTask.version, 2);
  const documentFields = { ...provenance, id: null, expectedVersion: 0, title: 'QA project document', body: 'Selected <script>plain text</script> result, never executed', visibility: 'client', sourceSessionId: excerpt.item.id, taskId: task.id };
  const document = success(await work(owner, mutation(projectId, 'saveDocument', documentFields)), 'changed');
  const documentRead = success(await read(client, projectId, 'document', document.id), 'item').item;
  assert.equal(documentRead.sourceSessionId, excerpt.item.id); assert.equal(documentRead.taskId, task.id); assert.equal(documentRead.body, documentFields.body);
  const update = success(await work(owner, mutation(projectId, 'publishUpdate', { ...provenance, title: 'QA published update', body: 'Update explicitly previewed', visibility: 'client', sourceSessionId: excerpt.item.id, taskId: task.id, documentId: document.id })), 'changed');
  const updateRead = success(await read(client, projectId, 'update', update.id), 'item').item; assert.equal(updateRead.documentId, document.id); assert.equal(updateRead.version, 1);
  const roadmap = success(await read(client, projectId, 'milestone', milestone.id), 'item').item; assert.equal(roadmap.progress.total, 1); assert.equal(roadmap.progress.completed, 1); assert.equal(roadmap.progress.percent, 100);
  checks.push('Traversable task/assignment → selected published session → document/provenance → immutable update; visible-task roadmap progress');

  stage = 'idempotent receipt, CAS conflict and transaction rollback';
  const retryRequest = mutation(projectId, 'saveDocument', { ...documentFields, id: document.id, expectedVersion: 1, title: 'QA document version two' });
  const receipt = success(await work(owner, retryRequest), 'changed'); assert.equal(receipt.version, 2);
  assert.deepEqual(await work(owner, retryRequest), receipt);
  rejected(await work(owner, { ...retryRequest, body: 'Different content with reused request ID' }), 'conflict');
  const countsBefore = (await database.pool.query(`SELECT (SELECT count(*) FROM work_receipt WHERE project_id=$1)::text AS receipts,
    (SELECT count(*) FROM work_change WHERE project_id=$1)::text AS changes`, [projectId])).rows[0];
  rejected(await work(owner, mutation(projectId, 'saveDocument', { ...documentFields, id: document.id, expectedVersion: 1, title: 'Stale cannot replace' })), 'conflict');
  const countsAfter = (await database.pool.query(`SELECT (SELECT count(*) FROM work_receipt WHERE project_id=$1)::text AS receipts,
    (SELECT count(*) FROM work_change WHERE project_id=$1)::text AS changes`, [projectId])).rows[0];
  assert.deepEqual(countsAfter, countsBefore); assert.equal(success(await read(client, projectId, 'document', document.id), 'item').item.title, 'QA document version two');
  checks.push('Idempotent receipt replays identical metadata; request-ID hash mismatch and stale CAS reject without mutation/event/receipt');

  stage = 'selected attachment security and explicit download';
  const bytes = Buffer.from('T11 own selected attachment\n', 'utf8'); const base64 = bytes.toString('base64'); const sha256 = createHash('sha256').update(bytes).digest('hex');
  const uploaded = success(await work(owner, mutation(projectId, 'uploadAttachment', { name: 'release-notes.txt', mime: 'text/plain', base64 })), 'uploaded').attachment;
  assert.equal(uploaded.sha256, sha256); assert.equal(uploaded.size, bytes.length);
  const ownUploads = success(await work(owner, { operation: 'listAttachments', projectId }), 'uploads');
  assert.deepEqual(ownUploads.items.map(item => item.id), [uploaded.id]); assert.equal(JSON.stringify(ownUploads).includes('base64'), false);
  rejected(await work(client, { operation: 'listAttachments', projectId }), 'forbidden');
  rejected(await work(owner, { operation: 'listAttachments', projectId, view: 'client' }), 'forbidden');
  rejected(await work(owner, { operation: 'readAttachment', projectId, id: uploaded.id, view: 'client' }), 'not_found');
  rejected(await work(client, { operation: 'readAttachment', projectId, id: uploaded.id }), 'not_found');
  for (const invalid of [{ name: '.env', mime: 'text/plain', base64 }, { name: '../notes.txt', mime: 'text/plain', base64 },
    { name: 'unknown.bin', mime: 'application/octet-stream', base64 }, { name: 'fake.png', mime: 'image/png', base64 },
    { name: 'oversize.txt', mime: 'text/plain', base64: Buffer.alloc(1048577, 65).toString('base64') }]) {
    rejected(await work(owner, mutation(projectId, 'uploadAttachment', invalid)), 'invalid_request');
  }
  const deliverableFields = { ...provenance, id: null, expectedVersion: 0, title: 'QA release deliverable', body: 'Explicit customer release content', visibility: 'client', sourceSessionId: excerpt.item.id, taskId: task.id, documentId: document.id, attachmentIds: [uploaded.id] };
  const deliverable = success(await work(owner, mutation(projectId, 'publishDeliverable', deliverableFields)), 'changed');
  assert.equal(success(await work(owner, { operation: 'listAttachments', projectId }), 'uploads').items.some(item => item.id === uploaded.id), false);
  const download = success(await work(client, { operation: 'readAttachment', projectId, id: uploaded.id }), 'attachment');
  assert.equal(download.base64, base64); assert.equal(createHash('sha256').update(Buffer.from(download.base64, 'base64')).digest('hex'), download.attachment.sha256);
  const initialDeliverable = success(await read(client, projectId, 'deliverable', deliverable.id), 'item').item;
  assert.equal(initialDeliverable.attachments[0].id, uploaded.id); assert.equal(JSON.stringify(initialDeliverable).includes('base64'), false);
  rejected(await work(owner, mutation(projectId, 'deleteAttachment', { id: uploaded.id })), 'forbidden');
  const unused = success(await work(owner, mutation(projectId, 'uploadAttachment', { name: 'unused.txt', mime: 'text/plain', base64 })), 'uploaded');
  assert.deepEqual(success(await work(owner, { operation: 'listAttachments', projectId }), 'uploads').items.map(item => item.id), [unused.attachment.id]);
  success(await work(owner, mutation(projectId, 'deleteAttachment', { id: unused.attachment.id })), 'attachmentDeleted');
  assert.deepEqual(success(await work(owner, { operation: 'listAttachments', projectId }), 'uploads').items, []);
  rejected(await work(owner, { operation: 'readAttachment', projectId, id: unused.attachment.id }), 'not_found');
  checks.push('Own explicit upload/download preserves bytes/hash; recoverable unused upload list private to technical author and denied in client preview, attached files leave recovery list; unsafe names/path/.env/MIME/signature/oversize denied; published attachments retained');

  stage = 'client feedback, comments, approval and immutable revision history';
  const feedback = success(await work(client, mutation(projectId, 'addFeedback', { targetKind: 'deliverable', targetId: deliverable.id, body: 'Client explicitly likes the release', sentiment: 'positive' })), 'changed');
  const comment = success(await work(client, mutation(projectId, 'addComment', { targetKind: 'deliverable', targetId: deliverable.id, body: 'Please keep the text attachment' })), 'changed');
  assert.equal(success(await read(client, projectId, 'feedback', feedback.id), 'item').item.sentiment, 'positive');
  assert.equal(success(await list(client, projectId, 'comment', { targetKind: 'deliverable', targetId: deliverable.id }), 'list').total, 1);
  const commentsPulse = await pulse(client, { operation: 'snapshot', projectId }); assert.equal(commentsPulse.ok, true); assert.equal(commentsPulse.snapshot.summary.comments, 2);
  const ownCommentsPulse = await pulse(owner, { operation: 'snapshot', projectId, scope: 'mine' }); assert.equal(ownCommentsPulse.ok, true); assert.equal(ownCommentsPulse.snapshot.summary.comments, 0);
  const approval = mutation(projectId, 'decideDeliverable', { id: deliverable.id, expectedVersion: 1, decision: 'approved', body: 'Client approved revision one' });
  success(await work(client, approval), 'changed'); assert.deepEqual(await work(client, approval), await work(client, approval));
  rejected(await work(client, { ...approval, requestId: randomUUID() }), 'conflict');
  const approved = success(await read(client, projectId, 'deliverable', deliverable.id), 'item').item;
  assert.equal(approved.status, 'approved'); assert.equal(approved.decision.by.id, client.id);
  success(await work(owner, mutation(projectId, 'publishDeliverable', { ...deliverableFields, id: deliverable.id, expectedVersion: 1, body: 'Revised explicit release content', attachmentIds: [] })), 'changed');
  const revised = success(await read(client, projectId, 'deliverable', deliverable.id), 'item').item;
  assert.equal(revised.version, 2); assert.equal(revised.status, 'pending'); assert.equal(revised.decision, null); assert.equal(revised.revisions.length, 2); assert.equal(revised.revisions.find(item => item.version === 1).decision.decision, 'approved');
  rejected(await work(client, { ...approval, requestId: randomUUID() }), 'conflict');
  const historical = success(await read(client, projectId, 'deliverable', deliverable.id, { revision: 1 }), 'item').item;
  assert.equal(historical.body, deliverableFields.body); assert.equal(historical.decision.by.id, client.id); assert.equal(historical.attachments[0].id, uploaded.id);
  success(await work(client, { operation: 'readAttachment', projectId, id: uploaded.id }), 'attachment');
  checks.push('Actual client feedback/comments counted as two UTC retained entities with correct mine scope; single approval and receipt retry safe; new immutable revision pending, stale decision denied, prior decision and attachment download retained');

  stage = 'roles, provenance audience and client preview';
  const privateDocument = success(await work(owner, mutation(projectId, 'saveDocument', { ...documentFields, title: 'Internal QA document secret', visibility: 'team', sourceSessionId: null, taskId: null })), 'changed');
  const foreignDocument = success(await work(owner, mutation(foreignProjectId, 'saveDocument', { ...documentFields, title: 'Other project QA source', sourceSessionId: null, taskId: null })), 'changed');
  for (const sourceId of [privateDocument.id, foreignDocument.id]) rejected(await work(owner, mutation(projectId, 'saveDocument', { ...documentFields, documentId: sourceId })), 'invalid_request');
  rejected(await work(owner, mutation(projectId, 'saveTask', { ...taskFields, id: task.id, expectedVersion: 2, assigneeId: outsider.id })), 'invalid_request');
  rejected(await work(client, mutation(projectId, 'saveTask', taskFields)), 'forbidden');
  rejected(await work(client, mutation(projectId, 'saveDocument', documentFields)), 'forbidden');
  await database.pool.query("UPDATE project_member SET role='viewer' WHERE project_id=$1 AND user_id=$2", [projectId, viewer.id]);
  rejected(await work(viewer, mutation(projectId, 'saveTask', taskFields)), 'forbidden');
  rejected(await work(viewer, mutation(projectId, 'saveDocument', documentFields)), 'forbidden');
  rejected(await work(viewer, mutation(projectId, 'addFeedback', { targetKind: 'project', targetId: null, body: 'Viewer cannot write', sentiment: null })), 'forbidden');
  rejected(await work(viewer, mutation(projectId, 'addComment', { targetKind: 'deliverable', targetId: deliverable.id, body: 'Viewer cannot comment' })), 'forbidden');
  success(await read(viewer, projectId, 'deliverable', deliverable.id), 'item');
  await database.pool.query("UPDATE project_member SET role='developer' WHERE project_id=$1 AND user_id=$2", [projectId, viewer.id]);
  rejected(await work(viewer, mutation(projectId, 'decideDeliverable', { id: deliverable.id, expectedVersion: 2, decision: 'approved', body: '' })), 'forbidden');
  await database.pool.query("UPDATE project_member SET role='client' WHERE project_id=$1 AND user_id=$2", [projectId, viewer.id]);
  const preview = success(await list(owner, projectId, 'document', { view: 'client' }), 'list');
  const actual = success(await list(client, projectId, 'document'), 'list');
  assert.deepEqual(preview, actual); assert.equal(JSON.stringify(preview).includes(privateDocument.id), false); assert.equal(JSON.stringify(preview).includes('Internal'), false);
  for (const [filter, expected] of [
    ['tasks', [task.id, milestone.id]], ['documents', [document.id, update.id, deliverable.id]], ['comments', [feedback.id, comment.id]],
  ]) {
    const filtered = success(await overview(client, { operation: 'snapshot', projectId, filter }), 'overview').snapshot;
    assert.deepEqual(new Set(filtered.activity.map(item => item.target.id)), new Set(expected));
    assert.equal(filtered.activity.every(item => item.category === filter && item.kind === 'work.changed'), true);
    for (const id of expected) assert.equal(filtered.authorizedTargets.some(item => item.id === id), true);
    assert.equal(filtered.authorizedTargets.some(item => item.id === privateDocument.id || item.id === foreignDocument.id), false);
    assert.equal(JSON.stringify(filtered).includes('Internal QA'), false);
  }
  const sourceNarrowed = await post('/api/sessions', { operation: 'publish', projectId, sessionId: excerpt.item.id, expectedVersion: 1, deviceId: excerpt.qaDeviceId,
    title: 'Internal QA narrowed source', status: 'completed', visibility: 'team', messages: [{ id: 'selected', role: 'assistant', text: 'QA selected source is now internal' }] }, owner.cookie);
  assert.equal((await sourceNarrowed.json()).ok, true);
  const redacted = success(await read(client, projectId, 'document', document.id), 'item').item; assert.equal(redacted.sourceSessionId, null); assert.equal(redacted.body, documentFields.body);
  assert.equal(success(await read(client, projectId, 'task', task.id), 'item').item.sourceSessionId, null);
  checks.push('Owner/developer/client/viewer roles enforced; public sources same-project/audience; assignee must be member; client preview exact projection; narrowed source links redacted; task/document/comment feed filters expose only current authorized targets');

  stage = 'bounded pagination and authorization before totals';
  const bulkIds = Array.from({ length: 105 }, () => randomUUID());
  await database.pool.query(`INSERT INTO task(id,project_id,milestone_id,title,description,created_by,status,visibility)
    SELECT id,$2,$3,'QA page task','QA body omitted from list',$4,'done','client' FROM unnest($1::text[]) AS id`, [bulkIds, projectId, milestone.id, owner.id]);
  await database.pool.query("INSERT INTO task(id,project_id,title,created_by,status,visibility) VALUES($1,$2,'Internal QA task secret',$3,'todo','team')", [randomUUID(), projectId, owner.id]);
  const first = success(await list(client, projectId, 'task', { limit: 100 }), 'list');
  const last = success(await list(client, projectId, 'task', { offset: first.nextOffset, limit: 100 }), 'list');
  assert.equal(first.total, 106); assert.equal(first.items.length, 100); assert.equal(last.items.length, 6); assert.equal(last.nextOffset, null);
  assert.equal(new Set([...first.items, ...last.items].map(item => item.id)).size, 106); assert.equal(first.items.every(item => item.body === ''), true);
  assert.equal(JSON.stringify(first).includes('Internal'), false);
  const wideRoadmap = success(await read(client, projectId, 'milestone', milestone.id), 'item').item; assert.equal(wideRoadmap.progress.total, 106); assert.equal(wideRoadmap.progress.percent, 100);
  assert.equal(success(await list(owner, projectId, 'task'), 'list').total, 107);
  const filteredFeedback = success(await list(client, projectId, 'feedback', { targetKind: 'deliverable', targetId: deliverable.id }), 'list'); assert.equal(filteredFeedback.total, 1); assert.equal(filteredFeedback.items[0].body, '');
  const pulseSnapshot = await pulse(client, { operation: 'snapshot', projectId }); assert.equal(pulseSnapshot.ok, true); assert.equal(pulseSnapshot.snapshot.progress.total, 106);
  checks.push('Pagination beyond 100 counts authorized scope first, stable no-duplicate pages, body-free lists, exact roadmap and Pulse denominators, target-filtered feedback');

  stage = 'current parent narrowing and WebSocket revocation';
  const observer = await peer(client, projectId); await observer.wait(frame => frame.type === 'snapshot');
  const priorCursor = (await database.pool.query('SELECT sequence::text FROM project_realtime_cursor WHERE project_id=$1', [projectId])).rows[0].sequence;
  success(await work(owner, mutation(projectId, 'publishDeliverable', { ...deliverableFields, id: deliverable.id, expectedVersion: 2, visibility: 'team', title: 'Internal QA release hidden', attachmentIds: [] })), 'changed');
  await observer.wait(frame => frame.type === 'snapshot' && BigInt(frame.snapshot.cursor) > BigInt(priorCursor));
  rejected(await read(client, projectId, 'deliverable', deliverable.id, { revision: 1 }), 'not_found');
  rejected(await read(client, projectId, 'feedback', feedback.id), 'not_found');
  rejected(await read(client, projectId, 'comment', comment.id), 'not_found');
  rejected(await work(client, { operation: 'readAttachment', projectId, id: uploaded.id }), 'not_found');
  assert.equal(success(await list(client, projectId, 'feedback'), 'list').total, 0);
  rejected(await list(client, projectId, 'comment', { targetKind: 'deliverable', targetId: deliverable.id }), 'not_found');
  const narrowedFeed = success(await overview(client, { operation: 'snapshot', projectId, filter: 'comments' }), 'overview').snapshot;
  assert.deepEqual(narrowedFeed.activity, []);
  assert.equal(narrowedFeed.authorizedTargets.some(item => [deliverable.id, feedback.id, comment.id].includes(item.id)), false);
  const narrowedPulse = await pulse(client, { operation: 'snapshot', projectId }); assert.equal(narrowedPulse.ok, true); assert.equal(narrowedPulse.snapshot.summary.comments, 0);
  assert.equal(JSON.stringify(observer.frames).includes(deliverable.id), false); assert.equal(JSON.stringify(observer.frames).includes('Internal QA'), false);
  await collab(owner, { operation: 'removeMember', scope: { kind: 'project', projectId }, userId: client.id }); await observer.wait(frame => frame.type === 'denied');
  rejected(await list(client, projectId, 'document'), 'forbidden'); rejected(await work(client, { operation: 'readAttachment', projectId, id: uploaded.id }), 'forbidden');
  checks.push('Current parent narrowing removes old revisions, feedback/comments and retained attachments; work changes trigger ID-free WS resync; membership removal denies open socket and future HTTP');
  await writeFile(path.join(output, 'work-report.json'), JSON.stringify({ passed: true, completedAt: new Date().toISOString(), checks, transport: 'actual PostgreSQL/SMTP/HTTP/WebSocket', fixtures: 'own temporary accounts/workspace, explicit content and selected fixture attachment', personalInference: false }, null, 2));
  console.log(`Project work verification passed: ${checks.length} actual PostgreSQL/HTTP/WebSocket scenarios; no personal inference or credential output.`);
} catch (error) {
  const location = error?.stack?.split('\n').find(line => line.includes('verify-work.mjs:'))?.trim();
  console.error(`Project work verification failed at: ${stage}.${location ? ` ${location}` : ''} Boundary ${JSON.stringify(boundary)}. No credentials or content printed.`);
  await writeFile(path.join(output, 'work-report.json'), JSON.stringify({ passed: false, stage, completedChecks: checks, location: location ?? null, boundary, personalInference: false }, null, 2));
  process.exitCode = 1;
} finally {
  for (const item of peers) item.close(); await app?.close();
  if (database?.pool) {
    if (workspaceId) await database.pool.query('DELETE FROM workspace WHERE id=$1 AND name=$2', [workspaceId, prefix]);
    for (const user of users) { await database.pool.query('DELETE FROM "user" WHERE email=$1', [user.email]); await database.pool.query('DELETE FROM verification WHERE identifier=$1', [user.email]); }
  }
  await database?.close();
  if (mailIds.size) await fetch('http://127.0.0.1:8025/api/v1/messages', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ IDs: [...mailIds] }), signal: AbortSignal.timeout(3000) }).catch(() => {});
}
