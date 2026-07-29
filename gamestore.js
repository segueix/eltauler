// ============================================================================
// gamestore.js — Historial de partides en DOS NIVELLS
// ============================================================================
// Una entrada de l'historial té dues meitats de mida molt diferent:
//
//   · ÍNDEX (lleuger, ~1-2 KB): qui, quan, com va acabar, les jugades, la
//     precisió, el moment clau i les estadístiques per fase. És el que
//     necessiten les estadístiques d'obertura, el bessó, el diagnòstic de
//     l'entrenador i la llista de l'historial. Viu al localStorage i, per tant,
//     viatja amb la sincronització del compte.
//
//   · COS (pesat, desenes de KB): les revisions jugada a jugada amb les seves
//     línies alternatives, les errades i la ressenya d'IA. Només cal quan
//     s'obre AQUELLA partida. Viu a IndexedDB i NO se sincronitza.
//
// El motiu és la quota: cloudsync.js puja tot el localStorage com un sol
// document de Firestore, i Firestore limita cada document a 1 MiB. Amb els
// cossos a dins, una desena de partides llargues ja s'hi acostava; amb només
// l'índex, dues-centes partides ocupen una fracció d'aquell límit.
//
// Si IndexedDB no està disponible (algun mode privat, permisos denegats), hi ha
// una xarxa de seguretat acotada al localStorage amb els últims cossos, sota una
// clau EXCLOSA de la sincronització.
//
// Es carrega com a:
//   - Navegador: <script src="gamestore.js"> → window.ElTaulerGameStore
//   - Node/Jest: require('./gamestore') → module.exports
// ============================================================================
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    } else {
        root.ElTaulerGameStore = api;
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // Camps PESATS d'una entrada. Tot el que no sigui aquí és índex.
    const HEAVY_FIELDS = ['moveReviews', 'errors', 'severeErrors', 'review', 'aiReview'];

    // Forma buida de cada camp pesat: en hidratar una entrada sense cos, s'hi
    // posa això perquè els consumidors trobin sempre el tipus que esperen.
    const EMPTY_BODY = {
        moveReviews: [],
        errors: [],
        severeErrors: [],
        review: [],
        aiReview: null
    };

    const DB_NAME = 'eltauler_games';
    const DB_VERSION = 1;
    const STORE_NAME = 'bodies';

    // Xarxa de seguretat quan IndexedDB no hi és. Clau EXCLOSA de la
    // sincronització (vegeu EXCLUDE_KEYS a cloudsync.js) i doblement acotada:
    // per nombre de partides i per mida, perquè mai no infli el localStorage.
    const FALLBACK_KEY = 'chess_gameBodies';
    const FALLBACK_MAX_ENTRIES = 3;
    const FALLBACK_MAX_BYTES = 400 * 1024;

    // ------------------------------------------------------------------
    //  Part PURA (sense IndexedDB ni DOM): és la que proven els tests
    // ------------------------------------------------------------------

    // ¿Aquest valor aporta res? Un camp pesat present però buit (p. ex. una
    // partida importada encara sense analitzar) no fa que calgui desar cap cos.
    function hasContent(value) {
        if (value === null || typeof value === 'undefined') return false;
        if (Array.isArray(value)) return value.length > 0;
        if (typeof value === 'string') return value.trim() !== '';
        if (typeof value === 'object') return Object.keys(value).length > 0;
        return true;
    }

    // Parteix una entrada en índex + cos. L'índex hi afegeix dos resums que
    // permeten respondre sense el cos les preguntes que es fan a la llista:
    // si hi ha cos desat (hasBody) i quantes jugades es van revisar
    // (reviewedMoves, el que distingeix una partida analitzada d'una que no).
    function splitEntry(entry) {
        if (!entry || typeof entry !== 'object') return { index: entry, body: null };
        const index = {};
        Object.keys(entry).forEach(function (key) {
            if (HEAVY_FIELDS.indexOf(key) === -1) index[key] = entry[key];
        });
        const body = {};
        let bodyHasContent = false;
        let carriesBody = false;
        HEAVY_FIELDS.forEach(function (key) {
            if (!(key in entry)) return;
            carriesBody = true;
            body[key] = entry[key];
            if (hasContent(entry[key])) bodyHasContent = true;
        });
        if (carriesBody) {
            // L'entrada porta el cos: els resums es recalculen del que hi ha.
            index.hasBody = bodyHasContent;
            index.reviewedMoves = Array.isArray(entry.moveReviews) ? entry.moveReviews.length : 0;
        } else {
            // L'entrada és només índex: es conserven els resums que ja duia.
            index.hasBody = !!entry.hasBody;
            index.reviewedMoves = Number(entry.reviewedMoves) || 0;
        }
        return { index: index, body: bodyHasContent ? body : null };
    }

    // Enganxa un cos (o la seva forma buida) a una entrada, in situ.
    function attachBody(entry, body) {
        if (!entry || typeof entry !== 'object') return entry;
        const source = body && typeof body === 'object' ? body : null;
        HEAVY_FIELDS.forEach(function (key) {
            if (source && typeof source[key] !== 'undefined') entry[key] = source[key];
            else if (Array.isArray(EMPTY_BODY[key])) entry[key] = [];
            else entry[key] = EMPTY_BODY[key];
        });
        entry.hasBody = !!(source && HEAVY_FIELDS.some(function (k) { return hasContent(source[k]); }));
        entry.reviewedMoves = Array.isArray(entry.moveReviews) ? entry.moveReviews.length : 0;
        return entry;
    }

    // Treu el cos de la MEMÒRIA d'una entrada (el disc no es toca): els resums
    // hi queden, de manera que la llista i les estadístiques segueixen servides.
    function shedBody(entry) {
        if (!entry || typeof entry !== 'object') return entry;
        const index = splitEntry(entry).index;
        HEAVY_FIELDS.forEach(function (key) { delete entry[key]; });
        entry.hasBody = index.hasBody;
        entry.reviewedMoves = index.reviewedMoves;
        return entry;
    }

    // ¿Es pot llegir el cos d'aquesta entrada ara mateix? Ho és tant si el porta
    // carregat com si consta que no en té cap: en tots dos casos, mirar-ne els
    // camps pesats dona la resposta correcta.
    function isHydrated(entry) {
        if (!entry || typeof entry !== 'object') return true;
        if (!entry.hasBody) return true;
        return HEAVY_FIELDS.some(function (key) { return hasContent(entry[key]); });
    }

    // Nombre de jugades revisades d'una entrada, tingui el cos carregat o no.
    function reviewCount(entry) {
        if (!entry || typeof entry !== 'object') return 0;
        if (Array.isArray(entry.moveReviews) && entry.moveReviews.length) return entry.moveReviews.length;
        return Number(entry.reviewedMoves) || 0;
    }

    // Llista llesta per desar al localStorage: només índexs.
    function indexForStorage(list) {
        return (Array.isArray(list) ? list : []).map(function (entry) {
            return splitEntry(entry).index;
        });
    }

    // ------------------------------------------------------------------
    //  Xarxa de seguretat al localStorage (només si IndexedDB falla)
    // ------------------------------------------------------------------

    function localStore() {
        try {
            if (typeof localStorage === 'undefined' || !localStorage) return null;
            return localStorage;
        } catch (e) { return null; }
    }

    function readFallbackMap() {
        const ls = localStore();
        if (!ls) return {};
        try {
            const raw = ls.getItem(FALLBACK_KEY);
            const parsed = raw ? JSON.parse(raw) : null;
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (e) { return {}; }
    }

    function writeFallbackMap(map) {
        const ls = localStore();
        if (!ls) return false;
        try {
            if (!Object.keys(map).length) { ls.removeItem(FALLBACK_KEY); return true; }
            ls.setItem(FALLBACK_KEY, JSON.stringify(map));
            return true;
        } catch (e) {
            // Sense espai: val més quedar-se sense xarxa de seguretat que
            // impedir que es desi la resta del progrés.
            try { ls.removeItem(FALLBACK_KEY); } catch (e2) {}
            return false;
        }
    }

    function fallbackPut(id, body) {
        const map = readFallbackMap();
        delete map[id];              // reinsertar el porta al final (més recent)
        map[id] = body;
        const ids = Object.keys(map);
        while (ids.length > FALLBACK_MAX_ENTRIES) delete map[ids.shift()];
        while (ids.length > 1 && JSON.stringify(map).length > FALLBACK_MAX_BYTES) delete map[ids.shift()];
        if (ids.length === 1 && JSON.stringify(map).length > FALLBACK_MAX_BYTES) return false;
        return writeFallbackMap(map);
    }

    function fallbackGet(id) {
        const map = readFallbackMap();
        return Object.prototype.hasOwnProperty.call(map, id) ? map[id] : null;
    }

    function fallbackDelete(ids) {
        const map = readFallbackMap();
        let changed = false;
        (Array.isArray(ids) ? ids : [ids]).forEach(function (id) {
            if (Object.prototype.hasOwnProperty.call(map, id)) { delete map[id]; changed = true; }
        });
        if (changed) writeFallbackMap(map);
    }

    function fallbackKeepOnly(keepIds) {
        const keep = new Set((Array.isArray(keepIds) ? keepIds : []).map(String));
        const map = readFallbackMap();
        let changed = false;
        Object.keys(map).forEach(function (id) {
            if (!keep.has(id)) { delete map[id]; changed = true; }
        });
        if (changed) writeFallbackMap(map);
    }

    function fallbackClear() {
        const ls = localStore();
        if (!ls) return;
        try { ls.removeItem(FALLBACK_KEY); } catch (e) {}
    }

    // ------------------------------------------------------------------
    //  IndexedDB
    // ------------------------------------------------------------------

    let dbPromise = null;
    let idbUsable = null;   // null = encara no se sap; true/false = comprovat

    function idbFactory() {
        try {
            if (typeof indexedDB !== 'undefined' && indexedDB) return indexedDB;
        } catch (e) {}
        return null;
    }

    function openDb() {
        if (dbPromise) return dbPromise;
        const factory = idbFactory();
        if (!factory) { idbUsable = false; dbPromise = Promise.resolve(null); return dbPromise; }
        dbPromise = new Promise(function (resolve) {
            let request;
            try { request = factory.open(DB_NAME, DB_VERSION); }
            catch (e) { idbUsable = false; resolve(null); return; }
            request.onupgradeneeded = function () {
                const db = request.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
            };
            request.onsuccess = function () { idbUsable = true; resolve(request.result); };
            request.onerror = function () { idbUsable = false; resolve(null); };
            request.onblocked = function () { idbUsable = false; resolve(null); };
        });
        return dbPromise;
    }

    function requestPromise(request) {
        return new Promise(function (resolve, reject) {
            request.onsuccess = function () { resolve(request.result); };
            request.onerror = function () { reject(request.error || new Error('IndexedDB request error')); };
        });
    }

    // Executa `work(store)` dins una transacció. Retorna el que doni `work`, o
    // el símbol NO_DB si no hi ha IndexedDB (per distingir «no hi ha magatzem»
    // de «el magatzem ha respost que no hi ha res»).
    const NO_DB = { noDb: true };

    function withStore(mode, work) {
        return openDb().then(function (db) {
            if (!db) return NO_DB;
            return new Promise(function (resolve) {
                let transaction;
                try { transaction = db.transaction(STORE_NAME, mode); }
                catch (e) { resolve(NO_DB); return; }
                let outcome = NO_DB;
                let failed = false;
                Promise.resolve()
                    .then(function () { return work(transaction.objectStore(STORE_NAME)); })
                    .then(function (value) { outcome = value; })
                    .catch(function () { failed = true; });
                transaction.oncomplete = function () { resolve(failed ? NO_DB : outcome); };
                transaction.onerror = function () { resolve(NO_DB); };
                transaction.onabort = function () { resolve(NO_DB); };
            });
        }).catch(function () { return NO_DB; });
    }

    // ------------------------------------------------------------------
    //  API pública del magatzem
    // ------------------------------------------------------------------

    // Desa el cos d'una entrada. Si l'entrada no en té (partida sense analitzar),
    // s'esborra el que hi pogués haver, perquè no quedin cossos orfes.
    function putBody(id, body) {
        const key = String(id || '');
        if (!key) return Promise.resolve(false);
        if (!body) return deleteBody(key).then(function () { return true; });
        return withStore('readwrite', function (store) {
            return requestPromise(store.put(body, key)).then(function () { return true; });
        }).then(function (result) {
            if (result === true) { fallbackDelete(key); return true; }
            return fallbackPut(key, body);
        });
    }

    // Desa el cos que correspon a una entrada sencera (la parteix ella mateixa).
    function putEntry(entry) {
        if (!entry || !entry.id) return Promise.resolve(false);
        return putBody(entry.id, splitEntry(entry).body);
    }

    function getBody(id) {
        const key = String(id || '');
        if (!key) return Promise.resolve(null);
        return withStore('readonly', function (store) {
            return requestPromise(store.get(key));
        }).then(function (result) {
            if (result === NO_DB) return fallbackGet(key);
            return typeof result === 'undefined' ? null : result;
        });
    }

    // Carrega el cos d'una entrada i l'hi enganxa. Retorna true si l'entrada ha
    // quedat hidratada (encara que no tingués cos: també és una resposta).
    function hydrate(entry) {
        if (!entry || typeof entry !== 'object') return Promise.resolve(false);
        if (isHydrated(entry)) return Promise.resolve(true);
        return getBody(entry.id).then(function (body) {
            if (!body) {
                // No hi és: pot ser que el cos s'hagi perdut (sense IndexedDB) o
                // que mai no s'hagués desat. S'hi posa la forma buida perquè no
                // es torni a demanar a cada repintada.
                attachBody(entry, null);
                return true;
            }
            attachBody(entry, body);
            return true;
        }).catch(function () { return false; });
    }

    function deleteBody(id) {
        const key = String(id || '');
        if (!key) return Promise.resolve(false);
        fallbackDelete(key);
        return withStore('readwrite', function (store) {
            return requestPromise(store.delete(key)).then(function () { return true; });
        }).then(function (result) { return result === true; });
    }

    // Esborra els cossos de partides que ja no són a l'historial (partides
    // desplaçades pel límit, o esborrades a un altre dispositiu).
    function keepOnly(ids) {
        const keep = new Set((Array.isArray(ids) ? ids : []).map(String));
        fallbackKeepOnly(Array.from(keep));
        return withStore('readwrite', function (store) {
            return requestPromise(store.getAllKeys()).then(function (keys) {
                const stale = (keys || []).filter(function (k) { return !keep.has(String(k)); });
                stale.forEach(function (k) { try { store.delete(k); } catch (e) {} });
                return stale.length;
            });
        }).then(function (result) { return typeof result === 'number' ? result : 0; });
    }

    function clear() {
        fallbackClear();
        return withStore('readwrite', function (store) {
            return requestPromise(store.clear()).then(function () { return true; });
        }).then(function (result) { return result === true; });
    }

    // ¿Hi ha IndexedDB de debò? Serveix per avisar (una sola vegada) que els
    // cossos de les partides velles no es podran recuperar.
    function available() {
        return openDb().then(function (db) { return !!db; });
    }

    return {
        HEAVY_FIELDS: HEAVY_FIELDS,
        FALLBACK_KEY: FALLBACK_KEY,
        // pures
        splitEntry: splitEntry,
        attachBody: attachBody,
        shedBody: shedBody,
        isHydrated: isHydrated,
        reviewCount: reviewCount,
        indexForStorage: indexForStorage,
        // magatzem
        available: available,
        putBody: putBody,
        putEntry: putEntry,
        getBody: getBody,
        hydrate: hydrate,
        deleteBody: deleteBody,
        keepOnly: keepOnly,
        clear: clear,
        get idbUsable() { return idbUsable; }
    };
});
