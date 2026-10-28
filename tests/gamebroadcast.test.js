const Chess = require('chess.js').Chess;
const TV = require('../stockfishtv');
const B = require('../gamebroadcast');
const fs = require('fs');
const vm = require('vm');

function report(fen, move, extra = {}) {
    return B.comment(Chess, TV, { fenBefore: fen, move, scope: 'history', ...extra });
}
const start = new Chess().fen();
const fork = '4k3/7r/4q3/8/8/5N2/8/K7 w - - 0 1';

describe('comentari de jugades ja fetes', () => {
    test('preferències independents i voluntàries; limita el volum', () => {
        expect(B.preferences()).toEqual({ enabled: false, volume: 0.8, frequency: 'all' });
        expect(B.preferences({ enabled: true, volume: 8, frequency: 'key' })).toEqual({ enabled: true, volume: 1, frequency: 'key' });
        expect(B.preferences({ enabled: 'on', volume: NaN, frequency: 'bad' })).toEqual(B.preferences());
    });
    test.each(['free', 'positional', 'antidote', 'besso', 'explorer', 'phase_replay'])('admet entrenament %s', mode => {
        expect(B.trainingAllowed({ mode })).toBe(true);
    });
    test.each([{ mode: 'league' }, { mode: 'bundle' }, { mode: 'free', exercise: true },
        { mode: 'free', calibration: true }, { mode: 'free', timedCalibration: true }])('exclou partides puntuables de lliga, calibratge i exercicis: %j', s => {
        expect(B.trainingAllowed(s)).toBe(false);
    });
    test('diu peó i les caselles reals; cap millor jugada inventada', () => {
        const r = report(start, 'e4', { scope: 'training' });
        expect(r.text).toBe('Blanques: el peó de e2 va a e4.');
        expect(r.important).toBe(false);
        expect(r.speech).not.toMatch(/pawn|e2e4/);
    });
    test('rebutja moviments il·legals i una FEN final que no correspon', () => {
        expect(report(start, 'e5')).toBeNull();
        expect(report(start, 'e4', { fenAfter: start })).toBeNull();
    });
    test('explica la forquilla a l’historial i només la pròpia a l’entrenament', () => {
        expect(report(fork, 'f3g5').text).toMatch(/Forquilla|Atac doble/i);
        expect(report(fork, 'f3g5', { scope: 'training', playerColor: 'w' }).text).toMatch(/Forquilla|Atac doble/i);
        const rival = report(fork, 'f3g5', { scope: 'training', playerColor: 'b' });
        expect(rival.text).toBe('Blanques: el cavall de f3 va a g5.');
        expect(rival.important).toBe(false);
    });
    test('errors desats només quan coincideixen la posició i la jugada', () => {
        const reviews = [{ fen: start, playerMove: 'e2e4', quality: 'blunder', bestMove: 'd2d4' }];
        expect(report(start, 'e4', { reviews }).text).toContain('error greu');
        expect(report(start, 'd4', { reviews }).text).not.toContain('error');
        expect(report(start, 'e4', { scope: 'training', playerColor: 'w', reviews }).text).not.toMatch(/error|d4/);
    });
    test('explica enroc, al pas i promoció amb fets verificats', () => {
        expect(report('4k3/8/8/8/8/8/8/4K2R w K - 0 1', 'O-O').text).toContain('enroc curt');
        expect(report('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2', 'exd6').text).toContain('al pas');
        expect(report('4k3/P7/8/8/8/8/8/4K3 w - - 0 1', 'a8=Q').text).toContain('es converteix en la dama');
    });
    test('narra el mat real sense anuncis de captures posteriors', () => {
        const r = report('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', 'Rd8#');
        expect(r.text).toContain('Escac i mat. Guanyen les blanques.');
        expect(r.important).toBe(true);
    });
    test('diferencia una captura inicial d’una recaptura real', () => {
        const g = new Chess('4k3/8/8/8/8/8/r7/R3K3 w - - 0 1');
        const fen = g.fen(); g.move('Rxa2');
        expect(report(fen, 'Rxa2', { scope: 'training', chess: g }).text).not.toContain('Recaptura');
        const h = new Chess(); ['e4', 'd5', 'exd5'].forEach(m => h.move(m));
        const before = h.fen(); h.move('Qxd5');
        expect(report(before, 'Qxd5', { scope: 'training', chess: h }).text).toContain('Recaptura');
    });
    test('la durada màxima artificial de TV no s’aplica a altres partides', () => {
        const game = new Chess(); game.move('e4');
        const history = game.history.bind(game);
        game.history = opts => opts ? history(opts) : Array(1000).fill('e4');
        expect(report(start, 'e4', { chess: game }).text).not.toMatch(/Taules|durada/);
    });
    test('usa l’historial real per reconèixer taules per repetició', () => {
        const game = new Chess();
        ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1'].forEach(m => game.move(m));
        const fen = game.fen(); game.move('Ng8');
        expect(report(fen, 'Ng8', { chess: game }).text).toContain('Taules per repetició');
    });
});

