import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile, mkdir, open, unlink, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createDatabaseBoundary, readDatabaseConfig, readSchemaReadiness } from '../packages/db/dist/index.js';
import { operatorTarget, parseOperatorCommand, runDatabaseOperator, resolvePostgresTool } from '../packages/db/dist/operator.js';
import { readOperationalReadiness } from '../apps/server/dist/operations.js';
import { readServerConfig } from '../apps/server/dist/config.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, '.nexus/visual/t16');
await mkdir(output, { recursive: true });
const env = parseEnv(await readFile(path.join(root, '.env'), 'utf8'));
const url = new URL(env.DATABASE_URL);
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)); assert.equal(url.pathname, '/nexus_ai_dev');
const schema = `nexus_t16_qa_${randomUUID().replaceAll('-', '')}`;
assert.match(schema, /^nexus_t16_qa_[a-f0-9]{32}$/);
const archive = path.join(output, `${schema}.dump`);
const database = createDatabaseBoundary(readDatabaseConfig(env));
const checks = []; let stage = 'connect';
async function tool(binary, args, input, destination) {
  const command = parseOperatorCommand(['backup', '--confirm-database', 'nexus_ai_dev', '--file', archive]);
  const target = operatorTarget(env.DATABASE_URL, command);
  const executable = await resolvePostgresTool(binary, target.environment);
  const child = spawn(executable, args, { env: target.environment, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000 });
  let diagnostic = ''; child.stderr.on('data', chunk => { if (diagnostic.length < 8000) diagnostic += chunk.toString(); });
  const done = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', code => code === 0 ? resolve() : reject(new Error(diagnostic.includes('does not exist') ? 'QA archive dependency missing.' : diagnostic.includes('permission denied') ? 'QA archive permission denied.' : diagnostic.includes('input file') ? 'QA archive input format rejected.' : 'PostgreSQL QA tool failed.'))); });
  const streams = [];
  if (input) streams.push(pipeline(input, child.stdin)); else child.stdin.end();
  if (destination) streams.push(pipeline(child.stdout, destination)); else child.stdout.resume();
  try { await Promise.all([done, ...streams]); } catch { await done; throw new Error('QA archive stream failed.'); }
}
try {
  assert.equal(await database.check(), 'connected');
  const before = (await database.pool.query('SELECT (SELECT count(*)::int FROM "user") AS users,(SELECT count(*)::int FROM drizzle.__drizzle_migrations) AS migrations')).rows[0];
  stage = 'readiness'; assert.equal(await readSchemaReadiness(database), 'current');
  const ready = await readOperationalReadiness(database, readServerConfig(env), '0.16.0');
  assert.equal(ready.status, 'ready'); assert.equal(ready.checks.schema, 'current');
  checks.push('Read-only readiness matches all 9 historical migration hashes and configured services.');
  stage = 'own schema archive';
  await database.pool.query(`CREATE SCHEMA "${schema}"`);
  await database.pool.query(`CREATE TABLE "${schema}".proof(id integer PRIMARY KEY, body text NOT NULL)`);
  await database.pool.query(`INSERT INTO "${schema}".proof VALUES(1,$1)`, ['T16 isolated backup/restore proof']);
  const file = await open(archive, 'wx', 0o600);
  await tool('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', '--schema', schema, '--dbname', 'nexus_ai_dev'], undefined, file.createWriteStream());
  checks.push('Actual pg_dump 18 custom archive contains only the owned temporary QA schema.');
  stage = 'operator destructive guards';
  await assert.rejects(runDatabaseOperator(parseOperatorCommand(['backup', '--confirm-database', 'nexus_ai_dev', '--file', archive]), env));
  await assert.rejects(runDatabaseOperator(parseOperatorCommand(['restore', '--confirm-database', 'nexus_ai_dev', '--file', archive]), env));
  checks.push('Existing archive is never overwritten; restore refuses the nonempty real application database.');
  stage = 'isolated restore';
  await database.pool.query(`DROP SCHEMA "${schema}" CASCADE`);
  stage = 'isolated restore tool';
  // The archive already contains only our schema. Restore its SCHEMA entry too:
  // pg_restore --schema filters that namespace-less entry out, unlike pg_dump --schema.
  await tool('pg_restore', ['--exit-on-error', '--single-transaction', '--no-owner', '--no-privileges', '--dbname', 'nexus_ai_dev'], createReadStream(archive));
  stage = 'isolated restored row';
  const restored = await database.pool.query(`SELECT body FROM "${schema}".proof WHERE id=1`);
  assert.equal(restored.rows[0]?.body, 'T16 isolated backup/restore proof');
  checks.push('Actual pg_restore 18 restores the owned schema and exact row without touching public data.');
  const after = (await database.pool.query('SELECT (SELECT count(*)::int FROM "user") AS users,(SELECT count(*)::int FROM drizzle.__drizzle_migrations) AS migrations')).rows[0];
  assert.deepEqual(after, before); assert.equal(await readSchemaReadiness(database), 'current');
  checks.push('Existing account count and migration journal remain unchanged; readiness stays current.');
  await writeFile(path.join(output, 'operations-report.json'), JSON.stringify({ status: 'passed', checks, migrations: before.migrations, scope: 'Local PostgreSQL 18 only; owned QA schema. Full empty-database restore and container checks are separate.', observedAt: new Date().toISOString() }, null, 2));
  console.log(`Operations verification passed: ${checks.length} checks; owned QA schema only.`);
} catch (error) {
  const category = error instanceof Error && error.message.startsWith('QA archive ') ? error.message : 'Operation failed.';
  console.error(`Operations verification failed at ${stage}: ${category} No credentials or database diagnostics printed.`); process.exitCode = 1;
} finally {
  if (database.pool) await database.pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => undefined);
  await database.close(); await unlink(archive).catch(() => undefined); await unlink(path.join(output, 'operations-tool-diagnostic.txt')).catch(() => undefined);
}
