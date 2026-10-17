import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabaseBoundary } from './index.js';
import { loadLocalDatabase } from './cli-config.js';

try {
  const config = loadLocalDatabase();
  const target = new URL(config.connectionString);
  // T03 only authorizes the dedicated local development database.
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) || target.pathname !== '/nexus_ai_dev') {
    throw new Error('Target non locale o database diverso da nexus_ai_dev.');
  }
  const database = createDatabaseBoundary(config);
  try {
    if (!database.db || !database.pool || await database.check() !== 'connected') throw new Error();
    const client = await database.pool.connect();
    try {
      // Serialize migration commands on this database, including their metadata table setup.
      await client.query("SELECT pg_advisory_lock(hashtext('nexus-ai:migrations'))");
      const { drizzle } = await import('drizzle-orm/node-postgres');
      await migrate(drizzle(client), { migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)) });
      console.log('Migrazioni PostgreSQL locali applicate; nessun dato iniziale creato.');
    } finally {
      try { await client.query("SELECT pg_advisory_unlock(hashtext('nexus-ai:migrations'))"); }
      finally { client.release(); }
    }
  } finally { await database.close(); }
} catch {
  console.error('Migrazione non riuscita. Verifica DB locale nexus_ai_dev, credenziali e migrazioni; nessun dettaglio sensibile viene stampato.');
  process.exitCode = 1;
}
