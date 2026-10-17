import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createDatabaseBoundary, readDatabaseConfig } from '../packages/db/dist/index.js';
import { buildServer } from '../apps/server/dist/app.js';
import { readServerConfig } from '../apps/server/dist/config.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, '.nexus/visual/t09-fix'); await mkdir(output, { recursive: true });
const env = parseEnv(await readFile(path.join(root, '.env'), 'utf8'));
const email = `nexus-rate-qa-${randomUUID()}@nexus.local`;
const originalNow = Date.now; const startedAt = originalNow(); const checks = [];
let clock;
const qaNow = () => clock ?? originalNow();
let app, database, base, mailId; let stage = 'local configuration';
async function post(route, body, cookie = '') {
  return fetch(new URL(route, base), { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(10000), headers: { 'Content-Type': 'application/json', Origin: base, ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
}
try {
  const target = new URL(env.DATABASE_URL); assert.equal(target.hostname, '127.0.0.1'); assert.equal(target.pathname, '/nexus_ai_dev'); assert.equal(env.SMTP_HOST, '127.0.0.1'); assert.equal(env.SMTP_PORT, '1025');
  database = createDatabaseBoundary(readDatabaseConfig(env)); assert.equal(await database.check(), 'connected');
  const { createServer } = await import('node:net'); const probe = createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve)); const port = probe.address().port; await new Promise(resolve => probe.close(resolve)); base = `http://127.0.0.1:${port}`;
  const config = readServerConfig({ ...env, NEXUS_SERVER_PORT: String(port), BETTER_AUTH_URL: base, NEXUS_WEB_URL: base, NEXUS_LOG_LEVEL: 'silent' });
  // Install the clock seam before the backend captures its budget clock.
  // Wall time remains real until the continuous-read scenario starts.
  Date.now = qaNow;
  app = await buildServer(config); await app.listen({ host: '127.0.0.1', port });
  stage = 'verified temporary account'; const password = randomBytes(32).toString('base64url');
  assert.equal((await post('/auth/sign-up/email', { name: 'Session rate QA', email, password })).status, 200);
  let link;
  for (let attempt = 0; attempt < 4 && !link; attempt++) {
    const result = await (await fetch(`http://127.0.0.1:8025/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json(); mailId = result.messages?.[0]?.ID;
    if (mailId) { const message = await (await fetch(`http://127.0.0.1:8025/api/v1/message/${mailId}`)).json(); link = message.Text?.match(/https?:\/\/[^\s<>"]+/)?.[0]; }
    else await new Promise(resolve => setTimeout(resolve, 150));
  }
  assert.ok(link); assert.equal(new URL(link).origin, base);
  assert.ok([200, 302, 303].includes((await fetch(link, { redirect: 'manual' })).status));
  const login = await post('/auth/sign-in/email', { email, password }); assert.equal(login.status, 200);
  const cookie = login.headers.getSetCookie().map(value => value.split(';', 1)[0]).join('; ');
  async function session() { return fetch(new URL('/auth/get-session', base), { headers: { Cookie: cookie, Origin: base }, signal: AbortSignal.timeout(5000) }); }
  stage = 'continuous reads across six virtual minutes';
  clock = originalNow();
  for (let read = 0; read < 180; read++) { clock += 2000; const response = await session(); assert.equal(response.status, 200); assert.equal((await response.json()).user.email, email); }
  checks.push('180 authenticated HTTP reads every two virtual seconds remain valid across six minutes without an idle gap');
  stage = 'burst limit and fixed retry window'; clock += 60_001; const windowStart = clock;
  for (let read = 0; read < 100; read++) { const response = await session(); assert.equal(response.status, 200); await response.arrayBuffer(); }
  for (const elapsed of [0, 10_000, 30_000, 59_999]) {
    clock = windowStart + elapsed; const response = await session(); assert.equal(response.status, 429); assert.equal(Number(response.headers.get('retry-after')), Math.ceil((60_000 - elapsed) / 1000)); await response.arrayBuffer();
  }
  clock = windowStart + 60_000; assert.equal((await session()).status, 200); clock = undefined; Date.now = originalNow;
  checks.push('A real burst remains limited to100/minute; rejected retries do not postpone recovery');
  stage = 'revoked session'; assert.equal((await post('/auth/sign-out', {}, cookie)).status, 200); const revoked = await session(); assert.equal(revoked.status, 200); assert.equal(await revoked.json(), null);
  checks.push('A revoked cookie stays unauthenticated after rate-limit recovery');
  stage = 'native identity, PKCE, storage and recovery';
  const requireDesktop = createRequire(path.join(root, 'apps/desktop/package.json'));
  const result = await new Promise((resolve, reject) => {
    const child = spawn(requireDesktop('electron'), ['.', '--verify-auth'], { cwd: path.join(root, 'apps/desktop'), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'ELECTRON_RUN_AS_NODE')), BETTER_AUTH_URL: base, NEXUS_WEB_URL: base } });
    let text = ''; for (const stream of [child.stdout, child.stderr]) stream.on('data', value => { if (text.length < 12000) text += value.toString(); });
    const timeout = setTimeout(() => child.kill(), 65000);
    child.once('error', reject); child.once('close', code => { clearTimeout(timeout); resolve({ code, text }); });
  });
  await writeFile(path.join(output, 'native-auth.log'), result.text);
  assert.equal(result.code, 0);
  const native = JSON.parse(await readFile(path.join(output, 'auth/desktop-auth-report.json'), 'utf8')); assert.equal(native.success, true);
  checks.push(`Native Electron: ${native.checks.length} account checks, including1000 detached local identity reads without HTTP`);
  await writeFile(path.join(output, 'session-rate-report.json'), JSON.stringify({ passed: true, checks, transport: 'real PostgreSQL/SMTP/HTTP + Electron PKCE/OS encryption', clock: 'virtual time only on isolated QA backend; no real minute-long sleeps', personalInference: false }, null, 2));
  console.log(`Session-rate verification passed: ${checks.length} regression scenarios; credentials never emitted.`);
} catch { console.error(`Session-rate verification failed at: ${stage}. No credentials or session content printed.`); process.exitCode = 1; }
finally {
  Date.now = originalNow; await app?.close();
  const emails = [email];
  try { const native = JSON.parse(await readFile(path.join(output, 'auth/desktop-auth-fixture.json'), 'utf8')); if (/^nexus-desktop-qa-[0-9a-f-]+@nexus\.local$/.test(native.email) && Date.parse(native.createdAt) >= startedAt) emails.push(native.email); } catch { /* No native account was created. */ }
  if (database?.pool) for (const fixtureEmail of emails) { await database.pool.query('DELETE FROM "user" WHERE email=$1', [fixtureEmail]); await database.pool.query('DELETE FROM verification WHERE identifier=$1', [fixtureEmail]); }
  await database?.close();
  if (mailId) await fetch('http://127.0.0.1:8025/api/v1/messages', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ IDs: [mailId] }), signal: AbortSignal.timeout(3000) }).catch(() => {});
}
