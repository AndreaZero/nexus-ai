import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
const entry = fileURLToPath(new URL('../packages/db/dist/operator-cli.js', import.meta.url));
if (!existsSync(entry)) { console.error('Build the database package first: pnpm --filter @nexus-ai/db build'); process.exitCode = 1; }
else {
  const child = spawn(process.execPath, [entry, ...process.argv.slice(2)], { stdio: 'inherit', windowsHide: true });
  child.once('error', () => { console.error('Database operator could not start.'); process.exitCode = 1; });
  child.once('exit', code => { process.exitCode = code ?? 1; });
}
