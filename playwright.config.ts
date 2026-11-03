import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests (spec 04; spec 06 §4). Phone viewport first. The server is the real
 * app on a fresh loopback database with a mocked model (`apps/api/test/e2e/serve.ts`);
 * run `pnpm build` first. Not yet in CI (B09 adds the E2E job).
 *
 *   pnpm build && pnpm test:e2e
 */
const port = Number(process.env['E2E_PORT'] ?? 8097)

export default defineConfig({
  testDir: './apps/web/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: './apps/web/e2e/.results',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // A Chromium phone profile (Pixel 5) at 390×844: Chromium is the only browser installed.
  // The teacher space is desktop-first (spec 05 §4.4): its spec runs at 1440×900 (B07).
  projects: [
    { name: 'phone-390', use: { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } }, testIgnore: /teacher-space/ },
    { name: 'laptop-1440', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, testMatch: /teacher-space/ },
  ],
  webServer: {
    command: 'pnpm --filter @guardian-book/api exec tsx test/e2e/serve.ts',
    url: `http://127.0.0.1:${port}/healthz`,
    reuseExistingServer: true,
    timeout: 60_000,
    env: { E2E_PORT: String(port) },
  },
})
