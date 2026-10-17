import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import test from 'node:test';
import type { DatabaseBoundary } from '@nexus-ai/db';
import type { RepositoriesRequest } from '@nexus-ai/contracts';
import { createRepositoriesService } from './repositories.js';
import { encryptGithubSecret } from './github-crypto.js';

const projectId = '00000000-0000-4000-8000-000000000001'; const repositoryId = '00000000-0000-4000-8000-000000000002';
const actor = { id: 'nexus-owner', email: 'private@example.test' }; const scope = { projectId, repositoryId };
const secret = 'server-owned-test-secret'.repeat(3); const token = 'github_pat_test_credential_not_real'; const webhookSecret = 'webhook-test-secret-that-is-not-real';
const sha = 'a'.repeat(40); const stamp = '2026-10-18T10:00:00.000Z'; const remoteUrl = 'https://github.com/nexus/repo';
function pull(number = 3) { return { number, title: 'Actual pull request', body: 'Description', state: 'open', draft: false, head: { ref: 'feature', sha }, base: { ref: 'main' }, user: { login: 'developer' }, updated_at: stamp }; }
/** A controlled SQL boundary; real PostgreSQL/membership/HTTP integration belongs to the coordinator QA. */
function fixture() {
  let role: 'owner' | 'developer' | 'client' | 'viewer' | null = 'owner'; let remote = remoteUrl;
  const connections = new Map<string, { token_cipher: string; login: string }>(); const receipts = new Map<string, { payload_hash: string; response: unknown | null }>();
  const deliveries = new Map<string, string>(); let webhook: { secret_cipher: string; configured_by: string } | null = null;
  let saved: { remote_url: string; snapshot: Record<string, unknown> } | null = null; let eventCount = 0; const activityActors: unknown[] = [];
  const queries: { sql: string; values: unknown[] }[] = [];
  const db = { async query(sql: string, values: unknown[] = []) {
    queries.push({ sql, values }); let rows: unknown[] = [];
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') { /* transaction markers asserted by the tests */ }
    else if (sql.startsWith('SELECT w.id FROM workspace') || sql.startsWith('SELECT id FROM project')) { /* lock ordering */ }
    else if (sql.startsWith('SELECT wm.role AS workspace_role')) rows = role ? [{ workspace_role: role === 'owner' ? 'owner' : 'member', role }] : [];
    else if (sql.startsWith('SELECT id,project_id,remote_url,default_branch')) rows = values[0] === repositoryId && values[1] === projectId ? [{ id: repositoryId, project_id: projectId, remote_url: remote, default_branch: 'main' }] : [];
    else if (sql.startsWith('SELECT remote_url,snapshot')) rows = saved ? [saved] : [];
    else if (sql.startsWith('SELECT token_cipher')) rows = connections.has(String(values[1])) ? [connections.get(String(values[1]))] : [];
    else if (sql.startsWith('INSERT INTO repository_connection')) connections.set(String(values[1]), { token_cipher: String(values[2]), login: String(values[3]) });
    else if (sql.startsWith('INSERT INTO repository_sync')) saved = { remote_url: String(values[1]), snapshot: JSON.parse(String(values[2])) as Record<string, unknown> };
    else if (sql.startsWith('SELECT secret_cipher')) rows = webhook ? [webhook] : [];
    else if (sql.startsWith('SELECT id,kind,url,sha,pull_number FROM repository_activity')) rows = values[1] === projectId && values[2] === repositoryId && values[0] === '00000000-0000-4000-8000-000000000099' ? [{ id: values[0], kind: 'commit', url: `${remoteUrl}/commit/${sha}`, sha, pull_number: null }] : [];
    else if (sql.startsWith('INSERT INTO repository_webhook')) webhook = { secret_cipher: String(values[1]), configured_by: String(values[2]) };
    else if (sql.startsWith('SELECT payload_hash,response')) { const receipt = receipts.get(String(values[2])); rows = receipt ? [receipt] : []; }
    else if (sql.startsWith('SELECT count(*)') && sql.includes('repository_receipt')) rows = [{ count: String(receipts.size) }];
    else if (sql.startsWith('INSERT INTO repository_receipt')) receipts.set(String(values[2]), { payload_hash: String(values[3]), response: null });
    else if (sql.startsWith('UPDATE repository_receipt')) { const item = receipts.get(String(values[2])); if (item) item.response = JSON.parse(String(values[3])); }
    else if (sql.startsWith('SELECT c.user_id')) rows = [...connections].filter(([, row]) => row.login.toLowerCase() === String(values[1]).toLowerCase()).map(([id]) => ({ user_id: id }));
    else if (sql.startsWith('INSERT INTO repository_activity')) { activityActors.push(values[3]); rows = [{ id: values[0] }]; }
    else if (sql.startsWith('INSERT INTO project_realtime_cursor')) rows = [{ sequence: String(++eventCount) }];
    else if (sql.startsWith('INSERT INTO realtime_event') || sql.startsWith('DELETE FROM realtime_event')) { /* outbox */ }
    else if (sql.startsWith('DELETE FROM repository_')) {
      const table = sql.match(/DELETE FROM (\w+)/)![1];
      if (table === 'repository_connection') { if (values.length === 2) connections.delete(String(values[1])); else connections.clear(); }
      if (table === 'repository_sync') saved = null;
      if (table === 'repository_webhook') webhook = null;
      if (table === 'repository_receipt') receipts.clear();
      if (table === 'repository_delivery') deliveries.clear();
    }
    else if (sql.startsWith('SELECT project_id FROM repository')) rows = [{ project_id: projectId }];
    else if (sql.startsWith('SELECT r.remote_url,h.secret_cipher')) rows = webhook ? [{ remote_url: remote, ...webhook }] : [];
    else if (sql.startsWith('SELECT payload_hash FROM repository_delivery')) rows = deliveries.has(String(values[1])) ? [{ payload_hash: deliveries.get(String(values[1])) }] : [];
    else if (sql.startsWith('SELECT count(*)') && sql.includes('repository_delivery')) rows = [{ count: String(deliveries.size) }];
    else if (sql.startsWith('INSERT INTO repository_delivery')) deliveries.set(String(values[1]), String(values[2]));
    else if (sql.startsWith('UPDATE repository_sync')) { if (saved) saved.snapshot['pages'] = {}; }
    else throw new Error(`Unhandled controlled SQL: ${sql.slice(0, 80)}`);
    return { rows };
  }, release() { /* shared fixture connection */ } };
  const database = { pool: { async connect() { return db; } } } as unknown as DatabaseBoundary;
  return { database, queries, connections, receipts, deliveries, activityActors, get eventCount() { return eventCount; }, setRole(value: typeof role) { role = value; }, setRemote(value: string) { remote = value; }, configureHook() { webhook = { secret_cipher: encryptGithubSecret(secret, `webhook:${repositoryId}`, JSON.stringify({ remoteUrl: remote, githubId: 42, secret: webhookSecret })), configured_by: actor.id }; } };
}
function upstream(fixtureState: ReturnType<typeof fixture>, options: { lostResponse?: boolean; changedHead?: boolean; rejectPost?: boolean } = {}) {
  const posts: string[] = []; const calls: string[] = []; const pulls: ReturnType<typeof pull>[] = [];
  const fetcher = (async (input, init) => {
    const url = new URL(String(input)); calls.push(url.pathname + url.search);
    assert.equal(url.origin, 'https://api.github.com');
    if (init?.method === 'POST') {
      assert.equal(fixtureState.queries.some(query => query.sql === 'COMMIT'), true, 'durable receipt committed before POST');
      posts.push(url.pathname); const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      if (options.rejectPost) return new Response('Private diagnostics', { status: 422 });
      if (url.pathname.endsWith('/reviews')) return Response.json({ id: 8, user: { login: 'developer' }, state: 'APPROVED', body: body['body'], commit_id: sha, submitted_at: stamp });
      const item = { ...pull(), body: String(body['body']) }; pulls.push(item);
      if (options.lostResponse) throw new Error('Transport lost after upstream accepted the POST');
      return Response.json(item);
    }
    if (url.pathname === '/user') return Response.json({ id: 7, login: 'developer' });
    if (url.pathname === '/repos/nexus/repo') return Response.json({ id: 42, full_name: 'nexus/repo', private: true });
    if (url.pathname.endsWith('/commits')) return Response.json([{ sha, commit: { message: 'Actual commit\nLong body is not activity metadata', author: { name: 'Developer', date: stamp } }, author: { login: 'other-author' } }]);
    if (url.pathname.endsWith('/pulls/3')) return Response.json(options.changedHead ? { ...pull(), head: { ref: 'feature', sha: 'b'.repeat(40) } } : pull());
    if (url.pathname.endsWith('/reviews')) return Response.json([]);
    if (url.pathname.endsWith('/files')) return Response.json([{ filename: 'README.md', status: 'modified', additions: 2, deletions: 1, patch: '@@ -1 +1 @@\n-old\n+new' }]);
    if (url.pathname.endsWith('/pulls')) return Response.json(url.search.includes('state=all') ? pulls : [pull()]);
    throw new Error(`Unhandled upstream route ${url.pathname}`);
  }) as typeof fetch;
  return { fetcher, calls, posts };
}
async function connected(options: Parameters<typeof upstream>[1] = {}) {
  const state = fixture(); const api = upstream(state, options); const service = createRepositoriesService(state.database, secret, undefined, api.fetcher);
  const result = await service.execute(actor, { operation: 'connect', ...scope, token }); assert.equal(result.ok, true);
  return { state, api, service };
}
const creation = (): Extract<RepositoriesRequest, { operation: 'createPull' }> => ({ operation: 'createPull', ...scope, requestId: randomUUID(), title: 'Actual PR', body: 'Explicit body', head: 'feature', base: 'main', draft: true });

