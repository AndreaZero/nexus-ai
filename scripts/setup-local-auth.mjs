import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const file = fileURLToPath(new URL('../.env', import.meta.url));
try {
  const original = existsSync(file) ? await readFile(file, 'utf8') : '';
  const values = parseEnv(original);
  if (!values.DATABASE_URL) throw new Error();
  const target = new URL(values.DATABASE_URL);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) || target.pathname !== '/nexus_ai_dev') throw new Error();
  const baseURL = `http://127.0.0.1:${values.NEXUS_SERVER_PORT || '3001'}`;
  const defaults = {
    BETTER_AUTH_SECRET: randomBytes(32).toString('base64'),
    BETTER_AUTH_URL: baseURL,
    NEXUS_WEB_URL: baseURL,
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: '1025',
    SMTP_SECURE: 'false',
    NEXUS_EMAIL_FROM: 'Nexus AI <noreply@nexus.local>',
  };
  const missing = Object.entries(defaults).filter(([key]) => !values[key]);
  if (missing.length) {
    const additions = missing.map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n');
    await writeFile(file, `${original.trimEnd()}\n\n# Local T03 authentication and Mailpit (generated once, never commit this file).\n${additions}\n`, { mode: 0o600 });
  }
  console.log(`Configurazione auth/Mailpit locale pronta; ${missing.length} valori mancanti aggiunti. DATABASE_URL e valori esistenti conservati; nessun segreto stampato.`);
} catch {
  console.error('Configura prima DATABASE_URL del DB locale nexus_ai_dev nel file .env. Nessuna credenziale è stata stampata.');
  process.exitCode = 1;
}
