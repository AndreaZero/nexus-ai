import { readinessResponseSchema, type ReadinessResponse } from '@nexus-ai/contracts';
import { readSchemaReadiness, type DatabaseBoundary } from '@nexus-ai/db';
import type { ServerConfig } from './config.js';

/** No DDL, provider traffic or email is sent by readiness. */
export async function readOperationalReadiness(database: DatabaseBoundary, config: ServerConfig, version: string): Promise<ReadinessResponse> {
  const connection = await database.check();
  const schema = connection === 'connected' ? await readSchemaReadiness(database) : 'unavailable';
  const accounts = Boolean(config.database.configured && config.auth.secret);
  const email = Boolean(config.auth.mail);
  return readinessResponseSchema.parse({ schemaVersion: 1, service: 'nexus-server', version,
    status: connection === 'connected' && schema === 'current' && accounts && email ? 'ready' : 'not_ready',
    checks: { database: connection, schema, accounts: accounts ? 'configured' : 'not_configured', email: email ? 'configured' : 'not_configured' },
    timestamp: new Date().toISOString(),
  });
}
