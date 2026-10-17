import { URL } from 'node:url';

export type DatabaseConfig =
  | { readonly configured: false }
  | { readonly configured: true; readonly connectionString: string };

export type DatabaseStatus = 'not_configured' | 'not_connected';

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
  close(): Promise<void>;
}

/**
 * T01 owns configuration only. A configured URL is never evidence of connectivity.
 * T03 will add the PostgreSQL pool and migrations behind this Node-only boundary.
 */
export function createDatabaseBoundary(config: DatabaseConfig): DatabaseBoundary {
  return {
    status: config.configured ? 'not_connected' : 'not_configured',
    async close(): Promise<void> {
      // No connection or other handles have been opened at this stage.
    },
  };
}
