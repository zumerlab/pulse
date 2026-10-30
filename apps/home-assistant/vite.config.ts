import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// The browser talks to Home Assistant directly (its WebSocket accepts any
// origin), signed in with Home Assistant's own OAuth flow: no proxy and no
// server-side credentials. Three pages: the app (index.html), the index of
// demo homes (gallery.html) and the card's test bench (card.html).
export default defineConfig({
  server: { host: '127.0.0.1', strictPort: true },
  preview: { host: '127.0.0.1', strictPort: true },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        gallery: fileURLToPath(new URL('./gallery.html', import.meta.url)),
        card: fileURLToPath(new URL('./card.html', import.meta.url)),
      },
    },
  },
});
