import { defineConfig } from 'vitest/config';

// Unit tests only; the Playwright suite in e2e/ runs through `pnpm test:e2e` (ROADMAP 7.7 day 5).
export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    include: ['src/**/*.test.ts'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
});
