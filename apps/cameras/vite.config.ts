import { defineConfig, type ProxyOptions } from 'vite';

// TfL and Caltrans let a page read them; the CHP's incidents, as Caltrans
// QuickMap publishes them, do not: the dev server (and the preview) asks
// QuickMap for the page, /net/chp/… A static build needs a proxy of its own.
const proxy: Record<string, ProxyOptions> = {
  '/net/chp': { target: 'https://quickmap.dot.ca.gov', changeOrigin: true, rewrite: (path: string) => path.slice('/net/chp'.length) },
};

export default defineConfig({
  server: { host: '127.0.0.1', strictPort: true, proxy },
  preview: { host: '127.0.0.1', strictPort: true, proxy },
});
