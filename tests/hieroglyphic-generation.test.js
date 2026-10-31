const fs = require('fs');
const vm = require('vm');
const { Chess } = require('chess.js');
const Core = require('../core');
const H = require('../hieroclosure');
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const between = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
// Mat en tres jugades: un jeroglífic són sempre tres jugades del jugador.
const candidate = { source: 'gameHistory.tactic', fen: 'rnb1kb1r/pp3ppp/2p5/4q3/4n3/3Q4/PPPB1PPP/2KR1BNR w kq - 0 9', bestMove: 'd3d8',
    solutionMoves: ['d3d8', 'd2g5', 'g5d8'], replyMoves: ['e8d8', 'd8c7'], evalBefore: 1000 };
const mate1 = { source: 'gameHistory.tactic', fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', bestMove: 'd1d8', solutionMoves: ['d1d8'], replyMoves: [], evalBefore: 1000 };
const a = (move, value, type = 'mate') => ({ move, eval: value, evalType: type, depth: 16, pv: [move] });
// Stockfish injectat: cada posició de la línia té la seva anàlisi.
const byFen = {};
(() => {
    const g = new Chess(candidate.fen);
    const rows = [[a('d3d8', 3), a('d1e1', 136, 'cp')], [a('e8d8', -2)], [a('d2g5', 2), a('d2f4', -1098, 'cp')], [a('d8c7', -1)], [a('g5d8', 1), a('g1f3', -1585, 'cp')]];
    H.lineOf(candidate).forEach((u, i) => { byFen[g.fen()] = { bestMove: rows[i][0], alternatives: rows[i] }; g.move({ from: u.slice(0, 2), to: u.slice(2, 4) }); });
})();
function setup() {
    const context = vm.createContext({
        Chess, window: { ElTaulerHieroClosure: H }, ElTaulerCore: Core,
        HIERO_ALLOWED_FINAL_MOTIFS: Core.HIERO_ALLOWED_FINAL_MOTIFS, HIERO_FINAL_MOTIF_LABELS: Core.HIERO_FINAL_MOTIF_LABELS,
        classifyPuzzleFinalMotif: Core.createHieroglyphicMotifHelpers(Chess).classifyPuzzleFinalMotif,
        analyzeFenRobust: jest.fn(async fen => byFen[fen] || null),
        analyzeHieroFenRobust: jest.fn(async fen => byFen[fen] || null),
        closeHieroglyphicCandidateWithStockfish: async c => ({ ...c }), hieroglyphicStats: { generatedFens: [] },
        hgDeviceId: () => 'test-device', hieroglyphicDifficultyPercent: () => 50,
        parseFenPosition: () => null, analyzePvThreats: () => null,
        hgSolvedHistoryFens: () => new Set(), hgFingerprint: it => it.id,
        candidate: { ...candidate }
    });
    vm.runInContext(between('function candidateFromPreparedBestLine(', 'async function closeHieroglyphicCandidateWithStockfish(')
        + between('async function verifyHieroglyphicConclusion(', 'function extractGameEntryCandidateFens(')
        + between('function hgToQueueItem(', 'function hgPruneQueue(')
        + between('function buildHieroglyphicBundleSequence(', 'async function startPersonalHieroglyphicFromLastGame(')
        + between('function hgPurgeStale(', 'function hgNewCount('), context);
    return { context, run: code => vm.runInContext(code, context) };
}

test('el camí de generació espera la verificació, i la prova sobreviu cua, sincronització i reconstrucció', async () => {
    const app = setup();
    const chosen = await app.run('chooseStockfishValidatedHieroglyphicCandidate([candidate])');
    expect(H.matches(chosen)).toBe(true);
    app.context.chosen = chosen;
    const item = app.run("hgToQueueItem(chosen, 'background')");
    app.context.restored = JSON.parse(JSON.stringify(item));
    const loaded = app.run('hgQueueItemToChosen(restored)');
    expect(H.matches(loaded)).toBe(true);
    app.context.loaded = loaded;
    const seq = app.run('buildHieroglyphicBundleSequence(loaded)');
    expect(seq.totalSteps).toBe(3);
    expect(seq.endsInMate).toBe(true);
    expect(seq.fullSequence).toEqual(['d3d8', 'e8d8', 'd2g5', 'd8c7', 'g5d8']);
    expect(seq.fullSequenceSan).toEqual(['Qd8+', 'Kxd8', 'Bg5+', 'Kc7', 'Bd8#']);
    expect(item.solutionMoves).toHaveLength(3); expect(item.replyMoves).toHaveLength(2);
    expect(loaded.conclusion.explanation).toContain('cap resposta legal');
});

test('la cua antiga o amb línia modificada no passa per la porta del generador nou', async () => {
    const app = setup();
    const valid = await app.run('verifyHieroglyphicConclusion(candidate)');
    // Un jeroglífic antic d'una sola jugada amb la seva prova d'abans.
    const short = { ...mate1, id: 'short', conclusion: { version: H.VERSION, fen: mate1.fen, line: ['d1d8'], kind: 'mate' } };
    app.context.hgState = { queue: [{ ...candidate, id: 'old' }, { ...valid, id: 'new' }, { ...valid, id: 'changed', solutionMoves: ['d3d8', 'd2g5', 'g5d7'] }, short] };
    app.run('hgPurgeStale()');
    expect(app.context.hgState.queue.map(it => it.id)).toEqual(['new']);
    app.context.short = short;
    expect(app.run('buildHieroglyphicBundleSequence(short)')).toBeNull();
    expect(app.run('buildHieroglyphicBundleSequence(candidate)')).toBeNull();
});

test('un motiu aparent no és prou per publicar un jeroglífic', async () => {
    const app = setup();
    app.context.candidate = { ...candidate, fen: '4k3/8/8/1q6/8/2N5/8/4K3 w - - 0 1', solutionMoves: ['c3d5'], bestMove: 'c3d5' };
    expect(await app.run('chooseStockfishValidatedHieroglyphicCandidate([candidate])')).toBeNull();
});

test('els límits de puntuació UCI arriben al verificador i no es confonen amb valoracions exactes', () => {
    const context = vm.createContext({});
    vm.runInContext(between('function parseUciInfo(', 'function analyzePositionEnriched('), context);
    expect(vm.runInContext("parseUciInfo('info depth 16 multipv 2 score cp 0 upperbound nodes 100 pv a1a2').bound", context)).toBe('upper');
    expect(vm.runInContext("parseUciInfo('info depth 16 multipv 1 score mate 3 lowerbound pv a1a8').bound", context)).toBe('lower');
});

test('el generador mai no publica un mat en 1 o en 2', async () => {
    const app = setup();
    app.context.candidate = { ...mate1 };
    expect(await app.run('chooseStockfishValidatedHieroglyphicCandidate([candidate])')).toBeNull();
    // Una línia de Stockfish que fa mat a la segona jugada es descarta, encara que acabi en mat.
    app.context.prepared = { totalSteps: 2, endsInMate: true,
        step1: { playerMove: 'd3d8', evalBefore: 3 }, opponentMove: { move: 'e8d8' }, step2: { playerMove: 'd2g5', evalBefore: 2 } };
    expect(app.run('candidateFromPreparedBestLine(candidate, prepared)')).toBeNull();
    app.context.prepared = { totalSteps: 3, endsInMate: true, fullSequence: H.lineOf(candidate),
        step1: { playerMove: 'd3d8' }, opponentMove: { move: 'e8d8' }, step2: { playerMove: 'd2g5' }, opponentMove2: { move: 'd8c7' }, step3: { playerMove: 'g5d8' } };
    const closed = app.run('candidateFromPreparedBestLine(candidate, prepared)');
    expect(closed.solutionMoves).toEqual(['d3d8', 'd2g5', 'g5d8']); expect(closed.replyMoves).toEqual(['e8d8', 'd8c7']);
});

test('la creació de jeroglífics té motor SF19 independent i sense fallback antic', () => {
    expect(source).toContain('const HIERO_STOCKFISH_URL = `stockfish-19-lite-single.js?v=${APP_VERSION}`;');
    expect(source).toContain('new Worker(HIERO_STOCKFISH_URL)');
    expect(source).toContain('hieroAnalysisQueue.then(run, run)');
    expect(source).toContain('createVerifier(Chess, analyzeHieroFenRobust)');
    const generator = between('async function hgGenerateOne(', '// Text llegible del motiu');
    expect(generator).toContain('await ensureHieroStockfish()');
    expect(generator).not.toContain('ensureStockfish()');
    const selfplay = between('async function hgMineSelfPlayGame(', 'function hgSelfPlayCandidate(');
    expect(selfplay).toContain('await analyzeHieroFenRobust(');
    expect(selfplay).toContain('verifyHieroglyphicConclusion(');
    expect(selfplay).not.toContain('hgRandomSeedFen');
    expect(selfplay).not.toContain("new Worker(STOCKFISH_URL)");
});

// Context per a l'autojoc: motor simulat, emmagatzematge en memòria.
function selfPlayContext(engine, extra = {}) {
    const store = {};
    const ctx = vm.createContext(Object.assign({
        Chess, ElTaulerCore: Core, window: { ElTaulerHieroClosure: H },
        HIERO_ALLOWED_FINAL_MOTIFS: Core.HIERO_ALLOWED_FINAL_MOTIFS, HIERO_FINAL_MOTIF_LABELS: Core.HIERO_FINAL_MOTIF_LABELS,
        classifyPuzzleFinalMotif: Core.createHieroglyphicMotifHelpers(Chess).classifyPuzzleFinalMotif,
        hgIsLowEndDevice: () => false, ensureHieroStockfish: async () => true, analyzeHieroFenRobust: engine,
        hgAllKnownFens: () => new Set(),
        readJsonStorage: (k, d) => (k in store ? JSON.parse(store[k]) : d),
        writeJsonStorage: (k, v) => { store[k] = JSON.stringify(v); }
    }, extra));
    vm.runInContext(between('const HG_SEEDS_KEY', 'async function hgGenerateFromSelfPlaySeed(')
        + between('function hgSelfPlayCandidate(', '// Diagnòstic de l\'últim intent')
        + between('async function verifyHieroglyphicConclusion(', 'function hasVerifiedHieroglyphicConclusion('), ctx);
    return { ctx, store, run: code => vm.runInContext(code, ctx) };
}

test('l’autojoc juga partides legals i desa com a llavors les posicions amb una sola jugada guanyadora', async () => {
    // Motor simulat: totes les jugades legals ordenades; a partir de la jugada 20
    // diu que la primera guanya clarament i la resta no (una «llavor»).
    let calls = 0;
    const engine = jest.fn(async fen => {
        calls++;
        const g = new Chess(fen);
        const legal = g.moves({ verbose: true }).slice(0, 5);
        if (!legal.length) return null;
        const winning = calls > 20 && calls % 7 === 0;
        const alternatives = legal.map((m, i) => ({ move: m.from + m.to + (m.promotion || ''), evalType: 'cp',
            eval: winning ? (i === 0 ? 450 : 20 - i) : 30 - i * 60, pv: [m.from + m.to + (m.promotion || '')] }));
        return { bestMove: alternatives[0], alternatives };
    });
    const app = selfPlayContext(engine);
    // Sense cap combinació que es tanqui a la tercera jugada, no es guarda res.
    expect(await app.run('hgMineSelfPlayGame(() => false, { budgetMs: 60000 })')).toBe(0);
    // Amb variants que sí que es tanquen (la comprovació real és a un altre test).
    calls = 0;
    app.run('hgClosureWindows = () => [{}]');
    const added = await app.run('hgMineSelfPlayGame(() => false, { budgetMs: 60000 })');
    expect(engine.mock.calls.length).toBeGreaterThan(30);
    expect(added).toBeGreaterThan(0);
    const seeds = app.run('hgLoadSeeds()');
    expect(seeds).toHaveLength(added);
    for (const seed of seeds) {
        expect(new Chess().load(seed.fen)).toBe(true);
        expect(seed.bestCp).toBe(450);
    }
    // Una llavor ja coneguda no es torna a desar.
    expect(await app.run('hgMineSelfPlayGame(() => false, { budgetMs: 60000, excludeFens: new Set(hgLoadSeeds().map(x => hgFenKey(x.fen))) })')).toBeGreaterThanOrEqual(0);
    const again = app.run('hgLoadSeeds()');
    expect(new Set(again.map(x => x.fen)).size).toBe(again.length);
});

test('les finestres de la variant principal acaben JUST a la tercera jugada', () => {
    const app = selfPlayContext(async () => null);
    app.ctx.line = H.lineOf(candidate);
    app.ctx.fen = candidate.fen;
    const wins = app.run('hgClosureWindows(fen, line)');
    expect(wins).toHaveLength(1);
    expect(wins[0].solutionMoves).toEqual(['d3d8', 'd2g5', 'g5d8']);
    // Una variant que s'acaba abans no fa jeroglífic.
    expect(app.run('hgClosureWindows(fen, line.slice(0, 4))')).toHaveLength(0);
    // Una variant tranquil·la tampoc.
    app.ctx.quiet = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6'];
    expect(app.run('hgClosureWindows(new Chess().fen(), quiet)')).toHaveLength(0);
});

test('una llavor es certifica amb la variant profunda i la validació completa', async () => {
    const line = H.lineOf(candidate);
    const engine = jest.fn(async (fen, depth, multiPv) => {
        if (fen === candidate.fen && multiPv === 1) return { bestMove: { move: 'd3d8', eval: 3, evalType: 'mate', depth: 16, pv: line } };
        return byFen[fen] || null;
    });
    const app = selfPlayContext(engine);
    app.ctx.fen = candidate.fen;
    const cert = await app.run('hgCertifySeed(fen, () => false)');
    expect(H.matches(cert)).toBe(true);
    expect(cert.solutionMoves).toEqual(['d3d8', 'd2g5', 'g5d8']);
    expect(cert.origin).toBe('engine_selfplay');
    expect(cert.finalMotif).toBe('mate');
});

test('cada llavor es prova un sol cop i, si la reserva és buida, se’n mina una partida', async () => {
    const app = selfPlayContext(async () => null);
    // La primera partida minada dona dues llavors; la segona, cap.
    app.ctx.hgMineSelfPlayGame = jest.fn(async () => {
        if (app.ctx.hgMineSelfPlayGame.mock.calls.length > 1) return 0;
        app.run("hgSaveSeeds([{ fen: '8/8/8/8/8/8/8/K6k w - - 0 1', gap: 400 }, { fen: '8/8/8/8/8/8/8/K5k1 w - - 0 1', gap: 300 }])");
        return 2;
    });
    vm.runInContext(between('async function hgGenerateFromSelfPlaySeed(', 'function hgSelfPlayCandidate('), app.ctx);
    app.ctx.hgCertifySeed = jest.fn(async () => null);
    const diag = {};
    app.ctx.diag = diag;
    expect(await app.run('hgGenerateFromSelfPlaySeed(() => false, new Set(), diag)')).toBeNull();
    expect(app.ctx.hgMineSelfPlayGame).toHaveBeenCalled();
    expect(app.ctx.hgCertifySeed.mock.calls.map(c => c[0].fen)).toEqual(['8/8/8/8/8/8/8/K6k w - - 0 1', '8/8/8/8/8/8/8/K5k1 w - - 0 1']);
    expect(app.run('hgLoadSeeds()')).toHaveLength(0);
    expect(diag.seedsTried).toBe(2);
    expect(diag.seedsMined).toBe(2);
});

test('la força d’una llavor es llegeix de la mateixa partida minada', () => {
    const win = (move) => [{ move, eval: 500, evalType: 'cp' }, { move: 'x', eval: 50, evalType: 'cp' }];
    const reply = (move) => [{ move, eval: -500, evalType: 'cp' }];
    const record = [
        { alternatives: win('a'), move: 'a' }, { alternatives: reply('b'), move: 'b' },
        { alternatives: win('c'), move: 'c' }, { alternatives: reply('d'), move: 'd' },
        { alternatives: win('e'), move: 'e' }
    ];
    expect(Core.hieroMiningSeedStrength(record, 0)).toBe(2);
    // La segona jugada del jugador tenia una alternativa que també guanyava.
    const ambiguous = record.slice();
    ambiguous[2] = { alternatives: [{ move: 'c', eval: 755, evalType: 'cp' }, { move: 'z', eval: 752, evalType: 'cp' }], move: 'c' };
    expect(Core.hieroMiningSeedStrength(ambiguous, 0)).toBe(1);
    // El rival no va respondre amb la seva millor jugada (error injectat).
    const blunder = record.slice();
    blunder[1] = { alternatives: reply('b'), move: 'q' };
    expect(Core.hieroMiningSeedStrength(blunder, 0)).toBe(1);
    expect(Core.hieroMiningSeedStrength(record, 1)).toBe(0);
    // Mat: cap altra jugada no fa mat.
    expect(Core.hieroMiningStepUnique([{ move: 'a', eval: 3, evalType: 'mate' }, { move: 'b', eval: 4, evalType: 'mate' }])).toBe(false);
    expect(Core.hieroMiningStepUnique([{ move: 'a', eval: 3, evalType: 'mate' }, { move: 'b', eval: 150, evalType: 'cp' }])).toBe(true);
});

test('la mineria tria jugades legals de MultiPV: obertura variada, i errors de 2,5 a 9 peons quan toca', () => {
    const alts = [{ move: 'a', eval: 30, evalType: 'cp' }, { move: 'b', eval: 10, evalType: 'cp' },
        { move: 'c', eval: -250, evalType: 'cp' }, { move: 'd', eval: -1000, evalType: 'cp' }];
    const state = {};
    const seq = [0.0, 0.99];   // el primer valor fixa quan tocarà el primer error
    const random = () => (seq.length ? seq.shift() : 0);
    expect(Core.hieroMiningChoose(alts, 2, state, random).move).toBe('b');      // dins de 40 cp
    state.nextErrorPly = 12;
    expect(Core.hieroMiningChoose(alts, 11, state, () => 0).move).toBe('a');    // encara no toca
    const err = Core.hieroMiningChoose(alts, 12, state, () => 0);
    expect(err).toEqual({ move: 'c', error: true });                            // perd 280 cp, no 1030
    expect(state.nextErrorPly).toBeGreaterThanOrEqual(13);
    expect(Core.hieroMiningBadMoves(alts).map(a => a.move)).toEqual(['c']);
    expect(Core.hieroMiningSeed(alts, 20)).toBeNull();
    expect(Core.hieroMiningSeed([{ move: 'a', eval: 2, evalType: 'mate' }, { move: 'b', eval: 0, evalType: 'cp' }], 20)).toBeNull();
    expect(Core.hieroMiningSeed([{ move: 'a', eval: 4, evalType: 'mate' }, { move: 'b', eval: 0, evalType: 'cp' }], 20)).not.toBeNull();
    expect(Core.hieroMiningSeed([{ move: 'a', eval: 450, evalType: 'cp' }, { move: 'b', eval: 20, evalType: 'cp' }], 5)).toBeNull();
});

test('si la partida minada ja contenia la combinació, es verifica sense anàlisi profunda prèvia', async () => {
    const engine = jest.fn(async (fen, depth) => (depth === 14 ? null : byFen[fen] || null));
    const app = selfPlayContext(engine);
    app.ctx.seed = { fen: candidate.fen, bestCp: 9970, line: H.lineOf(candidate) };
    const cert = await app.run('hgCertifySeed(seed, () => false)');
    expect(H.matches(cert)).toBe(true);
    expect(engine.mock.calls.some(c => c[1] === 14)).toBe(false);
});

test('el banc diari s\'acumula: tots els no jugats compten com a nous i no se\'n repeteix cap de conegut', async () => {
    const app = setup();
    const chosen = await app.run('chooseStockfishValidatedHieroglyphicCandidate([candidate])');
    app.context.chosen = chosen;
    const item = Object.assign(app.run("hgToQueueItem(chosen, 'reserve')"), { id: 'hgr_x', publishedAt: 2 });
    const broken = Object.assign(JSON.parse(JSON.stringify(item)), { id: 'hgr_broken', fen: '8/8/8/8/8/8/8/K6k w - - 0 1' });
    const state = { queue: [], updatedAt: 0 };
    const known = new Set();
    const ctx = vm.createContext({
        window: { ElTaulerHieroReserve: [broken, item] }, hgState: state,
        hgEnsureState: () => state, hgAllKnownFens: () => new Set(known), hieroglyphicStats: { solvedFens: [] },
        hgFenKey: f => Core.puzzleFenKey(f), hasVerifiedHieroglyphicConclusion: c => H.matches(c),
        saveHieroglyphicStats: jest.fn(), escapeHtml: x => String(x)
    });
    vm.runInContext(between('function hgNewCount(', '// ── Detecció de dispositiu modest')
        + between('function hgReserveItems(', '// Certifica llavors de la reserva'), ctx);
    // El banc no es copia a la cua (que viatja al núvol): es llegeix directament.
    expect(vm.runInContext('hgReserveFresh().map(x => x.id)', ctx)).toEqual(['hgr_x']);
    expect(vm.runInContext('hgNewCount()', ctx)).toBe(1);
    expect(state.queue).toHaveLength(0);
    // Ja és a l'historial o resolt: no compta com a nou.
    known.add(Core.puzzleFenKey(candidate.fen));
    expect(vm.runInContext('hgNewCount()', ctx)).toBe(0);
    known.clear();
    // Un cop servit queda marcat com a vist (també quan surti de l'historial).
    vm.runInContext('hgMarkSeen(' + JSON.stringify(candidate.fen) + ')', ctx);
    expect(ctx.hieroglyphicStats.seenKeys).toHaveLength(1);
    expect(vm.runInContext('hgNewCount()', ctx)).toBe(0);
});

test('tots els jeroglífics de la reserva tenen una línia legal i la prova vàlida', () => {
    const reserve = require('../jeroglifics-reserva.js');
    const { sound } = require('../scripts/mine-hieroglyphics.js');
    expect(Array.isArray(reserve)).toBe(true);
    const keys = new Set();
    for (const item of reserve) {
        expect(sound(item)).toBe(true);
        expect(item.solutionMoves).toHaveLength(3);
        expect(item.replyMoves).toHaveLength(2);
        expect(item.origin).toBe('engine_selfplay');
        const key = Core.puzzleFenKey(item.fen);
        expect(keys.has(key)).toBe(false);
        keys.add(key);
    }
});
