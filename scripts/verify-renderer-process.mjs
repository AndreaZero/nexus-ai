import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url)), output = path.join(root, '.nexus/visual/t15');
await mkdir(output, { recursive: true });
const directory = await mkdtemp(path.join(output, 'renderer-process-qa-'));
const requireDesktop = createRequire(path.join(root, 'apps/desktop/package.json'));
const { build } = requireDesktop('esbuild'), electron = requireDesktop('electron');
try {
  await writeFile(path.join(directory, 'index.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; base-uri \'none\'; form-action \'none\'"><title>Native recovery QA</title></head><body><h1>Controlled native recovery fixture</h1></body></html>');
  const payload = path.join(directory, 'input.json'); await writeFile(payload, JSON.stringify({ directory, output }));
  const main = path.join(directory, 'verify.mjs');
  await build({ bundle: true, platform: 'node', format: 'esm', target: 'node22', external: ['electron'], entryPoints: [path.join(root, 'apps/desktop/src/renderer-process-verification.ts')], outfile: main, logLevel: 'silent' });
  const result = await new Promise((resolve, reject) => {
    const child = spawn(electron, [main, payload], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: Object.fromEntries(Object.entries(process.env).filter(([name]) => name !== 'ELECTRON_RUN_AS_NODE')) });
    let logs = ''; for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { if (logs.length < 12000) logs += data.toString(); });
    const timer = setTimeout(() => child.kill(), 30000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => { clearTimeout(timer); resolve({ code, logs }); });
  });
  if (result.code !== 0) throw new Error(`Native renderer recovery QA failed (exit ${result.code}). Inspect .nexus/visual/t15/renderer-process-report.json; renderer crash output intentionally withheld.`);
  const report = JSON.parse(await readFile(path.join(output, 'renderer-process-report.json'), 'utf8'));
  if (!report.passed) throw new Error('Native renderer recovery report did not pass.');
  console.log(`Native renderer recovery passed: ${report.checks.length} checks, two actual renderer crashes, execution stopped before prompt, one explicit reload and close.`);
} finally {
  const resolved = path.resolve(directory);
  if (path.dirname(resolved) === path.resolve(output) && path.basename(resolved).startsWith('renderer-process-qa-')) await rm(resolved, { recursive: true, force: true });
  else { console.error('Unexpected native recovery cleanup target; skipped.'); process.exitCode = 1; }
}
