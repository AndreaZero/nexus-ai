import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Isolated UI/IPC QA: actual Git files and Node TAP, controlled provider transport, no personal login.
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, '.nexus/visual/t10');
await mkdir(output, { recursive: true });
const directory = await mkdtemp(path.join(output, 'workspace-qa-'));
const requireDesktop = createRequire(path.join(root, 'apps/desktop/package.json'));
const { build } = requireDesktop('esbuild');
const executable = requireDesktop('electron');
try {
  const repository = path.join(directory, 'repository');
  await mkdir(repository);
  const env = { ...process.env, GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
  const git = args => execFileSync('git', ['-c', `core.hooksPath=${process.platform === 'win32' ? 'NUL' : '/dev/null'}`, ...args], { cwd: repository, env, windowsHide: true, stdio: 'pipe' });
  git(['init', '--template=', '--initial-branch=main']);
  await mkdir(path.join(repository, 'src'));
  await writeFile(path.join(repository, 'src/document-service.ts'), 'export function createDocument(title: string) {\n  return { title };\n}\n');
  git(['add', '--', 'src/document-service.ts']);
  git(['-c', 'user.name=Nexus QA', '-c', 'user.email=qa@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'Local QA baseline']);
  await writeFile(path.join(repository, 'src/document-service.ts'), 'export function createDocument(title: string, userId: string) {\n  if (!userId) throw new Error("Sign in required");\n  return { title, createdBy: userId };\n}\n');
  const testPath = path.join(directory, 'local.test.mjs');
  await writeFile(testPath, "import test from 'node:test'; import assert from 'node:assert/strict'; test('local QA arithmetic', () => assert.equal(2 + 2, 4));\n");
  const tap = execFileSync(process.execPath, ['--test', '--test-reporter=tap', testPath], { windowsHide: true, encoding: 'utf8' });
  const payload = path.join(directory, 'input.json');
  await writeFile(payload, JSON.stringify({ repository, directory, output, root, tap }));
  const main = path.join(directory, 'verify.mjs');
  await build({ bundle: true, platform: 'node', target: 'node22', format: 'esm', external: ['electron'], entryPoints: [path.join(root, 'apps/desktop/src/workspace-verification.ts')], outfile: main, logLevel: 'silent' });
  const result = await new Promise((resolve, reject) => {
    const child = spawn(executable, [main, payload], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'ELECTRON_RUN_AS_NODE')) });
    let text = '';
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { if (text.length < 16000) text += chunk.toString(); });
    const timer = setTimeout(() => child.kill(), 75000);
    child.once('error', reject);
    child.once('close', code => { clearTimeout(timer); resolve({ code, text }); });
  });
  if (result.code !== 0) throw new Error(`Workspace QA failed (${result.code}): ${result.text}`);
  const report = JSON.parse(await readFile(path.join(output, 'workspace-report.json'), 'utf8'));
  console.log(`Workspace UI/IPC QA passed: ${report.checks.length} checks; real Git/Node TAP, controlled provider/Pulse transport. Captures: .nexus/visual/t10/`);
} finally {
  if (path.dirname(directory) === output && path.basename(directory).startsWith('workspace-qa-')) await rm(directory, { recursive: true, force: true });
  else { console.error('Unexpected QA cleanup target; cleanup skipped.'); process.exitCode = 1; }
}
