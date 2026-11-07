import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// The package: src/index.ts as one ES module in dist/, with Orbit, Zumly and
// hls.js left outside (two peers and a dependency). The types come from tsc
// (tsconfig.build.json) and the stylesheet is copied as it is; `npm run
// compile` runs the three, and `npm publish` runs compile first (prepack).
export default defineConfig({
  build: {
    lib: { entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)), formats: ['es'], fileName: () => 'index.js' },
    outDir: 'dist',
    emptyOutDir: false,
    target: 'es2022',
    minify: false,
    rollupOptions: { external: [/^@zumer\/orbit(\/|$)/, /^zumly(\/|$)/, 'hls.js'] },
  },
});
