import { defineConfig, loadEnv } from 'vite';
import { createLocalServices } from './server/runtime.ts';
import { createHomeAssistantMiddleware } from './server/homeassistant.ts';

export default defineConfig(({ mode }) => {
  // Solo las variables HA_* de .env.local; quedan del lado del servidor.
  const ha = loadEnv(mode, process.cwd(), 'HA_');
  const haUrl = ha.HA_URL ?? 'http://localhost:8123';
  const haProxy = {
    '/api/ha/websocket': { target: haUrl, ws: true, changeOrigin: true, rewrite: () => '/api/websocket' },
    // Imágenes de cámara: la URL que da Home Assistant ya lleva su propio token.
    '/api/camera_proxy': { target: haUrl, changeOrigin: true },
  };
  return {
    server: {
      host: '127.0.0.1', strictPort: true,
      watch: { ignored: ['**/.pulse/**'] },
      fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.pulse/**'] },
      proxy: haProxy,
    },
    preview: { host: '127.0.0.1', strictPort: true, proxy: haProxy },
    plugins: [{
      name: 'pulse-local-services',
      configureServer(server) {
        const services = createLocalServices(server.config.root);
        server.middlewares.use(services.discovery);
        server.middlewares.use(services.matter);
        server.middlewares.use(services.media);
        server.middlewares.use(createHomeAssistantMiddleware(ha));
        closeServices = services.close;
        server.httpServer?.once('close', () => { void services.close(); });
      },
      configurePreviewServer(server) {
        const services = createLocalServices(server.config.root);
        server.middlewares.use(services.discovery);
        server.middlewares.use(services.matter);
        server.middlewares.use(services.media);
        server.middlewares.use(createHomeAssistantMiddleware(ha));
        closeServices = services.close;
        server.httpServer.once('close', () => { void services.close(); });
      },
      async closeBundle() { await closeServices?.(); },
    }],
  };
});

let closeServices: (() => Promise<void>) | undefined;
