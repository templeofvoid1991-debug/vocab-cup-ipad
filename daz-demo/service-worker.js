importScripts("./storage.js");
const store = VocabCupInstallStore;
const SHELL_CACHE = store.prefix + "shell-v4";
const SHELL_FILES = ["./index.html", "./styles.css", "./config.js", "./storage.js", "./installer.js", "./package.js", "./zip.js",
  "./vendor/fflate-0.8.2.js", "./manifest.webmanifest", "./icons/icon-192.png",
  "./icons/icon-512.png", "./icons/apple-touch-icon.png", "./game-compat.css"];
const base = new URL(store.base);
const gamePath = new URL("game/", base).pathname;

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(SHELL_FILES);
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith(store.prefix + "shell-") && name !== SHELL_CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname) || event.request.method !== "GET") return;
  if (url.pathname.startsWith(gamePath)) {
    event.respondWith((async () => {
      const installed = await store.read();
      if (installed) {
        const cache = await caches.open(installed.cacheName);
        const response = await cache.match(event.request, { ignoreSearch: true });
        if (response) return response;
      }
      // The paid game is served only from the local import, never from hosting.
      if (event.request.mode === "navigate") return Response.redirect(new URL("index.html?setup=1", base), 302);
      return new Response("Spieldatei fehlt. Bitte die Eduki-ZIP erneut installieren.", { status: 404 });
    })());
    return;
  }
  event.respondWith((async () => {
    const cache = await caches.open(SHELL_CACHE);
    const cached = await cache.match(event.request, { ignoreSearch: true });
    if (cached) return cached;
    if (event.request.mode === "navigate" && url.pathname === base.pathname) return cache.match(new URL("index.html", base));
    return fetch(event.request);
  })());
});
