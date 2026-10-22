importScripts('./storage.js','./range-response.js');
const store=FunkelhainInstallStore,SHELL_CACHE=store.prefix+'shell-v1';
const SHELL_FILES=['./index.html','./styles.css','./config.js','./storage.js','./installer.js','./package.js','./zip.js','./range-response.js','./vendor/fflate-0.8.2.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png','./game-compat.css'];
const base=new URL(store.base),gamePath=new URL('game/',base).pathname;
self.addEventListener('install',e=>e.waitUntil((async()=>{await(await caches.open(SHELL_CACHE)).addAll(SHELL_FILES);await self.skipWaiting();})()));
self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const n of await caches.keys())if(n.startsWith(store.prefix+'shell-')&&n!==SHELL_CACHE)await caches.delete(n);await self.clients.claim();})()));
self.addEventListener('fetch',e=>{
 const url=new URL(e.request.url);if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname)||!['GET','HEAD'].includes(e.request.method))return;
 if(url.pathname.startsWith(gamePath)){
  e.respondWith((async()=>{const installed=await store.read();if(installed){const response=await(await caches.open(installed.cacheName)).match(url.href,{ignoreSearch:true});if(response)return FunkelhainMediaResponse(response,e.request.headers.get('Range'),e.request.method);}
   if(e.request.mode==='navigate')return Response.redirect(new URL('index.html?setup=1',base),302);return new Response('Spieldatei fehlt. Bitte die Funkelhain-ZIP erneut installieren.',{status:404});})());return;
 }
 e.respondWith((async()=>{const cache=await caches.open(SHELL_CACHE),cached=await cache.match(url.href,{ignoreSearch:true});if(cached)return e.request.method==='HEAD'?new Response(null,{headers:cached.headers}):cached;if(e.request.mode==='navigate'&&url.pathname===base.pathname)return cache.match(new URL('index.html',base));return fetch(e.request);})());
});
