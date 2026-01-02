
const CACHE_NAME="recall-pairs-v19";
const ASSETS=["./","./index.html","./styles.css","./app.js","./manifest.webmanifest"];
self.addEventListener("install",e=>{
  e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener("activate",e=>{
  e.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.map(k=>k===CACHE_NAME?null:caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch",e=>{
  const url=new URL(e.request.url);
  if(url.origin!==location.origin) return;
  e.respondWith((async()=>{
    try{
      const fresh=await fetch(e.request,{cache:"no-store"});
      return fresh;
    }catch{
      const cached=await caches.match(e.request,{ignoreSearch:true});
      return cached || caches.match("./index.html",{ignoreSearch:true});
    }
  })());
});
