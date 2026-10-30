import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import { createHomeAssistantMiddleware } from './server/homeassistant.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(({ mode }) => {
  // Only the HA_* variables from this app's .env.local; they stay on the server side.
  const ha = loadEnv(mode, here, 'HA_');
  const haUrl = ha.HA_URL ?? 'http://localhost:8123';
  const haProxy = {
    '/api/ha/websocket': { target: haUrl, ws: true, changeOrigin: true, rewrite: () => '/api/websocket' },
    // Camera images: the URL Home Assistant gives already carries its own token.
    '/api/camera_proxy': { target: haUrl, changeOrigin: true },
  };
  return {
    envDir: here,
    server: {
      host: '127.0.0.1', strictPort: true,
      fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**'] },
      proxy: haProxy,
    },
    preview: { host: '127.0.0.1', strictPort: true, proxy: haProxy },
    plugins: [{
      name: 'pulse-home-assistant',
      configureServer(server) { server.middlewares.use(createHomeAssistantMiddleware(ha)); },
      configurePreviewServer(server) { server.middlewares.use(createHomeAssistantMiddleware(ha)); },
    }],
  };
});
