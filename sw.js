// Service Worker per El Tauler PWA
// ================================
// VERSIÓ AUTOMÀTICA: Canvia cada vegada que es modifica el fitxer
const SW_VERSION = '2.0.1736268000';
const CACHE_NAME = `eltauler-${SW_VERSION}`;

// DEBUG: Log de versió
console.log(`[SW] Service Worker versió: ${SW_VERSION}`);
console.log(`[SW] Cache name: ${CACHE_NAME}`);

// Assets estàtics (cache-first) - imatges i fonts
const STATIC_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@400;600;700&family=Cinzel:wght@500;700&display=swap',
  'https://chessboardjs.com/img/chesspieces/wikipedia/wP.png',
  'https://chessboardjs.com/img/chesspieces/wikipedia/wR.png',
  'https://chessboardjs.com/img/chesspieces/wikipedia/wN.png',
  'https://chessboardjs.com/img/chesspieces/wikipedia/wB.png',
  'https://chessboardjs.com/img/chesspieces/wikipedia/wQ.png',
  'https://chessboardjs.com/img/chesspieces/wikipedia/wK.png',
  'https://chessboardjs.com/img/chesspieces/wikipedia/bP.png',
  'https://chessboardjs.com/img/chesspieces/wikipedia/bR.png',
  'https://chessboardjs.com/img/chesspieces/wikipedia/bN.png',
  'https://chessboardjs.com/img/chesspieces/wikipedia/bB.png',
  'https://chessboardjs.com/img/chesspieces/wikipedia/bQ.png',
  'https://chessboardjs.com/img/chesspieces/wikipedia/bK.png'
];

// Assets dinàmics (network-first) - codi que canvia sovint
const DYNAMIC_ASSETS = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  './stockfish.js',
  'https://cdnjs.cloudflare.com/ajax/libs/chessboard-js/1.0.0/chessboard-1.0.0.min.css',
  'https://code.jquery.com/jquery-3.6.0.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/chessboard-js/1.0.0/chessboard-1.0.0.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

// Patrons per determinar l'estratègia
const NETWORK_FIRST_PATTERNS = [
  /\.html(\?.*)?$/,
  /\.js(\?.*)?$/,
  /\.css(\?.*)?$/,
  /\/$/,  // Arrel
  /index\.html/,
  /app\.js/,
  /manifest\.json/
];

const CACHE_FIRST_PATTERNS = [
  /\.png$/,
  /\.jpg$/,
  /\.jpeg$/,
  /\.gif$/,
  /\.svg$/,
  /\.ico$/,
  /\.woff2?$/,
  /\.ttf$/,
  /fonts\.googleapis\.com/,
  /fonts\.gstatic\.com/,
  /chesspieces/
];

// ================================
// INSTAL·LACIÓ
// ================================
self.addEventListener('install', (event) => {
  console.log(`[SW] Instal·lant versió ${SW_VERSION}...`);

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Pre-caching assets estàtics...');
        // Primer els estàtics (menys crítics si fallen)
        return cache.addAll(STATIC_ASSETS).catch(err => {
          console.warn('[SW] Alguns assets estàtics no s\'han pogut cachear:', err);
        });
      })
      .then(() => caches.open(CACHE_NAME))
      .then((cache) => {
        console.log('[SW] Pre-caching assets dinàmics...');
        return cache.addAll(DYNAMIC_ASSETS).catch(err => {
          console.warn('[SW] Alguns assets dinàmics no s\'han pogut cachear:', err);
        });
      })
      .then(() => {
        console.log(`[SW] Instal·lació completada. Activant immediatament...`);
        // IMPORTANT: Activa immediatament sense esperar
        return self.skipWaiting();
      })
  );
});

// ================================
// ACTIVACIÓ
// ================================
self.addEventListener('activate', (event) => {
  console.log(`[SW] Activant versió ${SW_VERSION}...`);

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME && cacheName.startsWith('eltauler-')) {
              console.log(`[SW] Eliminant cache antic: ${cacheName}`);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] Prenent control de tots els clients...');
        // IMPORTANT: Pren control immediatament de totes les pàgines
        return self.clients.claim();
      })
      .then(() => {
        // Notifica a tots els clients que hi ha una nova versió activa
        return self.clients.matchAll().then(clients => {
          clients.forEach(client => {
            client.postMessage({
              type: 'SW_ACTIVATED',
              version: SW_VERSION
            });
          });
        });
      })
      .then(() => {
        console.log(`[SW] Versió ${SW_VERSION} activa i controlant.`);
      })
  );
});

