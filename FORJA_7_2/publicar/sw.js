/* FORJA 7.2 · service worker
   - La página (index.html, revision.html) se pide primero a la red: cada publicación en GitHub llega sin quedar atrapada en caché.
     Sin conexión, o si la red tarda más de 3,5 s, se usa la última copia guardada.
   - La biblioteca (data/*.json) se sirve desde caché y se actualiza en segundo plano.
   - Las imágenes de ejercicios se guardan al verlas por primera vez.
   - Al activarse borra las cachés de versiones anteriores. Los datos del usuario NO están acá: viven en localStorage. */
const VERSION = '7.2.0';
const CORE_CACHE = 'forja-v7-core-' + VERSION;
const DATA_CACHE = 'forja-v7-data';
const IMG_CACHE = 'forja-v7-img';
const KEEP = [CORE_CACHE, DATA_CACHE, IMG_CACHE];
const CORE = ['./', './index.html', './premium.css', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png', './favicon-32.png'];
const NETWORK_TIMEOUT = 3500;
const IMG_LIMIT = 300;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CORE_CACHE);
    await Promise.all(CORE.map(url => fetch(new Request(url, { cache: 'reload' }))
      .then(res => { if (res.ok) return cache.put(url, res); })
      .catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (!KEEP.includes(key)) await caches.delete(key);
    if (self.registration.navigationPreload) { try { await self.registration.navigationPreload.enable(); } catch (e) {} }
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => { if (event.data === 'SKIP_WAITING') self.skipWaiting(); });

function scopeUrl(path) { return new URL(path, self.registration.scope).href; }

async function pageFromNetwork(event) {
  const req = event.request;
  const url = new URL(req.url);
  /* La app principal se guarda siempre como index.html; cualquier otra página (revision.html, etc.) con su propia ruta. */
  const isIndex = url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');
  const cacheKey = isIndex ? scopeUrl('./index.html') : url.origin + url.pathname;
  const cache = await caches.open(CORE_CACHE);
  const network = (async () => {
    const preload = event.preloadResponse ? await event.preloadResponse.catch(() => null) : null;
    let res = preload || await fetch(req);
    /* Una respuesta redirigida no puede usarse para una navegación: se copia sin la marca de redirección. */
    if (res && res.redirected) res = new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers });
    if (res && res.ok && (res.type === 'basic' || res.type === 'default')) await cache.put(cacheKey, res.clone());
    return res;
  })();
  const timeout = new Promise(resolve => setTimeout(resolve, NETWORK_TIMEOUT, null));
  try {
    const fast = await Promise.race([network, timeout]);
    if (fast) return fast;
  } catch (e) { /* sin red: se usa la copia */ }
  const cached = await cache.match(cacheKey) || await caches.match(req, { ignoreSearch: true });
  /* (si la página nunca se abrió con conexión, no se reemplaza por otra) */
  if (cached) { event.waitUntil(network.catch(() => {})); return cached; }
  try { return await network; } catch (e) {
    return new Response('<!doctype html><meta charset="utf-8"><title>FORJA</title><body style="font-family:system-ui;background:#09131b;color:#f5f7f8;padding:24px"><h1>Sin conexión</h1><p>Abrí FORJA una vez con internet para poder usarla sin conexión.</p></body>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}

async function staleWhileRevalidate(event, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(event.request);
  const update = fetch(event.request).then(res => { if (res && res.ok) cache.put(event.request, res.clone()); return res; }).catch(() => null);
  if (cached) { event.waitUntil(update); return cached; }
  const res = await update;
  return res || new Response('', { status: 504, statusText: 'Sin conexión' });
}

async function cacheFirstImage(event) {
  const cache = await caches.open(IMG_CACHE);
  const cached = await cache.match(event.request);
  if (cached) return cached;
  try {
    const res = await fetch(event.request);
    if (res && res.ok) {
      await cache.put(event.request, res.clone());
      const keys = await cache.keys();
      if (keys.length > IMG_LIMIT) await Promise.all(keys.slice(0, keys.length - IMG_LIMIT).map(k => cache.delete(k)));
    }
    return res;
  } catch (e) { return new Response('', { status: 504, statusText: 'Sin conexión' }); }
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (!url.href.startsWith(self.registration.scope)) return;
  if (url.pathname.endsWith('/sw.js')) return;
  if (req.mode === 'navigate') { event.respondWith(pageFromNetwork(event)); return; }
  if (url.pathname.includes('/data/')) { event.respondWith(staleWhileRevalidate(event, DATA_CACHE)); return; }
  if (url.pathname.includes('/assets/')) { event.respondWith(cacheFirstImage(event)); return; }
  event.respondWith(staleWhileRevalidate(event, CORE_CACHE));
});

/* Tocar el aviso de «Descanso terminado» vuelve a FORJA. */
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) if (c.url.startsWith(self.registration.scope) && 'focus' in c) return c.focus();
    if (self.clients.openWindow) return self.clients.openWindow(self.registration.scope);
  })());
});
