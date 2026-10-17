import { createRequire } from 'node:module';
import { cp, mkdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const version = '0.159.2';
const root = fileURLToPath(new URL('../', import.meta.url));
const targets = {
  'win32-x64': ['codex-win32-x64', 'x86_64-pc-windows-msvc'],
  'win32-arm64': ['codex-win32-arm64', 'aarch64-pc-windows-msvc'],
  'darwin-x64': ['codex-darwin-x64', 'x86_64-apple-darwin'],
  'darwin-arm64': ['codex-darwin-arm64', 'aarch64-apple-darwin'],
  'linux-x64': ['codex-linux-x64', 'x86_64-unknown-linux-musl'],
  'linux-arm64': ['codex-linux-arm64', 'aarch64-unknown-linux-musl'],
};

/** Copies only the lockfile-installed official native runtime for the build host. */
export async function prepareCodexRuntime() {
  const target = targets[`${process.platform}-${process.arch}`];
  if (!target) throw new Error('This build host has no supported native Codex runtime.');
  const desktopRequire = createRequire(path.join(root, 'apps/desktop/package.json'));
  const wrapperFile = desktopRequire.resolve('@openai/codex/package.json');
  const wrapper = JSON.parse(await readFile(wrapperFile, 'utf8'));
  if (wrapper.version !== version) throw new Error(`The build requires official Codex ${version}.`);
  const runtimeRequire = createRequire(wrapperFile);
  const nativeFile = runtimeRequire.resolve(`@openai/${target[0]}/package.json`);
  const nativePackage = JSON.parse(await readFile(nativeFile, 'utf8'));
  if (nativePackage.version !== `${version}-${process.platform}-${process.arch}`) throw new Error('The native Codex package does not match the pinned release.');
  const source = await realpath(path.join(path.dirname(nativeFile), 'vendor', target[1]));
  const filename = process.platform === 'win32' ? 'codex.exe' : 'codex';
  if (!(await stat(path.join(source, 'bin', filename))).isFile()) throw new Error('The official Codex executable is missing. Reinstall workspace dependencies.');
  const destination = path.resolve(root, '.nexus/runtime/codex');
  const parent = path.resolve(root, '.nexus/runtime');
  // Fixed workspace target checked before recursive removal; never an OS/profile directory.
  if (path.dirname(destination) !== parent || path.basename(destination) !== 'codex' || !destination.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error('Unsafe runtime build path.');
  await mkdir(parent, { recursive: true });
  const stamp = { version, platform: process.platform, architecture: process.arch, target: target[1] };
  try {
    const previous = JSON.parse(await readFile(path.join(destination, 'nexus-runtime.json'), 'utf8'));
    if (JSON.stringify(previous) === JSON.stringify(stamp) && (await stat(path.join(destination, 'bin', filename))).isFile()) return destination;
  } catch { /* Missing/stale build cache is replaced from the pinned package. */ }
  await rm(destination, { recursive: true, force: true });
  await cp(source, destination, { recursive: true, force: true, preserveTimestamps: true });
  const readme = path.join(path.dirname(nativeFile), 'README.md');
  await cp(readme, path.join(destination, 'CODEX-README.md'));
  await writeFile(path.join(destination, 'nexus-runtime.json'), JSON.stringify(stamp, null, 2));
  console.log(`Prepared official Codex ${version} for ${process.platform}/${process.arch}.`);
  return destination;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await prepareCodexRuntime(); }
  catch { console.error('Codex runtime preparation failed. Install the pinned workspace dependencies for this OS and rebuild.'); process.exitCode = 1; }
}