// ================================
// ESTRATÈGIA DE FETCH
// ================================
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Ignorem peticions no-HTTP
  if (!url.startsWith('http')) {
    return;
  }

  // Ignorem peticions POST, etc.
  if (event.request.method !== 'GET') {
    return;
  }

  // Determina l'estratègia
  const shouldNetworkFirst = NETWORK_FIRST_PATTERNS.some(pattern => pattern.test(url));
  const shouldCacheFirst = CACHE_FIRST_PATTERNS.some(pattern => pattern.test(url));

  if (shouldCacheFirst && !shouldNetworkFirst) {
    // CACHE-FIRST per imatges i fonts
    event.respondWith(cacheFirst(event.request));
  } else {
    // NETWORK-FIRST per HTML, JS, CSS i tot el reste
    event.respondWith(networkFirst(event.request));
  }
});

// ================================
// ESTRATÈGIA NETWORK-FIRST
// ================================
async function networkFirst(request) {
  const url = request.url;

  try {
    // Intenta obtenir de la xarxa amb timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 segons timeout

    const networkResponse = await fetch(request, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (networkResponse && networkResponse.status === 200) {
      // Guarda al cache per fallback futur
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
      console.log(`[SW] Network-first OK: ${url.substring(0, 50)}...`);
    }

    return networkResponse;
  } catch (error) {
    // Fallback al cache
    console.log(`[SW] Network failed, trying cache: ${url.substring(0, 50)}...`);
    const cachedResponse = await caches.match(request);

    if (cachedResponse) {
      console.log(`[SW] Cache hit: ${url.substring(0, 50)}...`);
      return cachedResponse;
    }

    // Si és navegació, retorna index.html
    if (request.mode === 'navigate') {
      const indexResponse = await caches.match('./index.html');
      if (indexResponse) {
        return indexResponse;
      }
    }

    console.warn(`[SW] No cache available for: ${url}`);
    return new Response('Offline - Contingut no disponible', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

// ================================
// ESTRATÈGIA CACHE-FIRST
// ================================
async function cacheFirst(request) {
  const url = request.url;

  const cachedResponse = await caches.match(request);

  if (cachedResponse) {
    // Actualitza en background (stale-while-revalidate)
    fetch(request).then(networkResponse => {
      if (networkResponse && networkResponse.status === 200) {
        caches.open(CACHE_NAME).then(cache => {
          cache.put(request, networkResponse);
        });
      }
    }).catch(() => {});

    return cachedResponse;
  }

  // Si no està al cache, obtén de la xarxa
  try {
    const networkResponse = await fetch(request);

    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.warn(`[SW] Cache-first failed for: ${url}`);
    return new Response('', { status: 404 });
  }
}

// ================================
// MISSATGES
// ================================
self.addEventListener('message', (event) => {
  console.log('[SW] Missatge rebut:', event.data);

  if (event.data === 'skipWaiting' || event.data?.type === 'SKIP_WAITING') {
    console.log('[SW] Skip waiting sol·licitat');
    self.skipWaiting();
  }

  if (event.data === 'getVersion' || event.data?.type === 'GET_VERSION') {
    event.source?.postMessage({
      type: 'SW_VERSION',
      version: SW_VERSION
    });
  }

  if (event.data === 'clearCache' || event.data?.type === 'CLEAR_CACHE') {
    console.log('[SW] Netejant tots els caches...');
    caches.keys().then(names => {
      return Promise.all(names.map(name => caches.delete(name)));
    }).then(() => {
      event.source?.postMessage({ type: 'CACHE_CLEARED' });
      console.log('[SW] Caches netejats');
    });
  }
});

// ================================
// NOTIFICACIÓ D'ACTUALITZACIÓ
// ================================
self.addEventListener('install', () => {
  // Notifica que hi ha una actualització en espera
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({
        type: 'SW_UPDATE_AVAILABLE',
        version: SW_VERSION
      });
    });
  });
});
