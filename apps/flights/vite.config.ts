import { defineConfig, type ProxyOptions } from 'vite';

// The networks and OpenSky do not let a page read them (no
// Access-Control-Allow-Origin for its origin), so the dev server, and the
// preview, ask them for the page: /net/<name>/… is that network's API.
const NETWORKS: Record<string, string> = {
  'adsb.lol': 'https://api.adsb.lol',
  'airplanes.live': 'https://api.airplanes.live',
  'adsb.fi': 'https://opendata.adsb.fi/api',
  opensky: 'https://opensky-network.org/api',
};
const proxy: Record<string, ProxyOptions> = Object.fromEntries(Object.entries(NETWORKS).map(([name, target]) =>
  [`/net/${name}`, { target, changeOrigin: true, rewrite: (path: string) => path.slice(`/net/${name}`.length) }]));

export default defineConfig({
  server: { host: '127.0.0.1', strictPort: true, proxy },
  preview: { host: '127.0.0.1', strictPort: true, proxy },
});
