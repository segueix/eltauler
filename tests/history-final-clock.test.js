const fs = require('fs');
const vm = require('vm');
const Store = require('../gamestore');
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
function harness(clock) {
    const ctx = vm.createContext({ gameClock: clock,
        TIME_CONTROLS: [{ id: '3+2', label: 'Blitz 3+2' }], CLOCK_CENTIS_MS: 10000 });
    vm.runInContext(source.slice(source.indexOf('function formatHistoryMode('), source.indexOf('const TV_LICHESS_CHANNELS')) +
        source.slice(source.indexOf('function formatClock('), source.indexOf('// Quant ha de trigar el pròxim tic')), ctx);
    return ctx;
}

test('desa una còpia dels dos rellotges que sobreviu a l’índex i a una partida nova', () => {
    const clock = { enabled: true, white: 65200, black: 9420 };
    const ctx = harness(clock);
    const entry = { mode: 'free', playerColor: 'b', timeControl: '3+2', finalClock: ctx.snapshotFinalClock() };
    clock.white = 180000;
    clock.black = 180000;
    const restored = JSON.parse(JSON.stringify(Store.splitEntry(entry).index));
    expect(restored.finalClock).toEqual({ white: 65200, black: 9420 });
    expect(ctx.describeHistoryGame(restored)).toBe('Amistosa Blitz 3+2 amb negres · Rellotge final: blanques 1:06 · negres 0:09.42');
});

test('bandera a zero i rellotge rival conservat', () => {
    const ctx = harness({ enabled: true, white: -35, black: 20100 });
    expect(ctx.historyFinalClockLabel({ finalClock: ctx.snapshotFinalClock() }))
        .toBe('Rellotge final: blanques 0:00.00 · negres 0:20.1');
});

test('sense rellotge, antigues i dades incompletes no inventen temps finals', () => {
    const ctx = harness({ enabled: false, white: 123, black: 456 });
    expect(ctx.snapshotFinalClock()).toBeNull();
    expect(ctx.describeHistoryGame({ mode: 'free', playerColor: 'w' })).toBe('Amistosa amb blanques');
    expect(ctx.historyFinalClockLabel({ finalClock: { white: 200 } })).toBeNull();
});
