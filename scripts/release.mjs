import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertReleaseEvidence, releasePolicy, windowsSignatureCommand } from './release-policy.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const desktop = path.join(root, 'apps/desktop');
const [command, requestedMode = 'unsigned', ...extra] = process.argv.slice(2);

function run(executable, args, { cwd = root, env = process.env, capture = false, timeout = 30 * 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, env, windowsHide: true, shell: false, stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
    let output = '';
    if (capture) {
      const append = (chunk) => { output = (output + chunk.toString()).slice(-65_536); };
      child.stdout.on('data', append);
      child.stderr.on('data', append);
    }
    const timer = setTimeout(() => { child.kill(); reject(new Error('Release command exceeded its deadline.')); }, timeout);
    child.once('error', () => { clearTimeout(timer); reject(new Error('Release command could not start.')); });
    child.once('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(output);
      else reject(new Error('Release command failed. Check the preceding build output.'));
    });
  });
}

async function sha256(filename) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(filename)) digest.update(chunk);
  return digest.digest('hex');
}

async function macBinaries(directory, prefix = 'Contents/Resources/codex') {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    const destination = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) found.push(...await macBinaries(filename, destination));
    else if (entry.isFile()) {
      const handle = await open(filename, 'r');
      const buffer = Buffer.alloc(4);
      try { await handle.read(buffer, 0, 4, 0); } finally { await handle.close(); }
      if (['feedface', 'feedfacf', 'cefaedfe', 'cffaedfe', 'cafebabe', 'bebafeca', 'cafebabf', 'bfbafeca'].includes(buffer.toString('hex'))) found.push(destination);
    }
  }
  return found;
}

async function observedSignature(platform, artifact, appBundle) {
  if (platform === 'win32') {
    const script = '$ErrorActionPreference="Stop"; $s=Get-AuthenticodeSignature -LiteralPath $env:NEXUS_RELEASE_ARTIFACT; [Console]::Write($s.Status.ToString())';
    try {
      const { executable, env } = windowsSignatureCommand({ ...process.env, NEXUS_RELEASE_ARTIFACT: artifact });
      const status = (await run(executable, ['-NoProfile', '-NonInteractive', '-Command', script], { capture: true, env, timeout: 60_000 })).trim();
      return { status: status === 'Valid' ? 'valid' : status === 'NotSigned' ? 'unsigned' : 'invalid', method: 'Get-AuthenticodeSignature', notarization: 'not_applicable' };
    } catch { return { status: 'unverified', method: 'Get-AuthenticodeSignature', notarization: 'not_applicable' }; }
  }
  if (platform === 'darwin') {
    let status = 'invalid';
    let notarization = 'not_validated';
    try {
      await run('codesign', ['--verify', '--deep', '--strict', appBundle], { capture: true, timeout: 60_000 });
      const details = await run('codesign', ['--display', '--verbose=4', appBundle], { capture: true, timeout: 60_000 });
      status = /Signature=adhoc/.test(details) ? 'ad_hoc' : /Authority=Developer ID Application:/.test(details) ? 'valid' : 'unverified';
    } catch { /* Record the failed observation rather than inferring a signature. */ }
    try {
      await run('xcrun', ['stapler', 'validate', appBundle], { capture: true, timeout: 60_000 });
      notarization = 'validated';
    } catch { /* Unsigned packages have no stapled notarization ticket. */ }
    return { status, method: 'codesign --verify --deep --strict', notarization };
  }
  return { status: 'not_applicable', method: null, notarization: 'not_applicable' };
}

