import { defineConfig } from 'vite';

// Every feed lets a page read it (the telemetry is a WebSocket): no proxy.
export default defineConfig({
  server: { host: '127.0.0.1', strictPort: true },
  preview: { host: '127.0.0.1', strictPort: true },
});
