import { defineConfig } from 'vite';

// Served beside the game on GitHub Pages, at /Who-Did-It/walk/ (DECISIONS A610).
export default defineConfig({
  base: '/Who-Did-It/walk/',
  build: { chunkSizeWarningLimit: 1500 },
  server: { port: 8090 },
  preview: { port: 4174 },
});
