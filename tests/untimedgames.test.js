const fs = require('fs');
const vm = require('vm');
const { Chess } = require('chess.js');
const Core = require('../core.js');

// Exercita les funcions reals de persistència i sortida amb localStorage
// simulat: la partida continua fent servir chess.js real, no una còpia del joc.
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const persistence = source.slice(source.indexOf("const LIVE_GAME_KEY ="),
    source.indexOf('/* ===== Navegació de jugades'));
const leave = source.slice(source.indexOf('function returnToMainMenuImmediate()'),
    source.indexOf('/* ===================== TRIO DE NAVEGACIÓ'));
const SAVED = 'chess_untimedGames';
const LIVE = 'eltauler_cloud_liveGame';

function snapshot(id, extra = {}) {
    return { v: 1, id, mode: 'free', playerColor: 'w', moves: ['e4', 'e5'],
        timeControlId: 'none', clock: null, savedAt: 1700000000000,
        startedAt: 1699999000000, ...extra };
}

function harness(data = new Map()) {
    const nodes = new Map();
    for (const id of ['untimed-grid', 'untimed-section-title', 'untimed-scroll-hint', 'live-game-banner']) {
        nodes.set(id, { innerHTML: '', style: {}, scrollWidth: 2000, clientWidth: 600, scrollLeft: 0,
            classList: { toggle: jest.fn() } });
    }
    const jq = new Proxy({}, { get: () => () => jq });
    const context = vm.createContext({
        ElTaulerCore: Core, Chess, Date, Math, Number, JSON, console,
        localStorage: {
            getItem: key => data.get(key) || null,
            setItem: (key, value) => data.set(key, value),
            removeItem: key => data.delete(key)
        },
        document: { getElementById: id => nodes.get(id) || null },
        window: {}, $: () => jq, setTimeout: jest.fn(),
        game: new Chess(), gameClock: { enabled: false }, currentGameMode: 'free',
        blunderMode: false, phaseReplayState: null, pendingMoveEvaluation: false,
        currentGameStartTs: 1699999000000, isCalibrationGame: false, playerColor: 'w',
        currentGameTimeControlId: 'none', currentGameClockTemperament: 1,
        totalPlayerMoves: 1, goodMoves: 1, totalEngineMoves: 1, goodEngineMoves: 1,
        currentReview: [], currentGameErrors: [], currentGameActiveStrengthElo: 1000,
        currentGameEngineDepth: 8, humanPaceMs: 1200, humanPaceSamples: 1,
        leagueActiveMatch: null, currentLeague: null, currentElo: 1000,
        currentOpponent: null, positionalVision: 0, POSITIONAL_VISION_LEVELS: [{}, {}, {}],
        pendingFreeTimeControl: 'none', TIME_CONTROLS: [{ id: 'none' }, { id: '3+2' }],
        gameGeneration: 1, stockfish: { postMessage: jest.fn() }, antidoteSearchToken: 0,
        antidoteState: null, isEngineThinking: true, waitingForBlunderAnalysis: true,
        escapeHtml: s => String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;'),
        dailyMiniBoardHtml: (fen, color) => `<div data-fen="${fen}" data-color="${color}"></div>`,
        startGame: jest.fn(), showToast: jest.fn(), saveStorage: jest.fn(),
        getMyOpponentForRound: () => 'rival', getLeaguePlayer: () => ({ name: 'Rival', elo: 1200 })
    });
    for (const name of ['refreshPlayClockChips', 'clearEngineMoveTimers', 'clearPositionalRetryTimer',
        'clearQueuedPremove', 'stopGameClock', 'releaseAntidoteEngine', 'clearTapSelection',
        'updatePhaseReplayHud', 'updateBundleHintButtons', 'updateDisplay', 'backgroundPrepTick']) {
        context[name] = jest.fn();
    }
    vm.runInContext(persistence + '\n' + leave, context);
    return { context, data, nodes, run: code => vm.runInContext(code, context) };
}

function activate(h, id) {
    h.context.game = Core.liveGameReplay(Chess, ['e4', 'e5']);
    h.run(`liveGameActive = true; liveGameId = ${JSON.stringify(id)};`);
}

test('sortir desa la posició i atura el motor sense acabar la partida', () => {
    const h = harness();
    activate(h, 'a');
    h.context.returnToMainMenuImmediate();
    const saved = JSON.parse(h.data.get(SAVED));
    expect(saved).toHaveLength(1);
    expect(saved[0].moves).toEqual(['e4', 'e5']);
    expect(saved[0].clock).toBeNull();
    expect(h.run('liveGameActive')).toBe(false);
    expect(h.context.clearEngineMoveTimers).toHaveBeenCalled();
    expect(h.context.isEngineThinking).toBe(false);
    expect(h.context.waitingForBlunderAnalysis).toBe(false);
    expect(h.context.stockfish.postMessage).toHaveBeenCalledWith('stop');
});

