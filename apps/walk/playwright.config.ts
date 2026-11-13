import { defineConfig } from '@playwright/test';

// The pre-installed Chromium is used as-is (never `playwright install`), as in apps/client.
const executablePath =
  process.env.WDI_CHROMIUM ??
  (process.env.PLAYWRIGHT_BROWSERS_PATH ? `${process.env.PLAYWRIGHT_BROWSERS_PATH}/chromium` : undefined);

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4174',
    trace: 'retain-on-failure',
    launchOptions: {
      ...(executablePath ? { executablePath } : {}),
      // Software WebGL in headless CI.
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  projects: [
    { name: 'phone', use: { viewport: { width: 390, height: 844 } } },
    { name: 'laptop', use: { viewport: { width: 1280, height: 720 } } },
  ],
  webServer: {
    command: 'pnpm exec vite build && pnpm exec vite preview --port 4174 --strictPort',
    url: 'http://localhost:4174/Who-Did-It/walk/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
