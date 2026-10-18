import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url)), output = path.join(root, '.nexus/visual/t15');
await mkdir(output, { recursive: true });
const directory = await mkdtemp(path.join(output, 'renderer-recovery-qa-'));
const requireDesktop = createRequire(path.join(root, 'apps/desktop/package.json'));
const { build } = requireDesktop('esbuild'), electron = requireDesktop('electron');
try {
  const productionEntry = await readFile(path.join(root, 'apps/web/src/main.tsx'), 'utf8');
  if (!/onCaughtError:\s*\(\)\s*=>\s*undefined/.test(productionEntry)) throw new Error('Review the current production caught-error logging policy before updating this QA fixture.');
  const source = `
    import {createElement,StrictMode} from 'react';
    import {createRoot} from 'react-dom/client';
    import {RendererErrorBoundary} from './RendererErrorBoundary.tsx';
    import '../../../packages/ui/src/styles.css';
    import './integration.css';
    window.qaCaughtCount=0;window.qaRenderAttempts=0;
    function BrokenChild(){window.qaRenderAttempts++;throw new Error('PRIVATE_CONTROLLED_RENDER_FAILURE_T15');}
    createRoot(document.getElementById('root'),{onCaughtError:()=>{window.qaCaughtCount++;}}).render(
      createElement(StrictMode,null,createElement(RendererErrorBoundary,null,createElement(BrokenChild))));
  `;
  await build({ bundle: true, platform: 'browser', format: 'iife', target: 'chrome144', jsx: 'automatic', minify: true,
    define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.woff': 'file', '.woff2': 'file' }, assetNames: 'assets/[name]-[hash]',
    stdin: { contents: source.replace("'../../../packages/ui/src/styles.css'", JSON.stringify(path.join(root, 'packages/ui/src/styles.css').replaceAll('\\', '/'))), resolveDir: path.join(root, 'apps/web/src'), sourcefile: 'controlled-render-failure.tsx', loader: 'tsx' },
    outfile: path.join(directory, 'renderer.js'), logLevel: 'silent' });
  await writeFile(path.join(directory, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'none'; img-src 'none'; base-uri 'none'; form-action 'none'"><title>Nexus renderer recovery QA</title><link rel="stylesheet" href="renderer.css"></head><body><div id="root"></div><script src="renderer.js"></script></body></html>`);
  const payload = path.join(directory, 'input.json'); await writeFile(payload, JSON.stringify({ directory, output }));
  const main = path.join(directory, 'verify.mjs');
  await build({ bundle: true, platform: 'node', format: 'esm', target: 'node22', external: ['electron'], entryPoints: [path.join(root, 'apps/desktop/src/renderer-recovery-verification.ts')], outfile: main, logLevel: 'silent' });
  const result = await new Promise((resolve, reject) => {
    const child = spawn(electron, [main, payload], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: Object.fromEntries(Object.entries(process.env).filter(([name]) => name !== 'ELECTRON_RUN_AS_NODE')) });
    let logs = ''; for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { if (logs.length < 12000) logs += data.toString(); });
    const timer = setTimeout(() => { child.kill(); }, 30000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => { clearTimeout(timer); resolve({ code, logs }); });
  });
  if (result.code !== 0) throw new Error(`Renderer recovery QA failed (exit ${result.code}). Inspect .nexus/visual/t15/renderer-recovery-report.json; captured child output was withheld to preserve the error-payload assertion.`);
  const report = JSON.parse(await readFile(path.join(output, 'renderer-recovery-report.json'), 'utf8'));
  if (!report.passed) throw new Error('Renderer recovery report did not pass.');
  console.log(`Renderer recovery QA passed: ${report.checks.length} checks; real React boundary, no automatic reload, one explicit reload. Captures: .nexus/visual/t15/`);
} finally {
  const resolved = path.resolve(directory);
  if (path.dirname(resolved) === path.resolve(output) && path.basename(resolved).startsWith('renderer-recovery-qa-')) await rm(resolved, { recursive: true, force: true });
  else { console.error('Unexpected renderer recovery cleanup target; skipped.'); process.exitCode = 1; }
}
