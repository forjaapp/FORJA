/* FORJA APP · service worker: funciona sin conexión y se actualiza sola.
   Al publicar una versión nueva, cambiá VERSION para forzar la actualización. */
const VERSION = 'forja-v5.1';
const CORE = ['./', './index.html', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
const PHOTO_CACHE = 'forja-fotos';
const PHOTO_HOST = 'raw.githubusercontent.com';
const MAX_PHOTOS = 80;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => k !== VERSION && k !== PHOTO_CACHE).map(k => caches.delete(k))
  )).then(() => self.clients.claim()));
});

async function trimPhotos() {
  const c = await caches.open(PHOTO_CACHE);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - MAX_PHOTOS; i++) await c.delete(keys[i]);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // La app: primero red (para ver siempre la última versión), si no hay señal usa la copia guardada.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(res => {
      const copy = res.clone();
      caches.open(VERSION).then(c => c.put('./index.html', copy));
      return res;
    }).catch(() => caches.match('./index.html')));
    return;
  }

  // Fotos de la guía visual: se guardan la primera vez que se ven, para usarlas sin conexión en el gimnasio.
  if (url.hostname === PHOTO_HOST) {
    e.respondWith(caches.open(PHOTO_CACHE).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') { c.put(req, res.clone()); trimPhotos(); }
      return res;
    }));
    return;
  }

  // Íconos y manifiesto: copia guardada al instante, se refresca en segundo plano.
  if (url.origin === self.location.origin) {
    e.respondWith(caches.match(req).then(hit => {
      const net = fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => hit);
      return hit || net;
    }));
  }
});