test('una partida nova no sobreescriu les anteriors; reprendre actualitza només el seu id', () => {
    const h = harness();
    activate(h, 'a');
    h.context.saveLiveGame();
    activate(h, 'b');
    h.context.saveLiveGame();
    activate(h, 'a');
    h.context.game.move('Nf3');
    h.context.saveLiveGame();
    const games = h.context.loadUntimedGames();
    expect(games).toHaveLength(2);
    expect(games.find(g => g.id === 'a').moves).toEqual(['e4', 'e5', 'Nf3']);
    expect(games.find(g => g.id === 'b').moves).toEqual(['e4', 'e5']);
});

test('recarregar al cap d’anys conserva totes les targetes i reprèn la triada sense rellotge', () => {
    const data = new Map([[SAVED, JSON.stringify([snapshot('a'), snapshot('b', { playerColor: 'b' })])]]);
    const h = harness(data);
    h.context.renderUntimedGamesPanel();
    expect(h.nodes.get('untimed-grid').innerHTML.match(/untimed-card-play/g)).toHaveLength(2);
    expect(h.nodes.get('untimed-grid').innerHTML).toContain('Sense límit de temps');
    h.context.pendingFreeTimeControl = '3+2';
    h.context.resumeLiveGame('b');
    expect(h.run('liveGameResumePending.id')).toBe('b');
    expect(h.run('liveGameResumePending.playerColor')).toBe('b');
    expect(h.context.pendingFreeTimeControl).toBe('none');
    expect(h.context.startGame).toHaveBeenCalledWith(false);
});

test('tres o més partides es disposen d’antigues a recents i activen el carrusel', () => {
    const games = [
        snapshot('recent', { savedAt: 3000 }),
        snapshot('old', { savedAt: 1000 }),
        snapshot('middle', { savedAt: 2000 })
    ];
    const h = harness(new Map([[SAVED, JSON.stringify(games)]]));
    h.context.renderUntimedGamesPanel();
    const html = h.nodes.get('untimed-grid').innerHTML;
    const order = Array.from(html.matchAll(/data-untimed-id="([^"]+)"/g)).map(m => m[1]);
    expect(order).toEqual(['old', 'middle', 'recent']);
    expect(h.nodes.get('untimed-grid').classList.toggle).toHaveBeenCalledWith('untimed-carousel', true);
    expect(h.nodes.get('untimed-grid').scrollLeft).toBe(2000);
    expect(h.nodes.get('untimed-scroll-hint').style.display).toBe('');
});

test('aurèola daurada només al tauler que espera la jugada del jugador', () => {
    const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
    expect(html).toContain('#untimed-grid .daily-card-turn .daily-mini');
    expect(html).toContain('@keyframes untimed-board-halo');
    expect(html).toContain('animation: untimed-board-halo 2.8s ease-in-out infinite');
    expect(html).toContain('@media (prefers-reduced-motion: reduce)');

    const h = harness(new Map([[SAVED, JSON.stringify([
        snapshot('white-turn', { moves: ['e4', 'e5'], playerColor: 'w' }),
        snapshot('black-turn', { moves: ['e4', 'e5'], playerColor: 'b' })
    ])]]));
    h.context.renderUntimedGamesPanel();
    const cards = [...h.nodes.get('untimed-grid').innerHTML.matchAll(
        /<div class="daily-card ([^"]*)" data-untimed-id="([^"]+)"/g
    )].map(m => ({ classes: m[1], id: m[2] }));
    expect(cards).toHaveLength(2);
    // La classe es determina pel torn real, no per la data o l'ordre del carrusel.
    const white = cards.find(c => c.id === 'white-turn');
    const black = cards.find(c => c.id === 'black-turn');
    expect(white.classes).toContain('daily-card-turn');
    expect(black.classes).not.toContain('daily-card-turn');
});

