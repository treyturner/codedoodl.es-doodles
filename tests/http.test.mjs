import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { extname } from 'node:path';

const base = 'http://assets:8080';
const inventory = JSON.parse(readFileSync('/results/inventory.json'));
const modified = new Date(inventory.sourceDateEpoch * 1000).toUTCString();
function get(path, headers = {}, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = request(base + path, { method, headers, timeout: 15000 }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('HTTP timeout')));
    req.on('error', reject); req.end();
  });
}
const policy = path => /(?:\.html|\/(?:master_manifest(?:_DEV)?|manifest)\.json)$/.test(path) ? 'no-cache' : 'public, max-age=86400';
const plain = response => response.headers['content-encoding'] === 'gzip' ? gunzipSync(response.body) : response.body;

test('every packaged file serves unchanged identity bytes and its preserved gzip representation', async () => {
  for (let i = 0; i < inventory.files.length; i += 6) {
    await Promise.all(inventory.files.slice(i, i + 6).map(async file => {
      const path = '/' + file.path;
      const identity = await get(path, { 'Accept-Encoding': 'identity' });
      assert.equal(identity.status, 200, path);
      assert.equal(identity.headers['content-encoding'], undefined, path);
      assert.equal(identity.body.length, file.bytes, path);
      assert.equal(createHash('sha256').update(identity.body).digest('hex'), file.sha256, path);
      assert.equal(identity.headers['cache-control'], policy(path), path);
      assert.equal(identity.headers['access-control-allow-origin'], '*');
      assert.ok(identity.headers.etag && identity.headers['last-modified'], path);
      assert.equal(identity.headers['last-modified'], modified, path);
      if (file.gzipBytes !== null) {
        const gzip = await get(path, { 'Accept-Encoding': 'gzip' });
        assert.equal(gzip.headers['content-encoding'], 'gzip', path);
        assert.equal(gzip.headers['last-modified'], modified, path);
        assert.match(gzip.headers.vary, /Accept-Encoding/i, path);
        assert.equal(gzip.body.length, file.gzipBytes, path);
        assert.equal(createHash('sha256').update(gzip.body).digest('hex'), file.gzipSha256, path);
        assert.deepEqual(plain(gzip), identity.body, path);
        const denied = await get(path, { 'Accept-Encoding': 'gzip;q=0, identity' });
        assert.equal(denied.headers['content-encoding'], undefined, path);
      }
    }));
  }
});

test('both catalogues and every published entrypoint, preview and manifest are available', async () => {
  const production = JSON.parse(plain(await get('/master_manifest.json')));
  const development = JSON.parse(plain(await get('/master_manifest_DEV.json')));
  assert.equal(production.doodles.length, inventory.sketches);
  assert.equal(inventory.sketches, 76);
  assert.ok(development.doodles.every(d => production.doodles.some(p => p.slug === d.slug)));
  for (const doodle of production.doodles) {
    assert.ok(!['samsy/boobs', 'samsy/fury-ribbons'].includes(doodle.slug));
    const directory = await get('/' + doodle.slug + '/');
    assert.equal(directory.status, 200);
    assert.equal(directory.headers['cache-control'], 'no-cache');
    const redirect = await get('/' + doodle.slug, { Host: 'doodle.treyturner.info', 'X-Forwarded-Proto': 'https' });
    assert.equal(redirect.status, 301);
    assert.equal(redirect.headers.location, '/' + doodle.slug + '/');
    for (const file of ['index.html', 'manifest.json', 'thumb.jpg', 'thumb.webm', 'thumb.mp4']) {
      assert.equal((await get('/' + doodle.slug + '/' + file, {}, 'HEAD')).status, 200);
    }
  }
});

test('MIME types distinguish code, shaders, textures, fonts and media', async () => {
  const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json',
    '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.mp4': 'video/mp4',
    '.webm': 'video/webm', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf', '.txt': 'text/plain', '.ico': 'image/x-icon',
    '.glsl': 'text/plain', '.frag': 'text/plain', '.vert': 'text/plain', '.vs': 'text/plain', '.fs': 'text/plain', '.obj': 'text/plain', '.pde': 'text/plain' };
  for (const extension of new Set(inventory.files.map(file => extname(file.path)))) {
    const type = types[extension] || 'application/octet-stream';
    const file = inventory.files.find(file => extname(file.path) === extension);
    const response = await get('/' + file.path, {}, 'HEAD');
    assert.equal(response.headers['content-type'].split(';')[0], type, file.path);
  }
});

