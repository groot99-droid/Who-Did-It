import { gzipSync } from 'node:zlib';
import { type Plugin, defineConfig } from 'vite';
import { THREE_GZIP_MAX, threeChunkProblem } from './src/world3/chunkBudget';

/** Round 11, R1 (A618): fails the build when the `three` chunk outgrows its budget or joins the default load. */
const threeBudget = (): Plugin => ({
  name: 'wdi-three-budget',
  apply: 'build',
  generateBundle(_options, bundle) {
    const chunks = Object.values(bundle).flatMap((c) => (c.type === 'chunk' ? [c] : []));
    const code = new Map(chunks.map((c) => [c.fileName, c.code]));
    const gzip = (f: string) => gzipSync(code.get(f) ?? '').length;
    const problem = threeChunkProblem(chunks, gzip);
    if (problem !== null) this.error(problem);
    const three = chunks.find((c) => c.name === 'three')!;
    this.info(`three chunk ${gzip(three.fileName)} B gzip (budget ${THREE_GZIP_MAX})`);
  },
});

// GitHub Pages serves the project site under /Who-Did-It/ (ARCHITECTURE 5.10).
export default defineConfig({
  base: '/Who-Did-It/',
  plugins: [threeBudget()],
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
