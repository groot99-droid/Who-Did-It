import { defineConfig } from 'tsup';

// Bundles @wdi/shared and @wdi/content (devDependencies, TypeScript source) into build/index.js; colyseus
// stays external. The `development` condition makes @wdi/content resolve to its source, not its dist.
export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'build',
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  clean: true,
  sourcemap: true,
  esbuildOptions(options) {
    options.conditions = ['development', ...(options.conditions ?? [])];
  },
});
