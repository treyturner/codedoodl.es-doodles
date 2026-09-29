import { mkdir, readdir, readFile, lstat, writeFile, utimes } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const decode = bytes => bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes;

export async function prepare(source, destination, epoch) {
  source = resolve(source);
  destination = resolve(destination);
  if (!Number.isSafeInteger(epoch) || epoch <= 0) throw new Error('A positive SOURCE_DATE_EPOCH is required');
  if (source === destination || source.startsWith(destination + sep)) throw new Error('Output must not contain the source');
  await mkdir(destination, { recursive: true });
  if ((await readdir(destination)).length) throw new Error('Output directory must be empty');
  const date = new Date(epoch * 1000);
  const inventory = [];
  async function regular(path) {
    if (!(await lstat(path)).isFile()) throw new Error(`Expected regular file: ${path}`);
    return readFile(path);
  }
  async function master(name) {
    const bytes = await regular(join(source, name));
    const value = JSON.parse(decode(bytes));
    if (!Array.isArray(value.doodles) || !value.doodles.length) throw new Error(`Invalid catalogue: ${name}`);
    const slugs = new Set(), ids = new Set(), indexes = new Set();
    for (const entry of value.doodles) {
      if (!/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/.test(entry.slug) || typeof entry.id !== 'string' || !entry.id ||
          !Number.isSafeInteger(entry.index) || entry.index < 1 || slugs.has(entry.slug) || ids.has(entry.id) || indexes.has(entry.index)) {
        throw new Error(`Invalid or duplicate catalogue entry: ${name}`);
      }
      slugs.add(entry.slug); ids.add(entry.id); indexes.add(entry.index);
    }
    return slugs;
  }
  const published = await master('master_manifest.json');
  const development = await master('master_manifest_DEV.json');
  for (const slug of development) if (!published.has(slug)) throw new Error(`DEV entry is not published: ${slug}`);

  async function emit(path, bytes) {
    const target = join(destination, path);
    await mkdir(resolve(target, '..'), { recursive: true });
    await writeFile(target, bytes, { flag: 'wx', mode: 0o644 });
    await utimes(target, date, date);
  }
  async function copy(path) {
    if (path.endsWith('.gz')) throw new Error(`Source collides with a gzip companion: ${path}`);
    const bytes = await regular(join(source, path));
    const plain = decode(bytes);
    await emit(path, plain);
    const compressed = plain !== bytes;
    if (compressed) await emit(path + '.gz', bytes);
    inventory.push({ path, bytes: plain.length, gzipBytes: compressed ? bytes.length : null,
      sha256: createHash('sha256').update(plain).digest('hex'),
      gzipSha256: compressed ? createHash('sha256').update(bytes).digest('hex') : null });
  }
  async function walk(path) {
    const info = await lstat(join(source, path));
    if (info.isSymbolicLink()) throw new Error(`Symlinks are not supported: ${path}`);
    if (info.isFile()) return copy(path);
    if (!info.isDirectory()) throw new Error(`Unsupported archive entry: ${path}`);
    for (const entry of (await readdir(join(source, path))).sort()) {
      // Editor debris and repository/build metadata are not artwork resources.
      if (entry.startsWith('.')) continue;
      await walk(join(path, entry));
    }
  }
  for (const slug of [...published].sort()) {
    // Check the author directory as well: never traverse a parent symlink.
    if (!(await lstat(join(source, slug.split('/')[0]))).isDirectory()) throw new Error(`Invalid author directory: ${slug}`);
    for (const name of ['index.html', 'manifest.json', 'thumb.jpg', 'thumb.webm', 'thumb.mp4']) {
      const bytes = decode(await regular(join(source, slug, name)));
      if (name === 'manifest.json') {
        const manifest = JSON.parse(bytes);
        if (manifest.slug !== slug || typeof manifest.name !== 'string') throw new Error(`Invalid sketch manifest: ${slug}`);
      }
    }
    await walk(slug);
  }
  await copy('master_manifest.json');
  await copy('master_manifest_DEV.json');
  // Directory mtimes also remain stable across repeated builds.
  async function stamp(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) if (entry.isDirectory()) await stamp(join(path, entry.name));
    await utimes(path, date, date);
  }
  await stamp(destination);
  return { sketches: published.size, files: inventory.sort((a, b) => a.path.localeCompare(b.path, 'en')) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [source = '.', destination = 'build/public'] = process.argv.slice(2);
  const inventory = await prepare(source, destination, Number(process.env.SOURCE_DATE_EPOCH));
  console.log(JSON.stringify(inventory, null, 2));
}