async function writeManifest(policy) {
  const packageInfo = JSON.parse(await readFile(path.join(desktop, 'package.json'), 'utf8'));
  const version = packageInfo.version;
  if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version)) throw new Error('Unsupported release version.');
  const output = path.join(root, 'release', policy.directory);
  const artifactName = `Nexus-AI-${version}-${policy.directory}-${policy.artifactArchitecture}.${policy.extension}`;
  const artifact = path.join(output, artifactName);
  if (!(await stat(artifact)).isFile()) throw new Error('The matching native installer is missing. Package this version first.');
  const unpackedDirectory = policy.platform === 'win32' ? `win${policy.architecture === 'x64' ? '' : `-${policy.architecture}`}-unpacked`
    : policy.platform === 'darwin' ? `mac${policy.architecture === 'x64' ? '' : `-${policy.architecture}`}`
      : `linux${policy.architecture === 'x64' ? '' : `-${policy.architecture}`}-unpacked`;
  const appBundle = policy.platform === 'darwin' ? path.join(output, unpackedDirectory, 'Nexus AI.app') : path.join(output, unpackedDirectory);
  const resources = policy.platform === 'darwin' ? path.join(appBundle, 'Contents/Resources') : path.join(appBundle, 'resources');
  const desktopRequire = createRequire(path.join(desktop, 'package.json'));
  const electronBuilderRequire = createRequire(desktopRequire.resolve('electron-builder/package.json'));
  const builderRequire = createRequire(electronBuilderRequire.resolve('app-builder-lib/package.json'));
  const { extractFile } = builderRequire('@electron/asar');
  const packedPackage = JSON.parse(extractFile(path.join(resources, 'app.asar'), 'package.json').toString('utf8'));
  if (packedPackage.version !== version) throw new Error('The unpacked app does not match this release version.');
  const runtime = JSON.parse(await readFile(path.join(resources, 'codex/nexus-runtime.json'), 'utf8'));
  if (runtime.version !== '0.159.2' || runtime.platform !== policy.platform || runtime.architecture !== policy.architecture) throw new Error('Packaged Codex runtime does not match the native host.');
  const runtimeBinary = path.join(resources, 'codex/bin', policy.platform === 'win32' ? 'codex.exe' : 'codex');
  const signature = await observedSignature(policy.platform, artifact, appBundle);
  assertReleaseEvidence(policy.platform, policy.mode, signature);
  let commit = null;
  let sourceDirty = null;
  try {
    const candidate = (await run('git', ['rev-parse', 'HEAD'], { capture: true, timeout: 10_000 })).trim();
    if (/^[0-9a-f]{40}$/.test(candidate)) commit = candidate;
    sourceDirty = (await run('git', ['status', '--porcelain', '--untracked-files=normal'], { capture: true, timeout: 10_000 })).trim().length > 0;
  } catch { /* A source archive may have no Git metadata. */ }
  const installer = { name: artifactName, bytes: (await stat(artifact)).size, sha256: await sha256(artifact) };
  const manifest = {
    schemaVersion: 1, product: 'Nexus AI', version, commit, sourceDirty,
    platform: policy.platform, architecture: policy.architecture,
    createdAt: new Date().toISOString(), requestedSigning: policy.mode, signature,
    tools: { node: process.version, electron: packageInfo.devDependencies.electron, electronBuilder: packageInfo.devDependencies['electron-builder'] },
    codex: { ...runtime, binarySha256: await sha256(runtimeBinary) },
    artifacts: [installer],
  };
  const stem = `Nexus-AI-${version}-${policy.directory}-${policy.artifactArchitecture}`;
  await writeFile(path.join(output, `${stem}.manifest.json`), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(path.join(output, `${stem}.sha256`), `${installer.sha256}  ${installer.name}\n`);
  console.log(`Release manifest and SHA-256 written for ${policy.platform}/${policy.architecture}; observed signature: ${signature.status}.`);
}

try {
  if (!['package', 'manifest'].includes(command) || extra.length) throw new Error('Use pnpm release:package [unsigned|signed] or pnpm release:manifest [unsigned|signed].');
  // A manifest observes existing files and never needs access to signing credentials.
  const policy = releasePolicy(process.platform, process.arch, command === 'manifest' ? 'unsigned' : requestedMode, process.env);
  if (!['unsigned', 'signed'].includes(requestedMode)) throw new Error('Choose unsigned or signed explicitly.');
  policy.mode = requestedMode;
  if (command === 'package') {
    if (!process.env.npm_execpath) throw new Error('Run release packaging through the pnpm package script.');
    const pnpm = (args) => run(process.execPath, [process.env.npm_execpath, ...args], { env: policy.env });
    await pnpm(['build']);
    const configurationDirectory = path.join(root, '.nexus/release-config');
    await mkdir(configurationDirectory, { recursive: true });
    const configuration = { extends: path.join(desktop, 'electron-builder.yml'), ...policy.config };
    if (process.platform === 'darwin') {
      configuration.mac.binaries = await macBinaries(path.join(root, '.nexus/runtime/codex'));
      if (configuration.mac.binaries.length < 2) throw new Error('The native Codex tools to sign are missing.');
    }
    const configurationFile = path.join(configurationDirectory, `${process.platform}-${process.arch}.json`);
    await writeFile(configurationFile, `${JSON.stringify(configuration, null, 2)}\n`);
    await pnpm(['--filter', '@nexus-ai/desktop', 'exec', 'electron-builder', '--config', configurationFile, policy.flag, policy.target, `--${process.arch}`, '--publish', 'never']);
  }
  await writeManifest(policy);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Release preparation failed.');
  process.exitCode = 1;
}
