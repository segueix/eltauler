const fs = require('fs'), vm = require('vm');
const { Chess } = require('chess.js');
const Core = require('../core');
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
function setup({ color = 'w', base = 30, inc = 0, mode = 'free', fen } = {}) {
    let now = 1000, serial = 0;
    const intervals = new Set(), wrap = { style: {} };
    const c = vm.createContext({ game: new Chess(fen), gameClock: {}, playerColor: color, currentGameMode: mode,
        PHASE_REPLAY_CLOCK_FRACTION: .3, getTimeControlConfig: () => ({ id: base ? 'test' : 'none', base, inc }),
        nowMs: () => now, ElTaulerCore: Core, DEBUG_CLOCK_TIMING: false,
        document: { getElementById: id => id === 'game-clocks' ? wrap : null },
        setInterval: () => { intervals.add(++serial); return serial; }, clearInterval: id => intervals.delete(id),
        setTimeout: jest.fn(), clockWarnIfLow: jest.fn(), clearEngineMoveTimers: jest.fn(), clearQueuedPremove: jest.fn(),
        showImmediateGameResult: jest.fn(), scheduleGameOverAfterPaint: jest.fn(), isEngineThinking: false });
    vm.runInContext(source.slice(source.indexOf('const CLOCK_CENTIS_MS ='), source.indexOf('function showPreparingBoard('))
        + source.slice(source.indexOf('function restoreGameClock(saved)'), source.indexOf('function liveGameShowResumed(')), c);
    return { c, intervals, wrap, advance(ms) { now += ms; if (c.gameClock.interval) c.clockTick(); },
        move(san, premove = false) { const move = c.game.move(san); if (move) c.clockOnMove(premove); return move; } };
}
describe('rellotge real de l’app: inici amb la primera jugada de blanques', () => {
    test.each([30, 60, 180, 600])('%s segons: esperar abans de moure no consumeix temps', base => {
        const h = setup({ base });h.c.initGameClock(true);h.advance(300000);h.c.clockTick();
        expect(h.c.gameClock.white).toBe(base * 1000);expect(h.c.gameClock.black).toBe(base * 1000);
        expect(h.c.gameClock.awaitingFirstMove).toBe(true);expect(h.intervals.size).toBe(0);
        h.move('e4');expect(h.c.gameClock.active).toBe('b');expect(h.c.gameClock.awaitingFirstMove).toBe(false);
        expect(h.intervals.size).toBe(1);h.advance(700);
        expect(h.c.gameClock.black).toBe(base * 1000 - 700);expect(h.c.gameClock.white).toBe(base * 1000);
        h.move('e5');h.advance(500);expect(h.c.gameClock.white).toBe(base * 1000 - 500);
    });
    test('una jugada il·legal i obrir/tancar un modal no activen el rellotge', () => {
        const h = setup();h.c.initGameClock(true);expect(h.move('e5')).toBeNull();
        h.c.pauseGameClock();h.advance(90000);h.c.resumeGameClock();h.advance(90000);
        expect(h.c.gameClock.awaitingFirstMove).toBe(true);expect(h.c.gameClock.white).toBe(30000);expect(h.intervals.size).toBe(0);
    });
    test('l’increment es conserva i no es cobra l’espera anterior a la primera jugada', () => {
        const h = setup({ base: 180, inc: 2 });h.c.initGameClock(true);h.advance(60000);h.move('d4');
        expect(h.c.gameClock.white).toBe(182000);h.advance(1100);h.move('d5');
        expect(h.c.gameClock.black).toBe(180900);h.advance(500);h.move('c4');expect(h.c.gameClock.white).toBe(183500);
    });
    test('amb negres, el rellotge de Stockfish arrenca immediatament', () => {
        const h = setup({ color: 'b' });h.c.initGameClock(true);h.advance(650);
        expect(h.c.gameClock.white).toBe(29350);expect(h.c.gameClock.awaitingFirstMove).toBe(false);
        h.move('e4');h.advance(120);h.move('e5', true);expect(h.c.gameClock.black).toBe(29880);
    });
    test('després del primer moviment es mantenen les premoves i la bandera', () => {
        const h = setup();h.c.initGameClock(true);h.move('e4');h.advance(100);h.move('e5');
        h.advance(20);h.move('Nf3', true);expect(h.c.gameClock.white).toBe(29900);
        h.advance(30000);expect(h.c.showImmediateGameResult).toHaveBeenCalledWith(false, 'b');expect(h.intervals.size).toBe(0);
    });
    test('reprendre una partida iniciada no regala una segona primera jugada', () => {
        const h = setup();h.c.game.move('e4');h.c.game.move('e5');
        h.c.restoreGameClock({ white: 21000, black: 22000, inc: 0, awaitingFirstMove: false });h.advance(500);
        expect(h.c.gameClock.white).toBe(20500);expect(h.c.gameClock.awaitingFirstMove).toBe(false);
        h.c.restoreGameClock({ white: 21000, black: 22000, inc: 0, awaitingFirstMove: true });h.advance(500);
        expect(h.c.gameClock.white).toBe(20500);
    });
    test('reprendre una partida encara no començada conserva l’espera', () => {
        const h = setup();h.c.restoreGameClock({ white: 30000, black: 30000, inc: 0, awaitingFirstMove: true });h.advance(90000);
        expect(h.c.gameClock.white).toBe(30000);expect(h.intervals.size).toBe(0);h.move('Nf3');h.advance(400);
        expect(h.c.gameClock.black).toBe(29600);
    });
    test('s’aplica a la lliga i als reptes nous amb blanques; respecta el torn real del FEN', () => {
        const h = setup({ mode: 'league' });h.c.initGameClock(true);expect(h.c.gameClock.awaitingFirstMove).toBe(true);
        const white = setup({ mode: 'phase_replay', base: 180, fen: '4k3/8/8/8/8/8/4P3/4K3 w - - 0 12' });
        white.c.initGameClock(true);expect(white.c.gameClock.white).toBe(54000);expect(white.c.gameClock.awaitingFirstMove).toBe(true);
        const black = setup({ fen: '4k3/8/8/8/8/8/4P3/4K3 b - - 0 12' });black.c.initGameClock(true);black.advance(200);
        expect(black.c.gameClock.black).toBe(29800);expect(black.c.gameClock.awaitingFirstMove).toBe(false);
    });
    test('les partides sense rellotge continuen sense temporitzador', () => {
        const h = setup({ base: 0 });h.c.initGameClock(true);h.move('e4');h.advance(20000);
        expect(h.c.gameClock.enabled).toBe(false);expect(h.intervals.size).toBe(0);expect(h.wrap.style.display).toBe('none');
    });
});
