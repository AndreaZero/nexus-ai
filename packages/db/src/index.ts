import { URL } from 'node:url';
import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { databaseSchema } from './schema.js';

export { authSchema, collaborationSchema, databaseSchema } from './schema.js';

export type DatabaseConfig =
  | { readonly configured: false }
  | { readonly configured: true; readonly connectionString: string };

export type DatabaseStatus = 'not_configured' | 'not_connected' | 'connected' | 'unavailable';

/** Never includes the supplied connection string, which can contain credentials. */
export class DatabaseConfigurationError extends Error {
  constructor() {
    super('DATABASE_URL deve essere un URL PostgreSQL valido con host e nome database.');
    this.name = 'DatabaseConfigurationError';
  }
}

export function readDatabaseConfig(
  env: Readonly<Record<string, string | undefined>>,
): DatabaseConfig {
  const connectionString = env['DATABASE_URL']?.trim();
  if (!connectionString) return { configured: false };

  try {
    const url = new URL(connectionString);
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !url.hostname ||
      url.pathname.length <= 1 ||
      url.hash
    ) {
      throw new DatabaseConfigurationError();
    }
  } catch {
    throw new DatabaseConfigurationError();
  }

  return { configured: true, connectionString };
}

export interface DatabaseBoundary {
  readonly status: DatabaseStatus;
  readonly db: NodePgDatabase<typeof databaseSchema> | null;
  readonly pool: Pool | null;
  check(): Promise<DatabaseStatus>;
  close(): Promise<void>;
}

/** A pool is lazy; only a successful probe proves connectivity. Never migrates on startup. */
export function createDatabaseBoundary(config: DatabaseConfig): DatabaseBoundary {
  let status: DatabaseStatus = config.configured ? 'not_connected' : 'not_configured';
  let closed = false;
  const pool = config.configured ? new Pool({
    connectionString: config.connectionString,
    max: 8,
    connectionTimeoutMillis: 3_000,
    idleTimeoutMillis: 30_000,
    query_timeout: 5_000,
    statement_timeout: 5_000,
    application_name: 'nexus-server',
  }) : null;
  pool?.on('error', () => { status = 'unavailable'; });
  const db = pool ? drizzle(pool, { schema: databaseSchema }) : null;
  return {
    get status() { return status; },
    pool,
    db,
    async check(): Promise<DatabaseStatus> {
      if (!pool) return 'not_configured';
      if (closed) return 'unavailable';
      try {
        await pool.query('SELECT 1');
        status = 'connected';
      } catch { status = 'unavailable'; }
      return status;
    },
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      await pool?.end();
      status = config.configured ? 'not_connected' : 'not_configured';
    },
  };
}
