import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createDatabaseBoundary, readDatabaseConfig } from '../packages/db/dist/index.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const env = parseEnv(await readFile(new URL('../.env', import.meta.url), 'utf8'));
const server = env.BETTER_AUTH_URL || 'http://127.0.0.1:3001';
const origin = env.NEXUS_WEB_URL || server;
const email = `nexus-qa-${Date.now()}-${randomBytes(4).toString('hex')}@nexus.local`;
const password = randomBytes(24).toString('base64url');
const newPassword = randomBytes(24).toString('base64url');
const jar = new Map();
const received = new Set();
let stage = 'configuration';
let userId;
let database;

function cookieHeader() { return [...jar].map(([name, value]) => `${name}=${value}`).join('; '); }
async function request(path, body, cookie = cookieHeader(), requestOrigin = origin) {
  const response = await fetch(new URL(path, server), {
    method: body === undefined ? 'GET' : 'POST',
    redirect: 'manual', signal: AbortSignal.timeout(15_000),
    headers: { Origin: requestOrigin, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  for (const entry of response.headers.getSetCookie()) {
    const pair = entry.split(';')[0];
    const equal = pair.indexOf('=');
    if (/max-age=0/i.test(entry)) jar.delete(pair.slice(0, equal));
    else jar.set(pair.slice(0, equal), pair.slice(equal + 1));
  }
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = null; }
  return { status: response.status, data, headers: response.headers };
}

async function emailLink(subject) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const listing = await fetch('http://127.0.0.1:8025/api/v1/messages', { signal: AbortSignal.timeout(4_000) }).then((r) => r.json());
    const message = listing.messages.find((m) => m.Subject.includes(subject) && m.To.some((to) => to.Address === email));
    if (message) {
      received.add(message.ID);
      const details = await fetch(`http://127.0.0.1:8025/api/v1/message/${message.ID}`).then((r) => r.json());
      const link = details.Text.match(/https?:\/\/[^\s]+/)?.[0];
      assert.ok(link, 'Expected a real SMTP email link.');
      assert.equal(new URL(link).origin, new URL(server).origin);
      return new URL(link);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('No matching SMTP message received.');
}

try {
  const target = new URL(env.DATABASE_URL);
  assert.equal(target.pathname, '/nexus_ai_dev');
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname));
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(server).hostname));
  database = createDatabaseBoundary(readDatabaseConfig(env));
  assert.equal(await database.check(), 'connected');
  stage = 'service configuration';
  assert.equal((await request('/auth/status')).data?.configured, true);

  stage = 'origin protection';
  assert.equal((await request('/auth/sign-up/email', { name: 'QA', email, password }, '', 'https://untrusted.example')).status, 403);

  stage = 'registration and SMTP';
  const registration = await request('/auth/sign-up/email', { name: 'Nexus verification', email, password, callbackURL: `${origin}/sign-in` });
  assert.equal(registration.status, 200);
  userId = registration.data?.user?.id;
  assert.ok(userId);
  assert.equal(registration.data?.user?.emailVerified, false);
  assert.equal((await request('/auth/me')).data?.user, null);

  stage = 'unverified account denied';
  assert.equal((await request('/auth/sign-in/email', { email, password })).status, 403);

  stage = 'email verification';
  const verificationLink = await emailLink('Verify your email');
  const verified = await request(verificationLink.pathname + verificationLink.search);
  assert.equal(verified.status, 302);

  stage = 'verified sign in and sanitized profile';
  assert.equal((await request('/auth/sign-in/email', { email, password })).status, 200);
  const sessionCookie = cookieHeader();
  const me = (await request('/auth/me')).data;
  assert.equal(me?.user?.id, userId);
  assert.equal(me?.user?.emailVerified, true);
  assert.deepEqual(Object.keys(me).sort(), ['expiresAt', 'user']);
  assert.equal(JSON.stringify(me).includes('token'), false);
  assert.ok(Number.isFinite(Date.parse(me.expiresAt)));

  stage = 'reset email and neutral unknown account response';
  const resetRequest = await request('/auth/request-password-reset', { email, redirectTo: `${origin}/reset-password` });
  const unknownRequest = await request('/auth/request-password-reset', { email: `absent-${randomBytes(8).toString('hex')}@nexus.local`, redirectTo: `${origin}/reset-password` });
  assert.equal(resetRequest.status, 200);
  assert.equal(unknownRequest.status, resetRequest.status);
  assert.deepEqual(unknownRequest.data, resetRequest.data);
  const resetLink = await emailLink('Reset your password');
  const resetRedirect = await request(resetLink.pathname + resetLink.search);
  assert.equal(resetRedirect.status, 302);
  const destination = new URL(resetRedirect.headers.get('location'));
  const token = destination.searchParams.get('token');
  assert.ok(token);

  stage = 'password reset revokes persisted sessions';
  assert.equal((await request('/auth/reset-password', { newPassword, token })).status, 200);
  assert.equal((await request('/auth/me', undefined, sessionCookie)).data?.user, null);
  stage = 'reset token cannot be reused';
  assert.ok((await request('/auth/reset-password', { newPassword: password, token })).status >= 400);

  stage = 'new password and logout revocation';
  jar.clear();
  assert.equal((await request('/auth/sign-in/email', { email, password: newPassword })).status, 200);
  const newCookie = cookieHeader();
  assert.equal((await request('/auth/sign-out', {})).status, 200);
  assert.equal((await request('/auth/me', undefined, newCookie)).data?.user, null);

  stage = 'expired session denied';
  jar.clear();
  assert.equal((await request('/auth/sign-in/email', { email, password: newPassword })).status, 200);
  const expiredCookie = cookieHeader();
  await database.pool.query('UPDATE session SET expires_at = now() - interval \'1 minute\' WHERE user_id = $1', [userId]);
  assert.equal((await request('/auth/me', undefined, expiredCookie)).data?.user, null);
  await mkdir(`${root}/.nexus/visual/t03`, { recursive: true });
  await writeFile(`${root}/.nexus/visual/t03/accounts-report.json`, JSON.stringify({ passed: true, checks: ['real PostgreSQL', 'SMTP receipt', 'origin rejection', 'registration', 'unverified rejection', 'email verification', 'sanitized identity', 'neutral reset response', 'reset revokes sessions', 'reset replay denied', 'logout revocation', 'expiry rejection'], fixtureRemoved: true }, null, 2));
  console.log('Accounts verification passed: PostgreSQL, SMTP, verified login, reset/replay, session revocation/expiry and origin checks.');
} catch {
  console.error(`Accounts verification failed at: ${stage}. No credentials or email links were printed.`);
  process.exitCode = 1;
} finally {
  if (database?.pool) {
    // Delete only this invocation's uniquely named fixture; never clean unrelated accounts.
    await database.pool.query('DELETE FROM "user" WHERE email = $1', [email]);
    await database.pool.query('DELETE FROM verification WHERE identifier = $1', [email]);
  }
  await database?.close();
  if (received.size) await fetch('http://127.0.0.1:8025/api/v1/messages', {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ IDs: [...received] }),
    signal: AbortSignal.timeout(3_000),
  }).catch(() => {});
}
