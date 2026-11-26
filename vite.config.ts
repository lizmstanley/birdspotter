import { fileURLToPath } from 'node:url';
import { defineConfig, type ProxyOptions, type UserConfig } from 'vite';
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

// GitHub Pages serves this repo under /birdspotter/. Local dev and preview stay at /.
const SITE_BASE = process.env.GITHUB_PAGES ? '/birdspotter/' : '/';

function repoPath(path: string): string {
  return fileURLToPath(new URL(path, import.meta.url));
}

// Each app builds in its own pass, into the folder it is served from, so no two apps share a chunk.
// An installed app's scope covers every path under it, so no app sits at the site root or at cbc/.
const APP_PATHS = {
  'cbc-scout': 'cbc/scout/',
  birdspotter: 'app/',
} as const;
type PhoneAppMode = keyof typeof APP_PATHS;
const CIRCLE_MANAGER_PATH = 'cbc/manager/';

function isPhoneAppMode(mode: string): mode is PhoneAppMode {
  return Object.hasOwn(APP_PATHS, mode);
}

// Vite writes an HTML entry at its path relative to root, so root is the app's own folder.
// Each app copies its own public/ folder, which holds its manifest, icons, and service worker.
function phoneAppConfig(mode: PhoneAppMode): UserConfig {
  return {
    root: repoPath(`./apps/${mode}`),
    base: `${SITE_BASE}${APP_PATHS[mode]}`,
    build: { outDir: repoPath(`./dist/${APP_PATHS[mode]}`), emptyOutDir: true },
  };
}

// The home page and the CBC page are plain HTML with relative links. This pass runs first and empties dist/.
// Preview runs in this mode, so it serves all of dist/.
function siteConfig(): UserConfig {
  return {
    root: repoPath('./site'),
    base: SITE_BASE,
    publicDir: false,
    build: {
      outDir: repoPath('./dist'),
      emptyOutDir: true,
      rollupOptions: { input: [repoPath('./site/index.html'), repoPath('./site/cbc/index.html')] },
    },
  };
}

function circleManagerConfig(): UserConfig {
  return {
    base: `${SITE_BASE}${CIRCLE_MANAGER_PATH}`,
    build: { outDir: repoPath(`./dist/${CIRCLE_MANAGER_PATH}`), emptyOutDir: true },
  };
}

function passConfig(mode: string): UserConfig {
  if (mode === 'site') return siteConfig();
  if (isPhoneAppMode(mode)) return phoneAppConfig(mode);
  return circleManagerConfig();
}

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  optimizeDeps: {
    // Pre-bundling breaks PGlite's WASM loading. MapLibre must stay pre-bundled: it ships only a UMD build.
    exclude: ['@electric-sql/pglite'],
  },
  server: { proxy: audubonProxy },
  preview: { proxy: audubonProxy },
  ...passConfig(mode),
}));
