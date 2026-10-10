import { defineConfig } from "vite";

// GitHub Pages serves the project site under /Who-Did-It/ (ARCHITECTURE 5.10).
export default defineConfig({
  base: "/Who-Did-It/",
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: { manualChunks: (id: string) => (id.includes("node_modules/phaser") ? "phaser" : undefined) },
    },
  },
  server: { port: 8080 },
});
