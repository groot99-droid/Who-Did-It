import { defineConfig } from 'vite';

// GitHub Pages serves the project site under /Who-Did-It/ (ARCHITECTURE 5.10).
export default defineConfig({
  base: '/Who-Did-It/',
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        // Round 11, R1 (A618): Three.js in its own chunk, reached only by the sprite world's dynamic import.
        manualChunks: (id: string) =>
          id.includes('node_modules/phaser')
            ? 'phaser'
            : id.includes('node_modules/three')
              ? 'three'
              : undefined,
      },
    },
  },
  server: { port: 8080 },
});
