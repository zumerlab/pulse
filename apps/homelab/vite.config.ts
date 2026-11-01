import { defineConfig } from 'vite';

// The browser talks to the collector directly (it allows any origin on
// 127.0.0.1); the dev server only serves the page.
export default defineConfig({
  server: { host: '127.0.0.1', strictPort: true },
  preview: { host: '127.0.0.1', strictPort: true },
});
