// Online only: requests go to the network. Chrome installs a page only when its service worker handles fetch.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (new URL(request.url).origin !== self.location.origin) return;
  // Revalidating the page means a cached index.html never holds back a release; asset names change per build.
  event.respondWith(request.mode === 'navigate' ? fetch(request, { cache: 'no-cache' }) : fetch(request));
});
