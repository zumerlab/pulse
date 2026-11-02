import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// The card and the dashboard strategy as one JavaScript module for Home
// Assistant (a dashboard resource): Orbit, Zumly, the core and this app's
// styles inside. `npm run build:card` → dist-card/zumer-pulse.js.
export default defineConfig({
  build: {
    outDir: 'dist-card',
    emptyOutDir: true,
    lib: {
      entry: fileURLToPath(new URL('./card/zumer-pulse.ts', import.meta.url)),
      formats: ['es'],
      fileName: () => 'zumer-pulse.js',
    },
    rollupOptions: { output: { codeSplitting: false } },
    cssCodeSplit: false,
    target: 'es2022',
  },
});
