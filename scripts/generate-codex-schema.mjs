import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { prepareCodexRuntime } from './prepare-codex.mjs';

const run = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const runtime = await prepareCodexRuntime();
const executable = path.join(runtime, 'bin', process.platform === 'win32' ? 'codex.exe' : 'codex');
const home = path.join(root, '.nexus/tools/codex-schema/home');
await mkdir(home, { recursive: true });
const env = { CODEX_HOME: home };
for (const key of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA']) if (process.env[key]) env[key] = process.env[key];
const options = { cwd: home, env, windowsHide: true, timeout: 60_000, maxBuffer: 2 * 1024 * 1024 };
try {
  const version = await run(executable, ['--version'], options);
  if (version.stdout.trim() !== 'codex-cli 0.159.2') throw new Error();
  await run(executable, ['app-server', 'generate-ts', '--out', path.join(root, 'packages/codex-bridge/generated')], options);
  console.log('Generated official Codex 0.159.2 TypeScript protocol. No credentials used.');
} catch { console.error('Codex schema generation failed. Verify the pinned native runtime.'); process.exitCode = 1; }
