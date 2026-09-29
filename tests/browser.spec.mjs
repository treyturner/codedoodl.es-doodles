import { test, expect, chromium } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { tlsArgs } from './tls.mjs';

const site = 'https://doodles.treyturner.info';
const assets = 'https://doodle.treyturner.info';
const sketches = ['dmmn/substrate', 'jpweeks/particulate', 'silviopaganini/box-physics', 'neilcarpenter/square-stream'];

function probe() {
  window.assetProbe = { draws: 0, keys: 0, pointers: 0, document: crypto.randomUUID() };
  addEventListener('keydown', () => window.assetProbe.keys++, true);
  addEventListener('pointerdown', () => window.assetProbe.pointers++, true);
  for (const [type, methods] of [
    ['CanvasRenderingContext2D', ['fill', 'stroke', 'fillRect', 'drawImage', 'putImageData']],
    ['WebGLRenderingContext', ['drawArrays', 'drawElements']],
    ['WebGL2RenderingContext', ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']],
  ]) {
    const prototype = window[type]?.prototype;
    if (!prototype) continue;
    for (const method of methods) {
      const original = prototype[method];
      prototype[method] = function (...args) { window.assetProbe.draws++; return original.apply(this, args); };
    }
  }
}
function observe(page) {
  const errors = [];
  page.on('pageerror', error => {
    if (!/play\(\) request was interrupted/.test(error.message)) errors.push(error.message);
  });
  page.on('console', message => {
    if (/Content Security Policy|unsafe-eval/.test(message.text())) errors.push(message.text());
  });
  page.on('response', response => {
    if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) errors.push(`${response.status()} ${response.url()}`);
  });
  return errors;
}
async function artwork(page, slug) {
  const iframe = page.locator('[data-doodle-frame]');
  await expect(iframe).toHaveAttribute('src', `${assets}/${slug}/index.html`);
  await expect(iframe).toHaveClass(/show/);
  const frame = await (await iframe.elementHandle()).contentFrame();
  await frame.waitForFunction(() => window.assetProbe?.draws > 0);
  const canvas = frame.locator('canvas').first();
  await expect(canvas).toBeVisible();
  expect(await canvas.evaluate(el => el.width * el.height)).toBeGreaterThan(0);
  // Both clients transfer focus after the reveal transition. Observe that
  // transfer instead of racing/cancelling it with an early click.
  await page.waitForFunction(() => document.activeElement === document.querySelector('[data-doodle-frame]'));
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => frame.evaluate(() => window.assetProbe.keys)).toBeGreaterThan(0);
  await canvas.click();
  await expect.poll(() => frame.evaluate(() => window.assetProbe.pointers)).toBeGreaterThan(0);
  return frame;
}
async function refresh(page, slug, frame) {
  const document = await frame.evaluate(() => window.assetProbe.document);
  await page.locator('[data-doodle-refresh]').click();
  await expect.poll(async () => {
    try { return await frame.evaluate(() => window.assetProbe?.document); } catch { return document; }
  }).not.toBe(document);
  await artwork(page, slug);
}

for (const slug of sketches) {
  test(`site renders and forwards input to ${slug} through the candidate`, async ({ page }) => {
    const errors = observe(page);
    await page.addInitScript(probe);
    await page.goto(`${site}/_/${slug}/`);
    await expect(page.locator('#preloader')).not.toHaveClass(/show-preloader/);
    await refresh(page, slug, await artwork(page, slug));
    expect(errors).toEqual([]);
  });
}
test('previews play and seek through the TLS proxy', async ({ page }) => {
  await page.goto(`${site}/`);
  await page.evaluate(url => {
    const video = document.createElement('video');
    video.id = 'candidate-video'; video.src = url; video.muted = true; video.controls = true;
    document.body.append(video);
  }, `${assets}/flexi23/candlewick/thumb.mp4`);
  const video = page.locator('#candidate-video');
  await expect.poll(() => video.evaluate(el => el.readyState)).toBeGreaterThanOrEqual(2);
  await video.evaluate(async el => { await el.play(); el.currentTime = Math.min(1, el.duration / 2); });
  await expect.poll(() => video.evaluate(el => el.currentTime)).toBeGreaterThan(0);
  expect(await video.evaluate(el => el.error)).toBeNull();
});
test('browser reuses cached scripts and media without request interception', async ({ page, context }) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  const urls = new Map(), cached = new Set();
  cdp.on('Network.requestWillBeSent', event => urls.set(event.requestId, event.request.url));
  cdp.on('Network.requestServedFromCache', event => cached.add(urls.get(event.requestId)));
  cdp.on('Network.responseReceived', event => { if (event.response.fromDiskCache) cached.add(event.response.url); });
  await page.goto(`${site}/`);
  for (const path of ['/jpweeks/particulate/site/main-bundle.js', '/dmmn/substrate/thumb.jpg', '/flexi23/candlewick/thumb.webm']) {
    const url = assets + path;
    const sizes = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt) await page.reload();
      sizes.push(await page.evaluate(async url => {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Asset fetch failed');
        return (await response.arrayBuffer()).byteLength;
      }, url));
    }
    expect(sizes[1]).toBe(sizes[0]);
    await expect.poll(() => cached.has(url), url).toBe(true);
  }
});
test('unchanged installed extension loads the candidate, refreshes and accepts input', async () => {
  const extensionPath = '/extension/build/extension';
  const id = [...createHash('sha256').update(extensionPath).digest('hex').slice(0, 32)]
    .map(char => String.fromCharCode(97 + parseInt(char, 16))).join('');
  const base = `chrome-extension://${id}`;
  const profile = await mkdtemp(`${tmpdir()}/assets-extension-`);
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true, viewport: { width: 1280, height: 900 },
    args: [...tlsArgs, `--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  try {
    await context.addInitScript(probe);
    const page = await context.newPage();
    const errors = observe(page);
    await page.goto(`${base}/options.html`);
    // Seed real API records for deterministic selection; do not intercept requests.
    const catalogue = await (await context.request.get(`${site}/api/doodles`, { ignoreHTTPSErrors: true })).json();
    for (const slug of sketches.slice(0, 2)) {
      const doodle = catalogue.doodles.find(d => d.slug === slug);
      expect(doodle).toBeTruthy();
      await page.evaluate(async doodle => {
        await chrome.storage.local.set({ doodles: [doodle], lastUpdated: Date.now() });
        await chrome.storage.sync.set({ option_autoplay: true });
      }, doodle);
      await page.goto('chrome://newtab/');
      await refresh(page, slug, await artwork(page, slug));
    }
    await page.evaluate(() => chrome.storage.sync.set({ option_autoplay: false }));
    await page.goto('chrome://newtab/');
    await page.locator('[data-show-doodle-btn]').click();
    await artwork(page, sketches[1]);
    expect(errors).toEqual([]);
    await page.screenshot({ path: '/results/extension.png' });
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});
