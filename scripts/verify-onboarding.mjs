import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url)), output = path.join(root, '.nexus/visual/t17');
await mkdir(output, { recursive: true }); const directory = await mkdtemp(path.join(output, 'onboarding-qa-'));
const requireDesktop = createRequire(path.join(root, 'apps/desktop/package.json')), { build } = requireDesktop('esbuild'), executable = requireDesktop('electron');
try {
  const payload = path.join(directory, 'input.json'); await writeFile(payload, JSON.stringify({ directory, output, root })); const main = path.join(directory, 'verify.mjs');
  await build({ bundle: true, platform: 'node', target: 'node22', format: 'esm', external: ['electron'], entryPoints: [path.join(root, 'apps/desktop/src/onboarding-verification.ts')], outfile: main, logLevel: 'silent' });
  const result = await new Promise((resolve, reject) => {
    const child = spawn(executable, [main, payload], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'ELECTRON_RUN_AS_NODE')) });
    let text = ''; for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { if (text.length < 16000) text += chunk.toString(); });
    const timer = setTimeout(() => child.kill(), 180000); child.once('error', reject); child.once('close', code => { clearTimeout(timer); resolve({ code, text }); });
  });
  if (result.code !== 0) throw new Error(`Onboarding QA failed (${result.code}): ${result.text}`);
  const report = JSON.parse(await readFile(path.join(output, 'onboarding-report.json'), 'utf8')); console.log(`Onboarding UI/IPC QA passed: ${report.checks.length} checks; ${report.captures.length} captures. Strict controlled DTOs, no real login or inference. .nexus/visual/t17/`);
} finally {
  const resolved = path.resolve(directory); if (path.dirname(resolved) === path.resolve(output) && path.basename(resolved).startsWith('onboarding-qa-')) await rm(resolved, { recursive: true, force: true });
  else { console.error('Unexpected onboarding QA cleanup target; skipped.'); process.exitCode = 1; }
}
