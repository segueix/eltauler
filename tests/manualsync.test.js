const fs = require('fs');
const vm = require('vm');
const Core = require('../core');
const source = fs.readFileSync(require.resolve('../cloudsync.js'), 'utf8');
const GAMES = 'chess_untimedGames';
const REMOVED = 'chess_untimedGameRemovals';
const clone = value => JSON.parse(JSON.stringify(value));
const game = (id, moves = ['e4', 'e5'], extra = {}) => ({
    v: 1, id, mode: 'free', playerColor: 'w', clock: null, timeControlId: 'none',
    moves, savedAt: 1700000000000, revision: moves.length, ...extra
});
const ids = data => JSON.parse(data[GAMES] || '[]').map(g => g.id).sort();
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

// Dues instàncies reals de cloudsync.js, amb magatzems locals independents i
// un servidor compartit que reintenta la transacció si un altre aparell escriu.
function server(data) {
    return { doc: data ? { data: clone(data), updatedAt: Date.now(), deviceId: 'server' } : null,
        version: 0, reads: 0, writes: 0, transactions: 0, failRead: false, failWrite: false };
}
function device(remote, initial = {}, user = { uid: 'user', email: 'test@example.test' }) {
    const values = new Map(Object.entries(initial));
    const events = {};
    let authChanged;
    const screen = { style: { display: 'none' }, offsetParent: null };
    const statusChanges = [];
    const ref = { onSnapshot: jest.fn(), get: jest.fn(), set: jest.fn() };
    const auth = {
        getRedirectResult: () => Promise.resolve(null),
        onAuthStateChanged: cb => { authChanged = cb; cb(user); },
        signInWithPopup: jest.fn(() => Promise.resolve({})),
        currentUser: user
    };
    const db = {
        settings: jest.fn(), enablePersistence: jest.fn(),
        collection: jest.fn(() => ({ doc: () => ref })),
        runTransaction: async callback => {
            remote.transactions++;
            for (let attempt = 0; attempt < 6; attempt++) {
                const version = remote.version;
                let next;
                const result = await callback({
                    get: async () => {
                        remote.reads++;
                        if (remote.beforeRead) await remote.beforeRead();
                        if (remote.failRead) throw new Error('Sense connexió');
                        const data = clone(remote.doc);
                        return { exists: !!data, data: () => data };
                    },
                    set: (_, data) => { next = clone(data); }
                });
                if (remote.beforeCommit) await remote.beforeCommit();
                await Promise.resolve(); // permet conflictes i reintents entre aparells
                if (version !== remote.version) continue;
                if (remote.failWrite) throw new Error('Escriptura rebutjada');
                remote.doc = next;
                remote.version++;
                remote.writes++;
                return result;
            }
            throw new Error('Conflicte de transacció');
        }
    };
    const authFactory = () => auth;
    authFactory.GoogleAuthProvider = function () { this.setCustomParameters = () => {}; };
    const window = {
        ElTaulerCore: Core,
        onCloudSyncStatus: st => statusChanges.push(st),
        onCloudSyncSettled: jest.fn(), onCloudSyncReady: jest.fn(), onCloudSignedIn: jest.fn(),
        reloadAppStateFromStorage: jest.fn(),
        addEventListener: (name, cb) => { events[name] = cb; }
    };
    const context = vm.createContext({
        window, firebase: { initializeApp: () => ({}), auth: authFactory, firestore: () => db },
        document: { readyState: 'complete', getElementById: () => screen,
            addEventListener: (name, cb) => { events[name] = cb; } },
        localStorage: { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)),
            removeItem: k => values.delete(k), key: i => Array.from(values.keys())[i], get length() { return values.size; } },
        console: { info: jest.fn(), warn: jest.fn() }, Date, Math, JSON, Promise, Set, Number,
        setTimeout, clearTimeout, setInterval, clearInterval
    });
    vm.runInContext(source, context);
    return {
        sync: window.CloudSync, window, values, events, ref, db, statusChanges,
        read: () => Object.fromEntries(values),
        set: (key, value) => { values.set(key, typeof value === 'string' ? value : JSON.stringify(value)); window.CloudSync.onLocalSave(); },
        active: value => { screen.style.display = value ? 'block' : 'none'; screen.offsetParent = value ? {} : null; },
        login: value => { auth.currentUser = value; authChanged(value); }
    };
}

afterEach(() => jest.useRealTimers());

