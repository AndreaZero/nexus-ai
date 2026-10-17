import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const common = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  external: ['electron'],
  sourcemap: true,
  logLevel: 'info',
};

await Promise.all([
  build({ ...common, entryPoints: [path.join(root, 'src/main.ts')], outfile: path.join(root, 'dist/main.mjs'), format: 'esm' }),
  // Sandboxed preloads only support a limited require; bundle all application imports.
  build({ ...common, entryPoints: [path.join(root, 'src/preload.ts')], outfile: path.join(root, 'dist/preload.cjs'), format: 'cjs' }),
]);
