/* Fihrist offline shell. NEVER cache auth endpoints or user/API data. */
const CACHE = "fihrist-static-v1";
const SHELL = ["/", "/offline.html", "/manifest.webmanifest", "/icons/fihrist-192.png", "/icons/fihrist-512.png"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",event=>{
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k=>k.startsWith("fihrist-static-")&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",event=>{
  const request=event.request, url=new URL(request.url);
  if(request.method!=="GET" || url.origin!==self.location.origin) return;
  // Auth, API, and arbitrary data never enter CacheStorage.
  if(url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/") || url.pathname.startsWith("/.well-known/")) return;
  if(request.mode==="navigate"){
    event.respondWith(fetch(request).catch(async()=>{
      const cache=await caches.open(CACHE);
      return (await cache.match("/")) || (await cache.match("/offline.html")) || Response.error();
    }));
    return;
  }
  if(!url.pathname.startsWith("/assets/") && !url.pathname.startsWith("/icons/") && !["/manifest.webmanifest","/offline.html"].includes(url.pathname))return;
  event.respondWith(caches.open(CACHE).then(async cache=>{
    const cached=await cache.match(request);
    if(cached)return cached;
    const response=await fetch(request);
    if(response.ok&&response.type==="basic")void cache.put(request,response.clone());
    return response;
  }));
});