test('obrir, recuperar el focus, desar i tancar no llegeix ni puja dades automàticament', async () => {
    jest.useFakeTimers();
    const remote = server({ [GAMES]: JSON.stringify([game('remote')]) });
    const a = device(remote);
    a.set(GAMES, [game('local')]);
    a.sync.flushSoon();
    for (const event of ['visibilitychange', 'focus', 'pagehide']) if (a.events[event]) a.events[event]();
    await jest.advanceTimersByTimeAsync(120000);
    expect(remote.reads).toBe(0);
    expect(remote.writes).toBe(0);
    expect(a.ref.onSnapshot).not.toHaveBeenCalled();
    expect(a.db.enablePersistence).not.toHaveBeenCalled();
    expect(a.window.onCloudSyncReady).not.toHaveBeenCalled();
    expect(ids(a.read())).toEqual(['local']);
    expect(a.sync.isSettled()).toBe(false);
});

test('A sincronitza; B sincronitza i rep totes les partides; les pròpies de B també arriben a A', async () => {
    const remote = server();
    const a = device(remote, { [GAMES]: JSON.stringify([game('a')]) });
    const b = device(remote, { [GAMES]: JSON.stringify([game('b')]) });
    expect(await a.sync.syncNow()).toBe(true);
    expect(ids(remote.doc.data)).toEqual(['a']);
    expect(ids(b.read())).toEqual(['b']); // no hi ha baixada en temps real
    expect(await b.sync.syncNow()).toBe(true);
    expect(ids(b.read())).toEqual(['a', 'b']);
    expect(ids(remote.doc.data)).toEqual(['a', 'b']);
    await a.sync.syncNow();
    expect(ids(a.read())).toEqual(['a', 'b']);
    expect(a.sync.getStatus().state).toBe('synced');
    expect(b.window.reloadAppStateFromStorage).toHaveBeenCalledTimes(1);
});

test('tornar a desar una còpia antiga no trepitja les jugades més avançades', async () => {
    const remote = server({ [GAMES]: JSON.stringify([game('a', ['e4', 'e5', 'Nf3'])]) });
    const a = device(remote, { [GAMES]: JSON.stringify([game('a', ['e4'], { savedAt: Date.now() + 86400000 })]) });
    await a.sync.syncNow();
    expect(JSON.parse(a.read()[GAMES])[0].moves).toEqual(['e4', 'e5', 'Nf3']);
    expect(JSON.parse(remote.doc.data[GAMES])[0].moves).toHaveLength(3);
});

test('dues sincronitzacions simultànies fusionen el progrés independent sense perdre partides', async () => {
    const remote = server({ [GAMES]: JSON.stringify([game('a'), game('b')]) });
    const a = device(remote, { [GAMES]: JSON.stringify([game('a', ['e4', 'e5', 'Nf3']), game('b')]) });
    const b = device(remote, { [GAMES]: JSON.stringify([game('a'), game('b', ['e4', 'e5', 'Nc3']), game('c')]) });
    await Promise.all([a.sync.syncNow(), b.sync.syncNow()]);
    expect(ids(remote.doc.data)).toEqual(['a', 'b', 'c']);
    expect(JSON.parse(remote.doc.data[GAMES]).find(g => g.id === 'a').moves).toHaveLength(3);
    expect(JSON.parse(remote.doc.data[GAMES]).find(g => g.id === 'b').moves).toHaveLength(3);
    expect(remote.reads).toBeGreaterThan(2); // hi ha hagut reintent real
    await a.sync.syncNow();
    await b.sync.syncNow();
    expect(a.read()[GAMES]).toBe(b.read()[GAMES]);
});

test('les baixes arriben a l’altre aparell i no ressusciten partides acabades o descartades', async () => {
    const remote = server({ [GAMES]: JSON.stringify([game('a'), game('b')]) });
    const a = device(remote);
    const b = device(remote);
    await a.sync.syncNow();
    await b.sync.syncNow();
    a.set(REMOVED, { a: Date.now() });
    a.set(GAMES, [game('b')]);
    await a.sync.syncNow();
    b.set(GAMES, [game('a', ['e4', 'e5', 'Nf3']), game('b')]);
    await b.sync.syncNow();
    expect(ids(remote.doc.data)).toEqual(['b']);
    expect(ids(b.read())).toEqual(['b']);
    expect(JSON.parse(b.read()[REMOVED])).toHaveProperty('a');
});

test('la migració local s’executa abans de recollir la instantània del clic manual', async () => {
    const remote = server();
    const a = device(remote);
    a.window.prepareCloudSync = () => a.set(GAMES, [game('legacy')]);
    await a.sync.syncNow();
    expect(ids(remote.doc.data)).toEqual(['legacy']);
});

