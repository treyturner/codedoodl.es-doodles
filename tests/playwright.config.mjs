import { defineConfig } from '@playwright/test';
import { tlsArgs } from './tls.mjs';
export default defineConfig({
  testDir: '.', testMatch: 'browser.spec.mjs', workers: 1, retries: 0, timeout: 120000,
  expect: { timeout: 30000 }, forbidOnly: true,
  outputDir: '/results/browser',
  reporter: [['list'], ['json', { outputFile: '/results/browser-results.json' }]],
  use: { browserName: 'chromium', viewport: { width: 1280, height: 900 },
    launchOptions: { args: tlsArgs },
    trace: 'retain-on-failure', screenshot: 'only-on-failure' },
});
