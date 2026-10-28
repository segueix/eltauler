const { Chess } = require('chess.js');
const TV = require('../stockfishtv');
const H = require('../historytv');
const START = new Chess().fen();
function parsePosition(command) {
    const [fen, tail] = command.slice('position fen '.length).split(' moves ');
    const game = new Chess(fen);
    if (tail) tail.split(' ').forEach(u => game.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' }));
    return game;
}
function setup({ moves = ['e4', 'e5', 'Nf3', 'Nc6'], color = 'w', voiceOn = false, engineOn = true, startFen, speed = 'quick' } = {}) {
    const voiced = [], frames = [], prefs = { speed };
    const v = { isOn: () => voiceOn, unlock: jest.fn(), prefetch: jest.fn(),
        speak: jest.fn(text => new Promise(resolve => voiced.push({ text, resolve }))), stop: jest.fn() };
    const engines = [];
    const createEngine = () => {
        const engine = { ready: jest.fn(async () => engineOn ? { mode: 'skill', min: 0, max: 20, step: 1 } : null),
            request: jest.fn(async job => {
                if (job.tag.kind === 'history-analysis') return { infos: {}, bestUci: null };
                const game = parsePosition(job.position), legal = game.moves({ verbose: true });
                const mv = legal.find(m => ['e4', 'e5', 'Nf3', 'Nc6'].includes(m.san)) || legal[0];
                return { bestUci: mv.from + mv.to + (mv.promotion || '') };
            }), cancelAll: jest.fn(), destroy: jest.fn() };
        engines.push(engine); return engine;
    };
    const p = H.createPlayer({ ChessCtor: Chess, getVoice: () => v, createEngine,
        render: s => frames.push(JSON.parse(JSON.stringify(s))), now: () => Date.now(), random: () => .5,
        loadPrefs: () => prefs, savePrefs: next => Object.assign(prefs, next) });
    p.load({ moves, playerColor: color, startFen, roc: 1800 });
    return { p, v, voiced, frames, engines, prefs };
}
const tick = ms => jest.advanceTimersByTimeAsync(ms);
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('mateix tauler, tempos i retransmissió que Stockfish TV', () => {
    test('marca l’origen durant 1,5 segons sense avançar la posició abans', async () => {
        const { p } = setup(); p.play(); await tick(TV.TV_CONFIG.RESUME_DELAY_MS);
        expect(p.state().preview).toMatchObject({ from: 'e2', piece: 'p', color: 'w' });
        expect(p.state().fen).toBe(START);
        await tick(1499); expect(p.state().index).toBe(0);
        await tick(1); expect(p.state().index).toBe(1);
        expect(p.state().last).toMatchObject({ from: 'e2', to: 'e4' });
        expect(p.state().preview).toBeNull(); p.pause();
    });
    test('pausar durant la marca cancela la jugada i no acumula avenços', async () => {
        const { p } = setup(); p.play(); await tick(1800); p.pause();
        await tick(20000); expect(p.state().fen).toBe(START); expect(p.state().preview).toBeNull();
        p.play(); await tick(3000); expect(p.state().index).toBe(1); p.pause();
    });
    test('la locució acaba abans de la marca següent i respecta la pausa de ràdio', async () => {
        const { p, voiced } = setup({ voiceOn: true }); p.play(); await tick(3000);
        expect(voiced).toHaveLength(1); expect(p.state().index).toBe(1);
        await tick(30000); expect(p.state().index).toBe(1); expect(p.state().preview).toBeNull();
        voiced[0].resolve({ spoken: true }); await tick(TV.TV_CONFIG.POST_SPEECH_PAUSE_MS);
        expect(p.state().preview.from).toBe('e7');
        await tick(1500); expect(p.state().index).toBe(2); p.pause();
    });
    test('avanç manual té la mateixa previsualització i només fa una jugada', async () => {
        const { p } = setup(); p.step(); await tick(0);
        expect(p.state().preview.from).toBe('e2'); await tick(1500);
        expect(p.state().index).toBe(1); expect(p.state().paused).toBe(true);
        await tick(40000); expect(p.state().index).toBe(1);
    });
    test('els tres tempos comparteixen els valors i l’ordre de TV', async () => {
        const times = [];
        for (const speed of ['quick', 'calm', 'slow']) {
            const { p, frames } = setup({ speed }); p.play();
            let elapsed = 0;
            while (p.state().index < 2 && elapsed < 20000) { await tick(100); elapsed += 100; }
            expect(p.state().index).toBe(2); expect(frames.some(s => s.preview)).toBe(true);
            times.push(elapsed); p.pause();
        }
        expect(times[0]).toBeLessThan(times[1]); expect(times[1]).toBeLessThan(times[2]);
    });
    test('canviar el tempo durant una marca no deixa sortir la jugada cancel·lada', async () => {
        const { p, prefs } = setup(); p.play(); await tick(1800); p.setSpeed('slow');
        expect(prefs.speed).toBe('slow'); expect(p.state().index).toBe(0);
        await tick(1500); expect(p.state().index).toBe(0);
        await tick(1500); expect(p.state().index).toBe(1); p.pause();
    });
    test('usa el mateix redactor de TV per a la jugada visible', async () => {
        const fen = '4k3/7r/4q3/8/8/5N2/8/K7 w - - 0 1';
        const { p } = setup({ moves: ['Ng5'], startFen: fen }); p.step(); await tick(1500);
        const before = new Chess(fen), mv = before.move('Ng5');
        const expected = TV.tvBroadcastStep({ ChessCtor: Chess, fenBefore: fen, fenAfter: before.fen(), move: mv,
            before: null, after: null, tier: 'advanced', ply: 0, memory: TV.tvEmptyMemory() });
        expect(p.state().comment.text).toBe(expected.comment.text);
        expect(p.state().comment.fen).toBe(p.state().fen);
    });
    test('el final de la partida guardada espera l’última locució', async () => {
        const { p, voiced } = setup({ moves: ['e4'], voiceOn: true }); p.play(); await tick(3000);
        expect(p.state().paused).toBe(false); voiced[0].resolve({ spoken: true }); await tick(0);
        expect(p.state().paused).toBe(true); expect(p.state().finished).toBe(true);
    });
});

describe('prendre el control sense tocar la partida desada', () => {
    test('manté el color original, deixa moure el rival si toca i respon a la variant', async () => {
        const moves = Object.freeze(['e4', 'e5', 'Nf3', 'Nc6']);
        const { p, engines } = setup({ moves, color: 'b' });
        p.takeControl(); expect(p.state().playerColor).toBe('b'); expect(p.state().yourTurn).toBe(false);
        expect(p.userMove('e2', 'e4')).toBe(false);
        await tick(2700); expect(p.state().yourTurn).toBe(true);
        expect(p.userMove('e7', 'e6')).toBe(true);
        await tick(15000); expect(p.state().yourTurn).toBe(true);
        expect(p.state().index).toBe(0); expect(p.state().variation).toContain('e6');
        expect(moves).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
        const jobs = engines[0].request.mock.calls.map(x => x[0]).filter(j => j.tag.kind === 'history-variation');
        expect(jobs).toHaveLength(2);
        p.releaseControl(); expect(p.state().fen).toBe(START); expect(p.state().control).toBe(false);
        p.pause();
    });
    test('reprendre torna exactament a la posició de l’original on s’havia pres control', async () => {
        const { p } = setup(); p.seek(2); const originalFen = p.state().fen;
        p.takeControl(); expect(p.userMove('d2', 'd4')).toBe(true);
        await tick(15000); expect(p.state().fen).not.toBe(originalFen);
        p.releaseControl(); expect(p.state().fen).toBe(originalFen); expect(p.state().index).toBe(2);
        p.pause();
    });
    test('enrere desfà la resposta i la jugada de prova, conservant el color', async () => {
        const { p } = setup(); p.seek(2); const initial = p.state().fen;
        p.takeControl(); p.userMove('d2', 'd4'); await tick(15000);
        p.back(); await tick(0);
        expect(p.state().fen).toBe(initial); expect(p.state().yourTurn).toBe(true);
        expect(p.state().playerColor).toBe('w'); expect(p.state().variation).toEqual([]); p.pause();
    });
    test('respecta promocions i posicions inicials FEN, inclòs el torn de negres', async () => {
        const fen = '4k3/8/8/8/8/8/p7/4K3 b - - 0 32';
        const { p } = setup({ startFen: fen, moves: ['a1=Q+'], color: 'b' }); p.takeControl();
        expect(p.userMoves('a2').filter(m => m.to === 'a1')).toHaveLength(4);
        expect(p.userMove('a2', 'a1', 'n')).toBe(true); await tick(0);
        expect(p.chess().get('a1')).toEqual({ type: 'n', color: 'b' });
        p.releaseControl(); expect(p.state().fen).toBe(fen); p.pause();
    });
    test('no pot moure el color equivocat ni una peça il·legal', () => {
        const { p } = setup(); p.takeControl();
        expect(p.userMove('e7', 'e5')).toBe(false); expect(p.userMove('e2', 'e5')).toBe(false);
        expect(p.state().fen).toBe(START); p.pause();
    });
    test('amb motor indisponible, l’original es reprodueix i la variant falla de forma recuperable', async () => {
        const { p } = setup({ engineOn: false, color: 'b' });
        p.takeControl(); await tick(0); expect(p.state().error).toMatch(/Stockfish/); expect(p.state().paused).toBe(true);
        p.releaseControl(); await tick(3000); expect(p.state().index).toBe(1); p.pause();
    });
});

describe('cancel·lació i propietat dels recursos', () => {
    test('canviar de partida invalida les respostes pendents del motor', async () => {
        const { p, engines } = setup(); p.play(); await tick(0);
        p.pause(); let finish;
        engines[0].request.mockImplementationOnce(() => new Promise(r => { finish = r; }));
        p.seek(2); p.play(); await tick(0);
        p.load({ moves: ['d4'], playerColor: 'w' });
        finish({ infos: {}, bestUci: 'b1c3' }); await tick(30000);
        expect(p.state().fen).toBe(START); expect(p.state().index).toBe(0);
        expect(engines[0].destroy).toHaveBeenCalled();
    });
    test('tancar talla veu, timers i motor; cap callback ressuscita la partida', async () => {
        const { p, v, voiced, engines } = setup({ voiceOn: true }); p.play(); await tick(3000);
        p.close(); expect(v.stop).toHaveBeenCalled(); expect(engines[0].destroy).toHaveBeenCalled();
        voiced[0].resolve({ spoken: true }); await tick(50000);
        expect(p.state().open).toBe(false); expect(p.state().index).toBe(1); expect(jest.getTimerCount()).toBe(0);
    });
    test('pausar una reproducció silenciosa no cancel·la àudio d’altres pantalles', () => {
        const { p, v } = setup(); p.pause(); expect(v.stop).not.toHaveBeenCalled();
    });
    test('les marques compartides són idèntiques i no deixen destins antics durant la previsualització', () => {
        const cells = ['e2', 'e4', 'e7'].map(name => {
            const classes = new Set();
            return { name, classes, getAttribute: () => name, classList: { toggle: (key, yes) => yes ? classes.add(key) : classes.delete(key) } };
        });
        const el = { querySelectorAll: () => cells };
        TV.applyBroadcastHighlights(el, { last: { from: 'e2', to: 'e4' } });
        expect(cells[0].classes.has('sftv-from')).toBe(true); expect(cells[1].classes.has('sftv-to')).toBe(true);
        TV.applyBroadcastHighlights(el, { last: { from: 'e2', to: 'e4' }, preview: 'e7' });
        expect(cells[0].classes.has('sftv-from')).toBe(false); expect(cells[1].classes.has('sftv-to')).toBe(false);
        expect(cells[2].classes.has('sftv-preview')).toBe(true);
    });
});
