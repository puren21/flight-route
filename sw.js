const CACHE='flight-route-v15';
const APP_SHELL=['./flight-route.geojson','./manifest.webmanifest','./icon.svg','./styles.css','./app.js'];

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE).then(cache=>cache.addAll(APP_SHELL)).catch(()=>{})
  );
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    Promise.all([
      caches.keys().then(keys=>Promise.all(
        keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))
      )),
      self.clients.claim()
    ])
  );
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;

  const request=event.request;
  const url=new URL(request.url);
  const isNavigation=request.mode==='navigate' ||
    request.destination==='document' ||
    url.pathname.endsWith('/index.html') ||
    url.pathname.endsWith('/flight-route/');

  if(isNavigation){
    const freshUrl=new URL('./index.html?build=20260923-stable1',self.registration.scope).href;
    event.respondWith(
      fetch(freshUrl,{
        cache:'no-store',
        headers:{'Cache-Control':'no-cache'}
      }).catch(()=>fetch(request,{cache:'no-store'})).catch(()=>caches.match(request))
    );
    return;
  }

  event.respondWith(
    fetch(request).then(response=>{
      const copy=response.clone();
      caches.open(CACHE).then(cache=>cache.put(request,copy)).catch(()=>{});
      return response;
    }).catch(()=>caches.match(request))
  );
});
