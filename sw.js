const CACHE='flight-route-v28';
const APP_SHELL=[
  './flight-route.geojson',
  './airspace/lt_c_aisobls.geojson',
  './manifest.webmanifest',
  './icon.svg',
  './styles.css',
  './app.js',
  './improvements.js'
];

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
    const freshUrl=new URL('./index.html?build=20260923-live28',self.registration.scope).href;
    event.respondWith(
      fetch(freshUrl,{
        cache:'no-store',
        headers:{'Cache-Control':'no-cache'}
      }).catch(()=>fetch(request,{cache:'no-store'})).catch(()=>caches.match(request,{ignoreSearch:true}))
    );
    return;
  }

  const isLocalStatic=url.origin===self.location.origin &&
    /\.(?:css|js|json|geojson|svg|webmanifest)$/i.test(url.pathname);

  if(isLocalStatic){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      try{
        const response=await fetch(request,{cache:'no-store'});
        if(response && response.ok){
          cache.put(request,response.clone()).catch(()=>{});
          return response;
        }
      }catch(e){}

      const cached=await cache.match(request,{ignoreSearch:true});
      if(cached) return cached;
      return new Response('',{status:504,statusText:'Offline'});
    })());
    return;
  }

  event.respondWith(
    fetch(request).then(response=>{
      const copy=response.clone();
      caches.open(CACHE).then(cache=>cache.put(request,copy)).catch(()=>{});
      return response;
    }).catch(()=>caches.match(request,{ignoreSearch:true}))
  );
});
