import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readDatabaseConfig } from './index.js';

export function loadLocalDatabase() {
  const envFile = fileURLToPath(new URL('../../../.env', import.meta.url));
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const config = readDatabaseConfig(process.env);
  if (!config.configured) throw new Error('Imposta DATABASE_URL nel file .env locale.');
  return config;
}
