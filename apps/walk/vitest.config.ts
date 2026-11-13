import { defineConfig } from 'vitest/config';

// Unit tests only; the Playwright spec in e2e/ runs through `pnpm test:e2e`.
export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
  },
});
