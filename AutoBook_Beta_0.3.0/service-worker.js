const CACHE_NAME = "autobook-beta-0.3.0-workflow-refinements";
const APP_SHELL = ["./","./index.html","./styles.css","./app.js","./manifest.json","./assets/autobook-hero.png","./assets/icons/icon-192.png","./assets/icons/icon-512.png","./assets/icons/favicon-64.png","./assets/district-logo.png"];
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL)).then(()=>self.skipWaiting())));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",event=>{
  const req=event.request;
  if(req.method!=="GET" || new URL(req.url).origin!==self.location.origin) return;
  event.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(resp=>{
    if(resp.ok){const copy=resp.clone();caches.open(CACHE_NAME).then(cache=>cache.put(req,copy));}
    return resp;
  }).catch(()=>caches.match("./index.html"))));
});