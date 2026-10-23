import { defineConfig } from '@playwright/test';
import { E2E_SERVER_PORT, E2E_SERVER_URL } from './e2e/env';

// The pre-installed Chromium is used as-is (never `playwright install`). PLAYWRIGHT_BROWSERS_PATH
// points at it in the cloud image; locally, set WDI_CHROMIUM to a Chromium binary if needed.
const executablePath =
  process.env.WDI_CHROMIUM ??
  (process.env.PLAYWRIGHT_BROWSERS_PATH ? `${process.env.PLAYWRIGHT_BROWSERS_PATH}/chromium` : undefined);

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  // Phaser boots on software WebGL in CI, so first paint is slow.
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    launchOptions: {
      ...(executablePath ? { executablePath } : {}),
      // Software WebGL so Phaser boots in headless CI.
      args: [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        // Multi-page specs (host and guest): a page not in front must keep its game loop, or a short phase
        // passes unpainted on it.
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        '--disable-background-timer-throttling',
      ],
    },
  },
  webServer: [
    {
      // The real authoritative server, from source (tsx), for the specs that create and start a party.
      command: 'pnpm --filter @wdi/server serve',
      // WDI_DEBUG=1 registers debug.play, debug.deal and debug.clock, which the bots and match.spec use.
      env: { PORT: String(E2E_SERVER_PORT), WDI_DEBUG: '1' },
      url: `${E2E_SERVER_URL}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      // The client is built against that server; the `?mock=1` specs ignore it.
      command: 'pnpm exec vite build && pnpm exec vite preview --port 4173 --strictPort',
      env: { VITE_SERVER_URL: E2E_SERVER_URL },
      url: 'http://localhost:4173/Who-Did-It/',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
