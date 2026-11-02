var CACHE_NAME = 'cafe-order-v29';
var APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];
var NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', function(event){
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      // cache: 'reload' skips the browser's HTTP cache, so a new version never stores the old files again
      return cache.addAll(APP_SHELL.map(function(url){ return new Request(url, { cache: 'reload' }); }));
    })
  );
});

self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(key){ return key !== CACHE_NAME; }).map(function(key){ return caches.delete(key); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

function saveCopy(request, response){
  if(response && response.status === 200){
    var copy = response.clone();
    caches.open(CACHE_NAME).then(function(cache){ cache.put(request, copy); });
  }
  return response;
}

// the page itself: network first (so an update shows up on the next open), cached copy when offline or slow
function pageRequest(request){
  return new Promise(function(resolve){
    var settled = false, networkFailed = false;
    var useCache = function(){
      caches.match(request).then(function(cached){
        return cached || caches.match('./index.html');
      }).then(function(cached){
        if(settled) return;
        if(cached){ settled = true; resolve(cached); }
        // nothing cached yet (first visit while offline): only give up once the network has failed too
        else if(networkFailed){ settled = true; resolve(Response.error()); }
      });
    };
    var timer = setTimeout(useCache, NETWORK_TIMEOUT_MS);
    fetch(request, { cache: 'no-store' }).then(function(response){
      clearTimeout(timer);
      saveCopy(request, response);
      if(!settled){ settled = true; resolve(response); }
    }).catch(function(){
      clearTimeout(timer);
      networkFailed = true;
      useCache();
    });
  });
}

self.addEventListener('fetch', function(event){
  if(event.request.method !== 'GET') return;
  if(event.request.mode === 'navigate'){
    event.respondWith(pageRequest(event.request));
    return;
  }
  // icons, manifest, fonts: cached copy first, refreshed in the background
  event.respondWith(
    caches.match(event.request).then(function(cached){
      var networkFetch = fetch(event.request).then(function(response){
        return saveCopy(event.request, response);
      }).catch(function(){ return cached; });
      return cached || networkFetch;
    })
  );
});
