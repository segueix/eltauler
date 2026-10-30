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
 * Sincronització MANUAL: només «Sincronitza ara» llegeix i escriu les dades.
 * Una transacció llegeix el servidor, fusiona el progrés i confirma la pujada
 * abans de mostrar l'èxit. Obrir l'app, recuperar el focus o desar una jugada
 * no inicia cap transferència. Les partides sense rellotge es fusionen per id.
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
  const SYNC_TIMEOUT_MS = 20000;

  // Claus locals (mai no es sincronitzen): metadades del propi sync.
  const LOCAL_META_PREFIX = 'eltauler_cloud_';
  const DEVICE_ID_KEY = LOCAL_META_PREFIX + 'deviceId';
  const LAST_CHANGE_KEY = LOCAL_META_PREFIX + 'lastChangeAt';
  const LAST_SYNCED_KEY = LOCAL_META_PREFIX + 'lastSyncedAt';
  const REDIRECT_FLAG_KEY = LOCAL_META_PREFIX + 'redirectPending';
  const BASELINE_KEY = LOCAL_META_PREFIX + 'syncBaseline';

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
  let reconciled = false;
  let manualSyncPromise = null;
  let syncEpoch = 0;
  let pendingResult = null;
  let deferApplyTimer = null;
  let lastObservedHash = null;
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

  // Hash barat i estable d'una instantània (ordena les claus). Distingeix els
  // canvis locals pendents de l'estat que ja s'ha compartit amb el servidor.
  function snapshotHash(data) {
    const keys = Object.keys(data).sort();
    let h = 5381;
    for (let i = 0; i < keys.length; i++) {
      const s = keys[i] + '=' + data[keys[i]] + '\u0001';
      for (let j = 0; j < s.length; j++) h = ((h << 5) + h + s.charCodeAt(j)) | 0;
    }
    return String(h >>> 0);
  }

  // Un resum per clau de l'últim estat compartit permet distingir els canvis
  // locals reals de les dades velles d'un aparell que feia dies que no s'obria.
  function keyHashes(data) {
    const hashes = {};
    Object.keys(data).sort().forEach(function (k) { hashes[k] = snapshotHash({ value: data[k] }); });
    return hashes;
  }

  function readBaseline() {
    try {
      const saved = JSON.parse(localStorage.getItem(BASELINE_KEY) || 'null');
      return saved && currentUser && saved.uid === currentUser.uid ? saved.hashes : null;
    } catch (e) { return null; }
  }


  // Per sumar increments reals sense comptar dues vegades el mateix progrés,
  // guardem el valor que aquest aparell va compartir en l'últim clic. A i B
  // poden partir de 10: si A fa +2 i B fa +3, l'estat final és 15, no 13/25.
  // Sense base (primera sincronització antiga) no es poden saber increments
  // independents: triem el màxim, sense inventar sessions ni duplicar mèrits.
  const ROOT_COUNTERS = ['chess_totalGamesPlayed', 'chess_totalWins', 'chess_totalStars'];
  const GROWTH_COUNTERS = [
    'tasksRecommended', 'tasksStarted', 'tasksCompleted', 'personalErrorsConverted',
    'srsCompleted', 'weaknessSessionsCompleted', 'openingDrillsCompleted',
    'mateDrillsCompleted', 'triaTestsCompleted', 'openingHieroCompleted',
    'timedGamesPlayed', 'antidoteGamesPlayed', 'positionalGamesPlayed'
  ];
  const SESSION_COUNTERS = [
    'gamesPlayed', 'gamesWon', 'bundlesSolved', 'bundlesSolvedLow',
    'bundlesSolvedMed', 'bundlesSolvedHigh', 'blackWins', 'leagueGamesPlayed',
    'freeGamesPlayed', 'timedGamesPlayed', 'timedGamesWon', 'antidoteGamesPlayed',
    'antidoteGamesWon', 'positionalGamesPlayed', 'triaTests', 'hieroSolved',
    'openingHieroSolved'
  ];
  const OBJECT_COUNTERS = {
    'chess_growthStats': GROWTH_COUNTERS,
    'chess_tacticsStats': ['solved', 'attempts'],
    'eltauler_hieroglyphic_stats': ['solved', 'personalSolved'],
    'chess_antidoteProgress': ['games', 'passed', 'partial', 'failed', 'total'],
    'chess_sessionStats': SESSION_COUNTERS
  };
  const TIME_CONTROL_COUNTERS = ['games', 'wins', 'draws', 'losses'];
  const ANTI_THEME_COUNTERS = ['total', 'passed', 'partial', 'failed'];
  function parseCounterJson(raw) {
    try { const val = JSON.parse(raw); return val && typeof val === 'object' && !Array.isArray(val) ? val : {}; }
    catch (e) { return {}; }
  }
  function counterNumber(n) {
    const v = typeof n === 'number' ? n : (typeof n === 'string' && n.trim() ? Number(n) : NaN);
    return Number.isSafeInteger(v) && v >= 0 ? v : null;
  }
  function counterSnapshot(data) {
    const out = {};
    const add = (name, value) => {
      const n = counterNumber(value);
      if (n !== null) out[name] = n;
    };
    ROOT_COUNTERS.forEach(k => add(k, data[k]));
    Object.keys(OBJECT_COUNTERS).forEach(k => {
      const o = parseCounterJson(data[k]);
      OBJECT_COUNTERS[k].forEach(field => add(k + '|' + field, o[field]));
    });
    const t = parseCounterJson(data['chess_timeControlElos']);
    Object.keys(t).forEach(tc => {
      if (!t[tc] || typeof t[tc] !== 'object') return;
      TIME_CONTROL_COUNTERS.forEach(field => add('chess_timeControlElos|' + tc + '|' + field, t[tc][field]));
    });
    const hg = parseCounterJson(data['eltauler_hieroglyphic_stats']);
    const themes = hg.themes && typeof hg.themes === 'object' ? hg.themes : {};
    Object.keys(themes).forEach(theme => add('eltauler_hieroglyphic_stats|themes|' + theme, themes[theme]));
    const tria = parseCounterJson(data['chess_triaProgress']);
    const triaEntries = tria.entries && typeof tria.entries === 'object' ? tria.entries : {};
    Object.keys(triaEntries).forEach(id => {
      if (!triaEntries[id] || typeof triaEntries[id] !== 'object') return;
      ['attempts', 'wrong'].forEach(field => add('chess_triaProgress|entries|' + id + '|' + field, triaEntries[id][field]));
    });
    const ant = parseCounterJson(data['chess_antidoteProgress']);
    const antThemes = ant.themes && typeof ant.themes === 'object' ? ant.themes : {};
    Object.keys(antThemes).forEach(theme => {
      const stats = antThemes[theme] || {};
      ANTI_THEME_COUNTERS.forEach(field => add('chess_antidoteProgress|themes|' + theme + '|' + field, stats[field]));
    });
    return out;
  }
  function readCounterBaseline() {
    try {
      const saved = JSON.parse(localStorage.getItem(BASELINE_KEY) || 'null');
      return saved && currentUser && saved.uid === currentUser.uid &&
        saved.counters && typeof saved.counters === 'object' ? saved.counters : {};
    } catch (e) { return {}; }
  }
  function setMergedCounter(merged, key, value) {
    const parts = key.split('|');
    if (parts.length === 1) { merged[key] = String(value); return; }
    const storageKey = parts.shift();
    const obj = parseCounterJson(merged[storageKey]);
    let current = obj;
    while (parts.length > 1) {
      const field = parts.shift();
      current[field] = current[field] && typeof current[field] === 'object'
        ? Object.assign({}, current[field]) : {};
      current = current[field];
    }
    current[parts[0]] = value;
    merged[storageKey] = JSON.stringify(obj);
  }
  function mergeCounterProgress(local, cloud, merged, base) {
    const left = counterSnapshot(local), right = counterSnapshot(cloud);
    const keys = new Set(Object.keys(left).concat(Object.keys(right)));
    const localDay = local['chess_sessionStatsDate'], cloudDay = cloud['chess_sessionStatsDate'];
    if (localDay && cloudDay && localDay !== cloudDay) {
      const fromLocal = localDay > cloudDay;
      merged['chess_sessionStatsDate'] = fromLocal ? localDay : cloudDay;
      merged['chess_sessionStats'] = fromLocal ? local['chess_sessionStats'] : cloud['chess_sessionStats'];
    }
    keys.forEach(path => {
      if (path.startsWith('chess_sessionStats|') &&
          localDay !== cloudDay && (localDay || cloudDay)) return;
      const a = left[path], b = right[path], initial = base && base[path];
      if (a === undefined && b === undefined) return;
      if (a === undefined) { setMergedCounter(merged, path, b); return; }
      if (b === undefined) { setMergedCounter(merged, path, a); return; }
      const value = initial === undefined ? Math.max(a, b)
        : b + Math.max(0, a - initial);
      setMergedCounter(merged, path, Math.min(Number.MAX_SAFE_INTEGER, value));
    });
    // Valors que descriuen màxims i no fets independents: MAI no se sumen.
    for (const [key, fields] of Object.entries({
      'chess_tacticsStats': ['best'],
      'eltauler_hieroglyphic_stats': ['bestStreak']
    })) {
      const a = parseCounterJson(local[key]), b = parseCounterJson(cloud[key]);
      fields.forEach(field => {
        const x = counterNumber(a[field]), y = counterNumber(b[field]);
        if (x !== null || y !== null)
          setMergedCounter(merged, key + '|' + field, Math.max(x || 0, y || 0));
      });
    }
    const a = parseCounterJson(local['chess_sessionStats']);
    const b = parseCounterJson(cloud['chess_sessionStats']);
    if (localDay && localDay === cloudDay) {
      const precision = Object.assign({}, b.bestPrecisionByTc || {});
      Object.keys(a.bestPrecisionByTc || {}).forEach(k => {
        precision[k] = Math.max(Number(precision[k]) || 0, Number(a.bestPrecisionByTc[k]) || 0);
      });
      const obj = parseCounterJson(merged['chess_sessionStats']);
      obj.bestPrecisionByTc = precision;
      merged['chess_sessionStats'] = JSON.stringify(obj);
    }
    const antL = parseCounterJson(local['chess_antidoteProgress']);
    const antC = parseCounterJson(cloud['chess_antidoteProgress']);
    if (Array.isArray(antL.seenTestIds) || Array.isArray(antC.seenTestIds)) {
      const obj = parseCounterJson(merged['chess_antidoteProgress']);
      obj.seenTestIds = Array.from(new Set((antC.seenTestIds || []).concat(antL.seenTestIds || []))).slice(-400);
      merged['chess_antidoteProgress'] = JSON.stringify(obj);
    }
  }

  function mergeForManualSync(local, cloudDoc) {
    const cloud = cloudDoc && cloudDoc.data && typeof cloudDoc.data === 'object' ? cloudDoc.data : {};
    const baseline = readBaseline();
    let preferred = Object.assign({}, cloud);
    if (!cloudDoc) {
      preferred = Object.assign({}, local);
    } else if (baseline) {
      const hashes = keyHashes(local);
      new Set(Object.keys(baseline).concat(Object.keys(local))).forEach(function (k) {
        if (hashes[k] === baseline[k]) return; // intacte aquí: preval el servidor
        if (Object.prototype.hasOwnProperty.call(local, k)) preferred[k] = local[k];
        else delete preferred[k];
      });
    } else if ((getLocalChangeAt() || 0) > (cloudDoc.updatedAt || 0)) {
      // Migració d'aparells sense resum de l'últim sync: manté la preferència
      // temporal anterior, però no elimina claus que encara no coneixien.
      preferred = Object.assign(preferred, local);
    }
    const core = window.ElTaulerCore;
    if (!core || typeof core.mergeSyncSnapshots !== 'function') throw new Error('Recarrega la pàgina abans de sincronitzar.');
    const combined = core.mergeSyncSnapshots(local, core.mergeSyncSnapshots(cloud, preferred));
    // El nucli uneix historials; aquí afegim només el progrés nou des de
    // l'última base compartida (l'Elo i les preferències continuen sent valors).
    mergeCounterProgress(local, cloud, combined, readCounterBaseline());
    return combined;
  }

  // Conserva també qualsevol canvi fet DURANT la petició (p. ex. una partida
  // nova). Queda pendent per al següent clic, mai desapareix en aplicar el resultat.
  function includeChangesDuringSync(before, latest, shared) {
    const next = Object.assign({}, shared);
    new Set(Object.keys(before).concat(Object.keys(latest))).forEach(function (k) {
      if (before[k] === latest[k]) return;
      if (Object.prototype.hasOwnProperty.call(latest, k)) next[k] = latest[k];
      else delete next[k];
    });
    const merged = window.ElTaulerCore.mergeSyncSnapshots(latest,
      window.ElTaulerCore.mergeSyncSnapshots(shared, next));
    // Si una partida incrementa estadístiques MENTRE s'està pujant, conserva
    // l'increment local com a pendent; no torna a enviar-lo automàticament.
    mergeCounterProgress(latest, shared, merged, counterSnapshot(before));
    return merged;
  }

  function applySnapshot(data) {
    const before = collectSnapshot();
    try {
      Object.keys(data).forEach(function (k) { if (isSyncableKey(k)) localStorage.setItem(k, data[k]); });
      Object.keys(before).forEach(function (k) { if (!(k in data)) localStorage.removeItem(k); });
    } catch (e) {
      // Si el navegador rebutja el desat, restaura la còpia local i no anuncia
      // una sincronització completada a mitges.
      Object.keys(data).forEach(function (k) {
        if (isSyncableKey(k) && !(k in before)) { try { localStorage.removeItem(k); } catch (ignore) {} }
      });
      Object.keys(before).forEach(function (k) { try { localStorage.setItem(k, before[k]); } catch (ignore) {} });
      throw new Error('No s’han pogut desar les dades en aquest navegador. Allibera espai i torna a sincronitzar.');
    }
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

  // La sessió ja ha contrastat l'estat amb el servidor (i, si el núvol era més
  // nou, l'ha incorporat). L'app pot resoldre venciments per temps amb dades
  // al dia; aquests nous canvis queden pendents del següent clic manual.
  function setReconciled() {
    if (reconciled) return;
    reconciled = true;
    // L'app pot convertir venciments reals en fets i desar-los localment.
    if (typeof window.onCloudSyncSettled === 'function') {
      try { window.onCloudSyncSettled(); } catch (e) {}
    }
  }

  // ¿Pot l'app fiar-se de l'estat local per resoldre fets guiats pel rellotge
  // (derrota per temps d'una diària, ratxa a zero)? Sense núvol (no
  // configurat, sense Firebase o sense sessió), el dispositiu és l'única font
  // de veritat; amb sessió, només després de conciliar amb el servidor.
  function isSettled() {
    if (!isConfigured() || !firebaseLoaded()) return true;
    if (currentUser) return reconciled;
    // Sense usuari: definitiu quan sabem del cert que no hi ha sessió; mentre
    // l'autenticació inicial encara es resol ('init'), val més esperar.
    return status.state !== 'init' && status.state !== 'syncing';
  }

  // ---------------------------------------------------------------------------
  //  Firestore: sincronització explícita i bidireccional
  // ---------------------------------------------------------------------------
  function docRef() {
    if (!db || !currentUser) return null;
    return db.collection(FIRESTORE_COLLECTION).doc(currentUser.uid);
  }

  function cancelPendingApply() {
    if (deferApplyTimer) clearInterval(deferApplyTimer);
    deferApplyTimer = null;
    pendingResult = null;
  }

  function noteLocalChange() {
    const hash = snapshotHash(collectSnapshot());
    if (hash === lastObservedHash) return;
    lastObservedHash = hash;
    setLocalChangeAt(Date.now());
    if (currentUser && !manualSyncPromise && !pendingResult) setStatus({ state: 'pending', error: null });
  }

  function applyManualResult(result, epoch) {
    if (epoch !== syncEpoch || !currentUser) return false;
    if (!isSafeToApply()) {
      pendingResult = { result: result, epoch: epoch };
      setStatus({ state: 'waiting', error: null });
      if (!deferApplyTimer) {
        deferApplyTimer = setInterval(function () {
          if (!pendingResult || !isSafeToApply()) return;
          const pending = pendingResult;
          cancelPendingApply();
          try { applyManualResult(pending.result, pending.epoch); }
          catch (e) { setStatus({ state: 'error', error: e.message }); }
        }, 400);
      }
      return false;
    }
    const effective = includeChangesDuringSync(result.local, collectSnapshot(), result.data);
    applySnapshot(effective);
    localStorage.setItem(BASELINE_KEY, JSON.stringify({
      uid: currentUser.uid, hashes: keyHashes(result.data), counters: counterSnapshot(result.data)
    }));
    lastObservedHash = snapshotHash(effective);
    setLastSyncedAt(result.updatedAt);
    setLocalChangeAt(result.updatedAt);
    // La recàrrega de l'app encara no pot aplicar venciments sobre dades velles.
    reloadApp();
    setReconciled();
    const unchanged = snapshotHash(collectSnapshot()) === snapshotHash(result.data);
    setStatus({ state: unchanged ? 'synced' : 'pending', error: null });
    if (typeof window.onCloudSyncReady === 'function') {
      try { window.onCloudSyncReady(currentUser.email || currentUser.displayName || ''); } catch (e) {}
    }
    return true;
  }

  function handleSignedIn(user) {
    currentUser = user;
    syncEpoch++;
    manualSyncPromise = null;
    reconciled = false;
    cancelPendingApply();
    lastObservedHash = snapshotHash(collectSnapshot());
    try { localStorage.removeItem(REDIRECT_FLAG_KEY); } catch (e) {}
    setStatus({ state: 'connected', email: user.email || user.displayName || 'Connectat', error: null,
      lastSyncedAt: Number(localStorage.getItem(LAST_SYNCED_KEY)) || 0 });
    if (typeof window.onCloudSignedIn === 'function') {
      try { window.onCloudSignedIn(user.email || user.displayName || ''); } catch (e) {}
    }
    // Cap get(), subscripció, pujada ni sincronització en recuperar la sessió.
  }

  function handleSignedOut() {
    currentUser = null;
    syncEpoch++;
    manualSyncPromise = null;
    reconciled = false;
    cancelPendingApply();
    setStatus({ state: 'signedout', email: null, error: null });
    if (typeof window.onCloudSyncSettled === 'function') {
      try { window.onCloudSyncSettled(); } catch (e) {}
    }
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
        setStatus({ state: currentUser ? 'connected' : 'signedout' });
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
    if (!currentUser) { signIn(); return Promise.resolve(false); }
    if (manualSyncPromise) return manualSyncPromise;
    if (!isSafeToApply()) {
      setStatus({ state: 'error', error: 'Torna a la portada per desar la partida i sincronitzar les dades.' });
      return Promise.resolve(false);
    }
    if (pendingResult) {
      const pending = pendingResult;
      cancelPendingApply();
      try { return Promise.resolve(applyManualResult(pending.result, pending.epoch)); }
      catch (e) { setStatus({ state: 'error', error: e.message }); return Promise.resolve(false); }
    }
    try { if (typeof window.prepareCloudSync === 'function') window.prepareCloudSync(); }
    catch (e) { setStatus({ state: 'error', error: e.message }); return Promise.resolve(false); }
    const ref = docRef();
    const epoch = ++syncEpoch;
    const uid = currentUser.uid;
    setStatus({ state: 'syncing', error: null });
    let timeout;
    let timedOut = false;
    // Les transaccions no s'encuen fora de línia: si el servidor no confirma,
    // no es marca «Sincronitzat» ni es fa una pujada sorpresa en tornar a obrir.
    const operation = Promise.resolve().then(function () { return db.runTransaction(async function (transaction) {
      const snap = await transaction.get(ref);
      if (epoch !== syncEpoch) throw new Error('Sincronització cancel·lada. Torna-ho a provar.');
      const local = collectSnapshot();
      const cloudDoc = snap.exists ? snap.data() : null;
      const data = mergeForManualSync(local, cloudDoc);
      const updatedAt = Math.max(Date.now(), Number(cloudDoc && cloudDoc.updatedAt) || 0);
      transaction.set(ref, { data: data, updatedAt: updatedAt, deviceId: getDeviceId(), app: 'eltauler' });
      return { data: data, updatedAt: updatedAt, local: local };
    }); });
    const deadline = new Promise(function (_, reject) {
      timeout = setTimeout(function () {
        if (epoch === syncEpoch) { timedOut = true; syncEpoch++; }
        reject(new Error('No s’ha pogut confirmar la sincronització. Comprova la connexió i prem «Sincronitza ara» de nou.'));
      }, SYNC_TIMEOUT_MS);
    });
    const pending = Promise.race([operation, deadline]).then(function (result) {
      if (epoch !== syncEpoch) return false;
      return applyManualResult(result, epoch);
    }).catch(function (e) {
      if (currentUser && currentUser.uid === uid && (epoch === syncEpoch || (timedOut && epoch + 1 === syncEpoch))) {
        console.warn('[CloudSync] manual sync', e);
        setStatus({ state: 'error', error: e && e.message ? e.message : 'No s’ha pogut sincronitzar. Torna-ho a provar.' });
      }
      return false;
    }).finally(function () {
      clearTimeout(timeout);
      if (manualSyncPromise === pending) manualSyncPromise = null;
    });
    manualSyncPromise = pending;
    return manualSyncPromise;
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
      // Les dades es desen localment a l'app; el sync usa transaccions de
      // servidor i no activa cap cua persistent de pujades automàtiques.
      lastObservedHash = snapshotHash(collectSnapshot());

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
    // Les crides antigues de desat només marquen canvis pendents. Cap d'elles
    // transfereix dades: totes les pujades/baixades passen per syncNow().
    onLocalSave: noteLocalChange,
    flushSoon: noteLocalChange,
    isConfigured: isConfigured,
    // ¿Pot l'app fiar-se de l'estat local per resoldre fets guiats pel
    // rellotge (venciments de diàries, ratxa a zero)? Vegeu isSettled().
    isSettled: isSettled,
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
