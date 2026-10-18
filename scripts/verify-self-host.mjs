import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, open, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// All services, volumes, messages, secrets and restore targets belong to this run.
// Never reads the maintainer's .env, existing containers or application database.
const root = fileURLToPath(new URL('../', import.meta.url));
const id = randomUUID().replaceAll('-', '');
const project = `nexus-t16-qa-${id.slice(0, 12)}`;
const image = `nexus-ai-qa:${id}`;
const privateParent = path.resolve(root, '.nexus/qa-self-host');
const privateDirectory = path.resolve(privateParent, id);
assert.match(id, /^[a-f0-9]{32}$/);
assert.match(project, /^nexus-t16-qa-[a-f0-9]{12}$/);
assert.equal(path.dirname(privateDirectory), privateParent);
assert.ok(privateParent.startsWith(`${path.resolve(root)}${path.sep}`));
await mkdir(privateDirectory, { recursive: true, mode: 0o700 });
const output = path.join(root, '.nexus/visual/t16');
await mkdir(output, { recursive: true });
const envFile = path.join(privateDirectory, 'qa.env');
const overrideFile = path.join(privateDirectory, 'compose.qa.yaml');
const checks = [];
let stage = 'configuration', built = false, composeStarted = false, cleanup;
const logLimit = 1024 * 1024;
let logBytes = 0;
const logFile = await open(path.join(privateDirectory, 'docker.log'), 'wx', 0o600);
const childEnvironment = { ...process.env };
// Compose must interpolate only this run's environment file, never ambient secrets.
for (const key of Object.keys(childEnvironment)) {
  if (/^(NEXUS_|BETTER_AUTH_|DATABASE_URL$|SMTP_|COMPOSE_)/.test(key)) delete childEnvironment[key];
}
async function log(chunk) {
  if (logBytes >= logLimit) return;
  const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  const bounded = bytes.subarray(0, logLimit - logBytes);
  logBytes += bounded.byteLength;
  await logFile.write(bounded).catch(() => undefined);
}
async function docker(args, { timeout = 60_000, expected = 0 } = {}) {
  let captured = '', timedOut = false;
  const child = spawn('docker', args, { cwd: root, env: childEnvironment, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeout);
  timer.unref();
  child.stdout.on('data', chunk => { captured = (captured + chunk.toString()).slice(-128 * 1024); void log(chunk); });
  child.stderr.on('data', chunk => { void log(chunk); });
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject); child.once('close', resolve);
  }).finally(() => clearTimeout(timer));
  assert.equal(timedOut, false, `Docker stage timed out: ${stage}`);
  if (expected === 'failure') assert.notEqual(code, 0, `Expected refusal at ${stage}`);
  else assert.equal(code, expected, `Docker stage failed: ${stage}`);
  return captured;
}
const composeArgs = ['compose', '--project-name', project, '--env-file', envFile, '--profile', 'development', '-f', path.join(root, 'compose.yaml'), '-f', overrideFile];
const compose = (args, options) => docker([...composeArgs, ...args], options);
const execServer = (args, options) => compose(['exec', '-T', 'server', ...args], options);
const execDatabase = sql => compose(['exec', '-T', 'database', 'psql', '-X', '-U', 'postgres', '-d', 'nexus', '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql]);
async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}
async function privateFile(file, body) { const handle = await open(file, 'wx', 0o600); try { await handle.writeFile(body); } finally { await handle.close(); } }
function enter(value) { stage = value; console.log(`Self-host QA: ${value}.`); }
async function waitFor(read, test, label) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try { const value = await read(); if (test(value)) return value; } catch { /* Bounded startup wait; no request content is logged. */ }
    await new Promise(resolve => setTimeout(resolve, 750));
  }
  throw new Error(`Timed out waiting for ${label}`);
}
const request = (url, options) => fetch(url, { ...options, redirect: 'manual', signal: AbortSignal.timeout(8_000) });
let failure;
try {
  const serverPort = await freePort();
  let mailPort = await freePort();
  while (mailPort === serverPort) mailPort = await freePort();
  const base = `http://127.0.0.1:${serverPort}`, inbox = `http://127.0.0.1:${mailPort}`;
  await privateFile(envFile, [
    `NEXUS_DATABASE_ADMIN_PASSWORD=${randomBytes(48).toString('base64url')}`,
    `NEXUS_DATABASE_PASSWORD=${randomBytes(48).toString('base64url')}`,
    `BETTER_AUTH_SECRET=${randomBytes(48).toString('base64url')}`,
    `NEXUS_PUBLIC_URL=${base}`, `NEXUS_HTTP_PORT=${serverPort}`, 'NEXUS_TRUSTED_PROXIES=',
    'SMTP_HOST=mailpit', 'SMTP_PORT=1025', 'SMTP_SECURE=false', 'SMTP_USER=', 'SMTP_PASSWORD=',
    'NEXUS_EMAIL_FROM=Nexus QA <noreply@nexus.local>', 'NEXUS_LOG_LEVEL=warn', '',
  ].join('\n'));
  await privateFile(overrideFile, `services:\n  server:\n    image: ${image}\n    restart: "no"\n  database:\n    restart: "no"\n  mailpit:\n    restart: "no"\n    ports: !override\n      - "127.0.0.1:${mailPort}:8025"\n`);

  enter('build isolated server image');
  await compose(['build', 'server'], { timeout: 15 * 60_000 }); built = true;
  checks.push('Actual Docker build uses the frozen lockfile and an owned unique image tag.');
  enter('start isolated PostgreSQL and Mailpit');
  composeStarted = true;
  await compose(['up', '-d', '--wait', '--wait-timeout', '45', 'database', 'mailpit']);
  await compose(['up', '-d', 'server']);
  enter('readiness before migration');
  const pending = await waitFor(async () => {
    const response = await request(`${base}/ready`); return { code: response.status, body: await response.json() };
  }, value => value.code === 503 && value.body.checks?.schema === 'pending', 'read-only pending schema readiness');
  assert.equal(pending.body.status, 'not_ready');
  assert.equal(pending.body.checks.database, 'connected');
  checks.push('Fresh server returns 503/pending before migration, without applying DDL on startup.');

  enter('explicit container migration');
  await compose(['stop', 'server']);
  await compose(['run', '--rm', 'server', 'packages/db/dist/operator-cli.js', 'migrate', '--confirm-database', 'nexus']);
  await compose(['up', '-d', 'server']);
  const ready = await waitFor(async () => {
    const response = await request(`${base}/ready`); return { code: response.status, body: await response.json() };
  }, value => value.code === 200 && value.body.checks?.schema === 'current', 'current schema readiness');
  assert.equal(ready.body.version, '0.16.0');
  assert.equal(ready.body.status, 'ready');
  assert.equal(ready.body.checks.email, 'configured');
  const journal = (await execDatabase('SELECT count(*) FROM drizzle.__drizzle_migrations')).trim(); assert.equal(journal, '9');
  const restrictedRole = (await execDatabase("SELECT NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication FROM pg_roles WHERE rolname='nexus'")).trim(); assert.equal(restrictedRole, 't');
  const web = await request(base); assert.equal(web.status, 200);
  const csp = web.headers.get('content-security-policy') ?? '';
  assert.ok(csp.includes(base)); assert.ok(csp.includes(base.replace('http:', 'ws:')));
  assert.ok(!(await web.text()).includes('DATABASE_URL'));
  checks.push('Explicit container migration applies nine hashes; readiness is current, app DB role is non-admin and web CSP uses the exact QA origin.');

  enter('isolated inbox HTTP reachability');
  await waitFor(async () => (await request(`${inbox}/api/v1/messages`)).status, value => value === 200, 'isolated inbox HTTP');
  enter('actual signup and SMTP verification message');
  const email = `selfhost-${id}@nexus.local`, password = randomBytes(32).toString('base64url');
  async function post(route, body, cookie = '') {
    return request(new URL(route, base), { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  }
  const signup = await post('/auth/sign-up/email', { email, password, name: 'T16 container QA' }); assert.equal(signup.status, 200);
  const mail = await waitFor(async () => (await request(`${inbox}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json(), value => Boolean(value.messages?.[0]?.ID), 'owned verification email');
  enter('verification link login and account settings');
  const messageId = mail.messages[0].ID;
  const message = await (await request(`${inbox}/api/v1/message/${encodeURIComponent(messageId)}`)).json();
  const link = message.Text?.match(/https?:\/\/[^\s<>"']+/)?.[0]; assert.ok(link); assert.equal(new URL(link).origin, base);
  assert.ok([200, 302, 303].includes((await request(link)).status));
  const login = await post('/auth/sign-in/email', { email, password }); assert.equal(login.status, 200);
  const cookie = login.headers.getSetCookie().map(row => row.split(';', 1)[0]).join('; '); assert.ok(cookie);
  const initial = await (await post('/api/application', { operation: 'getSettings' }, cookie)).json(); assert.equal(initial.ok, true); assert.equal(initial.settings.version, 0);
  const preferences = { ...initial.settings.preferences, notificationsEnabled: false, defaultVisibility: 'client' };
  const save = await (await post('/api/application', { operation: 'saveSettings', expectedVersion: 0, name: 'T16 self-host QA', preferences }, cookie)).json();
  assert.equal(save.ok, true); assert.equal(save.settings.version, 1); assert.equal(save.settings.name, 'T16 self-host QA');
  const read = await (await post('/api/application', { operation: 'getSettings' }, cookie)).json(); assert.deepEqual(read.settings, save.settings);
  checks.push('Real isolated SMTP verification email, verified login and authenticated HTTP profile/preferences persistence succeed.');

  enter('actual PostgreSQL custom backup and destructive guard');
  await execServer(['node', 'packages/db/dist/operator-cli.js', 'backup', '--confirm-database', 'nexus', '--file', '/tmp/qa.dump']);
  await execServer(['node', 'packages/db/dist/operator-cli.js', 'restore', '--confirm-database', 'nexus', '--file', '/tmp/qa.dump'], { expected: 'failure' });
  const afterRefusal = await (await post('/api/application', { operation: 'getSettings' }, cookie)).json(); assert.deepEqual(afterRefusal.settings, save.settings);
  checks.push('Container PostgreSQL18 pg_dump creates a real custom archive; restore rejects the nonempty source database and leaves settings unchanged.');

  enter('restore into a new owned empty database');
  await execDatabase('CREATE DATABASE nexus_restore_qa OWNER nexus');
  const restoreCode = `import {spawnSync} from 'node:child_process';const url=new URL(process.env.DATABASE_URL);url.pathname='/nexus_restore_qa';const result=spawnSync(process.execPath,['packages/db/dist/operator-cli.js','restore','--confirm-database','nexus_restore_qa','--file','/tmp/qa.dump'],{env:{...process.env,DATABASE_URL:url.href},stdio:'inherit'});process.exit(result.status??1);`;
  await execServer(['node', '--input-type=module', '-e', restoreCode]);
  const restoredQuery = 'SELECT (SELECT count(*)::int FROM "user") users,(SELECT count(*)::int FROM drizzle.__drizzle_migrations) migrations,(SELECT count(*)::int FROM user_preferences WHERE version=1 AND NOT (preferences->>\'notificationsEnabled\')::boolean) preferences';
  const inspectCode = `import assert from 'node:assert/strict';import {createDatabaseBoundary,readDatabaseConfig,readSchemaReadiness} from './packages/db/dist/index.js';const url=new URL(process.env.DATABASE_URL);url.pathname='/nexus_restore_qa';const db=createDatabaseBoundary(readDatabaseConfig({...process.env,DATABASE_URL:url.href}));try{assert.equal(await readSchemaReadiness(db),'current');const row=(await db.pool.query(${JSON.stringify(restoredQuery)})).rows[0];assert.deepEqual(row,{users:1,migrations:9,preferences:1});const name=(await db.pool.query('SELECT name FROM "user"')).rows[0].name;assert.equal(name,'T16 self-host QA');console.log(JSON.stringify({schema:'current',users:row.users,migrations:row.migrations,preferences:row.preferences}));}finally{await db.close();}`;
  const restored = JSON.parse((await execServer(['node', '--input-type=module', '-e', inspectCode])).trim());
  assert.deepEqual(restored, { schema: 'current', users: 1, migrations: 9, preferences: 1 });
  checks.push('Actual pg_restore into a separate empty QA database restores all nine hashes, the verified user and exact saved preferences/profile.');
} catch (error) {
  failure = { stage, type: error instanceof Error ? error.name : 'UnknownError' };
  console.error(`Self-host QA failed at ${stage}; no credentials or Docker logs are printed.`);
  process.exitCode = 1;
} finally {
  enter('remove owned containers volumes and image');
  try {
    if (composeStarted) await compose(['down', '--volumes', '--remove-orphans', '--timeout', '10']);
    if (built) await docker(['image', 'rm', image]);
    cleanup = 'complete';
  } catch {
    cleanup = 'failed'; process.exitCode = 1;
    console.error('Self-host QA cleanup failed; only the UUID-scoped QA resources may require removal.');
  }
  await logFile.close();
  if (cleanup === 'complete') {
    assert.equal(path.dirname(privateDirectory), privateParent);
    assert.match(path.basename(privateDirectory), /^[a-f0-9]{32}$/);
    await rm(privateDirectory, { recursive: true, force: true });
  }
  await writeFile(path.join(output, 'self-host-report.json'), JSON.stringify({ task: 'T16', status: failure || cleanup !== 'complete' ? 'failed' : 'passed', checks, cleanup, ...(failure ? { failure } : {}), scope: 'Fresh UUID-owned Docker project/image/volume, loopback HTTP/SMTP, no maintainer .env, database or credentials.', observedAt: new Date().toISOString() }, null, 2));
}
if (!failure && cleanup === 'complete') console.log(`Self-host QA passed (${checks.length} checks); owned resources removed.`);
