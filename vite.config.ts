import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// The demo, served from demo/ with the core read from src/ under the names a
// project uses: `@zumer/pulse` and `@zumer/pulse/style.css`. The package
// itself is built by vite.lib.config.ts (`npm run compile`).
const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: 'demo',
  server: { host: '127.0.0.1', strictPort: true },
  preview: { host: '127.0.0.1', strictPort: true },
  resolve: {
    alias: [
      { find: /^@zumer\/pulse\/style\.css$/, replacement: at('./src/style.css') },
      { find: /^@zumer\/pulse$/, replacement: at('./src/index.ts') },
    ],
  },
});
