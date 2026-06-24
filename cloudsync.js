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
  const PUSH_DEBOUNCE_MS = 2500;

  // Claus locals (mai no es sincronitzen): metadades del propi sync.
  const LOCAL_META_PREFIX = 'eltauler_cloud_';
  const DEVICE_ID_KEY = LOCAL_META_PREFIX + 'deviceId';
  const LAST_CHANGE_KEY = LOCAL_META_PREFIX + 'lastChangeAt';
  const LAST_SYNCED_KEY = LOCAL_META_PREFIX + 'lastSyncedAt';

  // Claus concretes que mai no volem pujar al núvol.
  const EXCLUDE_KEYS = new Set();
  if (!SYNC_OPENAI_KEY) EXCLUDE_KEYS.add('chess_openai_api_key');

  // ---------------------------------------------------------------------------
  //  Estat del mòdul
  // ---------------------------------------------------------------------------
  let app = null;
  let auth = null;
  let db = null;
  let currentUser = null;
  let docUnsub = null;
  let pushTimer = null;
  let pushInFlight = false;
  let pendingCloudData = null;       // dades del núvol esperant a aplicar-se
  let deferApplyTimer = null;
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

  // ¿El dispositiu té dades de joc reals (no només configuració buida)?
  function hasMeaningfulLocalData() {
    const elo = localStorage.getItem('chess_userELO');
    const games = localStorage.getItem('chess_gameHistory');
    const errors = localStorage.getItem('chess_savedErrors');
    if (elo && parseInt(elo, 10) > 50) return true;
    try { if (games && JSON.parse(games).length > 0) return true; } catch (e) {}
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

  function pushSnapshot() {
    const ref = docRef();
    if (!ref) return Promise.resolve();
    const ts = Date.now();
    const payload = {
      data: collectSnapshot(),
      updatedAt: ts,
      deviceId: getDeviceId(),
      app: 'eltauler'
    };
    pushInFlight = true;
    setStatus({ state: 'syncing' });
    return ref.set(payload).then(function () {
      setLocalChangeAt(ts);
      setLastSyncedAt(ts);
      pushInFlight = false;
      setStatus({ state: 'synced', error: null });
    }).catch(function (e) {
      pushInFlight = false;
      console.warn('[CloudSync] push error', e);
      setStatus({ state: 'error', error: e && e.message ? e.message : 'Error de pujada' });
    });
  }

  function schedulePush() {
    if (!currentUser) return;
    setLocalChangeAt(Date.now());
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(function () {
      pushTimer = null;
      pushSnapshot();
    }, PUSH_DEBOUNCE_MS);
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
  function handleSignedIn(user) {
    currentUser = user;
    setStatus({ state: 'syncing', email: user.email || user.displayName || 'Connectat' });
    const ref = docRef();
    if (!ref) return;
    ref.get().then(function (snap) {
      const cloudDoc = snap.exists ? snap.data() : null;
      return reconcileInitial(cloudDoc);
    }).then(function () {
      subscribeRealtime();
    }).catch(function (e) {
      console.warn('[CloudSync] sign-in sync error', e);
      setStatus({ state: 'error', error: e && e.message ? e.message : 'Error de sincronització' });
    });
  }

  function handleSignedOut() {
    currentUser = null;
    if (docUnsub) { docUnsub(); docUnsub = null; }
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    setStatus({ state: 'signedout', email: null });
  }

  function signIn() {
    if (!auth) { setStatus({ state: 'error', error: 'Firebase no inicialitzat' }); return; }
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(function (e) {
      // En molts mòbils/PWA el popup es bloqueja → prova amb redirecció.
      if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment' || e.code === 'auth/cancelled-popup-request')) {
        auth.signInWithRedirect(provider).catch(function (e2) {
          console.warn('[CloudSync] redirect sign-in error', e2);
          setStatus({ state: 'error', error: e2 && e2.message ? e2.message : 'Error d\'inici de sessió' });
        });
      } else if (e && e.code === 'auth/popup-closed-by-user') {
        // L'usuari ha tancat la finestra; no és un error real.
        setStatus({ state: currentUser ? 'synced' : 'signedout' });
      } else {
        console.warn('[CloudSync] sign-in error', e);
        setStatus({ state: 'error', error: e && e.message ? e.message : 'Error d\'inici de sessió' });
      }
    });
  }

  function signOut() {
    if (!auth) return;
    auth.signOut().catch(function (e) { console.warn('[CloudSync] sign-out error', e); });
  }

  function syncNow() {
    if (!currentUser) { signIn(); return; }
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    pushSnapshot();
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
      try {
        db.enablePersistence({ synchronizeTabs: true }).catch(function () {});
      } catch (e) {}

      // Recupera el resultat d'un inici de sessió per redirecció (mòbil).
      auth.getRedirectResult().catch(function (e) {
        if (e && e.code) console.warn('[CloudSync] redirect result error', e);
      });

      auth.onAuthStateChanged(function (user) {
        if (user) handleSignedIn(user);
        else handleSignedOut();
      });
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
    signOut: signOut,
    syncNow: syncNow,
    // El crida saveStorage() de app.js cada cop que es desen dades locals.
    onLocalSave: function () { schedulePush(); },
    isConfigured: isConfigured,
    isSignedIn: function () { return !!currentUser; },
    getStatus: function () { return Object.assign({}, status, { configured: isConfigured() }); }
  };

  // Arrenca quan el DOM estigui a punt (i Firebase ja carregat als <script>).
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
