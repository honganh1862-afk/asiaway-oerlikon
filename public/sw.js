/*
 * Keeps what a guest has already seen, so a weak or lost signal at the table
 * does not blank the menu.
 *
 *  - Pages: the network first, so a new version reaches guests at once; the
 *    kept copy when the network fails or has not answered within 4 seconds.
 *  - /_next/static (code and fonts, named by their contents) and /images: the
 *    kept copy first. Their contents never change under the same name.
 *  - The menu, a dish and the allergen legend: the kept copy at once, and a
 *    fresh one fetched behind it for next time.
 *
 * Table links (/table, /t) set the table cookie and setup changes the
 * database, so those always go to the network and are never kept.
 *
 * Raise VERSION to drop everything kept by an older worker.
 */
const VERSION = 'v1';
const PAGES = `aw-pages-${VERSION}`;
const ASSETS = `aw-assets-${VERSION}`;
const DATA = `aw-data-${VERSION}`;
const PAGE_TIMEOUT_MS = 4000;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const current = new Set([PAGES, ASSETS, DATA]);
      for (const name of await caches.keys()) {
        if (name.startsWith('aw-') && !current.has(name)) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (/^\/(table|t)\//.test(url.pathname) || url.pathname.startsWith('/api/admin')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(event, request));
  } else if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/images/')) {
    event.respondWith(cacheFirst(request));
  } else if (
    url.pathname === '/api/menu' ||
    url.pathname === '/api/allergens' ||
    url.pathname.startsWith('/api/menu/items/')
  ) {
    event.respondWith(staleWhileRevalidate(event, request));
  }
});

async function networkFirst(event, request) {
  const cache = await caches.open(PAGES);
  const network = fetch(request).then((response) => {
    // Only real pages: a redirect or an error page is never kept.
    if (response.ok && response.type === 'basic') cache.put(request, response.clone());
    return response;
  });
  event.waitUntil(network.catch(() => undefined));

  const kept = () => cache.match(request, { ignoreSearch: true });
  const slow = new Promise((resolve) => setTimeout(resolve, PAGE_TIMEOUT_MS)).then(
    async () => (await kept()) || network,
  );

  try {
    return await Promise.race([network, slow]);
  } catch {
    // Offline: this page as last seen, or failing that the menu itself.
    return (await kept()) || (await cache.match('/menu')) || Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSETS);
  const kept = await cache.match(request);
  if (kept) return kept;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(event, request) {
  const cache = await caches.open(DATA);
  const kept = await cache.match(request);
  const network = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  });
  if (kept) {
    event.waitUntil(network.catch(() => undefined));
    return kept;
  }
  return network;
}
