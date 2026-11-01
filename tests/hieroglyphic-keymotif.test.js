// Tema dels jeroglífics: la idea tàctica de la primera o la segona jugada
// (forquilla, clavada, enfilada, descoberta) quan la tercera en cobra el guany.
// Posicions reals del banc diari (minades i certificades amb Stockfish 19).
const { Chess } = require('chess.js');
const Core = require('../core');
const HC = require('../hieroclosure');
const M = Core.createHieroglyphicMotifHelpers(Chess);
const classify = (fen, line) => M.classifyPuzzleFinalMotif(fen, line, {});

const FORK = { fen: '8/1pnrkr2/2p1p1p1/2P3Pp/1p2RN1P/5P2/P7/2K1R3 w - - 1 34', line: ['f4g6', 'e7e8', 'g6e5', 'd7d5', 'e5f7'] };
const SKEWER = { fen: '7r/p4pk1/PpP1pbp1/6p1/2P3B1/4R1P1/5P1r/3R2K1 b - - 1 30', line: ['h2h1', 'g1g2', 'h8h2', 'g2f3', 'h1d1'] };
const DISCOVERY = { fen: '8/5K1k/6R1/p1bB4/1p6/8/8/r7 w - - 15 51', line: ['d5e4', 'a1e1', 'g6g1', 'h7h6', 'g1e1'] };
const MAJOR = { fen: '4r1k1/3R4/6p1/1p6/6P1/2q2P2/5Q2/7K w - - 6 38', line: ['f2a2', 'c3c4', 'a2a1', 'c4f7', 'd7f7'] };

describe('tema per la idea tàctica, no només per l\'última jugada', () => {
    test('forquilla a la segona jugada i captura d\'una peça forquillada a la tercera', () => {
        const info = classify(FORK.fen, FORK.line);
        expect(info.motif).toBe('fork');
        expect(info.motifs).toContain('major_win');          // el guany material continua constant
        expect(info.details.linked).toBe(true);
        expect(info.reason).toMatch(/^Segona jugada \(Ne5\): .*les dues torres.*Nxf7/);
    });
    test('el rei davant d\'una torre és una enfilada, no una clavada', () => {
        const info = classify(SKEWER.fen, SKEWER.line);
        expect(info.motif).toBe('skewer');
        expect(info.reason).toContain('enfilada');
        expect(info.reason).not.toContain('clava el rei');
    });
    test('escac descobert que deixa capturar amb la peça que s\'ha mogut', () => {
        const info = classify(DISCOVERY.fen, DISCOVERY.line);
        expect(info.motif).toBe('discovery');
        expect(info.reason).toMatch(/Rg1\+.*Rxe1/);
    });
    test('sense cap motiu lligat continua sent «guany de dama o torre»', () => {
        expect(classify(MAJOR.fen, MAJOR.line).motif).toBe('major_win');
    });
    test('l\'enfilada és un tema acceptat, amb etiqueta i prioritat', () => {
        expect(Core.HIERO_ALLOWED_FINAL_MOTIFS).toContain('skewer');
        expect(Core.HIERO_FINAL_MOTIF_LABELS.skewer).toBe('enfilada');
    });
    test('les proves dels exemples són vàlides (el tema no toca la certificació)', () => {
        [FORK, SKEWER, DISCOVERY, MAJOR].forEach(x => {
            const sol = [x.line[0], x.line[2], x.line[4]], rep = [x.line[1], x.line[3]];
            expect(HC.lineOf({ solutionMoves: sol, replyMoves: rep })).toEqual(x.line);
        });
    });
});

describe('reetiquetatge del banc diari', () => {
    const { relabel } = require('../scripts/relabel-hieroglyphics');
    test('canvia el tema i els camps visibles, sense tocar la línia ni la prova', () => {
        const item = { fen: FORK.fen, solutionMoves: [FORK.line[0], FORK.line[2], FORK.line[4]], replyMoves: [FORK.line[1], FORK.line[3]],
            finalMotif: 'major_win', finalType: 'major_win', theme: 'major_win', tacticKind: 'guany de dama o torre', conclusion: { kind: 'material' } };
        expect(relabel(item, M.classifyPuzzleFinalMotif)).toBe(true);
        expect(item).toMatchObject({ finalMotif: 'fork', finalType: 'fork', theme: 'fork', tacticKind: 'forquilla', finalMotifLabel: 'forquilla', conclusion: { kind: 'material' } });
        expect(relabel(item, M.classifyPuzzleFinalMotif)).toBe(false);   // idempotent
    });
    test('el workflow diari reetiqueta el banc abans de publicar-lo', () => {
        const wf = require('fs').readFileSync(require.resolve('../.github/workflows/jeroglifics-diaris.yml'), 'utf8');
        expect(wf.indexOf('node scripts/relabel-hieroglyphics.js')).toBeGreaterThan(wf.indexOf('mine-hieroglyphics.js --add'));
        expect(wf.indexOf('node scripts/relabel-hieroglyphics.js')).toBeLessThan(wf.indexOf('git add jeroglifics-reserva.js'));
    });
});

describe('migració a l\'app dels jeroglífics ja desats', () => {
    const fs = require('fs');
    const vm = require('vm');
    const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
    const between = (a, b) => source.slice(source.indexOf(a), source.indexOf(b, source.indexOf(a)));
    test('es reetiqueten una sola vegada la cua i l\'historial; el mat i la prova no es toquen', () => {
        const mk = (x, extra = {}) => Object.assign({ fen: x.fen, solutionMoves: [x.line[0], x.line[2], x.line[4]], replyMoves: [x.line[1], x.line[3]], finalMotif: 'major_win', theme: 'major_win', tacticKind: 'guany de dama o torre', conclusion: { kind: 'material' } }, extra);
        const store = new Map();
        let history = [mk(SKEWER), mk(MAJOR), mk(FORK, { finalMotif: 'mate', theme: 'mate' })];
        const state = { queue: [mk(FORK, { finalType: 'major_win', status: 'new' })], updatedAt: 0 };
        const ctx = vm.createContext({
            window: { ElTaulerHieroClosure: HC }, localStorage: { getItem: k => store.get(k) || null, setItem: (k, v) => store.set(k, String(v)) },
            classifyPuzzleFinalMotif: M.classifyPuzzleFinalMotif, HIERO_ALLOWED_FINAL_MOTIFS: Core.HIERO_ALLOWED_FINAL_MOTIFS, HIERO_FINAL_MOTIF_LABELS: Core.HIERO_FINAL_MOTIF_LABELS,
            hgEnsureState: () => state, hgState: state, hgSaveState: jest.fn(),
            loadHieroglyphicHistory: () => JSON.parse(JSON.stringify(history)), saveHieroglyphicHistory: l => { history = l; }, console
        });
        vm.runInContext(between('const HG_MOTIF_VERSION = 2;', '// Entrada a la secció des del bàner'), ctx);
        expect(vm.runInContext('hgMigrateMotifLabels()', ctx)).toBe(2);
        expect(state.queue[0]).toMatchObject({ finalMotif: 'fork', finalType: 'fork', theme: 'fork', tacticKind: 'forquilla' });
        expect(history.map(e => e.finalMotif)).toEqual(['skewer', 'major_win', 'mate']);
        expect(history[0].conclusion).toEqual({ kind: 'material' });
        expect(vm.runInContext('hgMigrateMotifLabels()', ctx)).toBe(0);   // ja fet
    });
});
