// Subir este número cada vez que se cambie la estrategia de caché o se necesite
// forzar que los navegadores descarten lo que tenían guardado (ver README).
const CACHE_NAME = "jarvis-alcover-v2";
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

// Network-first con fallback a caché: siempre intenta traer la versión más nueva
// (config.js, el catálogo, etc. cambian con el negocio), y solo usa lo guardado si
// no hay conexión. Antes era cache-first y eso hacía que, una vez guardada una
// versión vieja de config.js, quedara serviéndose para siempre sin importar cuántas
// veces se recargue la página — nunca volvía a pedirla a la red.
// Solo intercepta pedidos del propio sitio: los pedidos a otros dominios (Supabase,
// ElevenLabs, etc.) los deja pasar sin tocarlos, tal cual harían sin Service Worker.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || Response.error()))
  );
});
