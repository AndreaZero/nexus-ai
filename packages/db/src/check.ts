import { createDatabaseBoundary } from './index.js';
import { loadLocalDatabase } from './cli-config.js';

try {
  const database = createDatabaseBoundary(loadLocalDatabase());
  try {
    if (await database.check() !== 'connected' || !database.pool) throw new Error();
    const result = await database.pool.query<{ database: string; version: string; encoding: string }>(
      "SELECT current_database() AS database, current_setting('server_version') AS version, current_setting('server_encoding') AS encoding",
    );
    const info = result.rows[0];
    console.log(`PostgreSQL connesso: database ${info?.database}; versione ${info?.version}; encoding ${info?.encoding}.`);
  } finally { await database.close(); }
} catch {
  console.error('Verifica PostgreSQL non riuscita. Controlla il servizio e DATABASE_URL locale; nessuna credenziale è stata stampata.');
  process.exitCode = 1;
}
