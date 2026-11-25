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

// CBC Scout builds in its own pass so it shares no chunks with the web app and the web app's bundles stay as they were.
const CBC_SCOUT_MODE = 'cbc-scout';

export default defineConfig(({ mode }) => ({
  // GitHub Pages serves this repo under /birdspotter/. Local dev and preview stay at /.
  base: process.env.GITHUB_PAGES ? '/birdspotter/' : '/',
  plugins: [react()],
  optimizeDeps: {
    // Pre-bundling breaks PGlite's WASM loading. MapLibre must stay pre-bundled: it ships only a UMD build.
    exclude: ['@electric-sql/pglite'],
  },
  build:
    mode === CBC_SCOUT_MODE
      ? { emptyOutDir: false, rollupOptions: { input: 'cbc-scout/index.html' } }
      : undefined,
  server: { proxy: audubonProxy },
  preview: { proxy: audubonProxy },
}));
