import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../src/', import.meta.url));
const output = fileURLToPath(new URL('../dist/', import.meta.url));
async function copyStyles(directory = '') {
  for (const entry of await readdir(join(source, directory), { withFileTypes: true })) {
    const relative = join(directory, entry.name);
    if (entry.isDirectory()) await copyStyles(relative);
    else if (entry.name.endsWith('.css')) {
      await mkdir(dirname(join(output, relative)), { recursive: true });
      await copyFile(join(source, relative), join(output, relative));
    }
  }
}
await copyStyles();
