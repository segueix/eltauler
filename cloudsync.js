/*
 * cloudsync.js — Sincronització al núvol per a El Tauler
 * ----------------------------------------------------------------------------
 * Sincronitza TOTA la informació del joc (partides, errors, reptes diaris, ELO,
 * missions, trofeus, calibratge, lligues, obertures, tàctiques...) entre
 * dispositius mitjançant Firebase (Authentication amb Google + Cloud Firestore).
 *
 * Estratègia: instantània completa (snapshot) de tot el localStorage de l'app.
 * En comptes d'enumerar clau a clau (que és fràgil i deixa coses sense
 * sincronitzar), agafem TOTES les claus amb prefix `chess_` i `eltauler_`.
 * Així mai no oblidem cap dada nova que s'afegeixi al joc en el futur.
 *
 * Resolució de conflictes: "última escriptura guanya" per marca de temps.
 * La primera vegada que un dispositiu ja amb dades es connecta i troba dades al
 * núvol, es pregunta a l'usuari quines vol conservar (per evitar pèrdues).
 * ============================================================================
 */
(function () {
  'use strict';

  // ===========================================================================
  //  CONFIGURACIÓ DE FIREBASE  ←  OMPLE AIXÒ AMB LES DADES DEL TEU PROJECTE
  // ---------------------------------------------------------------------------
  //  1. Ves a https://console.firebase.google.com i crea un projecte.
  //  2. Afegeix una "app web" (</>) i copia aquí l'objecte firebaseConfig.
  //  3. Activa Authentication → Sign-in method → Google.
  //  4. Activa Firestore Database (mode producció) i posa-hi les regles que
  //     trobaràs al README de més avall.
  //  5. A Authentication → Settings → Authorized domains, afegeix el domini
  //     on publiques l'app (p. ex. usuari.github.io i localhost).
  // ===========================================================================
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyADh3NEUcSgGDnnoJsAZurtg-E_M_3YFyk",
    authDomain: "eltauler-85726.firebaseapp.com",
    projectId: "eltauler-85726",
    storageBucket: "eltauler-85726.firebasestorage.app",
    messagingSenderId: "694353336390",
    appId: "1:694353336390:web:9dd10b1064ace91c989247"
  };

  // Si vols sincronitzar TAMBÉ la clau API d'OpenAI (es desa en text pla al teu
  // Firestore privat), posa-ho a true. Per seguretat, per defecte NO se
  // sincronitza: la podràs continuar configurant a cada dispositiu.
  const SYNC_OPENAI_KEY = false;

  // ---------------------------------------------------------------------------
  //  Constants internes
  // ---------------------------------------------------------------------------
  const SYNC_PREFIXES = ['chess_', 'eltauler_'];
  const FIRESTORE_COLLECTION = 'eltauler_users';
  // Debounce llarg: agrupa molts desats petits d'una sessió en poques pujades.
  // El sostre garanteix que, encara que hi hagi desats continus (el debounce sol
  // es reiniciaria indefinidament), es puja de tant en tant. A més es fa un
  // «flush» en amagar/tancar la pestanya (vegeu init()). Amb el guard per hash,
  // les pujades sense canvis reals no gasten cap escriptura.
  const PUSH_DEBOUNCE_MS = 20000;
  const PUSH_MAX_WAIT_MS = 60000;
  // Pujada IMMINENT per a esdeveniments valuosos (final de partida, error resolt):
  // no s'espera el debounce llarg, però es coalesca una ràfega en una sola pujada.
  // Així la finestra de dades sense sincronitzar entre dispositius es manté petita.
  const FLUSH_SOON_MS = 3000;
  // Baixada en recuperar el focus: com a molt un cop cada X ms (evita gastar
  // lectures en cada canvi de pestanya).
  const FOCUS_PULL_THROTTLE_MS = 30000;

  // Claus locals (mai no es sincronitzen): metadades del propi sync.
  const LOCAL_META_PREFIX = 'eltauler_cloud_';
  const DEVICE_ID_KEY = LOCAL_META_PREFIX + 'deviceId';
  const LAST_CHANGE_KEY = LOCAL_META_PREFIX + 'lastChangeAt';
  const LAST_SYNCED_KEY = LOCAL_META_PREFIX + 'lastSyncedAt';
  const REDIRECT_FLAG_KEY = LOCAL_META_PREFIX + 'redirectPending';

  // Claus concretes que mai no volem pujar al núvol.
  const EXCLUDE_KEYS = new Set();
  if (!SYNC_OPENAI_KEY) EXCLUDE_KEYS.add('chess_openai_api_key');
  // El control del tauler (Tocar/Arrossegar) és una preferència de CADA
  // dispositiu: al mòbil sol anar millor «Tocar» i a l'ordinador «Arrossegar».
  // Si es sincronitzés, l'últim aparell usat imposaria la seva opció als altres.
  EXCLUDE_KEYS.add('eltauler_control_mode');
  // El COS pesat de les partides (revisions jugada a jugada amb les seves
  // línies, errades i ressenya d'IA) viu a IndexedDB, fora d'aquesta
  // instantània: són desenes de KB per partida i el document de Firestore té un
  // límit d'1 MiB. Aquesta clau és només la xarxa de seguretat que fa servir
  // gamestore.js quan IndexedDB no està disponible, i tampoc no s'ha de pujar.
  EXCLUDE_KEYS.add('chess_gameBodies');

  // ---------------------------------------------------------------------------
  //  Estat del mòdul
  // ---------------------------------------------------------------------------
  let app = null;
  let auth = null;
  let db = null;
  let currentUser = null;
  let docUnsub = null;
  let pushTimer = null;
  let pushMaxTimer = null;           // garanteix una pujada com a molt cada PUSH_MAX_WAIT_MS
  let pushSoonTimer = null;          // pujada imminent d'un esdeveniment valuós
  let pushInFlight = false;
  let lastPushedHash = null;         // hash de l'última instantània pujada (evita pujades redundants)
  let lastFocusPullAt = 0;           // última baixada en recuperar el focus (throttle)
  let pendingCloudData = null;       // dades del núvol esperant a aplicar-se
  let deferApplyTimer = null;
  let syncWatchdog = null;           // detecta sincronitzacions inicials encallades
  const SYNC_WATCHDOG_MS = 15000;
  let pushWatchdog = null;           // detecta pujades encallades (ref.set() que no resol)
  const PUSH_WATCHDOG_MS = 15000;
  let status = { state: 'init', email: null, lastSyncedAt: 0, error: null };

  // ---------------------------------------------------------------------------
  //  Utilitats
  // ---------------------------------------------------------------------------
  function isConfigured() {
    return FIREBASE_CONFIG.apiKey &&
           FIREBASE_CONFIG.apiKey.indexOf('OMPLE_') !== 0 &&
           FIREBASE_CONFIG.projectId &&
           FIREBASE_CONFIG.projectId.indexOf('OMPLE_') !== 0;
  }

  function firebaseLoaded() {
    return typeof firebase !== 'undefined' && firebase && firebase.initializeApp;
  }

  function getDeviceId() {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = 'dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      try { localStorage.setItem(DEVICE_ID_KEY, id); } catch (e) {}
    }
    return id;
  }

  function getLocalChangeAt() {
    const v = parseInt(localStorage.getItem(LAST_CHANGE_KEY), 10);
    return isNaN(v) ? null : v;
  }
  function setLocalChangeAt(ts) {
    try { localStorage.setItem(LAST_CHANGE_KEY, String(ts)); } catch (e) {}
  }
  function setLastSyncedAt(ts) {
    try { localStorage.setItem(LAST_SYNCED_KEY, String(ts)); } catch (e) {}
    status.lastSyncedAt = ts;
  }

  function isSyncableKey(k) {
    if (!k) return false;
    if (k.indexOf(LOCAL_META_PREFIX) === 0) return false;
    if (EXCLUDE_KEYS.has(k)) return false;
    return SYNC_PREFIXES.some(function (p) { return k.indexOf(p) === 0; });
  }

  // Agafa una instantània de TOT el localStorage rellevant.
  function collectSnapshot() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (isSyncableKey(k)) data[k] = localStorage.getItem(k);
    }
    return data;
  }

  // Hash barat i estable d'una instantània (ordena les claus). Serveix per no
  // tornar a pujar dades idèntiques a l'última pujada (estalvi d'escriptures).
  function snapshotHash(data) {
    const keys = Object.keys(data).sort();
    let h = 5381;
    for (let i = 0; i < keys.length; i++) {
      const s = keys[i] + '=' + data[keys[i]] + '\u0001';
      for (let j = 0; j < s.length; j++) h = ((h << 5) + h + s.charCodeAt(j)) | 0;
    }
    return String(h >>> 0);
  }

  // ¿El dispositiu té dades de joc reals (no només configuració buida)?
  function hasMeaningfulLocalData() {
    const elo = localStorage.getItem('chess_userELO');
    const games = localStorage.getItem('chess_gameHistory');
    const imported = localStorage.getItem('chess_importedGameHistory');
    const errors = localStorage.getItem('chess_savedErrors');
    if (elo && parseInt(elo, 10) > 50) return true;
    try { if (games && JSON.parse(games).length > 0) return true; } catch (e) {}
    try { if (imported && JSON.parse(imported).length > 0) return true; } catch (e) {}
    try { if (errors && JSON.parse(errors).length > 0) return true; } catch (e) {}
    if (localStorage.getItem('chess_totalGamesPlayed') &&
        parseInt(localStorage.getItem('chess_totalGamesPlayed'), 10) > 0) return true;
    return false;
  }

  // Aplica una instantània del núvol al localStorage local (mirall complet).
  function applySnapshot(data) {
    if (!data || typeof data !== 'object') return;
    // 1. Esborra les claus sincronitzables locals que ja no existeixen al núvol
    //    (així es propaguen també les eliminacions, p. ex. esborrar un error).
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (isSyncableKey(k) && !(k in data)) toRemove.push(k);
    }
    toRemove.forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} });
    // 2. Escriu totes les claus del núvol.
    Object.keys(data).forEach(function (k) {
      if (!isSyncableKey(k)) return;
      try { localStorage.setItem(k, data[k]); } catch (e) {}
    });
  }

  // Demana a l'app que recarregui el seu estat des del localStorage i refresqui
  // la interfície. La definim a app.js com a window.reloadAppStateFromStorage.
  function reloadApp() {
    if (typeof window.reloadAppStateFromStorage === 'function') {
      try { window.reloadAppStateFromStorage(); } catch (e) { console.warn('[CloudSync] reload error', e); }
    }
  }

  // ¿És segur aplicar canvis ara mateix? No volem trencar una partida en curs.
  function isSafeToApply() {
    const g = document.getElementById('game-screen');
    if (g && g.style.display !== 'none' && g.offsetParent !== null) return false;
    return true;
  }

  // ---------------------------------------------------------------------------
  //  Notificació d'estat cap a la UI
  // ---------------------------------------------------------------------------
  function setStatus(partial) {
    status = Object.assign({}, status, partial);
    if (typeof window.onCloudSyncStatus === 'function') {
      try { window.onCloudSyncStatus(Object.assign({}, status, { configured: isConfigured() })); } catch (e) {}
    }
  }

  // ---------------------------------------------------------------------------
  //  Firestore: push i pull
  // ---------------------------------------------------------------------------
  function docRef() {
    if (!db || !currentUser) return null;
    return db.collection(FIRESTORE_COLLECTION).doc(currentUser.uid);
  }

  function pushSnapshot(force) {
    const ref = docRef();
    if (!ref) return Promise.resolve();
    if (pushMaxTimer) { clearTimeout(pushMaxTimer); pushMaxTimer = null; }
    const data = collectSnapshot();
    const hash = snapshotHash(data);
    if (!force && hash === lastPushedHash) {
      // Res nou des de l'última pujada: no gastis una escriptura.
      setStatus({ state: 'synced', error: null });
      return Promise.resolve();
    }
    const ts = Date.now();
    const payload = {
      data: data,
      updatedAt: ts,
      deviceId: getDeviceId(),
      app: 'eltauler'
    };
    pushInFlight = true;
    setStatus({ state: 'syncing' });
    // Watchdog: amb persistència offline, ref.set() només resol quan el servidor
    // confirma l'escriptura. Si la xarxa està bloquejada (algunes xarxes/extensions
    // bloquegen Firestore), la promesa queda pendent indefinidament i la UI es
    // quedaria eternament en "Sincronitzant…". No avortem l'escriptura (queda en
    // cua i es reintenta sola), però treiem la UI d'aquest estat encallat.
    clearPushWatchdog();
    pushWatchdog = setTimeout(function () {
      pushWatchdog = null;
      if (status.state === 'syncing') {
        console.warn('[CloudSync] pujada encallada (>' + PUSH_WATCHDOG_MS + ' ms); l\'escriptura queda en cua i es reintenta sola.');
        setStatus({
          state: 'error',
          error: 'La pujada al núvol triga més del compte (xarxa lenta o Firestore ' +
                 'bloquejat en aquesta xarxa/navegador). Les dades queden desades al ' +
                 'dispositiu i es tornaran a sincronitzar soles quan es recuperi la connexió.'
        });
      }
    }, PUSH_WATCHDOG_MS);
    return ref.set(payload).then(function () {
      clearPushWatchdog();
      lastPushedHash = hash;
      setLocalChangeAt(ts);
      setLastSyncedAt(ts);
      pushInFlight = false;
      setStatus({ state: 'synced', error: null });
    }).catch(function (e) {
      clearPushWatchdog();
      pushInFlight = false;
      console.warn('[CloudSync] push error', e);
      setStatus({ state: 'error', error: e && e.message ? e.message : 'Error de pujada' });
    });
  }
  function clearPushWatchdog() { if (pushWatchdog) { clearTimeout(pushWatchdog); pushWatchdog = null; } }

  function schedulePush() {
    if (!currentUser) return;
    setLocalChangeAt(Date.now());
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(function () {
      pushTimer = null;
      pushSnapshot();
    }, PUSH_DEBOUNCE_MS);
    // Sostre: encara que hi hagi desats continus (el debounce es reiniciaria sol),
    // puja com a molt cada PUSH_MAX_WAIT_MS.
    if (!pushMaxTimer) {
      pushMaxTimer = setTimeout(function () {
        pushMaxTimer = null;
        if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
        pushSnapshot();
      }, PUSH_MAX_WAIT_MS);
    }
  }

  // Cancel·la tots els temporitzadors de pujada pendents.
  function clearPushTimers() {
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    if (pushMaxTimer) { clearTimeout(pushMaxTimer); pushMaxTimer = null; }
    if (pushSoonTimer) { clearTimeout(pushSoonTimer); pushSoonTimer = null; }
  }

  // Puja de seguida el que estigui pendent (en amagar o tancar la pestanya): així
  // no cal escriure durant el joc a cada moviment; una sessió es resol en poques
  // pujades. Amb el guard per hash, si no hi ha canvis reals no escriu res.
  function flushPendingPush() {
    if (!currentUser) return;
    clearPushTimers();
    pushSnapshot();
  }

  // Pujada IMMINENT per a esdeveniments valuosos (final de partida, error resolt).
  // No espera el debounce llarg, però coalesca una ràfega d'esdeveniments en una
  // sola pujada. Manté petita la finestra de dades sense sincronitzar entre
  // dispositius, sense renunciar a l'estalvi d'escriptures dels desats menors.
  function flushSoon() {
    if (!currentUser) return;
    setLocalChangeAt(Date.now());
    if (pushSoonTimer) return;   // ja n'hi ha una de programada imminent
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }   // el push imminent mana
    pushSoonTimer = setTimeout(function () {
      pushSoonTimer = null;
      if (pushMaxTimer) { clearTimeout(pushMaxTimer); pushMaxTimer = null; }
      pushSnapshot();
    }, FLUSH_SOON_MS);
  }

  // Baixada en recuperar el focus (a més del listener en temps real): en tornar a
  // un dispositiu, garanteix que tens l'última versió abans de continuar jugant.
  // Llegeix del SERVIDOR (no de la memòria cau) i es limita per no gastar lectures
  // en cada canvi de pestanya.
  function pullOnFocus() {
    if (!currentUser) return;
    const now = Date.now();
    if (now - lastFocusPullAt < FOCUS_PULL_THROTTLE_MS) return;
    lastFocusPullAt = now;
    const ref = docRef();
    if (!ref) return;
    ref.get({ source: 'server' }).then(function (snap) {
      if (!snap.exists) return;
      const d = snap.data();
      if (!d || !d.data) return;
      if (d.deviceId === getDeviceId()) return;          // canvi originat per nosaltres
      const localChangeAt = getLocalChangeAt() || 0;
      if ((d.updatedAt || 0) > localChangeAt) applyCloudData(d.data, d.updatedAt || Date.now());
    }).catch(function (e) {
      // Sense connexió o servidor no disponible: el listener ja ho recuperarà.
      console.warn('[CloudSync] focus pull', e && e.code ? e.code : e);
    });
  }

  // Aplica dades del núvol (ara o quan sigui segur).
  function applyCloudData(data, updatedAt) {
    if (!isSafeToApply()) {
      pendingCloudData = { data: data, updatedAt: updatedAt };
      if (!deferApplyTimer) {
        deferApplyTimer = setInterval(function () {
          if (pendingCloudData && isSafeToApply()) {
            const p = pendingCloudData;
            pendingCloudData = null;
            clearInterval(deferApplyTimer);
            deferApplyTimer = null;
            applyCloudData(p.data, p.updatedAt);
          }
        }, 4000);
      }
      return;
    }
    applySnapshot(data);
    // Evita re-pujar immediatament el que acabem de baixar: fixa el hash actual.
    try { lastPushedHash = snapshotHash(collectSnapshot()); } catch (e) {}
    setLocalChangeAt(updatedAt);
    setLastSyncedAt(updatedAt);
    reloadApp();
    setStatus({ state: 'synced', error: null });
  }

  // Decideix què fer la primera vegada que ens connectem amb aquest compte.
  function reconcileInitial(cloudDoc) {
    const localChangeAt = getLocalChangeAt();

    if (!cloudDoc) {
      // No hi ha res al núvol → aquest dispositiu és la font: puja-ho tot.
      return pushSnapshot();
    }

    const cloudAt = cloudDoc.updatedAt || 0;

    if (localChangeAt !== null) {
      // Ja hem sincronitzat abans en aquest dispositiu → última escriptura guanya.
      if (cloudAt > localChangeAt) {
        applyCloudData(cloudDoc.data, cloudAt);
      } else if (localChangeAt > cloudAt) {
        pushSnapshot();
      } else {
        setLastSyncedAt(cloudAt);
        setStatus({ state: 'synced' });
      }
      return Promise.resolve();
    }

    // Primer cop en aquest dispositiu.
    if (!hasMeaningfulLocalData()) {
      // No hi ha res a perdre localment → baixa del núvol.
      applyCloudData(cloudDoc.data, cloudAt);
      return Promise.resolve();
    }

    // Conflicte real: dades al núvol I dades en aquest dispositiu.
    const useCloud = window.confirm(
      'Sincronització al núvol\n\n' +
      'Hem trobat una còpia de les teves dades al núvol i també dades en aquest ' +
      'dispositiu.\n\n' +
      '• Accepta (D\'acord) per CONSERVAR LES DADES DEL NÚVOL (es substituiran les ' +
      'd\'aquest dispositiu).\n' +
      '• Cancel·la per CONSERVAR LES DADES D\'AQUEST DISPOSITIU (es pujaran al núvol ' +
      'i substituiran les del núvol).'
    );
    if (useCloud) {
      applyCloudData(cloudDoc.data, cloudAt);
    } else {
      pushSnapshot();
    }
    return Promise.resolve();
  }

  // Subscripció en temps real: si un altre dispositiu puja dades més noves,
  // les apliquem automàticament.
  function subscribeRealtime() {
    const ref = docRef();
    if (!ref) return;
    if (docUnsub) { docUnsub(); docUnsub = null; }
    docUnsub = ref.onSnapshot(function (snap) {
      if (!snap.exists) return;
      if (snap.metadata && snap.metadata.hasPendingWrites) return; // és la nostra pròpia escriptura
      const d = snap.data();
      if (!d || !d.data) return;
      if (d.deviceId === getDeviceId()) return;       // canvi originat per nosaltres
      const localChangeAt = getLocalChangeAt() || 0;
      if ((d.updatedAt || 0) > localChangeAt) {
        applyCloudData(d.data, d.updatedAt || Date.now());
      }
    }, function (err) {
      console.warn('[CloudSync] onSnapshot error', err);
    });
  }

  // ---------------------------------------------------------------------------
  //  Autenticació
  // ---------------------------------------------------------------------------
  function clearSyncWatchdog() {
    if (syncWatchdog) { clearTimeout(syncWatchdog); syncWatchdog = null; }
  }

  function handleSignedIn(user) {
    currentUser = user;
    // Sessió iniciada correctament: neteja la marca de redirecció i avisa l'app
    // (perquè mostri un missatge clar i, si cal, torni a la pantalla on era).
    try { localStorage.removeItem(REDIRECT_FLAG_KEY); } catch (e) {}
    if (typeof window.onCloudSignedIn === 'function') {
      try { window.onCloudSignedIn(user.email || user.displayName || ''); } catch (e) {}
    }
    setStatus({ state: 'syncing', email: user.email || user.displayName || 'Connectat' });

    // Watchdog: si la sincronització inicial es queda penjada (típicament perquè
    // la connexió amb Firestore està bloquejada en aquest navegador/xarxa), no
    // deixem la UI eternament en "Sincronitzant…": informem l'usuari amb un avís
    // accionable. No avortem la petició: la subscripció en temps real i el
    // long-polling poden resoldre-la més tard i tornar a posar l'estat a 'synced'.
    clearSyncWatchdog();
    syncWatchdog = setTimeout(function () {
      syncWatchdog = null;
      if (status.state === 'syncing') {
        console.warn('[CloudSync] sincronització inicial encallada (>' + SYNC_WATCHDOG_MS + ' ms).');
        setStatus({
          state: 'error',
          error: 'La connexió amb el núvol triga massa. Comprova la xarxa (algunes ' +
                 'xarxes o extensions bloquegen Firestore) i torna-ho a provar; si el ' +
                 'problema continua, recarrega la pàgina.'
        });
      }
    }, SYNC_WATCHDOG_MS);

    const ref = docRef();
    if (!ref) { clearSyncWatchdog(); return; }
    // Subscrivim el temps real abans (i a part) de la conciliació inicial: així,
    // encara que el get() inicial trigui, l'estat es pot recuperar sol quan arribi
    // el primer snapshot del document.
    ref.get().then(function (snap) {
      const cloudDoc = snap.exists ? snap.data() : null;
      return reconcileInitial(cloudDoc);
    }).then(function () {
      clearSyncWatchdog();
      subscribeRealtime();
      // La conciliació inicial ha acabat: ja tenim (si n'hi havia) el nom d'usuari
      // que viatja amb el compte al núvol. Avisem l'app perquè, si el compte encara
      // no té nom, en demani un (cal per aparèixer al rànquing i a les col·lectives).
      if (typeof window.onCloudSyncReady === 'function') {
        try { window.onCloudSyncReady(currentUser ? (currentUser.email || currentUser.displayName || '') : ''); } catch (e) {}
      }
    }).catch(function (e) {
      clearSyncWatchdog();
      console.warn('[CloudSync] sign-in sync error', e);
      setStatus({ state: 'error', error: e && e.message ? e.message : 'Error de sincronització' });
      // Intentem la subscripció igualment: pot recuperar-se quan torni la connexió.
      try { subscribeRealtime(); } catch (e2) {}
    });
  }

  function handleSignedOut() {
    currentUser = null;
    clearSyncWatchdog();
    if (docUnsub) { docUnsub(); docUnsub = null; }
    clearPushTimers();
    lastPushedHash = null;
    setStatus({ state: 'signedout', email: null });
  }

  function buildProvider() {
    const provider = new firebase.auth.GoogleAuthProvider();
    // Mostra SEMPRE el selector de comptes de Google: així es pot iniciar sessió i
    // també CANVIAR de compte fàcilment (no reutilitza automàticament l'últim).
    provider.setCustomParameters({ prompt: 'select_account' });
    return provider;
  }

  function startRedirect(provider) {
    // Marca que hi ha una redirecció en curs: en tornar, comprovarem si s'ha
    // completat de debò (alguns navegadors mòbils bloquegen l'emmagatzematge i la
    // sessió no s'acaba, sense cap error visible).
    try { localStorage.setItem(REDIRECT_FLAG_KEY, String(Date.now())); } catch (e) {}
    try {
      auth.signInWithRedirect(provider).catch(function (e2) {
        console.warn('[CloudSync] redirect sign-in error', e2);
        try { localStorage.removeItem(REDIRECT_FLAG_KEY); } catch (e) {}
        setStatus({ state: 'error', error: friendlyAuthError(e2) });
      });
    } catch (e2) {
      try { localStorage.removeItem(REDIRECT_FLAG_KEY); } catch (e) {}
      setStatus({ state: 'error', error: friendlyAuthError(e2) });
    }
  }

  function friendlyAuthError(e) {
    const code = e && e.code ? String(e.code) : '';
    if (code === 'auth/unauthorized-domain') {
      return 'El domini «' + (location.hostname || '') + '» no està autoritzat a Firebase ' +
             '(Authentication → Settings → Authorized domains). Afegeix-l\'hi i torna-ho a provar.';
    }
    if (code === 'auth/operation-not-allowed') return 'L\'inici de sessió amb Google no està activat a Firebase.';
    if (code === 'auth/network-request-failed') return 'Error de xarxa en iniciar sessió. Comprova la connexió.';
    return (e && e.message) ? e.message : 'Error d\'inici de sessió';
  }

  // Inici de sessió: SEMPRE intentem primer el popup (funciona a la majoria de
  // navegadors moderns, mòbil inclòs, i evita els problemes de la redirecció amb
  // la partició d'emmagatzematge). Si el popup falla per qualsevol motiu que no
  // sigui que l'usuari l'ha tancat, provem amb redirecció.
  function signIn() {
    if (!auth) { setStatus({ state: 'error', error: 'Firebase no inicialitzat' }); return; }
    const provider = buildProvider();
    let popup;
    try { popup = auth.signInWithPopup(provider); } catch (e) { startRedirect(provider); return; }
    popup.catch(function (e) {
      const code = e && e.code ? e.code : '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request' || code === 'auth/user-cancelled') {
        // L'usuari ha tancat el selector; no és un error real.
        setStatus({ state: currentUser ? 'synced' : 'signedout' });
        return;
      }
      if (code === 'auth/unauthorized-domain' || code === 'auth/operation-not-allowed') {
        // La redirecció no ho arreglaria: mostra l'error accionable.
        setStatus({ state: 'error', error: friendlyAuthError(e) });
        return;
      }
      // Qualsevol altre error (popup bloquejat, no suportat, mòbil…) → redirecció.
      console.warn('[CloudSync] popup sign-in error, provant redirecció', e);
      startRedirect(provider);
    });
  }

  // NO hi ha signOut públic: la sessió queda vinculada a l'app de manera
  // permanent perquè el nom d'usuari (i totes les dades) van enganxats al compte
  // de Google i mai no han de quedar "orfes" en un dispositiu sense compte.
  // handleSignedOut() es conserva només per a tancaments EXTERNS de sessió
  // (token revocat, sessió caducada), que Firebase notifica via onAuthStateChanged.

  // Canviar de compte: amb prompt=select_account, n'hi ha prou amb tornar a iniciar
  // sessió (Google mostra el selector i, si tries un altre compte, s'hi canvia).
  // Ho fem DINS del gest del clic (sense signOut previ) perquè el popup no es
  // bloquegi.
  function switchAccount() {
    if (!auth) { signIn(); return; }
    signIn();
  }

  function syncNow() {
    if (!currentUser) { signIn(); return; }
    clearPushTimers();
    pushSnapshot(true);   // «Sincronitza ara»: força la pujada encara que el hash coincideixi
  }

  // ---------------------------------------------------------------------------
  //  Inicialització
  // ---------------------------------------------------------------------------
  function init() {
    if (!isConfigured()) {
      setStatus({ state: 'unconfigured' });
      console.info('[CloudSync] Firebase no configurat. Omple FIREBASE_CONFIG a cloudsync.js.');
      return;
    }
    if (!firebaseLoaded()) {
      setStatus({ state: 'unavailable' });
      console.warn('[CloudSync] SDK de Firebase no carregat (sense connexió?).');
      return;
    }
    try {
      app = firebase.initializeApp(FIREBASE_CONFIG);
      auth = firebase.auth();
      db = firebase.firestore();
      // IMPORTANT: per defecte Firestore es connecta amb WebChannel, que en alguns
      // navegadors d'escriptori (típic en Chromebooks, xarxes corporatives, proxies
      // o amb certes extensions) queda BLOQUEJAT i les peticions no resolen mai →
      // l'app es queda eternament "Sincronitzant…". Activant la detecció automàtica
      // de long-polling, Firestore canvia a HTTP normal quan detecta el problema,
      // cosa que ho soluciona sense penalitzar els entorns on WebChannel sí funciona
      // (com els mòbils). Cal cridar settings() ABANS de qualsevol altra operació.
      try {
        db.settings({ experimentalAutoDetectLongPolling: true, merge: true });
      } catch (e) { console.warn('[CloudSync] settings()', e); }
      try {
        db.enablePersistence({ synchronizeTabs: true }).catch(function () {});
      } catch (e) {}

      // Recupera el resultat d'un inici de sessió per redirecció (mòbil) i detecta
      // si la redirecció ha tornat SENSE completar la sessió (cas típic a mòbil per
      // bloqueig de cookies/emmagatzematge de tercers), per avisar l'usuari.
      const hadPendingRedirect = (function () { try { return !!localStorage.getItem(REDIRECT_FLAG_KEY); } catch (e) { return false; } })();
      auth.getRedirectResult().then(function (result) {
        if (result && result.user) {
          // onAuthStateChanged ja s'encarrega de la resta (i neteja el flag).
          return;
        }
        // Sense usuari del redirect: si n'esperàvem un, avisa de manera accionable.
        if (hadPendingRedirect && !auth.currentUser) {
          try { localStorage.removeItem(REDIRECT_FLAG_KEY); } catch (e) {}
          setStatus({
            state: 'error',
            error: 'No s\'ha pogut completar l\'inici de sessió en tornar de Google. ' +
                   'És possible que el navegador estigui bloquejant les cookies/emmagatzematge ' +
                   'de tercers. Prova-ho amb el navegador normal (no en mode incògnit), permet-hi ' +
                   'les cookies, o inicia sessió des d\'un ordinador.'
          });
        }
      }).catch(function (e) {
        try { localStorage.removeItem(REDIRECT_FLAG_KEY); } catch (e2) {}
        if (e && e.code) {
          console.warn('[CloudSync] redirect result error', e);
          if (!currentUser) setStatus({ state: 'error', error: friendlyAuthError(e) });
        }
      });

      auth.onAuthStateChanged(function (user) {
        if (user) handleSignedIn(user);
        else handleSignedOut();
      });

      // Flush-on-exit: puja les dades pendents en amagar o tancar la pestanya, en
      // comptes d'escriure durant el joc a cada desat. Així una sessió sencera es
      // resol en poques escriptures. Firestore encua l'escriptura localment
      // (persistència) i la sincronitza encara que la pàgina es tanqui.
      try {
        document.addEventListener('visibilitychange', function () {
          if (document.visibilityState === 'hidden') flushPendingPush();
          else if (document.visibilityState === 'visible') pullOnFocus();
        });
        window.addEventListener('pagehide', function () { flushPendingPush(); });
      } catch (e) {}
    } catch (e) {
      console.warn('[CloudSync] init error', e);
      setStatus({ state: 'error', error: e && e.message ? e.message : 'Error d\'inicialització' });
    }
  }

  // ---------------------------------------------------------------------------
  //  API pública
  // ---------------------------------------------------------------------------
  window.CloudSync = {
    init: init,
    signIn: signIn,
    switchAccount: switchAccount,
    syncNow: syncNow,
    // El crida saveStorage() de app.js cada cop que es desen dades locals.
    onLocalSave: function () { schedulePush(); },
    // El crida app.js després d'un esdeveniment valuós (final de partida, error
    // resolt) perquè es pugi de seguida, sense esperar el debounce llarg.
    flushSoon: function () { flushSoon(); },
    isConfigured: isConfigured,
    isSignedIn: function () { return !!currentUser; },
    getEmail: function () { return currentUser ? (currentUser.email || currentUser.displayName || null) : null; },
    getStatus: function () { return Object.assign({}, status, { configured: isConfigured() }); }
  };

  // Arrenca quan el DOM estigui a punt (i Firebase ja carregat als <script>).
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
