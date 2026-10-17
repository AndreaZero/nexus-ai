import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createDatabaseBoundary, readDatabaseConfig } from '../packages/db/dist/index.js';
import { collaborationResponseSchema } from '../packages/contracts/dist/index.js';
import { buildServer } from '../apps/server/dist/app.js';
import { readServerConfig } from '../apps/server/dist/config.js';

// Explicit, isolated local HTTP instance; never stops the maintainer's server.
const root = fileURLToPath(new URL('../', import.meta.url));
const env = parseEnv(await readFile(new URL('../.env', import.meta.url), 'utf8'));
const received = new Set();
const users = [];
const workspaceIds = [];
const checks = [];
let database;
let app;
let base;
let stage = 'local configuration';
const fixturePrefix = `nexus-t04-qa-${randomUUID()}`;

async function authRequest(route, body, cookie = '') {
  return fetch(new URL(`/auth/${route}`, base), {
    method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(15_000),
    headers: { Origin: base, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
}
async function mailLink(email) {
  let message;
  for (let attempt = 0; attempt < 4 && !message; attempt++) {
    const response = await fetch(`http://127.0.0.1:8025/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`, { signal: AbortSignal.timeout(3_000) });
    assert.equal(response.status, 200);
    const results = await response.json();
    const id = results.messages?.find(item => !received.has(item.ID))?.ID;
    if (id) {
      received.add(id);
      const content = await fetch(`http://127.0.0.1:8025/api/v1/message/${id}`, { signal: AbortSignal.timeout(3_000) });
      message = await content.json();
    } else await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(message?.Text, 'Expected SMTP receipt is missing.');
  const link = message.Text.match(/https?:\/\/[^\s<>"]+/)?.[0];
  assert.ok(link, 'Expected SMTP link is missing.');
  const url = new URL(link);
  assert.equal(url.origin, base);
  return url;
}
async function createAccount(label) {
  const email = `${fixturePrefix}-${label}@nexus.local`;
  const password = randomBytes(32).toString('base64url');
  const user = { email, id: null, cookie: '' };
  users.push(user);
  const signup = await authRequest('sign-up/email', { name: `T04 QA ${label}`, email, password, callbackURL: `${base}/sign-in` });
  assert.equal(signup.status, 200, 'QA registration failed.');
  user.id = (await signup.json()).user.id;
  const link = await mailLink(email);
  assert.equal(link.pathname, '/auth/verify-email');
  const verify = await fetch(link, { redirect: 'manual', signal: AbortSignal.timeout(8_000) });
  assert.ok([200, 302, 303].includes(verify.status));
  const login = await authRequest('sign-in/email', { email, password });
  assert.equal(login.status, 200);
  user.cookie = login.headers.getSetCookie().map(value => value.split(';', 1)[0]).join('; ');
  assert.ok(user.cookie);
  return user;
}
async function request(user, body, origin = base) {
  const response = await fetch(new URL('/api/collaboration', base), {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...(user?.cookie ? { Cookie: user.cookie } : {}) },
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
async function denied(user, body) {
  const result = await request(user, body);
  assert.equal(result.ok, false, `Operation ${body.operation} should be denied.`);
  return result;
}
async function invite(owner, scope, recipient, role) {
  const before = await success(owner, { operation: 'listInvitations', scope }, 'invitations');
  const result = await request(owner, { operation: 'createInvitation', scope, email: recipient.email, role });
  assert.equal(result.ok, true);
  const link = await mailLink(recipient.email);
  assert.equal(link.pathname, '/');
  assert.ok(link.hash.startsWith('#/invitations?token='));
  const token = new URLSearchParams(link.hash.split('?')[1]).get('token');
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  const after = await success(owner, { operation: 'listInvitations', scope }, 'invitations');
  const row = after.items.find(item => !before.items.some(previous => previous.id === item.id));
  assert.ok(row);
  const stored = await database.pool.query('SELECT token_hash FROM invitation WHERE id = $1', [row.id]);
  assert.equal(stored.rows[0].token_hash, createHash('sha256').update(token).digest('hex'));
  assert.equal(JSON.stringify(after).includes(token), false);
  return { token, id: row.id };
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
  const reservation = createServer();
  await new Promise((resolve, reject) => { reservation.once('error', reject); reservation.listen(0, '127.0.0.1', resolve); });
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  base = `http://127.0.0.1:${port}`;
  app = await buildServer(readServerConfig({ ...env, BETTER_AUTH_URL: base, NEXUS_WEB_URL: base, NEXUS_SERVER_PORT: String(port), NEXUS_LOG_LEVEL: 'silent' }));
  await app.listen({ port, host: '127.0.0.1' });

  stage = 'three verified isolated accounts';
  const owner = await createAccount('owner');
  const member = await createAccount('member');
  const outsider = await createAccount('outsider');
  checks.push('three real verified PostgreSQL/SMTP accounts');
  stage = 'origin, schema and session checks';
  await denied(null, { operation: 'listWorkspaces' });
  const badOrigin = await fetch(`${base}/api/collaboration`, { method: 'POST', headers: { Origin: 'https://untrusted.invalid', 'Content-Type': 'application/json', Cookie: owner.cookie }, body: JSON.stringify({ operation: 'listWorkspaces' }) });
  assert.equal(badOrigin.status, 403);
  await denied(owner, { operation: 'listWorkspaces', url: 'https://untrusted.invalid' });
  checks.push('unauthenticated, cross-origin and arbitrary payload rejection');

  stage = 'workspace, project and repository persistence';
  const workspace = (await success(owner, { operation: 'createWorkspace', name: `${fixturePrefix} workspace` }, 'workspace')).item;
  workspaceIds.push(workspace.id);
  const p1 = (await success(owner, { operation: 'createProject', workspaceId: workspace.id, name: 'Allowed project', description: 'T04 isolated QA', defaultVisibility: 'team' }, 'project')).item;
  const p2 = (await success(owner, { operation: 'createProject', workspaceId: workspace.id, name: 'Separate project', description: '', defaultVisibility: 'private' }, 'project')).item;
  await success(owner, { operation: 'setRepository', projectId: p1.id, remoteUrl: 'https://github.com/example/nexus-t04-qa', defaultBranch: 'main' }, 'repository');
  const scope = { kind: 'project', projectId: p1.id };
  const workspaceScope = { kind: 'workspace', workspaceId: workspace.id };
  assert.equal((await success(owner, { operation: 'listProjects', workspaceId: workspace.id }, 'projects')).items.length, 2);
  checks.push('durable workspace, projects, repository and no seeded contents');

  stage = 'recipient binding and one-time invitation';
  const first = await invite(owner, scope, member, 'client');
  await denied(outsider, { operation: 'previewInvitation', token: first.token });
  await denied(outsider, { operation: 'acceptInvitation', token: first.token });
  await success(member, { operation: 'previewInvitation', token: first.token }, 'invitation');
  await success(member, { operation: 'acceptInvitation', token: first.token }, 'done');
  await denied(member, { operation: 'acceptInvitation', token: first.token });
  checks.push('SMTP invitation, hash-only storage, recipient binding and replay denial');

  stage = 'project isolation and client projections';
  assert.equal((await success(member, { operation: 'listProjects', workspaceId: workspace.id }, 'projects')).items.length, 1);
  await denied(member, { operation: 'getProject', projectId: p2.id });
  await denied(outsider, { operation: 'getProject', projectId: p1.id });
  await denied(outsider, { operation: 'listProjects', workspaceId: workspace.id });
  const clientProject = (await success(member, { operation: 'getProject', projectId: p1.id }, 'project')).item;
  assert.equal(clientProject.repository, null);
  assert.equal(clientProject.capabilities.viewRepository, false);
  const roster = (await success(member, { operation: 'listMembers', scope }, 'members')).items;
  assert.ok(roster.filter(item => item.userId !== member.id).every(item => item.email === null));
  await denied(member, { operation: 'changeMemberRole', scope, userId: member.id, role: 'owner' });
  await denied(member, { operation: 'createProject', workspaceId: workspace.id, name: 'Denied client project', description: '', defaultVisibility: 'team' });
  await denied(member, { operation: 'setRepository', projectId: p1.id, remoteUrl: 'https://github.com/example/forbidden', defaultBranch: 'main' });
  const absentAttachment = await fetch(`${base}/projects/${p1.id}/attachments/${randomUUID()}`, { headers: { Cookie: outsider.cookie } });
  assert.equal(absentAttachment.status, 404);
  checks.push('tenant/project isolation, reduced roster, no repository or attachment exposure');

  stage = 'role reduction effective on next request';
  await success(owner, { operation: 'changeMemberRole', scope, userId: member.id, role: 'developer' }, 'done');
  assert.ok((await success(member, { operation: 'getProject', projectId: p1.id }, 'project')).item.repository);
  await denied(member, { operation: 'createInvitation', scope, email: outsider.email, role: 'owner' });
  await success(owner, { operation: 'changeMemberRole', scope, userId: member.id, role: 'viewer' }, 'done');
  assert.equal((await success(member, { operation: 'getProject', projectId: p1.id }, 'project')).item.repository, null);
  checks.push('developer access, denied escalation and immediate viewer reduction');

  stage = 'last-owner and membership revocation';
  await denied(owner, { operation: 'changeMemberRole', scope, userId: owner.id, role: 'developer' });
  await denied(owner, { operation: 'removeMember', scope: workspaceScope, userId: owner.id });
  await success(owner, { operation: 'removeMember', scope, userId: member.id }, 'done');
  await denied(member, { operation: 'getProject', projectId: p1.id });
  checks.push('last owner protection and immediate project revocation');

  stage = 'revoked and expired invitation';
  const revoked = await invite(owner, scope, member, 'developer');
  await success(owner, { operation: 'revokeInvitation', invitationId: revoked.id }, 'done');
  await denied(member, { operation: 'acceptInvitation', token: revoked.token });
  const expired = await invite(owner, scope, member, 'developer');
  await database.pool.query("UPDATE invitation SET expires_at = now() - interval '1 second' WHERE id = $1", [expired.id]);
  await denied(member, { operation: 'acceptInvitation', token: expired.token });
  checks.push('revoked and expired invitation rejection');

  stage = 'workspace-only membership does not expose projects';
  const workspaceInvite = await invite(owner, workspaceScope, outsider, 'member');
  await success(outsider, { operation: 'acceptInvitation', token: workspaceInvite.token }, 'done');
  assert.equal((await success(outsider, { operation: 'listProjects', workspaceId: workspace.id }, 'projects')).items.length, 0);
  await denied(outsider, { operation: 'getProject', projectId: p2.id });
  await success(owner, { operation: 'removeMember', scope: workspaceScope, userId: outsider.id }, 'done');
  await denied(outsider, { operation: 'listProjects', workspaceId: workspace.id });
  checks.push('workspace invitation without implicit project access');

  stage = 'concurrent owner reductions and revoked issuer';
  const coOwner = await invite(owner, scope, member, 'owner');
  await success(member, { operation: 'acceptInvitation', token: coOwner.token }, 'done');
  const reductions = await Promise.all([
    request(owner, { operation: 'changeMemberRole', scope, userId: owner.id, role: 'developer' }),
    request(member, { operation: 'changeMemberRole', scope, userId: member.id, role: 'developer' }),
  ]);
  assert.equal(reductions.filter(result => result.ok).length, 1);
  const ownerCount = await database.pool.query("SELECT count(*)::int AS count FROM project_member WHERE project_id = $1 AND role = 'owner'", [p1.id]);
  assert.equal(ownerCount.rows[0].count, 1);
  await success(owner, { operation: 'changeMemberRole', scope, userId: owner.id, role: 'owner' }, 'done');
  await success(owner, { operation: 'changeMemberRole', scope, userId: member.id, role: 'owner' }, 'done');
  const abandoned = await invite(member, scope, outsider, 'client');
  await success(owner, { operation: 'changeMemberRole', scope, userId: member.id, role: 'developer' }, 'done');
  await denied(outsider, { operation: 'acceptInvitation', token: abandoned.token });
  checks.push('concurrent owner reductions preserve one owner and revoked issuer cannot grant access');

  stage = 'workspace removal protects owned projects';
  const owned = (await success(owner, { operation: 'createProject', workspaceId: workspace.id, name: 'Member-owned project', description: '', defaultVisibility: 'team' }, 'project')).item;
  const ownedScope = { kind: 'project', projectId: owned.id };
  const ownedInvite = await invite(owner, ownedScope, member, 'owner');
  await success(member, { operation: 'acceptInvitation', token: ownedInvite.token }, 'done');
  await success(owner, { operation: 'changeMemberRole', scope: ownedScope, userId: owner.id, role: 'developer' }, 'done');
  await denied(owner, { operation: 'removeMember', scope: workspaceScope, userId: member.id });
  await success(member, { operation: 'changeMemberRole', scope: ownedScope, userId: owner.id, role: 'owner' }, 'done');
  await success(owner, { operation: 'removeMember', scope: workspaceScope, userId: member.id }, 'done');
  await denied(member, { operation: 'getProject', projectId: owned.id });
  await denied(member, { operation: 'getProject', projectId: p1.id });
  checks.push('workspace removal cannot strand projects and removes project memberships');

  stage = 'transactional events and empty foundations';
  const events = await database.pool.query('SELECT payload FROM collaboration_event WHERE workspace_id = $1', [workspace.id]);
  assert.ok(events.rows.length > 8);
  assert.equal(JSON.stringify(events.rows).includes('@'), false);
  for (const table of ['task', 'milestone', 'ai_session']) {
    const count = await database.pool.query(`SELECT count(*)::int AS count FROM ${table} WHERE project_id = ANY($1::text[])`, [[p1.id, p2.id]]);
    assert.equal(count.rows[0].count, 0);
  }
  checks.push('transactional non-secret audit and empty task/milestone/session tables');
  await mkdir(`${root}/.nexus/visual/t04`, { recursive: true });
  await writeFile(`${root}/.nexus/visual/t04/collaboration-report.json`, JSON.stringify({ passed: true, checks, fixtureCleanup: 'handled in finally' }, null, 2));
  console.log(`Collaboration verification passed: ${checks.length} real PostgreSQL/SMTP/HTTP scenarios; no credentials emitted.`);
} catch {
  console.error(`Collaboration verification failed at: ${stage}. No credentials, recipients or email links were printed.`);
  process.exitCode = 1;
} finally {
  await app?.close();
  if (database?.pool) {
    if (workspaceIds.length) await database.pool.query('DELETE FROM workspace WHERE id = ANY($1::text[]) AND name LIKE $2', [workspaceIds, `${fixturePrefix}%`]);
    for (const user of users) {
      await database.pool.query('DELETE FROM "user" WHERE email = $1', [user.email]);
      await database.pool.query('DELETE FROM verification WHERE identifier = $1', [user.email]);
    }
  }
  await database?.close();
  if (received.size) await fetch('http://127.0.0.1:8025/api/v1/messages', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ IDs: [...received] }), signal: AbortSignal.timeout(3_000) }).catch(() => {});
}
