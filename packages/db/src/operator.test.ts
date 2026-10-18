import assert from 'node:assert/strict';
import test from 'node:test';
import { operatorTarget, parseOperatorCommand, resolvePostgresTool } from './operator.js';
import { readSchemaReadiness, migrationDirectory } from './readiness.js';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import type { DatabaseBoundary } from './index.js';
import { mkdtemp, writeFile, chmod, rm, symlink, rmdir, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('operator requires explicit matching database confirmation and files', () => {
  for (const args of [[], ['migrate'], ['migrate', '--confirm-database', 'a', '--file', 'x'], ['restore', '--confirm-database', 'a'], ['backup', '--confirm-database', 'a', '--file', 'x', '--file', 'y'], ['migrate', '--confirm-database', 'a', '--clean', 'true']]) assert.throws(() => parseOperatorCommand(args));
  const command = parseOperatorCommand(['migrate', '--confirm-database', 'nexus_ai_dev', '--env-file', '.env']);
  assert.throws(() => operatorTarget('postgres://a:secret@127.0.0.1/other', command));
  assert.throws(() => operatorTarget('postgres://a:secret@remote.example/nexus_ai_dev', command));
  assert.throws(() => operatorTarget('postgres://a:secret@127.0.0.1/nexus_ai_dev?options=unsafe', command));
});

test('readiness detects missing, pending, historical tampering and extra migrations without DDL', async () => {
  const expected = readMigrationFiles({ migrationsFolder: migrationDirectory }).map(row => ({ hash: row.hash, created_at: String(row.folderMillis) }));
  const boundary = (rows: unknown[], present = true) => ({ pool: { async query(sql: string) { assert.equal(/CREATE|ALTER|INSERT|UPDATE|DELETE|DROP/.test(sql), false); return { rows: sql.includes('to_regclass') ? [{ present: present ? 'drizzle.__drizzle_migrations' : null }] : rows }; } } }) as unknown as DatabaseBoundary;
  assert.equal(await readSchemaReadiness(boundary(expected)), 'current');
  assert.equal(await readSchemaReadiness(boundary([], false)), 'pending');
  assert.equal(await readSchemaReadiness(boundary(expected.slice(0, -1))), 'pending');
  assert.equal(await readSchemaReadiness(boundary([{ ...expected[0], hash: 'tampered' }, ...expected.slice(1)])), 'mismatch');
  assert.equal(await readSchemaReadiness(boundary([...expected, expected[0]])), 'mismatch');
  assert.equal(await readSchemaReadiness({ pool: null } as DatabaseBoundary), 'unavailable');
});

test('operator credentials stay in the child environment and explicit remote TLS defaults verify the server', () => {
  const command = parseOperatorCommand(['backup', '--confirm-database', 'nexus', '--file', 'archive.dump']);
  const target = operatorTarget('postgresql://nexus:a%40b@database.example:5433/nexus', command);
  assert.equal(target.database, 'nexus'); assert.equal(target.environment['PGPASSWORD'], 'a@b');
  assert.equal(target.environment['PGSSLMODE'], 'verify-full'); assert.equal(target.environment['PGPORT'], '5433');
  assert.equal(target.environment['DATABASE_URL'], undefined); assert.equal(target.environment['PGOPTIONS'], undefined);
  assert.equal(target.environment['BETTER_AUTH_SECRET'], undefined); assert.equal(target.environment['SMTP_PASSWORD'], undefined);
});

test('native tool resolution excludes relative PATH, cwd and canonical aliases of forbidden roots', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'nexus-operator-tool-'));
  const alias = `${directory}-alias`;
  const binary = path.join(directory, process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump');
  try {
    await writeFile(binary, 'controlled fixture, never executed'); await chmod(binary, 0o700);
    assert.equal(await resolvePostgresTool('pg_dump', { PATH: directory }, [process.cwd()]), await realpath(binary));
    await assert.rejects(resolvePostgresTool('pg_dump', { PATH: '.' }, []));
    await assert.rejects(resolvePostgresTool('pg_dump', { PATH: directory }, [directory]));
    await symlink(directory, alias, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(resolvePostgresTool('pg_dump', { PATH: directory }, [alias]));
  } finally {
    await rm(alias, { force: true }).catch(() => undefined);
    await rm(binary, { force: true }); await rmdir(directory);
  }
});
