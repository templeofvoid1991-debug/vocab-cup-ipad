// Large game files use bounded cache entries. The SDK still receives its original URL.
(() => {
  const BLOCK = 16 * 1024 * 1024;
  globalThis.SolaraGameCache = {
    async put(cache, url, bytes, type, chunked, base) {
      if (bytes.length <= BLOCK) {
        await cache.put(url, new Response(bytes, { headers: { 'Content-Type': type, 'Content-Length': String(bytes.length) } }));
        return;
      }
      const id = crypto.randomUUID(), parts = [];
      for (let offset = 0; offset < bytes.length; offset += BLOCK) {
        const part = new URL(`game/.solara-parts/${id}/${parts.length}`, base).href;
        const slice = bytes.subarray(offset, Math.min(offset + BLOCK, bytes.length));
        await cache.put(part, new Response(slice, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(slice.length) } }));
        parts.push(part);
      }
      chunked[url.href] = { parts, bytes: bytes.length, type };
    },
    async exists(cache, url, chunked = {}) {
      const record = chunked[url.href];
      if (!record) return !!(await cache.match(url));
      let total = 0;
      for (const part of record.parts) {
        const response = await cache.match(part);
        if (!response) return false;
        total += Number(response.headers.get('Content-Length'));
      }
      return total === record.bytes;
    },
    async match(cache, url, chunked = {}) {
      const record = chunked[url.href];
      if (!record) return cache.match(url, { ignoreSearch: true });
      let position = 0;
      const stream = new ReadableStream({
        async pull(controller) {
          try {
            if (position === record.parts.length) { controller.close(); return; }
            const response = await cache.match(record.parts[position++]);
            if (!response) throw new Error('Offline game block is missing.');
            controller.enqueue(new Uint8Array(await response.arrayBuffer()));
          } catch (error) { controller.error(error); }
        }
      });
      return new Response(stream, { headers: { 'Content-Type': record.type, 'Content-Length': String(record.bytes) } });
    }
  };
})();