test('les dades intactes aquí adopten el valor del núvol encara que hi hagi altres canvis locals', async () => {
    const remote = server({ chess_userELO: '900', chess_username: 'Dani' });
    const a = device(remote);
    await a.sync.syncNow();
    remote.doc.data.chess_userELO = '950';
    remote.doc.updatedAt += 5000;
    a.set('chess_otherPreference', 'new');
    await a.sync.syncNow();
    expect(a.read().chess_userELO).toBe('950');
    expect(remote.doc.data.chess_userELO).toBe('950');
    expect(remote.doc.data.chess_otherPreference).toBe('new');
});

test.each(['failRead', 'failWrite'])('%s: no anuncia èxit ni substitueix les dades locals', async flag => {
    const remote = server({ [GAMES]: JSON.stringify([game('remote')]) });
    remote[flag] = true;
    const a = device(remote, { [GAMES]: JSON.stringify([game('local')]) });
    expect(await a.sync.syncNow()).toBe(false);
    expect(a.sync.getStatus().state).toBe('error');
    expect(ids(a.read())).toEqual(['local']);
    expect(ids(remote.doc.data)).toEqual(['remote']);
    expect(a.window.reloadAppStateFromStorage).not.toHaveBeenCalled();
});

test('un timeout no deixa una pujada diferida que s’executi quan torni la connexió', async () => {
    jest.useFakeTimers();
    const gate = deferred();
    const remote = server();
    remote.beforeRead = () => gate.promise;
    const a = device(remote, { [GAMES]: JSON.stringify([game('a')]) });
    const promise = a.sync.syncNow();
    await jest.advanceTimersByTimeAsync(20001);
    expect(await promise).toBe(false);
    gate.resolve();
    await jest.advanceTimersByTimeAsync(1);
    expect(remote.writes).toBe(0);
    expect(a.sync.getStatus().state).toBe('error');
    remote.beforeRead = null;
    expect(await a.sync.syncNow()).toBe(true);
});

test('doble clic reutilitza la mateixa operació', async () => {
    const remote = server();
    const a = device(remote, { [GAMES]: JSON.stringify([game('a')]) });
    const first = a.sync.syncNow();
    expect(a.sync.syncNow()).toBe(first);
    await first;
    expect(remote.transactions).toBe(1);
});

test('no aplica el resultat sobre una partida activa i conserva les noves jugades fetes durant la petició', async () => {
    jest.useFakeTimers();
    const remote = server();
    const gate = deferred();
    const committing = deferred();
    remote.beforeCommit = () => { committing.resolve(); return gate.promise; };
    const a = device(remote, { [GAMES]: JSON.stringify([game('a')]) });
    const promise = a.sync.syncNow();
    await committing.promise;
    a.active(true);
    a.set(GAMES, [game('a', ['e4', 'e5', 'Nf3']), game('new')]);
    gate.resolve();
    await promise;
    expect(a.sync.getStatus().state).toBe('waiting');
    expect(a.window.reloadAppStateFromStorage).not.toHaveBeenCalled();
    a.active(false);
    await jest.advanceTimersByTimeAsync(500);
    expect(ids(a.read())).toEqual(['a', 'new']);
    expect(JSON.parse(a.read()[GAMES])[0].moves).toHaveLength(3);
    expect(a.sync.getStatus().state).toBe('pending');
    expect(remote.writes).toBe(1);
    await a.sync.syncNow();
    expect(ids(remote.doc.data)).toEqual(['a', 'new']);
});

test('canviar de compte durant la petició invalida el resultat anterior', async () => {
    const remote = server();
    const gate = deferred();
    remote.beforeRead = () => gate.promise;
    const a = device(remote, { [GAMES]: JSON.stringify([game('a')]) });
    const pending = a.sync.syncNow();
    await Promise.resolve();
    a.login({ uid: 'other', email: 'other@example.test' });
    gate.resolve();
    await pending;
    expect(remote.writes).toBe(0);
    expect(a.sync.getStatus().state).toBe('connected');
    expect(a.window.reloadAppStateFromStorage).not.toHaveBeenCalled();
});

test('una partida activa demana tornar a la portada abans de sincronitzar', async () => {
    const remote = server();
    const a = device(remote);
    a.active(true);
    expect(await a.sync.syncNow()).toBe(false);
    expect(remote.reads).toBe(0);
});


