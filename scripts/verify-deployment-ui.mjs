import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Actual Electron renderer/preload and loopback probe. Shared account/domain DTOs
// are controlled fixtures in the disposable entry, never the production app.
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, '.nexus/visual/t13'); await mkdir(output, { recursive: true });
const directory = await mkdtemp(path.join(output, 'deployment-ui-qa-'));
const requireDesktop = createRequire(path.join(root, 'apps/desktop/package.json'));
const { build } = requireDesktop('esbuild'); const executable = requireDesktop('electron');
try {
  const payload = path.join(directory, 'input.json'); await writeFile(payload, JSON.stringify({ directory, output, root }));
  const main = path.join(directory, 'verify.mjs');
  await build({ bundle: true, platform: 'node', target: 'node22', format: 'esm', external: ['electron'], entryPoints: [path.join(root, 'apps/desktop/src/deployment-verification.ts')], outfile: main, logLevel: 'silent' });
  const result = await new Promise((resolve, reject) => {
    const child = spawn(executable, [main, payload], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'ELECTRON_RUN_AS_NODE')) });
    let text = ''; for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { if (text.length < 16000) text += chunk.toString(); });
    const timer = setTimeout(() => child.kill(), 150000);
    child.once('error', reject); child.once('close', code => { clearTimeout(timer); resolve({ code, text }); });
  });
  if (result.code !== 0) throw new Error(`Deployment UI QA failed (${result.code}): ${result.text}`);
  const report = JSON.parse(await readFile(path.join(output, 'deployment-ui-report.json'), 'utf8'));
  console.log(`Deployment UI/IPC QA passed: ${report.checks.length} checks; actual preload/loopback HTTP, controlled shared DTOs. Captures: .nexus/visual/t13/`);
} finally {
  const resolvedOutput = path.resolve(output); const resolvedDirectory = path.resolve(directory);
  if (path.dirname(resolvedDirectory) === resolvedOutput && path.basename(resolvedDirectory).startsWith('deployment-ui-qa-')) await rm(resolvedDirectory, { recursive: true, force: true });
  else { console.error('Unexpected deployment UI QA cleanup target; cleanup skipped.'); process.exitCode = 1; }
}
