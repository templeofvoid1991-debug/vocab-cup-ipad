// Shared by the installer and its Service Worker. Scope keeps installations apart.
(() => {
  const base = new URL("./", typeof document === "undefined" ? self.registration.scope : location.href);
  const prefix = `vocab-cup-ipad-${base.pathname}-`;
  const pointerURL = new URL("installed-package.json", base).href;
  globalThis.VocabCupInstallStore = {
    base: base.href,
    prefix,
    async read() {
      const cache = await caches.open(prefix + "state");
      const response = await cache.match(pointerURL);
      return response ? response.json() : null;
    },
    async write(value) {
      const cache = await caches.open(prefix + "state");
      await cache.put(pointerURL, new Response(JSON.stringify(value), {
        headers: { "Content-Type": "application/json" },
      }));
    },
  };
})();