test('els increments independents de dos dispositius se sumen una sola vegada', async () => {
    const json = JSON.stringify;
    const start = {
        chess_totalGamesPlayed:'10', chess_totalWins:'5', chess_totalStars:'40',
        chess_growthStats:json({tasksCompleted:3,openingDrillsCompleted:1}),
        chess_tacticsStats:json({solved:4,attempts:5,best:8}),
        eltauler_hieroglyphic_stats:json({solved:3,personalSolved:2,themes:{mate:2},solvedFens:['base']}),
        chess_timeControlElos:json({'3+2':{elo:900,games:6,wins:2,draws:1,losses:3}}),
        chess_gameHistory:json([{id:'initial',moves:['e4']}])
    };
    const remote = server(start);
    const a = device(remote);
    const b = device(remote);
    // Tots dos reben el mateix punt de partida i conserven la base confirmada.
    expect(await a.sync.syncNow()).toBe(true);
    expect(await b.sync.syncNow()).toBe(true);
    a.set('chess_totalGamesPlayed','12');
    a.set('chess_totalWins','7');
    a.set('chess_totalStars','45');
    a.set('chess_growthStats',{tasksCompleted:5,openingDrillsCompleted:2});
    a.set('chess_tacticsStats',{solved:6,attempts:8,best:9});
    a.set('eltauler_hieroglyphic_stats',{solved:5,personalSolved:4,themes:{mate:3},solvedFens:['base','a']});
    a.set('chess_timeControlElos',{'3+2':{elo:930,games:8,wins:4,draws:1,losses:3}});
    a.set('chess_gameHistory',[{id:'initial',moves:['e4']},{id:'game-a',moves:['d4']}]);
    b.set('chess_totalGamesPlayed','13');
    b.set('chess_totalWins','6');
    b.set('chess_totalStars','44');
    b.set('chess_growthStats',{tasksCompleted:6,openingDrillsCompleted:4});
    b.set('chess_tacticsStats',{solved:7,attempts:9,best:10});
    b.set('eltauler_hieroglyphic_stats',{solved:6,personalSolved:3,themes:{mate:4},solvedFens:['base','b']});
    b.set('chess_timeControlElos',{'3+2':{elo:940,games:9,wins:3,draws:2,losses:4}});
    b.set('chess_gameHistory',[{id:'initial',moves:['e4']},{id:'game-b',moves:['c4']}]);
    await a.sync.syncNow();
    await b.sync.syncNow();
    expect(remote.doc.data.chess_totalGamesPlayed).toBe('15');
    expect(remote.doc.data.chess_totalWins).toBe('8');
    expect(remote.doc.data.chess_totalStars).toBe('49');
    expect(JSON.parse(remote.doc.data.chess_growthStats).tasksCompleted).toBe(8);
    expect(JSON.parse(remote.doc.data.chess_growthStats).openingDrillsCompleted).toBe(5);
    expect(JSON.parse(remote.doc.data.chess_tacticsStats)).toMatchObject({solved:9,attempts:12,best:10});
    expect(JSON.parse(remote.doc.data.eltauler_hieroglyphic_stats)).toMatchObject({
        solved:8,personalSolved:5,themes:{mate:5}
    });
    expect(JSON.parse(remote.doc.data.eltauler_hieroglyphic_stats).solvedFens.sort()).toEqual(['a','b','base']);
    expect(JSON.parse(remote.doc.data.chess_timeControlElos)['3+2']).toMatchObject({
        games:11,wins:5,draws:2,losses:4
    });
    expect(idsHistory(remote.doc.data)).toEqual(['game-a','game-b','initial']);
    // Una segona pujada sense avenços NO afegeix res.
    const last = clone(remote.doc.data);
    await a.sync.syncNow();
    await b.sync.syncNow();
    expect(remote.doc.data).toEqual(last);
});
function idsHistory(data) {
    return JSON.parse(data.chess_gameHistory || '[]').map(x=>x.id).sort();
}

test('primera sincronització sense base evita duplicar comptadors antics', async () => {
    const remote = server({chess_totalGamesPlayed:'10',chess_totalStars:'15'});
    const a = device(remote,{chess_totalGamesPlayed:'8',chess_totalStars:'12'});
    await a.sync.syncNow();
    expect(a.read().chess_totalGamesPlayed).toBe('10');
    expect(a.read().chess_totalStars).toBe('15');
    await a.sync.syncNow();
    expect(remote.doc.data.chess_totalGamesPlayed).toBe('10');
});
