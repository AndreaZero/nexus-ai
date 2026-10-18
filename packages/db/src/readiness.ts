import { fileURLToPath } from 'node:url';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import type { DatabaseBoundary } from './index.js';

export type SchemaReadiness = 'current' | 'pending' | 'mismatch' | 'unavailable';
export const migrationDirectory = fileURLToPath(new URL('../migrations', import.meta.url));

/** Read-only comparison of the complete ordered journal, including historical hashes. */
export async function readSchemaReadiness(database: DatabaseBoundary): Promise<SchemaReadiness> {
  if (!database.pool) return 'unavailable';
  try {
    const expected = readMigrationFiles({ migrationsFolder: migrationDirectory });
    const table = await database.pool.query<{ present: string | null }>("SELECT to_regclass('drizzle.__drizzle_migrations')::text AS present");
    if (!table.rows[0]?.present) return 'pending';
    const applied = await database.pool.query<{ hash: string; created_at: string }>('SELECT hash, created_at::text FROM drizzle.__drizzle_migrations ORDER BY created_at, id');
    if (applied.rows.length > expected.length) return 'mismatch';
    for (const [index, row] of applied.rows.entries()) {
      const file = expected[index];
      if (!file || row.hash !== file.hash || Number(row.created_at) !== file.folderMillis) return 'mismatch';
    }
    return applied.rows.length === expected.length ? 'current' : 'pending';
  } catch { return 'unavailable'; }
}
