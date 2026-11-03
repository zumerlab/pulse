import { defineConfig } from 'vite';

// The browser reads the public feeds directly (they allow any origin); the
// dev server only serves the page.
export default defineConfig({
  server: { host: '127.0.0.1', strictPort: true },
  preview: { host: '127.0.0.1', strictPort: true },
});
