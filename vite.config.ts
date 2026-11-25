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

// Each phone app builds in its own pass so it shares no chunks with the web app or the other phone app.
// Rooted at apps/ so apps/<mode>/index.html builds to dist/<mode>/index.html, the app's hosted address.
const PHONE_APP_MODES = ['cbc-scout', 'lets-go-birding'] as const;
type PhoneAppMode = (typeof PHONE_APP_MODES)[number];
const APPS_ROOT = fileURLToPath(new URL('./apps', import.meta.url));

function isPhoneAppMode(mode: string): mode is PhoneAppMode {
  return PHONE_APP_MODES.some((appMode) => appMode === mode);
}

// The web app's pass copies public/, which holds each phone app's manifest, icons, and service worker.
function phoneAppConfig(mode: PhoneAppMode) {
  return {
    root: APPS_ROOT,
    publicDir: fileURLToPath(new URL('./public', import.meta.url)),
    build: {
      outDir: fileURLToPath(new URL('./dist', import.meta.url)),
      emptyOutDir: false,
      copyPublicDir: false,
      rollupOptions: { input: fileURLToPath(new URL(`./apps/${mode}/index.html`, import.meta.url)) },
    },
  };
}

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
  ...(isPhoneAppMode(mode) ? phoneAppConfig(mode) : {}),
}));
