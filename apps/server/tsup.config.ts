import { defineConfig } from 'tsup';

// Bundles @wdi/shared (a devDependency, TypeScript source) into build/index.js; colyseus stays external.
export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'build',
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  clean: true,
  sourcemap: true,
});
