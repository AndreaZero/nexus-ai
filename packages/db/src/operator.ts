import { spawn } from 'node:child_process';
import { createReadStream, constants } from 'node:fs';
import { open, lstat, unlink, realpath, stat, access } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { resolve, delimiter, isAbsolute, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import { createDatabaseBoundary, readDatabaseConfig } from './index.js';
import { migrationDirectory, readSchemaReadiness } from './readiness.js';

export interface OperatorCommand { readonly operation: 'migrate' | 'backup' | 'restore'; readonly database: string; readonly file: string | null; readonly envFile: string | null }
export const operatorHelp = 'database <migrate|backup|restore> --confirm-database NAME [--file PATH] [--env-file .env]\nDATABASE_URL comes from the environment. --env-file is restricted to local nexus_ai_dev. Backup creates a new private custom-format archive; restore requires an empty target and trusted archive. No automatic migrations.';
export function parseOperatorCommand(args: readonly string[]): OperatorCommand {
  const operation = args[0];
  if (!['migrate', 'backup', 'restore'].includes(operation ?? '')) throw new Error('Choose migrate, backup or restore.');
  const values = new Map<string, string>();
  for (let index = 1; index < args.length; index += 2) {
    const key = args[index], value = args[index + 1];
    if (!key || !['--confirm-database', '--file', '--env-file'].includes(key) || values.has(key) || !value || value.startsWith('--') || [...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) throw new Error('Invalid or duplicate operator argument.');
    values.set(key, value);
  }
  const database = values.get('--confirm-database');
  if (!database) throw new Error('The exact database name must be confirmed.');
  const file = values.get('--file') ?? null;
  if ((operation === 'migrate') === Boolean(file)) throw new Error('Backup and restore require --file; migrate does not accept it.');
  return { operation: operation as OperatorCommand['operation'], database, file: file ? resolve(file) : null, envFile: values.get('--env-file') ?? null };
}

export function operatorTarget(connectionString: string, command: OperatorCommand): { readonly database: string; readonly environment: NodeJS.ProcessEnv } {
  const url = new URL(connectionString);
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.hash || !url.username || !url.password || !database || database !== command.database) throw new Error('Database target and explicit confirmation must match a credentialed PostgreSQL URL.');
  if (command.envFile && (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || database !== 'nexus_ai_dev')) throw new Error('Local env files can only address local nexus_ai_dev.');
  const sslmode = url.searchParams.get('sslmode') ?? (['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ? 'prefer' : 'verify-full');
  if (![...url.searchParams.keys()].every(key => key === 'sslmode') || !['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full'].includes(sslmode)) throw new Error('Only the explicit sslmode connection option is supported.');
  const environment: NodeJS.ProcessEnv = {};
  const allowed = new Set(['PATH', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'LANG', 'LC_ALL']);
  for (const [key, value] of Object.entries(process.env)) if (allowed.has(key.toUpperCase())) environment[key] = value;
  return { database, environment: { ...environment, PGHOST: url.hostname.replace(/^\[|\]$/g, ''), PGPORT: url.port || '5432', PGDATABASE: database, PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGSSLMODE: sslmode, PGCONNECT_TIMEOUT: '10', PGAPPNAME: 'nexus-operator' } };
}

/** Never resolve a native PostgreSQL tool through cwd or a repository-controlled PATH entry. */
export async function resolvePostgresTool(binary: 'pg_dump' | 'pg_restore', environment: NodeJS.ProcessEnv = process.env, forbiddenDirectories: readonly string[] = [fileURLToPath(new URL('../../../', import.meta.url)), process.cwd()]): Promise<string> {
  const forbidden = await Promise.all(forbiddenDirectories.map(directory => realpath(directory)));
  const within = (candidate: string, directory: string) => { const distance = relative(directory, candidate); return !distance || (!distance.startsWith('..') && !isAbsolute(distance)); };
  const executable = process.platform === 'win32' ? `${binary}.exe` : binary;
  const pathValue = Object.entries(environment).find(([key]) => key.toUpperCase() === 'PATH')?.[1] ?? '';
  for (const entry of pathValue.split(delimiter)) {
    if (!isAbsolute(entry)) continue;
    try {
      const candidate = join(await realpath(entry), executable);
      if (forbidden.some(directory => within(candidate, directory))) continue;
      const canonical = await realpath(candidate);
      if (forbidden.some(directory => within(canonical, directory)) || !(await stat(canonical)).isFile()) continue;
      await access(canonical, constants.X_OK);
      // Debian's pg_dump/pg_restore aliases dispatch by basename through pg_wrapper.
      // Validate the canonical target, then retain the trusted absolute alias name.
      return candidate;
    } catch { /* Try the next explicit absolute PATH directory. */ }
  }
  throw new Error('A trusted PostgreSQL executable outside the workspace is required on PATH.');
}

export async function assertPostgresCustomArchive(filename: string): Promise<void> {
  const handle = await open(filename, 'r');
  try {
    const magic = Buffer.alloc(5);
    const { bytesRead } = await handle.read(magic, 0, magic.length, 0);
    if (bytesRead !== magic.length || magic.toString('ascii') !== 'PGDMP' || (await handle.stat()).size <= magic.length) {
      throw new Error('A nonempty PostgreSQL custom archive is required.');
    }
  } finally { await handle.close(); }
}

async function postgresTool(binary: 'pg_dump' | 'pg_restore', args: readonly string[], environment: NodeJS.ProcessEnv, input?: NodeJS.ReadableStream, output?: NodeJS.WritableStream): Promise<void> {
  const executable = await resolvePostgresTool(binary, environment);
  const child = spawn(executable, [...args], { env: environment, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'], timeout: 600_000 });
  const completion = new Promise<void>((resolvePromise, reject) => { child.once('error', () => reject(new Error('PostgreSQL tool unavailable.'))); child.once('close', code => code === 0 ? resolvePromise() : reject(new Error('PostgreSQL tool failed.'))); });
  const streams: Promise<unknown>[] = [];
  if (input) streams.push(pipeline(input, child.stdin)); else child.stdin.end();
  if (output) streams.push(pipeline(child.stdout, output)); else child.stdout.resume();
  try { await Promise.all([completion, ...streams]); } catch { child.kill(); await Promise.allSettled([completion, ...streams]); throw new Error('PostgreSQL operation failed; inspect target and installed tools without exposing credentials.'); }
}

/** Caller has stopped writers. Advisory lock serializes all Nexus operator commands. */
export async function runDatabaseOperator(command: OperatorCommand, environment: Readonly<Record<string, string | undefined>>): Promise<void> {
  const config = readDatabaseConfig(environment);
  if (!config.configured) throw new Error('DATABASE_URL is required.');
  const target = operatorTarget(config.connectionString, command);
  const connection = new URL(config.connectionString);
  // Apply the same explicit TLS policy to our guard/lock connection as to libpq tools.
  if (!connection.searchParams.has('sslmode')) connection.searchParams.set('sslmode', target.environment['PGSSLMODE'] ?? 'verify-full');
  const database = createDatabaseBoundary({ configured: true, connectionString: connection.href });
  try {
    if (!database.pool || await database.check() !== 'connected') throw new Error('Database unavailable.');
    const client = await database.pool.connect();
    try {
      await client.query("SELECT pg_advisory_lock(hashtext('nexus-ai:migrations'))");
      const current = await client.query<{ name: string }>('SELECT current_database() AS name');
      if (current.rows[0]?.name !== target.database) throw new Error('Connected database differs from confirmation.');
      if (command.operation === 'migrate') {
        const readiness = await readSchemaReadiness(database);
        if (readiness === 'mismatch' || readiness === 'unavailable') throw new Error('Migration history mismatches the release or is unreadable.');
        await migrate(drizzle(client), { migrationsFolder: migrationDirectory });
        if (await readSchemaReadiness(database) !== 'current') throw new Error('Schema is not current after migration.');
      } else if (command.operation === 'backup') {
        if (!command.file) throw new Error('Backup file required.');
        const handle = await open(command.file, 'wx', 0o600);
        try {
          await postgresTool('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', '--dbname', target.database], target.environment, undefined, handle.createWriteStream());
          await assertPostgresCustomArchive(command.file);
        }
        catch (error) { await handle.close().catch(() => undefined); await unlink(command.file).catch(() => undefined); throw error; }
      } else {
        if (!command.file) throw new Error('Trusted archive file required.');
        const stat = await lstat(command.file);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0) throw new Error('Restore requires a regular nonempty archive.');
        await assertPostgresCustomArchive(command.file);
        const objects = await client.query<{ empty: boolean }>(`SELECT NOT EXISTS (
          SELECT 1 FROM pg_namespace n WHERE n.nspname NOT IN ('public','information_schema') AND n.nspname !~ '^pg_'
          UNION ALL SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
          UNION ALL SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
          UNION ALL SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public'
        ) AS empty`);
        if (!objects.rows[0]?.empty) throw new Error('Restore requires an empty target; no objects were dropped.');
        await postgresTool('pg_restore', ['--exit-on-error', '--single-transaction', '--no-owner', '--no-privileges', '--dbname', target.database], target.environment, createReadStream(command.file));
      }
    } finally {
      try { await client.query("SELECT pg_advisory_unlock(hashtext('nexus-ai:migrations'))"); } finally { client.release(); }
    }
  } finally { await database.close(); }
}
