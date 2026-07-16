// Service Worker per El Tauler PWA
// ================================
// VERSIÓ: canviar el número forçarà la substitució de qualsevol SW antic.
const SW_VERSION = '3.9.56';
const CACHE_NAME = `eltauler-${SW_VERSION}`;
// Cau PERSISTENT per al motor (Stockfish, 1,5 MB): NO es purga en canviar de
// versió del SW, perquè el motor estigui sempre disponible OFFLINE sense haver de
// tornar a baixar-lo a cada actualització. (Sense això, just després d'actualitzar
// el SW la cau queda buida i, si l'usuari està offline, no es pot jugar ni generar
// jeroglífics ni resoldre errors.)
const ENGINE_CACHE = 'eltauler-engine-v1';

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
      // Escalfa la cau del motor (si encara no hi és) perquè Stockfish funcioni
      // offline tan aviat com sigui possible.
      .then(() => caches.open(ENGINE_CACHE).then((c) =>
        c.match('stockfish.js', { ignoreSearch: true }).then((hit) => hit ? null : c.add('stockfish.js').catch(() => {}))
      ).catch(() => {}))
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
          // Conserva la cau actual i la cau PERSISTENT del motor (Stockfish).
          if (name !== CACHE_NAME && name !== ENGINE_CACHE) {
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

  // Motor Stockfish: cache-first des de la cau persistent, perquè funcioni
  // OFFLINE encara que s'hagi actualitzat el SW (no es torna a baixar 1,5 MB).
  if (url.indexOf('stockfish.js') !== -1) {
    event.respondWith(engineCacheFirst(event.request));
    return;
  }

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
// MOTOR (Stockfish) — cache-first persistent amb fallback offline
// ================================
async function engineCacheFirst(request) {
  const cache = await caches.open(ENGINE_CACHE);
  // 1) Coincidència exacta (mateix ?v): serveix-la directament.
  const exact = await cache.match(request);
  if (exact) return exact;
  // 2) Si no, intenta baixar-la (i desa-la) — actualitza si ha canviat la versió.
  try {
    const res = await fetch(request);
    if (res && res.status === 200) { await cache.put(request, res.clone()); }
    return res;
  } catch (err) {
    // 3) Sense xarxa: serveix QUALSEVOL stockfish.js desat (ignorant el ?v).
    const any = await cache.match(request, { ignoreSearch: true })
      || await cache.match('stockfish.js', { ignoreSearch: true });
    if (any) return any;
    return new Response('// motor no disponible offline', {
      status: 503, headers: { 'Content-Type': 'application/javascript' }
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

// ---------------------------------------------------------------------------
// Notificacions de torn de les partides col·lectives: en clicar la notificació,
// porta l'usuari a l'app (i, si es pot, a la partida concreta via l'URL amb hash).
// ---------------------------------------------------------------------------
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const url = data.url || self.registration.scope || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          if ('navigate' in client && url) { try { client.navigate(url); } catch (e) {} }
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