test('HEAD and conditional responses retain validators and cache negotiation', async () => {
  for (const path of ['/master_manifest.json', '/jpweeks/particulate/site/main-bundle.js', '/dmmn/substrate/thumb.jpg']) {
    for (const encoding of ['identity', 'gzip']) {
      const initial = await get(path, { 'Accept-Encoding': encoding });
      const head = await get(path, { 'Accept-Encoding': encoding }, 'HEAD');
      assert.equal(head.body.length, 0);
      assert.equal(head.headers.etag, initial.headers.etag);
      assert.equal(head.headers['content-length'], initial.headers['content-length']);
      assert.equal(head.headers['last-modified'], initial.headers['last-modified']);
      for (const condition of [{ 'If-None-Match': initial.headers.etag }, { 'If-Modified-Since': initial.headers['last-modified'] }]) {
        const cached = await get(path, { 'Accept-Encoding': encoding, ...condition });
        assert.equal(cached.status, 304, path);
        assert.equal(cached.body.length, 0);
        assert.equal(cached.headers.etag, initial.headers.etag);
        assert.equal(cached.headers['cache-control'], policy(path));
        if (initial.headers.vary) assert.equal(cached.headers.vary, initial.headers.vary);
      }
    }
  }
});

test('media ranges support seeking, suffix requests, HEAD and invalid ranges', async () => {
  for (const suffix of ['mp4', 'webm']) {
    const path = '/flexi23/candlewick/thumb.' + suffix;
    const full = await get(path);
    for (const [range, start, end] of [['bytes=0-99', 0, 99], ['bytes=-100', full.body.length - 100, full.body.length - 1]]) {
      const partial = await get(path, { Range: range });
      assert.equal(partial.status, 206);
      assert.equal(partial.headers['cache-control'], 'public, max-age=86400');
      assert.equal(partial.headers['content-range'], `bytes ${start}-${end}/${full.body.length}`);
      assert.deepEqual(partial.body, full.body.subarray(start, end + 1));
      assert.equal(partial.headers['content-encoding'], undefined);
    }
    assert.equal((await get(path, { Range: 'bytes=0-99' }, 'HEAD')).body.length, 0);
    const invalid = await get(path, { Range: `bytes=${full.body.length}-` });
    assert.equal(invalid.status, 416);
    assert.equal(invalid.headers['cache-control'], 'no-store');
    assert.equal(invalid.headers['content-range'], `bytes */${full.body.length}`);
    assert.equal(invalid.headers['access-control-allow-origin'], '*');
    const unchanged = await get(path, { Range: 'bytes=0-99', 'If-Range': full.headers.etag });
    assert.equal(unchanged.status, 206);
    const changed = await get(path, { Range: 'bytes=0-99', 'If-Range': '"old-version"' });
    assert.equal(changed.status, 200);
    assert.deepEqual(changed.body, full.body);
  }
});

test('ranges on negotiated gzip bytes preserve Vary and representation validators', async () => {
  const path = '/jpweeks/particulate/site/main-bundle.js';
  const full = await get(path, { 'Accept-Encoding': 'gzip' });
  const identity = await get(path, { 'Accept-Encoding': 'identity' });
  assert.equal(full.headers['last-modified'], identity.headers['last-modified']);
  const partial = await get(path, { 'Accept-Encoding': 'gzip', Range: 'bytes=0-99' });
  assert.equal(partial.status, 206);
  assert.equal(partial.headers['content-encoding'], 'gzip');
  assert.equal(partial.headers.etag, full.headers.etag);
  assert.match(partial.headers.vary, /Accept-Encoding/i);
  assert.equal(partial.headers['cache-control'], 'public, max-age=86400');
  assert.deepEqual(partial.body, full.body.subarray(0, 100));
  const validated = await get(path, { 'Accept-Encoding': 'gzip', Range: 'bytes=0-99', 'If-None-Match': full.headers.etag });
  assert.equal(validated.status, 304);
  assert.equal(validated.headers['cache-control'], 'public, max-age=86400');
  assert.match(validated.headers.vary, /Accept-Encoding/i);
  for (const path of ['/dmmn/substrate/', '/dmmn/substrate/index.html']) {
    const html = await get(path, { Range: 'bytes=0-99' });
    assert.equal(html.status, 206);
    assert.equal(html.headers['cache-control'], 'no-cache');
  }
});

test('health is uncached; unpublished, private, missing and listing URLs return uncached errors', async () => {
  const health = await get('/health');
  assert.equal(health.status, 200); assert.equal(health.body.toString(), 'OK\n');
  assert.equal(health.headers['cache-control'], 'no-store');
  for (const path of ['/', '/dmmn/', '/samsy/boobs/index.html', '/samsy/fury-ribbons/index.html',
    '/neilcarpenter/test/index.html', '/neilcarpenter/shape-stream-light/index.html', '/.git/config',
    '/Dockerfile', '/README.md', '/scripts/prepare.mjs', '/missing.js', '/master_manifest.json.gz']) {
    const missing = await get(path, { 'Accept-Encoding': 'gzip' });
    assert.equal(missing.status, 404, path);
    assert.equal(missing.headers['cache-control'], 'no-store', path);
    assert.equal(missing.headers['content-encoding'], undefined, path);
  }
});
