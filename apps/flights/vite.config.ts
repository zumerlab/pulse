import { defineConfig } from 'vite';

// The browser asks the ADS-B networks and OpenSky directly; the dev server
// only serves the page.
export default defineConfig({
  server: { host: '127.0.0.1', strictPort: true },
  preview: { host: '127.0.0.1', strictPort: true },
});
