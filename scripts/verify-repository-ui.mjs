import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Focused T12 UI/IPC verification. Native Git is real; GitHub/account/realtime transport is controlled, no remote writes or inference.
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, '.nexus/visual/t12'); await mkdir(output, { recursive: true });
const directory = await mkdtemp(path.join(output, 'repository-ui-qa-'));
const requireDesktop = createRequire(path.join(root, 'apps/desktop/package.json')); const { build } = requireDesktop('esbuild'); const executable = requireDesktop('electron');
try {
  const repository = path.join(directory, 'repository'); await mkdir(repository); await mkdir(path.join(repository, 'src'));
  const gitNull = process.platform === 'win32' ? 'NUL' : '/dev/null';
  const env = { ...process.env, GIT_CONFIG_GLOBAL: gitNull, GIT_CONFIG_NOSYSTEM: '1' };
  const git = args => execFileSync('git', ['-c', `core.hooksPath=${gitNull}`, ...args], { cwd: repository, env, windowsHide: true, stdio: 'pipe' });
  git(['init', '--template=', '--initial-branch=main']); git(['config', 'core.autocrlf', 'false']);
  await writeFile(path.join(repository, 'src/document-service.ts'), 'export function createDocument(title: string) {\n  return { title };\n}\n');
  git(['add', '--', 'src/document-service.ts']); git(['-c', 'user.name=Nexus QA', '-c', 'user.email=qa@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'Local repository QA baseline']);
  await writeFile(path.join(repository, 'src/document-service.ts'), 'export function createDocument(title: string, userId: string) {\n  if (!userId) throw new Error("Sign in required");\n  return { title, createdBy: userId };\n}\n');
  const payload = path.join(directory, 'input.json'); await writeFile(payload, JSON.stringify({ repository, directory, output, root }));
  const main = path.join(directory, 'verify.mjs');
  await build({ bundle: true, platform: 'node', target: 'node22', format: 'esm', external: ['electron'], entryPoints: [path.join(root, 'apps/desktop/src/repository-verification.ts')], outfile: main, logLevel: 'silent' });
  const result = await new Promise((resolve, reject) => {
    const child = spawn(executable, [main, payload], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'ELECTRON_RUN_AS_NODE')) });
    let text = ''; for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { if (text.length < 16000) text += chunk.toString(); });
    const timer = setTimeout(() => child.kill(), 150000);
    child.once('error', reject); child.once('close', code => { clearTimeout(timer); resolve({ code, text }); });
  });
  if (result.code !== 0) throw new Error(`Repository UI QA failed (${result.code}): ${result.text}`);
  const report = JSON.parse(await readFile(path.join(output, 'repository-report.json'), 'utf8'));
  const committedHead = git(['rev-parse', 'HEAD']).toString().trim();
  if (committedHead !== report.commit.sha) throw new Error('UI commit SHA differs from actual Git HEAD.');
  const author = git(['log', '-1', '--format=%an <%ae>']).toString().trim();
  if (author !== 'Nexus QA Author <qa-author@example.invalid>') throw new Error('Native commit author was not preserved.');
  report.checks.push('Runner independently confirms actual Git HEAD and author after renderer-confirmed commit');
  await writeFile(path.join(output, 'repository-report.json'), JSON.stringify(report, null, 2));
  console.log(`Repository UI/IPC QA passed: ${report.checks.length} checks; actual Git commit/branch, production preload, controlled GitHub responses. Captures: .nexus/visual/t12/`);
} finally {
  const resolvedOutput = path.resolve(output); const resolvedDirectory = path.resolve(directory);
  if (path.dirname(resolvedDirectory) === resolvedOutput && path.basename(resolvedDirectory).startsWith('repository-ui-qa-')) await rm(resolvedDirectory, { recursive: true, force: true });
  else { console.error('Unexpected repository UI QA cleanup target; cleanup skipped.'); process.exitCode = 1; }
}
