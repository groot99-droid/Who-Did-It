import { defineConfig } from "@playwright/test";

// The pre-installed Chromium is used as-is (never `playwright install`). PLAYWRIGHT_BROWSERS_PATH
// points at it in the cloud image; locally, set WDI_CHROMIUM to a Chromium binary if needed.
const executablePath =
  process.env.WDI_CHROMIUM ?? (process.env.PLAYWRIGHT_BROWSERS_PATH ? `${process.env.PLAYWRIGHT_BROWSERS_PATH}/chromium` : undefined);

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
    launchOptions: {
      ...(executablePath ? { executablePath } : {}),
      // Software WebGL so Phaser boots in headless CI.
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    },
  },
  webServer: {
    command: "pnpm exec vite build && pnpm exec vite preview --port 4173 --strictPort",
    url: "http://localhost:4173/Who-Did-It/",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
