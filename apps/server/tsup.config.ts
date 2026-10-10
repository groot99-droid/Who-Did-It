import { defineConfig } from 'tsup';

// Bundles @wdi/shared and @wdi/content (workspace devDependencies, TypeScript source and JSON) into
// build/index.js; colyseus stays external. The `development` condition selects @wdi/content's source entry.
export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'build',
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  clean: true,
  sourcemap: true,
  esbuildOptions(options) {
    options.conditions = ['development'];
  },
});