test('GitHub connect is account scoped and encrypted; snapshots never include tokens and do not contact GitHub', async () => {
  const { state, api, service } = await connected(); const count = api.calls.length;
  const response = await service.execute(actor, { operation: 'snapshot', ...scope, page: 1 });
  assert.equal(response.ok && response.kind === 'snapshot' && response.snapshot.connected, true); assert.equal(api.calls.length, count);
  assert.equal(JSON.stringify(response).includes(token), false); assert.equal(state.connections.get(actor.id)!.token_cipher.includes(token), false);
  assert.deepEqual(await service.credential(actor, projectId, repositoryId), { token, remoteUrl });
  assert.equal(await service.credential({ ...actor, id: 'another-user' }, projectId, repositoryId), null);
  const disconnected = await service.execute(actor, { operation: 'disconnect', ...scope }); assert.equal(disconnected.ok && disconnected.kind === 'snapshot' && disconnected.snapshot.connected, false);
  assert.equal(await service.credential(actor, projectId, repositoryId), null);
});
test('GitHub operations enforce current role, project/repository scope and absence of connection on every request', async () => {
  const { state, api, service } = await connected();
  for (const role of ['client', 'viewer', null] as const) {
    state.setRole(role); const count = api.calls.length;
    const response = await service.execute(actor, { operation: 'snapshot', ...scope, page: 1 });
    assert.equal(!response.ok && response.code, 'forbidden'); assert.equal(await service.credential(actor, projectId, repositoryId), null); assert.equal(api.calls.length, count);
  }
  state.setRole('developer'); const configure = await service.execute(actor, { operation: 'configureWebhook', ...scope, secret: webhookSecret });
  assert.equal(!configure.ok && configure.code, 'forbidden');
  const other = await service.execute(actor, { operation: 'snapshot', ...scope, repositoryId: randomUUID(), page: 1 }); assert.equal(!other.ok && other.code, 'not_found');
  const unavailable = createRepositoriesService(state.database, null, undefined, api.fetcher);
  const noSecret = await unavailable.execute(actor, { operation: 'connect', ...scope, token }); assert.equal(!noSecret.ok && noSecret.code, 'unavailable');
});
test('fine-grained token is required and activity resolution checks current exact project/repository authorization without GitHub requests', async () => {
  const { state, api, service } = await connected(); const calls = api.calls.length;
  const classic = await service.execute(actor, { operation: 'connect', ...scope, token: 'ghp_classic_test_token_not_supported' });
  assert.equal(!classic.ok && classic.code, 'invalid_request'); assert.equal(api.calls.length, calls);
  const request: RepositoriesRequest = { operation: 'resolveActivity', ...scope, id: '00000000-0000-4000-8000-000000000099' };
  const response = await service.execute(actor, request); assert.equal(response.ok && response.kind === 'activity' && response.sha, sha); assert.equal(api.calls.length, calls);
  const missing = await service.execute(actor, { ...request, id: randomUUID() }); assert.equal(!missing.ok && missing.code, 'not_found');
  state.setRole('viewer'); const revoked = await service.execute(actor, request); assert.equal(!revoked.ok && revoked.code, 'forbidden');
});
test('synchronization projects bounded actual history and distinguishes external authors from the actor requesting sync', async () => {
  const { state, service } = await connected();
  const response = await service.execute(actor, { operation: 'synchronize', ...scope, page: 1 });
  assert.equal(response.ok && response.kind === 'snapshot' && response.snapshot.commits.length, 1);
  assert.equal(response.ok && response.kind === 'snapshot' && response.snapshot.pulls.length, 1); assert.equal(state.eventCount, 2);
  assert.deepEqual(state.activityActors, [null, actor.id], 'unmapped commit author remains unknown; PR author maps to its explicit connection');
  const detail = await service.execute(actor, { operation: 'getPull', ...scope, number: 3, page: 1 });
  assert.equal(detail.ok && detail.kind === 'pull' && detail.files[0]?.path, 'README.md');
});
test('remote URL change invalidates stored credentials, webhook, receipts and history before reconnecting', async () => {
  const { state, service } = await connected(); state.configureHook(); state.setRemote('https://github.com/nexus/other');
  const response = await service.execute(actor, { operation: 'snapshot', ...scope, page: 1 });
  assert.equal(response.ok && response.kind === 'snapshot' && response.snapshot.connected, false);
  assert.equal(response.ok && response.kind === 'snapshot' && response.snapshot.webhookConfigured, false); assert.equal(state.connections.size, 0);
});
test('PR write receipts replay exactly, reject request ID reuse and are durable before a single upstream POST', async () => {
  const { state, api, service } = await connected(); const request = creation();
  const first = await service.execute(actor, request); assert.equal(first.ok, true);
  assert.deepEqual(await service.execute(actor, request), first); assert.equal(api.posts.length, 1); assert.notEqual(state.receipts.get(request.requestId)?.response, null);
  const conflict = await service.execute(actor, { ...request, title: 'Changed intent' }); assert.equal(!conflict.ok && conflict.code, 'conflict'); assert.equal(api.posts.length, 1);
});
test('uncertain remote writes reconcile the same marker without ever repeating the POST', async () => {
  const { state, api, service } = await connected({ lostResponse: true }); const request = creation();
  const uncertain = await service.execute(actor, request); assert.equal(!uncertain.ok && uncertain.code, 'uncertain'); assert.equal(state.receipts.get(request.requestId)?.response, null);
  const reconciled = await service.execute(actor, request); assert.equal(reconciled.ok && reconciled.kind === 'done' && reconciled.url, `${remoteUrl}/pull/3`);
  assert.equal(api.posts.length, 1); assert.notEqual(state.receipts.get(request.requestId)?.response, null);
});
test('review binds an explicitly reviewed head SHA; stale heads never create a remote write receipt', async () => {
  const { state, api, service } = await connected({ changedHead: true });
  const response = await service.execute(actor, { operation: 'review', ...scope, requestId: randomUUID(), number: 3, headSha: sha, event: 'APPROVE', body: 'I reviewed this exact commit.' });
  assert.equal(!response.ok && response.code, 'conflict'); assert.equal(state.receipts.size, 0); assert.equal(api.posts.length, 0);
});
test('review success has a single durable receipt, explicit expected head and no duplicate review POST', async () => {
  const { state, api, service } = await connected();
  const request: RepositoriesRequest = { operation: 'review', ...scope, requestId: randomUUID(), number: 3, headSha: sha, event: 'APPROVE', body: 'I reviewed this exact commit.' };
  const response = await service.execute(actor, request); assert.equal(response.ok && response.kind === 'done' && response.url, `${remoteUrl}/pull/3#pullrequestreview-8`);
  assert.deepEqual(await service.execute(actor, request), response); assert.equal(api.posts.length, 1); assert.notEqual(state.receipts.get(request.requestId)?.response, null);
});
test('definite GitHub mutation rejection is a replayable error and never discloses upstream body', async () => {
  const { api, service } = await connected({ rejectPost: true }); const request = creation();
  const response = await service.execute(actor, request); assert.equal(!response.ok && response.code, 'conflict'); assert.equal(JSON.stringify(response).includes('Private diagnostics'), false);
  assert.deepEqual(await service.execute(actor, request), response); assert.equal(api.posts.length, 1);
});
test('signed webhook validates raw bytes/repository, deduplicates delivery IDs and refuses tampering/revoked owner', async () => {
  const state = fixture(); state.configureHook(); const service = createRepositoriesService(state.database, secret);
  const payload = { repository: { id: 42, full_name: 'nexus/repo' }, commits: [{ id: sha, message: 'Actual commit', timestamp: stamp, author: { username: 'external-author' } }] };
  const body = Buffer.from(JSON.stringify(payload)); const signature = `sha256=${createHmac('sha256', webhookSecret).update(body).digest('hex')}`;
  const headers = { delivery: randomUUID(), event: 'push', signature };
  assert.equal((await service.webhook(repositoryId, { ...headers, signature: `sha256=${'0'.repeat(64)}` }, body)).status, 401); assert.equal(state.deliveries.size, 0);
  assert.equal((await service.webhook(repositoryId, headers, body)).status, 200); assert.equal(state.eventCount, 1); assert.equal(state.deliveries.size, 1);
  assert.equal((await service.webhook(repositoryId, headers, body)).status, 200); assert.equal(state.eventCount, 1);
  const changed = Buffer.from(JSON.stringify({ ...payload, commits: [] })); const changedSignature = `sha256=${createHmac('sha256', webhookSecret).update(changed).digest('hex')}`;
  assert.equal((await service.webhook(repositoryId, { ...headers, signature: changedSignature }, changed)).status, 409);
  const other = Buffer.from(JSON.stringify({ ...payload, repository: { id: 99, full_name: 'nexus/repo' } }));
  assert.equal((await service.webhook(repositoryId, { ...headers, delivery: randomUUID(), signature: `sha256=${createHmac('sha256', webhookSecret).update(other).digest('hex')}` }, other)).status, 409);
  state.setRole('developer'); assert.equal((await service.webhook(repositoryId, { ...headers, delivery: randomUUID() }, body)).status, 403);
});
