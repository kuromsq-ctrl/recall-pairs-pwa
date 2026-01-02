const CACHE="recall-pairs-pwa-v6";
const ASSETS=[
  "./","./index.html","./styles.css","./app.js","./manifest.webmanifest",
  "./icon-192.png","./icon-512.png",
  "./words_low.txt","./words_mid.txt","./words_high.txt","./words_abs.txt"
];
self.addEventListener("install",(e)=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener("activate",(e)=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>(k===CACHE)?null:caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener("fetch",(e)=>{e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));});
