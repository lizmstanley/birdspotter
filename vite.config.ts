import { fileURLToPath } from 'node:url';
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
// Rooted at apps/ so apps/cbc-scout/index.html builds to dist/cbc-scout/index.html, CBC Scout's hosted address.
const APPS_ROOT = fileURLToPath(new URL('./apps', import.meta.url));

// The web app's pass copies public/, which holds CBC Scout's manifest, icons, and service worker.
const cbcScoutConfig = {
  root: APPS_ROOT,
  publicDir: fileURLToPath(new URL('./public', import.meta.url)),
  build: {
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    emptyOutDir: false,
    copyPublicDir: false,
    rollupOptions: { input: fileURLToPath(new URL('./apps/cbc-scout/index.html', import.meta.url)) },
  },
};

export default defineConfig(({ mode }) => ({
  // GitHub Pages serves this repo under /birdspotter/. Local dev and preview stay at /.
  base: process.env.GITHUB_PAGES ? '/birdspotter/' : '/',
  plugins: [react()],
  optimizeDeps: {
    // Pre-bundling breaks PGlite's WASM loading. MapLibre must stay pre-bundled: it ships only a UMD build.
    exclude: ['@electric-sql/pglite'],
  },
  server: { proxy: audubonProxy },
  preview: { proxy: audubonProxy },
  ...(mode === CBC_SCOUT_MODE ? cbcScoutConfig : {}),
}));
