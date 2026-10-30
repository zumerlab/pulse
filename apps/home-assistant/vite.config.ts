import { defineConfig } from 'vite';

// The browser talks to Home Assistant directly (its WebSocket accepts any
// origin), signed in with Home Assistant's own OAuth flow: no proxy and no
// server-side credentials.
export default defineConfig({
  server: { host: '127.0.0.1', strictPort: true },
  preview: { host: '127.0.0.1', strictPort: true },
});
