import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createServer } from 'node:net';

const root = fileURLToPath(new URL('../', import.meta.url));
const command = process.argv[2];
const pnpm = process.env.npm_execpath;
const children = new Set();
let stopping = false;

if (!pnpm) {
  console.error('Avvia questo comando tramite gli script pnpm del progetto.');
  process.exit(1);
}

function launch(args, extraEnv = {}) {
  const child = spawn(process.execPath, [pnpm, ...args], {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
    detached: process.platform !== 'win32',
    env: { ...process.env, ...extraEnv },
  });
  children.add(child);
  child.once('exit', () => children.delete(child));
  return child;
}

function run(args, extraEnv = {}) {
  return new Promise((resolveRun, reject) => {
    const child = launch(args, extraEnv);
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolveRun();
      else reject(new Error(`pnpm ${args.join(' ')}: ${signal ?? `exit ${code}`}`));
    });
  });
}

async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  await Promise.all([...children].map(async (child) => {
    if (!child.pid) return;
    if (process.platform === 'win32') {
      await new Promise((done) => {
        const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
          stdio: 'ignore', windowsHide: true,
        });
        killer.once('error', done);
        killer.once('exit', done);
      });
    } else {
      try { process.kill(-child.pid, 'SIGTERM'); }
      catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
  }));
  process.exitCode = code;
}

function supervise(args, env) {
  const child = launch(args, env);
  child.once('error', (error) => {
    console.error(error.message);
    void stop(1);
  });
  child.once('exit', (code) => {
    if (!stopping) void stop(code ?? 1);
  });
}

async function waitForRenderer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline && !stopping) {
    try {
      const response = await fetch('http://127.0.0.1:5173/', { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
    } catch { /* Vite has not started yet. */ }
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error('Il renderer non è pronto su 127.0.0.1:5173 entro 30 secondi.');
}

function assertPortAvailable(port, host) {
  return new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once('error', () => reject(new Error(`Porta ${host}:${port} già occupata o non disponibile. Chiudi l'altro processo prima di avviare Nexus.`)));
    probe.listen(port, host, () => probe.close(resolvePort));
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => void stop());

try {
  const envFile = resolve(root, '.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);

  const packageTargets = { 'package:win': 'win32', 'package:mac': 'darwin', 'package:linux': 'linux' };
  if (command in packageTargets) {
    if (process.platform !== packageTargets[command]) {
      throw new Error(`Eseguire ${command} sul sistema operativo di destinazione (${packageTargets[command]}).`);
    }
    await run(['build']);
    await run(['--filter', '@nexus-ai/desktop', command]);
  } else if (command === 'start:server') {
    if (!existsSync(resolve(root, 'apps/server/dist/index.js'))) {
      throw new Error('Build server assente. Esegui pnpm build prima di pnpm start:server.');
    }
    supervise(['--filter', '@nexus-ai/server', 'start']);
  } else if (command === 'start:desktop') {
    if (!existsSync(resolve(root, 'apps/web/dist/index.html'))) {
      throw new Error('Build assente. Esegui pnpm build prima di pnpm start:desktop.');
    }
    supervise(['--filter', '@nexus-ai/desktop', 'start']);
  } else if (['dev:desktop', 'dev:web', 'dev:server'].includes(command)) {
    await run(['-r', '--filter', './packages/**', 'build']);
    await assertPortAvailable(Number(process.env.NEXUS_SERVER_PORT ?? 3001), process.env.NEXUS_SERVER_HOST ?? '127.0.0.1');
    if (command !== 'dev:server') await assertPortAvailable(5173, '127.0.0.1');
    if (command === 'dev:server') supervise(['--filter', '@nexus-ai/server', 'dev']);
    else {
      const webDevelopment = { NEXUS_WEB_URL: 'http://127.0.0.1:5173' };
      supervise(['--filter', '@nexus-ai/server', 'dev'], webDevelopment);
      supervise(['--filter', '@nexus-ai/web', 'dev']);
      if (command === 'dev:desktop') {
        await run(['--filter', '@nexus-ai/desktop', 'build'], webDevelopment);
        await waitForRenderer();
        if (!stopping) supervise(['--filter', '@nexus-ai/desktop', 'dev'], {
          ...webDevelopment,
          NEXUS_RENDERER_URL: 'http://127.0.0.1:5173',
        });
      }
    }
  } else throw new Error(`Comando workspace sconosciuto: ${command ?? '(assente)'}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  await stop(1);
}
