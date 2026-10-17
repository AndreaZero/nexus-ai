import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CodexProcess, CODEX_VERSION } from '../packages/codex-bridge/dist/src/index.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const parent = path.resolve(root, '.nexus/qa-codex');
await mkdir(parent, { recursive: true });
const home = await mkdtemp(path.join(parent, 'runtime-'));
if (path.dirname(home) !== parent || !path.basename(home).startsWith('runtime-')) throw new Error('Unsafe QA cleanup path.');
const packaged = process.argv.includes('--packaged');
if (packaged && process.platform !== 'win32') throw new Error('Packaged runtime QA currently targets the Windows unpacked directory.');
const executable = path.resolve(root, packaged ? 'release/win/win-unpacked/resources/codex/bin' : '.nexus/runtime/codex/bin', process.platform === 'win32' ? 'codex.exe' : 'codex');
const client = new CodexProcess({ executable, home, clientVersion: '0.5.0' });
let stage = 'runtime version and initialize';
try {
  await client.start();
  stage = 'dedicated unauthenticated account';
  const account = await client.request('account/read', { refreshToken: false });
  if (account.account !== null) throw new Error('A fresh home unexpectedly has an account.');
  stage = 'model catalog';
  const models = await client.request('model/list', { limit: 100, cursor: null, includeHidden: false });
  if (!Array.isArray(models.data) || models.data.length === 0) throw new Error('Runtime catalog is missing.');
  const report = { passed: true, version: CODEX_VERSION, platform: process.platform, architecture: process.arch, packaged, accountInherited: false, modelCount: models.data.length, inferenceExecuted: false, checks: ['native pinned binary', 'real initialize/initialized', 'isolated account/read', 'model/list catalog', 'bounded process shutdown'] };
  await client.dispose();
  await mkdir(path.join(root, '.nexus/visual/t05'), { recursive: true });
  await writeFile(path.join(root, '.nexus/visual/t05', packaged ? 'packaged-runtime-report.json' : 'runtime-report.json'), JSON.stringify(report, null, 2));
  console.log(`Codex runtime verification passed: ${CODEX_VERSION}, native ${process.platform}/${process.arch}, isolated account and ${models.data.length} catalog models. No inference or existing credentials used.`);
} catch {
  console.error(`Codex runtime verification failed at: ${stage}. No credentials or protocol payloads were printed.`);
  process.exitCode = 1;
} finally {
  await client.dispose();
  await rm(home, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
}
