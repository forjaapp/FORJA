/* FORJA APP · service worker: funciona sin conexión y se actualiza sola.
   Al publicar una versión nueva, cambiá VERSION para forzar la actualización. */
const VERSION = 'forja-v6.0';
const CORE = ['./', './index.html', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
/* Biblioteca de ejercicios: se guarda para usarla sin conexión (si falta algún archivo, la app igual funciona). */
const DATA = ['./data/catalogo.json', './data/forja_ejercicios_v1.json', './data/equipamiento_v1.json', './data/media_v1.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION)
    .then(c => c.addAll(CORE).then(() => Promise.allSettled(DATA.map(u => c.add(u)))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => k !== VERSION).map(k => caches.delete(k))
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Páginas: primero red (para ver siempre la última versión); sin señal, la copia guardada de esa misma página.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }).catch(async () => (await caches.match(req, { ignoreSearch: true })) || (await caches.match('./index.html')) || caches.match('./')));
    return;
  }

  // Datos, íconos e imágenes aprobadas: copia guardada al instante y se refresca en segundo plano.
  e.respondWith(caches.match(req).then(hit => {
    const net = fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => hit);
    return hit || net;
  }));
});
