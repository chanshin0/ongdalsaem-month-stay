import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, copyFile, readFile, readdir, rm, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const hashes = {
  'index.html': '0b6d91132275a79b4f19453e34baa15836423d5dc6367cd0c43ce34794b3f5b1',
  '202610_1month.jpg': '2359dc832d4ede085da484968dd650715e56583e2905b82b6fe8f925503ba314',
  '202610_1month_mo.jpg': 'f346e9158b703b4023f7a304d01e15617d1524ff062a24dbeb959b9871099549',
};

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'month-stay-build-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, 'scripts'));
  await copyFile(join(root, 'scripts/build.mjs'), join(dir, 'scripts/build.mjs'));
  for (const name of Object.keys(hashes)) await copyFile(join(root, name), join(dir, name));
  return dir;
}

test('only the three approved byte-identical assets are published, including after rebuild', async (t) => {
  const dir = await fixture(t);
  for (const name of ['2026month.jpg', '.env', 'docs/internal.md', '.dryforge/internal.md']) {
    await mkdir(join(dir, name, '..'), { recursive: true });
    await writeFile(join(dir, name), 'synthetic private sentinel');
  }
  await mkdir(join(dir, 'site-dist'));
  await writeFile(join(dir, 'site-dist/stale-secret.txt'), 'synthetic stale sentinel');
  for (let attempt = 0; attempt < 2; attempt++) {
    execFileSync(process.execPath, [join(dir, 'scripts/build.mjs')]);
    assert.deepEqual((await readdir(join(dir, 'site-dist'))).sort(), Object.keys(hashes).sort());
    for (const [name, hash] of Object.entries(hashes)) {
      assert.equal(createHash('sha256').update(await readFile(join(dir, 'site-dist', name))).digest('hex'), hash);
    }
  }
});

for (const mode of ['missing', 'symlink']) {
  test(`${mode} source fails closed and clears old output`, async (t) => {
    const dir = await fixture(t);
    await rm(join(dir, '202610_1month.jpg'));
    if (mode === 'symlink') await symlink(join(root, '202610_1month.jpg'), join(dir, '202610_1month.jpg'));
    await mkdir(join(dir, 'site-dist'));
    await writeFile(join(dir, 'site-dist/stale.txt'), 'stale');
    const result = spawnSync(process.execPath, [join(dir, 'scripts/build.mjs')]);
    assert.notEqual(result.status, 0);
    await assert.rejects(readdir(join(dir, 'site-dist')), { code: 'ENOENT' });
  });
}

test('Workers serves only site-dist and uses a real 404 fallback without worker code', async () => {
  const config = JSON.parse(await readFile(join(root, 'wrangler.jsonc'), 'utf8'));
  assert.equal(config.name, 'ongdalsaem-month-stay');
  assert.equal(config.workers_dev, true);
  assert.equal(config.assets.directory, './site-dist');
  assert.equal(config.assets.not_found_handling, 'none');
  assert.equal(config.main, undefined);
});
