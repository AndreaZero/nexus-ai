import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { parseEnv } from 'node:util';
import { createDatabaseBoundary, readDatabaseConfig, readSchemaReadiness } from '../packages/db/dist/index.js';
import { collaborationResponseSchema } from '../packages/contracts/dist/index.js';
import { buildServer } from '../apps/server/dist/app.js';
import { readServerConfig } from '../apps/server/dist/config.js';

// Real local PostgreSQL/HTTP/SMTP, exclusively UUID-owned fixtures. Never logs private payloads.
const env = parseEnv(await readFile(new URL('../.env', import.meta.url), 'utf8'));
const fixturePrefix = `nexus-t17-qa-${randomUUID()}`;
const reportDirectory = new URL('../.nexus/visual/t17/', import.meta.url);
const received = new Set();
const users = [];
const workspaceIds = [];
const checks = [];
let database;
let app;
let base;
let serverConfig;
let before;
let stage = 'local configuration';
let failure;

async function snapshot() {
  const accounts = await database.pool.query('SELECT id FROM "user" ORDER BY id');
  const workspaces = await database.pool.query('SELECT id FROM workspace ORDER BY id');
  const journal = await database.pool.query('SELECT id, hash, created_at::text FROM drizzle.__drizzle_migrations ORDER BY id');
  return { accounts: accounts.rows, workspaces: workspaces.rows, journal: journal.rows };
}
async function authRequest(route, body) {
  return fetch(new URL(`/auth/${route}`, base), {
    method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(15_000),
    headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}
async function mailLink(email) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await fetch(`http://127.0.0.1:8025/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`, { signal: AbortSignal.timeout(3_000) });
    assert.equal(response.status, 200);
    const results = await response.json();
    const id = results.messages?.find(item => !received.has(item.ID))?.ID;
    if (id) {
      received.add(id);
      const content = await fetch(`http://127.0.0.1:8025/api/v1/message/${id}`, { signal: AbortSignal.timeout(3_000) });
      assert.equal(content.status, 200);
      const message = await content.json();
      const link = message.Text?.match(/https?:\/\/[^\s<>"]+/)?.[0];
      assert.ok(link, 'Expected SMTP link is missing.');
      const url = new URL(link);
      assert.equal(url.origin, base);
      return url;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Expected SMTP receipt is missing.');
}
async function createAccount(label) {
  const email = `${fixturePrefix}-${label}@nexus.local`;
  const password = randomBytes(32).toString('base64url');
  const user = { email, id: null, cookie: '' };
  users.push(user);
  const signup = await authRequest('sign-up/email', { name: `T17 QA ${label}`, email, password, callbackURL: `${base}/sign-in` });
  assert.equal(signup.status, 200);
  user.id = (await signup.json()).user.id;
  const verification = await mailLink(email);
  assert.equal(verification.pathname, '/auth/verify-email');
  const verified = await fetch(verification, { redirect: 'manual', signal: AbortSignal.timeout(8_000) });
  assert.ok([200, 302, 303].includes(verified.status));
  const login = await authRequest('sign-in/email', { email, password });
  assert.equal(login.status, 200);
  user.cookie = login.headers.getSetCookie().map(value => value.split(';', 1)[0]).join('; ');
  assert.ok(user.cookie);
  return user;
}
async function request(user, body) {
  const response = await fetch(new URL('/api/collaboration', base), {
    method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json', ...(user?.cookie ? { Cookie: user.cookie } : {}) },
    body: JSON.stringify(body), signal: AbortSignal.timeout(15_000),
  });
  return collaborationResponseSchema.parse(await response.json());
}
async function success(user, body, kind) {
  const result = await request(user, body);
  assert.equal(result.ok, true, `Operation ${body.operation} denied.`);
  assert.equal(result.kind, kind);
  return result;
}
async function startServer() {
  app = await buildServer(serverConfig);
  await app.listen({ port: serverConfig.port, host: '127.0.0.1' });
}

try {
  const config = readDatabaseConfig(env);
  assert.ok(config.configured);
  const target = new URL(config.connectionString);
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname));
  assert.equal(target.pathname, '/nexus_ai_dev');
  assert.equal(env.SMTP_HOST, '127.0.0.1');
  assert.equal(env.SMTP_PORT, '1025');
  database = createDatabaseBoundary(config);
  assert.equal(await database.check(), 'connected');
  assert.equal(await readSchemaReadiness(database), 'current', 'Migrations must already be current; this verifier performs no DDL.');
  before = await snapshot();
  const reservation = createServer();
  await new Promise((resolve, reject) => { reservation.once('error', reject); reservation.listen(0, '127.0.0.1', resolve); });
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  base = `http://127.0.0.1:${port}`;
  serverConfig = readServerConfig({ ...env, BETTER_AUTH_URL: base, NEXUS_WEB_URL: base, NEXUS_SERVER_PORT: String(port), NEXUS_LOG_LEVEL: 'silent' });
  await startServer();

  stage = 'verified local accounts';
  const owner = await createAccount('owner');
  const client = await createAccount('client');
  checks.push('two actual verified PostgreSQL/SMTP accounts on an isolated ephemeral HTTP server');

  stage = 'local-only repository persistence';
  const workspace = (await success(owner, { operation: 'createWorkspace', name: `${fixturePrefix} workspace` }, 'workspace')).item;
  workspaceIds.push(workspace.id);
  const project = (await success(owner, { operation: 'createProject', workspaceId: workspace.id, name: 'Onboarding local project', description: 'T17 isolated regression fixture', defaultVisibility: 'private' }, 'project')).item;
  const operation = { operation: 'setRepository', projectId: project.id, remoteUrl: '', defaultBranch: 'main' };
  const repository = (await success(owner, operation, 'repository')).item;
  assert.equal(repository.remoteUrl, '');
  assert.equal(repository.projectId, project.id);
  const repeated = (await success(owner, operation, 'repository')).item;
  assert.equal(repeated.id, repository.id);
  await app.close();
  app = undefined;
  await startServer();
  const persisted = (await success(owner, { operation: 'getProject', projectId: project.id }, 'project')).item;
  assert.equal(persisted.repository.id, repository.id);
  assert.equal(persisted.repository.remoteUrl, '');
  checks.push('empty remote persists across actual server restart and repeated save preserves repository identity');

  stage = 'remote validation remains strict';
  for (const remoteUrl of ['http://github.com/AndreaZero/nexus-ai', 'https://user:secret@github.com/AndreaZero/nexus-ai', 'https://github.com/AndreaZero/nexus-ai?token=secret', 'not-a-url']) {
    const denied = await request(owner, { ...operation, remoteUrl });
    assert.equal(denied.ok, false);
    assert.equal(denied.code, 'invalid_request');
  }
  const unchanged = (await success(owner, { operation: 'getProject', projectId: project.id }, 'project')).item;
  assert.equal(unchanged.repository.remoteUrl, '');
  checks.push('invalid transport, credentials, query and malformed remote rejected without mutation');

  stage = 'optional remote added later';
  const remoteUrl = 'https://github.com/AndreaZero/nexus-ai';
  const updated = (await success(owner, { ...operation, remoteUrl }, 'repository')).item;
  assert.equal(updated.id, repository.id);
  assert.equal(updated.remoteUrl, remoteUrl);
  const loaded = (await success(owner, { operation: 'getProject', projectId: project.id }, 'project')).item;
  assert.equal(loaded.repository.id, repository.id);
  assert.equal(loaded.repository.remoteUrl, remoteUrl);
  const count = await database.pool.query('SELECT count(*)::int AS count FROM repository WHERE project_id = $1', [project.id]);
  assert.equal(count.rows[0].count, 1);
  checks.push('real HTTPS remote added later on the same repository ID, without GitHub API or inference');

  stage = 'client and session authorization';
  assert.equal((await request(null, { operation: 'getProject', projectId: project.id })).ok, false);
  const scope = { kind: 'project', projectId: project.id };
  await success(owner, { operation: 'createInvitation', scope, email: client.email, role: 'client' }, 'done');
  const invitation = await mailLink(client.email);
  assert.equal(invitation.pathname, '/');
  const token = new URLSearchParams(invitation.hash.split('?')[1]).get('token');
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  await success(client, { operation: 'acceptInvitation', token }, 'done');
  const projection = (await success(client, { operation: 'getProject', projectId: project.id }, 'project')).item;
  assert.equal(projection.repository, null);
  assert.equal(projection.capabilities.viewRepository, false);
  assert.equal((await request(client, operation)).ok, false);
  assert.equal((await success(owner, { operation: 'getProject', projectId: project.id }, 'project')).item.repository.remoteUrl, remoteUrl);
  checks.push('unauthenticated access denied; invited client receives no repository metadata and cannot replace it');
} catch {
  failure = stage;
} finally {
  try {
    await app?.close();
    if (database?.pool) {
      if (workspaceIds.length) await database.pool.query('DELETE FROM workspace WHERE id = ANY($1::text[]) AND name LIKE $2', [workspaceIds, `${fixturePrefix}%`]);
      for (const user of users) {
        await database.pool.query('DELETE FROM "user" WHERE email = $1', [user.email]);
        await database.pool.query('DELETE FROM verification WHERE identifier = $1', [user.email]);
      }
      if (before) assert.deepEqual(await snapshot(), before, 'Existing account/workspace IDs and migration journal must remain unchanged.');
    }
    if (received.size) {
      const cleanup = await fetch('http://127.0.0.1:8025/api/v1/messages', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ IDs: [...received] }), signal: AbortSignal.timeout(3_000) });
      assert.equal(cleanup.status, 200);
    }
    if (!failure) checks.push('fixture accounts/workspace/emails removed; existing account/workspace IDs and full migration journal unchanged');
  } catch { failure ??= 'isolated fixture cleanup'; }
  await database?.close();
}

await mkdir(reportDirectory, { recursive: true });
await writeFile(new URL('onboarding-data-report.json', reportDirectory), JSON.stringify({ passed: !failure, checks, ...(failure ? { failedStage: failure } : {}), fixtureCleanup: !failure ? 'complete' : 'inspect owned fixture cleanup' }, null, 2));
if (failure) {
  console.error(`Onboarding data verification failed at: ${failure}. No credentials, recipients or private payloads emitted.`);
  process.exitCode = 1;
} else console.log(`Onboarding data verification passed: ${checks.length} real PostgreSQL/SMTP/HTTP scenarios; no private payloads emitted.`);
