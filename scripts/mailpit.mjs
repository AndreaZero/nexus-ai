import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Official release asset digests, verified via github.com/axllent/mailpit on 2026-10-17.
const version = '1.31.6';
const digests = {
  'win32-x64': '5d5ad094bfb3bac9004f9d1105d2335fea9f8952c09951df73ae0a280e34d3b1',
  'win32-arm64': 'c04c77ac9fd9da27c91259d0484b93b163e8534964682f543204cf3301a6b967',
  'darwin-x64': '2f89ed77d2e6623bf700de42236858d10dde1ba96a222c9dbdefd33fa094a6f3',
  'darwin-arm64': '1411270aa8fd7f4fb0cc358318754d7bb7c2c30bfd70572dd12d05a53e956373',
  'linux-x64': '10fa12ccc610f653d4ed4df848c1817f9935dcf4e9a6a458a19ab0fa02093f91',
  'linux-arm64': 'de07955b783236d9129da76da9a5970f1777834a18b2c07611de957be784dafe',
};
const root = fileURLToPath(new URL('../', import.meta.url));
const directory = resolve(root, '.nexus/tools/mailpit', version);
const executable = resolve(directory, process.platform === 'win32' ? 'mailpit.exe' : 'mailpit');

async function install() {
  const digest = digests[`${process.platform}-${process.arch}`];
  if (!digest) throw new Error('Questa piattaforma richiede installazione Mailpit manuale.');
  const platform = process.platform === 'win32' ? 'windows' : process.platform;
  const arch = process.arch === 'x64' ? 'amd64' : 'arm64';
  const name = `mailpit-${platform}-${arch}.${process.platform === 'win32' ? 'zip' : 'tar.gz'}`;
  const response = await fetch(`https://github.com/axllent/mailpit/releases/download/v${version}/${name}`, {
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error('Download Mailpit ufficiale non riuscito.');
  const archive = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(archive).digest('hex') !== digest) throw new Error('Checksum Mailpit non valido.');
  await mkdir(directory, { recursive: true });
  const archivePath = resolve(directory, name);
  await writeFile(archivePath, archive);
  if (process.platform === 'win32') {
    const quote = (text) => `'${text.replaceAll("'", "''")}'`;
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      `Expand-Archive -LiteralPath ${quote(archivePath)} -DestinationPath ${quote(directory)} -Force`], { windowsHide: true, stdio: 'pipe' });
  } else {
    execFileSync('tar', ['-xzf', archivePath, '-C', directory, 'mailpit'], { stdio: 'pipe' });
    await chmod(executable, 0o755);
  }
  if (!existsSync(executable)) throw new Error('Eseguibile Mailpit non trovato dopo estrazione.');
  await writeFile(resolve(directory, 'verified-sha256.txt'), `${digest}\n`);
  console.log(`Mailpit ${version} installato localmente con SHA-256 verificato.`);
}

try {
  if (process.argv.includes('--install')) await install();
  else {
    if (!existsSync(executable) || !existsSync(resolve(directory, 'verified-sha256.txt'))) {
      throw new Error('Prima esegui pnpm mailpit --install (download ufficiale locale).');
    }
    const data = resolve(root, '.nexus/mailpit');
    await mkdir(data, { recursive: true });
    // Inherit the OS environment, never an SMTP relay or listener override from MP_*.
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('MP_')));
    const child = spawn(executable, ['--listen', '127.0.0.1:8025', '--smtp', '127.0.0.1:1025', '--database', resolve(data, 'mailpit.db')], {
      env, windowsHide: true, stdio: 'inherit',
    });
    console.log('Mailpit locale: http://127.0.0.1:8025 · SMTP 127.0.0.1:1025. Ctrl+C per arrestare.');
    child.once('error', () => { console.error('Avvio Mailpit non riuscito.'); process.exitCode = 1; });
    child.once('exit', (code) => { process.exitCode = code ?? 0; });
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
  }
} catch {
  console.error('Mailpit non disponibile. Controlla rete/installazione e porte 1025/8025; guida in docs/auth.md.');
  process.exitCode = 1;
}
