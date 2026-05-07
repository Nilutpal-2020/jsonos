// JSON OS service worker — minimal, hand-rolled.
// Strategy:
//   - HTML/navigations:        network-first, fall back to cached shell
//   - /assets/* (hashed JS/CSS): cache-first (immutable build output)
//   - icons/manifest/og:       stale-while-revalidate
//   - everything else:         network passthrough (no caching)
//
// Bump CACHE_VERSION on a release that changes shell HTML to force refresh.

const CACHE_VERSION = 'v1';
const SHELL_CACHE = `jsonos-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `jsonos-assets-${CACHE_VERSION}`;
const STATIC_CACHE = `jsonos-static-${CACHE_VERSION}`;

const SHELL_URLS = ['/', '/index.html'];

const STATIC_PATHS = [
  '/manifest.webmanifest',
  '/favicon.svg',
  '/favicon-32.png',
  '/favicon-192.png',
  '/favicon-512.png',
  '/apple-touch-icon.png',
  '/og-image.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL_CACHE);
    await shell.addAll(SHELL_URLS).catch(() => {});
    const stat = await caches.open(STATIC_CACHE);
    await stat.addAll(STATIC_PATHS).catch(() => {});
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL_CACHE, ASSET_CACHE, STATIC_CACHE]);
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => keep.has(k) ? null : caches.delete(k)));
    await self.clients.claim();
  })());
});

function isAssetRequest(url) {
  return url.pathname.startsWith('/assets/');
}
function isStaticRequest(url) {
  return STATIC_PATHS.includes(url.pathname);
}
function isHtmlNavigation(req) {
  if (req.mode === 'navigate') return true;
  const accept = req.headers.get('accept') || '';
  return accept.includes('text/html');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never cache share or API
  if (url.pathname.startsWith('/api/') || url.searchParams.has('share')) return;

  if (isAssetRequest(url)) {
    event.respondWith(cacheFirst(req, ASSET_CACHE));
    return;
  }
  if (isStaticRequest(url)) {
    event.respondWith(staleWhileRevalidate(req, STATIC_CACHE));
    return;
  }
  if (isHtmlNavigation(req)) {
    event.respondWith(networkFirstShell(req));
    return;
  }
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const fetchPromise = fetch(req).then((res) => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => hit);
  return hit || fetchPromise;
}

async function networkFirstShell(req) {
  try {
    const res = await fetch(req);
    if (res.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put('/', res.clone());
    }
    return res;
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    const shell = await cache.match('/') || await cache.match('/index.html');
    if (shell) return shell;
    return new Response('Offline', { status: 503, headers: { 'content-type': 'text/plain' } });
  }
}
