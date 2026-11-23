import { defineConfig, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';

// cbc.audubon.org sends no CORS headers, so the browser reaches it through the dev and preview server.
// A static deploy of dist/ has no proxy; circle details then fall back to the ArcGIS search data.
const audubonProxy: Record<string, ProxyOptions> = {
  '/audubon-cbc': {
    target: 'https://cbc.audubon.org',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/audubon-cbc/, ''),
  },
};

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // Required so Vite does not pre-bundle PGlite's WASM or MapLibre's Web Worker
    exclude: ['@electric-sql/pglite', 'maplibre-gl'],
  },
  server: { proxy: audubonProxy },
  preview: { proxy: audubonProxy },
});
