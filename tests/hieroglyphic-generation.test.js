const fs = require('fs');
const vm = require('vm');
const { Chess } = require('chess.js');
const Core = require('../core');
const H = require('../hieroclosure');
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const between = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const candidate = { source: 'gameHistory.tactic', fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', bestMove: 'd1d8', solutionMoves: ['d1d8'], replyMoves: [], evalBefore: 1000 };
const alternatives = [
    { move: 'd1d8', eval: 1, evalType: 'mate', depth: 16, pv: ['d1d8'] },
    { move: 'd1d7', eval: 4, evalType: 'mate', depth: 16, pv: ['d1d7', 'g8f8'] }
];
function setup() {
    const context = vm.createContext({
        Chess, window: { ElTaulerHieroClosure: H }, ElTaulerCore: Core,
        HIERO_ALLOWED_FINAL_MOTIFS: Core.HIERO_ALLOWED_FINAL_MOTIFS, HIERO_FINAL_MOTIF_LABELS: Core.HIERO_FINAL_MOTIF_LABELS,
        classifyPuzzleFinalMotif: Core.createHieroglyphicMotifHelpers(Chess).classifyPuzzleFinalMotif,
        analyzeFenRobust: jest.fn(async () => ({ bestMove: alternatives[0], alternatives })),
        closeHieroglyphicCandidateWithStockfish: async c => ({ ...c }), hieroglyphicStats: { generatedFens: [] },
        hgDeviceId: () => 'test-device', hieroglyphicDifficultyPercent: () => 50,
        parseFenPosition: () => null, analyzePvThreats: () => null,
        hgSolvedHistoryFens: () => new Set(), hgFingerprint: it => it.id,
        candidate: { ...candidate }
    });
    vm.runInContext(between('async function verifyHieroglyphicConclusion(', 'function extractGameEntryCandidateFens(')
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
    expect(seq.totalSteps).toBe(1);
    expect(seq.endsInMate).toBe(true);
    expect(seq.fullSequence).toEqual(['d1d8']);
    expect(loaded.conclusion.explanation).toContain('cap resposta legal');
});

test('la cua antiga o amb línia modificada no passa per la porta del generador nou', async () => {
    const app = setup();
    const valid = await app.run('verifyHieroglyphicConclusion(candidate)');
    app.context.hgState = { queue: [{ ...candidate, id: 'old' }, { ...valid, id: 'new' }, { ...valid, id: 'changed', solutionMoves: ['d1d7'] }] };
    app.run('hgPurgeStale()');
    expect(app.context.hgState.queue.map(it => it.id)).toEqual(['new']);
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
