import { defineConfig } from 'vitest/config';

// Each package runs `vitest run` from its own directory; this is the shared base they extend.
export default defineConfig({
  test: { environment: 'node', include: ['test/**/*.test.ts', 'src/**/*.test.ts'] },
});
