import { execFileSync, spawn } from 'node:child_process';
import { createGunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
const [image, archive] = process.argv.slice(2);
const inspect = JSON.parse(execFileSync('docker', ['image', 'inspect', image]))[0];
const read = path => JSON.parse(execFileSync('tar', ['-xOf', archive, path], { maxBuffer: 8 * 1024 * 1024 }));
const index = read('index.json');
let descriptor = index.manifests[0];
let manifest = read('blobs/sha256/' + descriptor.digest.split(':')[1]);
while (manifest.manifests) {
  descriptor = manifest.manifests.find(item => item.platform?.os === 'linux' && item.platform?.architecture === 'amd64') || manifest.manifests[0];
  manifest = read('blobs/sha256/' + descriptor.digest.split(':')[1]);
}
if (!manifest.layers?.every(layer => /gzip|zstd/.test(layer.mediaType))) throw new Error('Expected compressed OCI layers');
let uncompressedLayerBytes = 0;
for (const layer of manifest.layers) {
  // Buildx --load may use Docker's .gzip media type instead of OCI's +gzip.
  if (!/[.+]gzip$/.test(layer.mediaType)) throw new Error('Size measurement currently expects gzip layers');
  const child = spawn('tar', ['-xOf', archive, 'blobs/sha256/' + layer.digest.split(':')[1]], { stdio: ['ignore', 'pipe', 'inherit'] });
  const completion = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error('Layer extraction failed')));
  });
  await pipeline(child.stdout, createGunzip(), async stream => { for await (const chunk of stream) uncompressedLayerBytes += chunk.length; });
  await completion;
}
console.log(JSON.stringify({
  image, imageId: inspect.Id, platform: inspect.Os + '/' + inspect.Architecture,
  sourceRevision: inspect.Config.Labels['org.opencontainers.image.revision'],
  manifestDigest: descriptor.digest,
  dockerReportedBytes: inspect.Size,
  uncompressedLayerBytes,
  compressedLayerBytes: manifest.layers.reduce((sum, layer) => sum + layer.size, 0),
  // Registry digest is verified again after publication; this is the local OCI manifest.
  published: false,
}, null, 2));
