import { copyFile, lstat, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'site-dist');
const assets = ['index.html', '1month.jpg'];

// Clear stale output first so failed builds cannot leave deployable old assets.
await rm(output, { recursive: true, force: true });
for (const asset of assets) {
  if (!(await lstat(join(root, asset))).isFile()) {
    throw new Error(`Expected a regular source file: ${asset}`);
  }
}
await mkdir(output);
for (const asset of assets) {
  await copyFile(join(root, asset), join(output, asset));
}
