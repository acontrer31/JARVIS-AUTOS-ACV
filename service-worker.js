const CACHE_NAME = "jarvis-alcover-v1";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./data.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Cache-first para lo esencial (funciona sin conexión); network-first con fallback a caché para el resto (fotos, etc.)
// Solo intercepta pedidos del propio sitio: los pedidos a otros dominios (Supabase,
// ElevenLabs, etc.) los deja pasar sin tocarlos, tal cual harían sin Service Worker.
// Interceptarlos acá rompía en particular al widget de voz de ElevenLabs.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => cached || Response.error());
    })
  );
});
