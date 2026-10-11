importScripts("./storage.js", "./game-cache.js");
const store = SolaraInstallStore;
const SHELL_CACHE = store.prefix + "shell-v2";
const SHELL_FILES = ["./index.html", "./styles.css", "./config.js", "./storage.js", "./installer.js", "./package.js", "./zip.js", "./game-cache.js",
  "./vendor/fflate-0.8.2.js", "./manifest.webmanifest", "./icons/icon-192.png",
  "./icons/icon-512.png", "./icons/apple-touch-icon.png", "./vendor/fflate-LICENSE.txt"];
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
  url.pathname=url.pathname.replace(/\/{2,}/g,"/");
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname) || event.request.method !== "GET") return;
  if (url.pathname.startsWith(gamePath)) {
    event.respondWith((async () => {
      const installed = await store.read();
      if (installed) {
        const cache = await caches.open(installed.cacheName);
        const response = await SolaraGameCache.match(cache, new URL(url.origin + url.pathname), installed.chunked);
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
    const cached = await cache.match(url, { ignoreSearch: true });
    if (cached) return cached;
    if (event.request.mode === "navigate" && url.pathname === base.pathname) return cache.match(new URL("index.html", base));
    return fetch(event.request);
  })());
});
