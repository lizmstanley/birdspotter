// Saves Birdspotter's own files so it opens with no signal. The page is network first, so a release is never held
// back once the network answers. Built files are answered from the save first: their names change with every build,
// so a saved one is never stale, and an open waits on the network for the page alone. Other origins (eBird,
// OpenFreeMap) pass through untouched. Chrome installs a page only when its service worker handles fetch.
// Every cache on this origin is shared with the other apps, so only names with this prefix are ever removed.
// The release-saving functions match apps/cbc-scout/public/sw.js; change both together.
const CACHE_PREFIX = 'birdspotter-';
// Rename when what the worker stores changes; activation removes the old cache.
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const FALLBACK_AFTER_MS = 4000;
const SCOPE = self.registration.scope;
const APP_PAGE_KEY = SCOPE;
const BUILT_FILES_PREFIX = `${SCOPE}assets/`;

const savesInFlight = new Map();

self.addEventListener('install', (event) => {
  self.skipWaiting();
  // The open that installs the worker loaded before the worker could see it, so it saves the release itself.
  event.waitUntil(fetch(APP_PAGE_KEY, { cache: 'no-cache' }).then(saveReleaseIfAppPage).catch(() => undefined));
});
self.addEventListener('activate', (event) => event.waitUntil(removeOtherCaches().then(() => self.clients.claim())));
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || !request.url.startsWith(SCOPE)) return;
  if (request.mode === 'navigate') {
    respondToNavigation(event);
    return;
  }
  const network = () => fetchAndSave(request.url).then((response) => response.clone());
  if (request.url.startsWith(BUILT_FILES_PREFIX)) {
    event.respondWith(findSaved(request.url).then((saved) => saved ?? network()));
    return;
  }
  event.respondWith(networkOrSaved(network(), () => findSaved(request.url)));
});

function respondToNavigation(event) {
  // Revalidating means a saved index.html never holds back a release.
  const network = fetch(event.request, { cache: 'no-cache' });
  // Registered before respondWith reads the body, so the clone is taken from an unread response.
  event.waitUntil(network.then(saveReleaseIfAppPage, () => undefined));
  event.respondWith(networkOrSaved(network, () => findSaved(APP_PAGE_KEY)));
}

function findSaved(key) {
  return caches.match(key, { cacheName: CACHE_NAME }).catch(() => undefined);
}

async function removeOtherCaches() {
  const names = await caches.keys();
  const stale = names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME);
  await Promise.all(stale.map((name) => caches.delete(name)));
}

function isSavable(response) {
  return response.status === 200 && response.type === 'basic' && !response.redirected;
}

// Resolves to the network's answer, or the saved copy findSavedCopy finds once the network fails or has not answered
// in FALLBACK_AFTER_MS. With no saved copy it waits for the network, and rejects if that fails.
function networkOrSaved(network, findSavedCopy) {
  return new Promise((resolve, reject) => {
    const serveSaved = (networkError) =>
      findSavedCopy().then((saved) => {
        if (saved) resolve(saved);
        else if (networkError) reject(networkError);
      });
    const timer = setTimeout(() => serveSaved(null), FALLBACK_AFTER_MS);
    network.then(
      (response) => {
        clearTimeout(timer);
        resolve(response);
      },
      (error) => {
        clearTimeout(timer);
        serveSaved(error);
      },
    );
  });
}

// One network fetch per URL at a time, shared by the page's own request and saveRelease, so a new release downloads
// each built file once. Callers clone the result, since the body can be read only once.
function fetchAndSave(url) {
  const inFlight = savesInFlight.get(url);
  if (inFlight) return inFlight;
  const save = fetch(url)
    .then(async (response) => {
      if (isSavable(response)) await saveResponse(url, response.clone());
      return response;
    })
    .finally(() => savesInFlight.delete(url));
  savesInFlight.set(url, save);
  return save;
}

// A cache failure (full storage, a blocked Cache API) must not cost the page a good network answer. A download that
// breaks partway rejects with a TypeError and still rejects here, so the caller falls back to the saved copy.
async function saveResponse(url, response) {
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(url, response);
  } catch (error) {
    if (error instanceof TypeError) throw error;
  }
}

function saveReleaseIfAppPage(response) {
  const isHtml = (response.headers.get('content-type') ?? '').startsWith('text/html');
  if (!isSavable(response) || !isHtml) return undefined;
  return saveRelease(response.clone());
}

// The saved page is replaced only once every built file it loads is saved, and the previous release's files are
// removed only after that, so a signal lost mid-update leaves the previous release able to open.
async function saveRelease(page) {
  const builtFiles = builtFileUrls(await page.clone().text(), page.url);
  if (builtFiles.length === 0) return;
  const cache = await caches.open(CACHE_NAME);
  const saved = await Promise.all(builtFiles.map((url) => isBuiltFileSaved(cache, url)));
  if (saved.includes(false)) return;
  await cache.put(APP_PAGE_KEY, page);
  const savedRequests = await cache.keys();
  const previousRelease = savedRequests.filter(
    ({ url }) => url.startsWith(BUILT_FILES_PREFIX) && !builtFiles.includes(url),
  );
  await Promise.all(previousRelease.map((request) => cache.delete(request)));
}

async function isBuiltFileSaved(cache, url) {
  if (await cache.match(url)) return true;
  try {
    await fetchAndSave(url);
  } catch {
    return false;
  }
  // A good response is not proof of a save: fetchAndSave serves it even when storage is full.
  return Boolean(await cache.match(url));
}

function builtFileUrls(html, pageUrl) {
  const urls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(([, value]) => new URL(value, pageUrl).href);
  return [...new Set(urls.filter((url) => url.startsWith(BUILT_FILES_PREFIX)))];
}