test('una jugada nova envia el tauler a la dreta; reobrir sense moure no el reordena', () => {
    const games = [
        snapshot('a', { savedAt: 1000 }),
        snapshot('b', { savedAt: 2000 }),
        snapshot('c', { savedAt: 3000 })
    ];
    const h = harness(new Map([[SAVED, JSON.stringify(games)]]));
    const ids = () => Array.from(h.nodes.get('untimed-grid').innerHTML.matchAll(/data-untimed-id="([^"]+)"/g)).map(m => m[1]);
    activate(h, 'a');
    h.context.game.move('Nf3');
    h.context.saveLiveGame();
    h.run('liveGameActive = false; liveGameId = null;');
    h.context.renderUntimedGamesPanel();
    expect(ids()).toEqual(['b', 'c', 'a']);
    const moved = h.context.loadUntimedGames().find(g => g.id === 'a');
    expect(moved.lastMoveAt).toBeGreaterThan(3000);

    activate(h, 'b');
    h.context.saveLiveGame(); // sense cap jugada
    h.run('liveGameActive = false; liveGameId = null;');
    h.context.renderUntimedGamesPanel();
    expect(ids()).toEqual(['b', 'c', 'a']);
    expect(h.context.loadUntimedGames().find(g => g.id === 'b').lastMoveAt).toBe(2000);
});

test('amb una o dues partides no activa el desplaçament lateral', () => {
    const h = harness(new Map([[SAVED, JSON.stringify([snapshot('a'), snapshot('b')])]]));
    h.context.renderUntimedGamesPanel();
    expect(h.nodes.get('untimed-grid').classList.toggle).toHaveBeenCalledWith('untimed-carousel', false);
    expect(h.nodes.get('untimed-scroll-hint').style.display).toBe('none');
});

