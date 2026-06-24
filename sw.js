// Service Worker per El Tauler PWA
// ================================
// VERSIÓ: canviar el número forçarà la substitució de qualsevol SW antic.
const SW_VERSION = '3.6.0';
const CACHE_NAME = `eltauler-${SW_VERSION}`;

console.log(`[SW] Service Worker versió: ${SW_VERSION}`);

// ---------------------------------------------------------------------------
// Recursos ESTÀTICS (cache-first, rarament canvien): imatges de peces, fonts.
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// NOTA: Ja no precachegem app.js, index.html ni altres fitxers de codi.
// El motiu: cache.addAll() usa la cache HTTP del navegador; si GitHub Pages
// ha servit una versió antiga, precachejaríem codi vell i el SW la serviria
// com si fos nova. Els recursos dinàmics es cachegen la primera vegada que
// es demanen via network-first (amb cache:'no-cache'), garantint frescor.
// ---------------------------------------------------------------------------

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

// Dominis de Firebase: streaming i long-polling; el SW no els ha de tocar.
const FIREBASE_HOSTS = [
  'firestore.googleapis.com',
  'firebaseinstallations.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firebase.googleapis.com',
  'apis.google.com',
  'accounts.google.com'
];

// ================================
// INSTAL·LACIÓ
// ================================
self.addEventListener('install', (event) => {
  console.log(`[SW] Instal·lant versió ${SW_VERSION}...`);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Alguns estàtics no s\'han precachejat:', err);
      }))
      .then(() => {
        console.log(`[SW] Instal·lació completada. Activant immediatament...`);
        // Activa el nou SW sense esperar que les pestanyes antigues es tanquin.
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
    // Elimina TOTES les caches antigues (no només les eltauler-*).
    caches.keys()
      .then((names) => Promise.all(
        names.map((name) => {
          if (name !== CACHE_NAME) {
            console.log(`[SW] Eliminant cache antiga: ${name}`);
            return caches.delete(name);
          }
        })
      ))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ includeUncontrolled: true }))
      .then((clients) => {
        clients.forEach((client) => {
          // Avisa la pàgina que el nou SW ja controla: la pàgina es recarrega.
          client.postMessage({ type: 'SW_ACTIVATED', version: SW_VERSION });
        });
        console.log(`[SW] Versió ${SW_VERSION} activa i controlant ${clients.length} clients.`);
      })
  );
});

// ================================
// ESTRATÈGIA DE FETCH
// ================================
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  if (!url.startsWith('http')) return;
  if (event.request.method !== 'GET') return;

  // Firebase: passa directament sense cap intervenció del SW.
  if (FIREBASE_HOSTS.some((h) => url.indexOf(h) !== -1)) return;

  if (CACHE_FIRST_PATTERNS.some((p) => p.test(url))) {
    event.respondWith(cacheFirst(event.request));
  } else {
    event.respondWith(networkFirst(event.request));
  }
});

// ================================
// NETWORK-FIRST (HTML, JS, CSS…)
// ================================
async function networkFirst(request) {
  const url = request.url;
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 8000);
    // cache:'no-cache' revalida amb el servidor i ignora la cache HTTP del
    // navegador (GitHub Pages serveix amb max-age=600). Sense això el
    // network-first pot retornar codi antic des de la cache HTTP.
    const res = await fetch(request, { signal: controller.signal, cache: 'no-cache' });
    clearTimeout(tid);
    if (res && res.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, res.clone());
    }
    return res;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const idx = await caches.match('./index.html');
      if (idx) return idx;
    }
    return new Response('Offline - contingut no disponible', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

// ================================
// CACHE-FIRST (imatges, fonts…)
// ================================
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    // Revalidació en segon pla (stale-while-revalidate).
    fetch(request).then((res) => {
      if (res && res.status === 200)
        caches.open(CACHE_NAME).then((c) => c.put(request, res));
    }).catch(() => {});
    return cached;
  }
  try {
    const res = await fetch(request);
    if (res && res.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, res.clone());
    }
    return res;
  } catch (err) {
    return new Response('', { status: 404 });
  }
}

// ================================
// MISSATGES
// ================================
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting' || event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data === 'getVersion' || event.data?.type === 'GET_VERSION') {
    event.source?.postMessage({ type: 'SW_VERSION', version: SW_VERSION });
  }
  if (event.data === 'clearCache' || event.data?.type === 'CLEAR_CACHE') {
    caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n))))
      .then(() => event.source?.postMessage({ type: 'CACHE_CLEARED' }));
  }
});
