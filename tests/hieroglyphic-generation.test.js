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