describe('propietat i cancel·lació de la locució', () => {
    test('parar sense locució pròpia no cancel·la la veu d’altres modes', () => {
        const voice = { speak: jest.fn(), stop: jest.fn() };
        B.createNarrator(voice).stop();
        expect(voice.stop).not.toHaveBeenCalled();
    });
    test('desactivar resol immediatament, encara que Matxa no respongui', async () => {
        const voice = { speak: () => new Promise(() => {}), stop: jest.fn() };
        const n = B.createNarrator(voice), done = n.speak('Peó a e4.');
        n.stop();
        await expect(done).resolves.toEqual({ spoken: false, reason: 'stopped' });
        expect(n.busy()).toBe(false);
        expect(voice.stop).toHaveBeenCalledTimes(1);
    });
    test('una resposta antiga no completa ni cancel·la la nova locució', async () => {
        const resolves = [];
        const voice = { speak: () => new Promise(r => resolves.push(r)), stop: jest.fn() };
        const n = B.createNarrator(voice), a = n.speak('Primera'), b = n.speak('Segona');
        await expect(a).resolves.toMatchObject({ reason: 'stopped' });
        resolves[0]({ spoken: true }); await Promise.resolve();
        expect(n.busy()).toBe(true);
        resolves[1]({ spoken: true }); await expect(b).resolves.toEqual({ spoken: true });
        expect(n.busy()).toBe(false);
    });
    test.each([() => { throw Error('audio'); }, () => Promise.reject(Error('audio'))])('una fallada no encalla la reproducció', async speak => {
        const n = B.createNarrator({ speak, stop() {} });
        await expect(n.speak('Jugada')).resolves.toMatchObject({ reason: 'error' });
    });
});

function replayHarness() {
    const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
    const pending = [];
    const context = vm.createContext({ Chess, setTimeout, clearTimeout, clearInterval,
        historyReplay: { game: new Chess(), moves: ['e4', 'e5', 'Nf3'], entry: {}, moveIndex: 0, isPlaying: false },
        activeReviewHighlight: null, updateHistoryBoard: jest.fn(), updateHistoryControls: jest.fn(),
        stopReviewTts() {}, narrationPrefs: () => ({ enabled: false }),
        stopGameNarration: () => { while (pending.length) pending.shift()(); },
        narrateGameMove: () => new Promise(r => pending.push(r))
    });
    vm.runInContext(source.slice(source.indexOf('function stopHistoryPlayback()'), source.indexOf('function updateHistoryControls()')) +
        source.slice(source.indexOf('async function historyStepForward()'), source.indexOf('function stopTvPlayback()')), context);
    return { context, pending, run: code => vm.runInContext(code, context) };
}
describe('sincronització real del reproductor de l’historial', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());
    test('espera el final de la locució abans del següent moviment', async () => {
        const h = replayHarness(); h.run('startHistoryPlayback()');
        await jest.advanceTimersByTimeAsync(900);
        expect(h.context.historyReplay.moveIndex).toBe(1);
        await jest.advanceTimersByTimeAsync(10000);
        expect(h.context.historyReplay.moveIndex).toBe(1);
        h.pending.shift()(); await jest.advanceTimersByTimeAsync(900);
        expect(h.context.historyReplay.moveIndex).toBe(2);
    });
    test('pausa/reprèn durant la locució sense crear dos bucles', async () => {
        const h = replayHarness(); h.run('startHistoryPlayback()');
        await jest.advanceTimersByTimeAsync(900);
        h.run('stopHistoryPlayback(); startHistoryPlayback();');
        await jest.advanceTimersByTimeAsync(900);
        expect(h.context.historyReplay.moveIndex).toBe(2);
        expect(h.pending).toHaveLength(1);
        h.pending.shift()(); await jest.advanceTimersByTimeAsync(900);
        expect(h.context.historyReplay.moveIndex).toBe(3);
        h.pending.shift()(); await jest.advanceTimersByTimeAsync(900);
        expect(h.context.historyReplay.isPlaying).toBe(false);
    });
    test('enrere atura la veu i no reapareix cap moviment pendent', async () => {
        const h = replayHarness(); h.run('startHistoryPlayback()');
        await jest.advanceTimersByTimeAsync(900);
        h.run('historyStepBack()');
        await jest.advanceTimersByTimeAsync(10000);
        expect(h.context.historyReplay.moveIndex).toBe(0);
        expect(h.context.historyReplay.game.fen()).toBe(start);
    });
    test('una partida nova no rep el temporitzador de l’anterior', async () => {
        const h = replayHarness(); h.run('startHistoryPlayback()');
        await jest.advanceTimersByTimeAsync(900);
        h.run('stopHistoryPlayback(); historyReplay = { game: new Chess(), moves: ["d4"], entry: {}, moveIndex: 0 };');
        await jest.advanceTimersByTimeAsync(10000);
        expect(h.context.historyReplay.moveIndex).toBe(0);
    });
});
