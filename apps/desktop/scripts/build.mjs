import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { prepareCodexRuntime } from '../../../scripts/prepare-codex.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
await prepareCodexRuntime();
try {
  const values = parseEnv(await readFile(path.resolve(root, '../../.env'), 'utf8'));
  for (const [key, value] of Object.entries(values)) process.env[key] ??= value;
} catch (error) {
  if (error.code !== 'ENOENT') throw new Error('Cannot read the local build configuration.', { cause: error });
}
const common = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  external: ['electron'],
  sourcemap: true,
  logLevel: 'info',
  define: {
    __NEXUS_AUTH_SERVER_URL__: JSON.stringify(process.env.BETTER_AUTH_URL ?? 'http://127.0.0.1:3001'),
    __NEXUS_WEB_URL__: JSON.stringify(process.env.NEXUS_WEB_URL ?? 'http://127.0.0.1:3001'),
  },
};

await Promise.all([
  build({ ...common, entryPoints: [path.join(root, 'src/main.ts')], outfile: path.join(root, 'dist/main.mjs'), format: 'esm',
    // ws uses CommonJS builtin imports; retain a Node-only require in the ESM main bundle.
    banner: { js: "import { createRequire as nexusCreateRequire } from 'node:module'; const require = nexusCreateRequire(import.meta.url);" } }),
  // Sandboxed preloads only support a limited require; bundle all application imports.
  build({ ...common, entryPoints: [path.join(root, 'src/preload.ts')], outfile: path.join(root, 'dist/preload.cjs'), format: 'cjs' }),
]);
