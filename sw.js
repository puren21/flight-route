const CACHE='flight-route-v4';
const APP_SHELL=['./flight-route.geojson','./manifest.webmanifest','./icon.svg'];

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE).then(cache=>cache.addAll(APP_SHELL)).catch(()=>{})
  );
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys().then(keys=>Promise.all(
      keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;

  const request=event.request;
  const isNavigation=request.mode==='navigate' ||
    request.destination==='document' ||
    new URL(request.url).pathname.endsWith('/index.html');

  if(isNavigation){
    event.respondWith(
      fetch(request,{cache:'no-store'}).catch(()=>caches.match(request))
    );
    return;
  }

  event.respondWith(
    fetch(request,{cache:'no-store'}).then(response=>{
      const copy=response.clone();
      caches.open(CACHE).then(cache=>cache.put(request,copy)).catch(()=>{});
      return response;
    }).catch(()=>caches.match(request))
  );
});
