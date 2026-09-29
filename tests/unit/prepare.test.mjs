import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { prepare } from '../../scripts/prepare.mjs';

const epoch = 1790667239;
async function fixture(t) {
  const base = await mkdtemp(join(tmpdir(), 'artwork-prepare-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const source = join(base, 'source'), output = join(base, 'output');
  await mkdir(join(source, 'artist/sketch/_original'), { recursive: true });
  const catalogue = { doodles: [{ id: 'original', index: 75, slug: 'artist/sketch', created: 'original timestamp' }] };
  const master = gzipSync(JSON.stringify(catalogue));
  for (const name of ['master_manifest.json', 'master_manifest_DEV.json']) await writeFile(join(source, name), master);
  const compressed = gzipSync('<!doctype html><canvas></canvas>');
  await writeFile(join(source, 'artist/sketch/index.html'), compressed);
  await writeFile(join(source, 'artist/sketch/manifest.json'), gzipSync(JSON.stringify({ slug: 'artist/sketch', name: 'Example' })));
  for (const name of ['thumb.jpg', 'thumb.webm', 'thumb.mp4', '_original/source.txt']) await writeFile(join(source, 'artist/sketch', name), 'unchanged binary bytes');
  for (const name of ['unpublished', 'experiment']) {
    await mkdir(join(source, 'artist', name));
    await writeFile(join(source, 'artist', name, 'index.html'), 'excluded');
  }
  await writeFile(join(source, 'README.md'), 'excluded');
  await writeFile(join(source, 'artist/sketch/.index.html.swp'), 'editor debris');
  return { base, source, output, catalogue, compressed, master };
}

test('prepare includes complete published directories, preserves IDs and both representations, and is reproducible', async t => {
  const { source, output, base, compressed, master, catalogue } = await fixture(t);
  const result = await prepare(source, output, epoch);
  assert.equal(result.sketches, 1);
  assert.equal(result.files.length, 8);
  assert.deepEqual(JSON.parse(await readFile(join(output, 'master_manifest.json'))), catalogue);
  assert.deepEqual(await readFile(join(output, 'master_manifest.json.gz')), master);
  assert.deepEqual(await readFile(join(output, 'artist/sketch/index.html.gz')), compressed);
  assert.equal(await readFile(join(output, 'artist/sketch/index.html'), 'utf8'), '<!doctype html><canvas></canvas>');
  assert.equal(await readFile(join(output, 'artist/sketch/_original/source.txt'), 'utf8'), 'unchanged binary bytes');
  assert.deepEqual(await readdir(join(output, 'artist')), ['sketch']);
  assert.deepEqual((await readdir(output)).sort(), ['artist', 'master_manifest.json', 'master_manifest.json.gz', 'master_manifest_DEV.json', 'master_manifest_DEV.json.gz']);
  const again = join(base, 'again');
  assert.deepEqual(await prepare(source, again, epoch), result);
  for (const { path, gzipBytes } of result.files) {
    for (const name of gzipBytes === null ? [path] : [path, path + '.gz']) {
      assert.deepEqual(await readFile(join(output, name)), await readFile(join(again, name)));
      assert.equal((await stat(join(output, name))).mtimeMs, epoch * 1000);
      assert.equal((await stat(join(again, name))).mtimeMs, epoch * 1000);
    }
  }
  assert.deepEqual(await readFile(join(source, 'artist/sketch/index.html')), compressed, 'Never rewrite source');
  await assert.rejects(prepare(source, output, epoch), /must be empty/);
});

for (const missing of ['index.html', 'manifest.json', 'thumb.jpg', 'thumb.webm', 'thumb.mp4']) {
  test(`missing required ${missing} fails preparation`, async t => {
    const { source, output } = await fixture(t);
    await rm(join(source, 'artist/sketch', missing));
    await assert.rejects(prepare(source, output, epoch), /ENOENT/);
  });
}

test('reject corrupt gzip and malformed or mismatched manifests', async t => {
  const { source, output } = await fixture(t);
  for (const bytes of [Buffer.from([0x1f, 0x8b, 0]), gzipSync('{invalid'), gzipSync('{"slug":"other/sketch","name":"wrong"}')]) {
    await writeFile(join(source, 'artist/sketch/manifest.json'), bytes);
    await rm(output, { recursive: true, force: true });
    await assert.rejects(prepare(source, output, epoch));
  }
});

test('reject invalid catalogues, unpublished DEV entries and unsafe paths', async t => {
  const { source, output, catalogue } = await fixture(t);
  for (const value of [{ doodles: [] }, {}, { doodles: [catalogue.doodles[0], catalogue.doodles[0]] },
    { doodles: [{ ...catalogue.doodles[0], slug: '../outside' }] }]) {
    await writeFile(join(source, 'master_manifest.json'), JSON.stringify(value));
    await assert.rejects(prepare(source, output, epoch), /catalogue/);
  }
  await writeFile(join(source, 'master_manifest.json'), JSON.stringify(catalogue));
  await writeFile(join(source, 'master_manifest_DEV.json'), JSON.stringify({ doodles: [{ ...catalogue.doodles[0], slug: 'artist/experiment' }] }));
  await assert.rejects(prepare(source, output, epoch), /DEV entry is not published/);
  await assert.rejects(prepare(source, output, 0), /SOURCE_DATE_EPOCH/);
});

test('reject symlinks and companion name collisions', async t => {
  const { source, output } = await fixture(t);
  await symlink(join(source, 'README.md'), join(source, 'artist/sketch/link'));
  await assert.rejects(prepare(source, output, epoch), /Symlinks/);
  await rm(join(source, 'artist/sketch/link'));
  await rm(output, { recursive: true });
  await writeFile(join(source, 'artist/sketch/index.html.gz'), 'collision');
  await assert.rejects(prepare(source, output, epoch), /companion/);
});
