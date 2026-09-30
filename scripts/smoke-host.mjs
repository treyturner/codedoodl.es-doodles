import assert from 'node:assert/strict';

const [origin, mode] = process.argv.slice(2);
if (!origin || (mode && mode !== '--candidate')) throw new Error('Usage: smoke-host.mjs ORIGIN [--candidate]');
const base = new URL(origin);
if (!['https:', 'http:'].includes(base.protocol) || base.pathname !== '/') throw new Error('Supply an HTTP(S) origin');
const checks = [];
async function get(path, options) {
  const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(15000), ...options });
  assert.ok(response.ok, `${path}: HTTP ${response.status}`);
  if (mode === '--candidate') {
    const policy = path === '/health' ? 'no-store' : /\.html$|manifest(?:_DEV)?\.json$|\/$/.test(path) ? 'no-cache' : 'public, max-age=86400';
    assert.equal(response.headers.get('cache-control'), policy, path);
    assert.equal(response.headers.get('access-control-allow-origin'), '*', path);
  }
  checks.push({ path, status: response.status, cache: response.headers.get('cache-control') });
  return response;
}
try {
  const catalogue = await (await get('/master_manifest.json')).json();
  assert.equal(catalogue.doodles.length, 76);
  for (const slug of ['dmmn/substrate', 'jpweeks/particulate']) {
    assert.ok(catalogue.doodles.some(doodle => doodle.slug === slug));
    const response = await get('/' + slug + '/index.html');
    assert.match(await response.text(), /<html|<!doctype/i);
    await get('/' + slug + '/manifest.json');
  }
  const preview = await get('/flexi23/candlewick/thumb.mp4', { headers: { Range: 'bytes=0-99' } });
  assert.equal(preview.status, 206);
  assert.equal((await preview.arrayBuffer()).byteLength, 100);
  if (mode === '--candidate') await get('/health');
  console.log(JSON.stringify({ origin: base.origin, external: true, passed: true, checks }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ origin: base.origin, external: true, passed: false, error: error.message, checks }, null, 2));
  process.exitCode = 1;
}