test('el carrusel deixa dos taulers visibles a escriptori i manté el desplaçament mòbil', () => {
    const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
    expect(html).toContain('id="untimed-scroll-hint"');
    expect(html).toContain('app.js?v=1.0.131');
    expect(html).toMatch(/#untimed-grid\.untimed-carousel > \.daily-card \{[^}]*flex:\s*0 0 calc\(\(100% - 14px\) \/ 2\);/);
    expect(html).toContain('body.device-mobile #untimed-grid.untimed-carousel > .daily-card { flex-basis: 82%; }');
});

test('migra la instantània antiga sense duplicar-la ni perdre les altres', () => {
    const old = snapshot(undefined);
    const h = harness(new Map([[LIVE, JSON.stringify(old)], [SAVED, JSON.stringify([snapshot('b')])]]));
    h.context.migrateUntimedLiveGame();
    h.context.migrateUntimedLiveGame();
    expect(h.context.loadUntimedGames()).toHaveLength(2);
    expect(h.data.has(LIVE)).toBe(false);
    expect(h.context.loadUntimedGames().find(g => g.id !== 'b').moves).toEqual(old.moves);
});

test('acabar o rendir-se només retira la partida activa; no toca una recuperació amb rellotge', () => {
    const timed = snapshot('timed', { timeControlId: '3+2', clock: { white: 120000, black: 120000 } });
    const h = harness(new Map([[SAVED, JSON.stringify([snapshot('a'), snapshot('b')])], [LIVE, JSON.stringify(timed)]]));
    activate(h, 'a');
    h.context.liveGameFinished();
    expect(h.context.loadUntimedGames().map(g => g.id)).toEqual(['b']);
    expect(JSON.parse(h.data.get(LIVE)).id).toBe('timed');
    h.context.liveGameFinished();
    expect(h.context.loadUntimedGames()).toHaveLength(1);
});

test('una posició final desapareix de la graella i no es pot reprendre', () => {
    const h = harness(new Map([[SAVED, JSON.stringify([snapshot('a'), snapshot('b')])]]));
    activate(h, 'a');
    h.context.game = Core.liveGameReplay(Chess, ['f3', 'e5', 'g4', 'Qh4#']);
    h.context.liveGameAfterMove();
    expect(h.context.loadUntimedGames().map(g => g.id)).toEqual(['b']);
});

test('es conserva fins i tot sense haver fet la primera jugada', () => {
    const h = harness();
    activate(h, 'a');
    h.context.game = new Chess();
    h.context.returnToMainMenuImmediate();
    h.context.renderUntimedGamesPanel();
    expect(h.nodes.get('untimed-grid').innerHTML).toContain('untimed-card-play');
});

test('si falta espai no surt de la partida ni elimina les altres', () => {
    const h = harness(new Map([[SAVED, JSON.stringify([snapshot('b')])]]));
    activate(h, 'a');
    h.context.localStorage.setItem = () => { throw new Error('quota'); };
    expect(h.context.returnToMainMenuImmediate()).toBe(false);
    expect(h.run('liveGameActive')).toBe(true);
    expect(h.context.loadUntimedGames().map(g => g.id)).toEqual(['b']);
    expect(h.context.showToast).toHaveBeenCalled();
});

test('pausar la lliga no la perd i es pot reprendre després de jugar una partida lliure', () => {
    const match = { leagueId: 'lliga', round: 2, opponentId: 'rival', opponentRoc: 1200 };
    const h = harness(new Map([[SAVED, JSON.stringify([snapshot('lliga2', { mode: 'league', league: match })])]]));
    h.context.currentLeague = { id: 'lliga', currentRound: 2, completed: false };
    h.context.leagueActiveMatch = null;
    h.context.resumeLiveGame('lliga2');
    expect(h.context.leagueActiveMatch.opponentId).toBe('rival');
    expect(h.context.leagueActiveMatch.round).toBe(2);
    expect(h.context.startGame).toHaveBeenCalledWith(false);
});

test('una jornada de lliga ja resolta no es torna a jugar', () => {
    const h = harness(new Map([[SAVED, JSON.stringify([snapshot('old', { mode: 'league', league: { leagueId: 'l', round: 1 } })])]]));
    h.context.currentLeague = { id: 'l', currentRound: 2 };
    h.context.resumeLiveGame('old');
    expect(h.context.startGame).not.toHaveBeenCalled();
    expect(h.context.loadUntimedGames()).toHaveLength(0);
});

test('migra tota la col·lecció local antiga sense perdre partides ni duplicar-les', () => {
    const h = harness(new Map([
        ['eltauler_cloud_untimedGames', JSON.stringify([snapshot('a'), snapshot('b')])],
        [SAVED, JSON.stringify([snapshot('a', { moves: ['e4', 'e5', 'Nf3'] }), snapshot('c')])]
    ]));
    h.context.migrateUntimedCollection();
    h.context.migrateUntimedCollection();
    expect(h.context.loadUntimedGames().map(g => g.id)).toEqual(['a', 'b', 'c']);
    expect(h.context.loadUntimedGames()[0].moves).toHaveLength(3);
    expect(h.data.has('eltauler_cloud_untimedGames')).toBe(false);
});

test('la migració fallida conserva l’original', () => {
    const h = harness(new Map([['eltauler_cloud_untimedGames', JSON.stringify([snapshot('a')])]]));
    h.context.localStorage.setItem = () => { throw new Error('quota'); };
    h.context.migrateUntimedCollection();
    expect(h.data.has('eltauler_cloud_untimedGames')).toBe(true);
    expect(() => h.context.window.prepareCloudSync()).toThrow('No s’han pogut preparar totes les partides');
});

test('desar sense moure no incrementa la revisió; desfer sí que és una nova posició', () => {
    const h = harness();
    activate(h, 'a');
    h.context.saveLiveGame();
    const initial = h.context.loadUntimedGames()[0];
    h.context.saveLiveGame();
    expect(h.context.loadUntimedGames()[0].revision).toBe(initial.revision);
    h.context.game.move('Nf3');
    h.context.saveLiveGame();
    const advanced = h.context.loadUntimedGames()[0];
    h.context.game.undo();
    h.context.saveLiveGame();
    const undone = h.context.loadUntimedGames()[0];
    expect(undone.revision).toBe(advanced.revision + 1);
    expect(Core.untimedMergeGames([advanced], [undone])[0].moves).toEqual(['e4', 'e5']);
});

test('les baixes impedeixen ressuscitar una partida des d’una pestanya antiga', () => {
    const h = harness(new Map([[SAVED, JSON.stringify([snapshot('a'), snapshot('b')])]]));
    h.context.removeUntimedGame('a');
    expect(JSON.parse(h.data.get('chess_untimedGameRemovals'))).toHaveProperty('a');
    expect(() => h.context.saveUntimedSnapshot(snapshot('a'))).toThrow();
    h.data.set('eltauler_cloud_untimedGames', JSON.stringify([snapshot('a')]));
    h.context.migrateUntimedCollection();
    expect(h.context.loadUntimedGames().map(g => g.id)).toEqual(['b']);
});

test('la fusió és simètrica, estable i ignora entrades corruptes o amb rellotge', () => {
    const a = snapshot('a', { moves: ['e4'] });
    const advanced = snapshot('a', { moves: ['e4', 'e5'] });
    const b = snapshot('b');
    const timed = snapshot('timed', { timeControlId: '3+2', clock: { white: 1000, black: 1000 } });
    const ab = Core.untimedMergeGames([a, b, null, {}], [advanced, timed]);
    const ba = Core.untimedMergeGames([advanced, timed], [a, b]);
    expect(ab).toEqual(ba);
    expect(ab.map(g => g.id)).toEqual(['a', 'b']);
    expect(Core.untimedMergeGames(ab, ab)).toEqual(ab);
    const equalA = snapshot('tie', { review: [{ san: 'e4' }] });
    const equalB = snapshot('tie', { review: [] });
    expect(Core.untimedPickVersion(equalA, equalB)).toEqual(Core.untimedPickVersion(equalB, equalA));
});
