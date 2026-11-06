// Errades per pressió de rellotge del rival (core.js: CLOCK_SLIP_EXCESS,
// clockSlipChance, pickClockSlip; app.js: pickClockSlipMove i la tirada de
// makeEngineMove). Vegeu ANALISI_RELLOTGE.md §13 per a la mesura.
const Core = require('../core');
const { Chess } = require('chess.js');
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');

function random(seed = 42) { let n = seed; return () => ((n = (Math.imul(n, 1664525) + 1013904223) >>> 0) / 4294967296); }
function chooser(elo, seed = 42) {
    const context = vm.createContext({ ElTaulerCore: Core, Chess, game: new Chess(),
        ELO_MIN: 200, ELO_MAX: 2600, engineEloMin: 1350, DEBUG_WEAK_AI: false,
        getActiveStrengthElo: () => elo, Math: Object.assign(Object.create(Math), { random: random(seed) }) });
    vm.runInContext(source.slice(source.indexOf('const WEAK_AI_CONFIG ='), source.indexOf('let game =')) +
        source.slice(source.indexOf('const PIECE_VALUE ='), source.indexOf('// MODIFICAT: Ara carrega directament')), context);
    return context;
}
const sec = (tc, s) => Core.clockSlipChance({ timeControlId: tc, remainingMs: s * 1000 });

describe('quan s’equivoca el rival per pressió de rellotge (dades reals)', () => {
    test('als centres dels trams dóna exactament l’excés mesurat', () => {
        for (const [tc, pts] of Object.entries(Core.CLOCK_SLIP_EXCESS)) {
            for (const [s, excess] of pts) expect(sec(tc, s)).toBeCloseTo(excess, 10);
        }
    });

    test('va just o no hi ha efecte: res amb el rellotge còmode ni als ritmes no mesurats', () => {
        expect(sec('30s', 10)).toBe(0);
        expect(sec('1+0', 20)).toBe(0);
        expect(sec('1+0', 45)).toBe(0);
        expect(sec('3+2', 30)).toBe(0);
        expect(sec('5+0', 120)).toBe(0);
        for (const tc of ['10+0', '15+10', 'none', undefined]) expect(sec(tc, 1)).toBe(0);
        expect(Core.clockSlipChance({ timeControlId: '1+0', remainingMs: null })).toBe(0);
    });

    test.each(Object.keys(Core.CLOCK_SLIP_EXCESS))('%s: com menys temps, més errades (mai menys)', tc => {
        let prev = Infinity;
        for (let ms = 0; ms <= 40000; ms += 250) {
            const p = Core.clockSlipChance({ timeControlId: tc, remainingMs: ms });
            expect(p).toBeLessThanOrEqual(prev + 1e-12);
            expect(p).toBeGreaterThanOrEqual(0);
            expect(p).toBeLessThan(0.06);
            prev = p;
        }
    });

    // Les dues mesures de l'efecte a 1+0 (posicions obertes, totes les franges):
    // comparat amb el rival al mateix tram de la mateixa partida (la baixa, la
    // que es fa servir) i comparat amb un mateix (la alta, que hi barreja el
    // desgast de la partida). La taula no pot sortir d'aquesta forquilla: ni
    // inventar més efecte del que s'ha vist ni treure'l.
    test('1+0: la taula queda dins la forquilla de les dues mesures', () => {
        const mesures = [
            { s: 1, baixa: 0.029, alta: 0.087 },   // 0-2 s (la baixa, suavitzada amb el tram veí)
            { s: 3, baixa: 0.025, alta: 0.069 },
            { s: 5, baixa: 0.029, alta: 0.061 },
            { s: 8, baixa: 0.029, alta: 0.055 },
            { s: 12.5, baixa: 0.021, alta: 0.041 },
            { s: 17.5, baixa: 0.018, alta: 0.035 }
        ];
        for (const { s, baixa, alta } of mesures) {
            expect(sec('1+0', s)).toBeGreaterThanOrEqual(baixa - 1e-9);
            expect(sec('1+0', s)).toBeLessThanOrEqual(alta);
        }
    });

    test('no depèn del nivell del rival: l’apuro fa equivocar-se igual de més a tothom', () => {
        // L'excés absolut mesurat és pla entre franges (1+0, 6-10 s: +3,5%,
        // +3,3%, +3,2%, +2,5% i +2,8% de <1000 a ≥2200), i la funció no rep ELO.
        expect(Core.clockSlipChance({ timeControlId: '1+0', remainingMs: 8000, elo: 600 }))
            .toBe(Core.clockSlipChance({ timeControlId: '1+0', remainingMs: 8000, elo: 2400 }));
    });
});

describe('quina jugada se li escapa (pickClockSlip)', () => {
    const cands = [
        { move: 'best', score: 40 },
        { move: 'ok', score: 10 },
        { move: 'meh', score: -60 },
        { move: 'greu', score: -250, appeal: 3 },
        { move: 'greu2', score: -450, appeal: 1 },
        { move: 'mat', score: -10000, appeal: 50 },
        { move: 'dama', score: -900, materialLoss: 9, appeal: 50 }
    ];

    test('només errades greus (≥ 0,30 de probabilitat de guanyar), mai la millor', () => {
        const rnd = random(7);
        const seen = new Set();
        for (let i = 0; i < 500; i++) {
            const slip = Core.pickClockSlip(cands, { random: rnd });
            seen.add(slip.move);
            expect(Core.winningChances(40) - Core.winningChances(slip.score)).toBeGreaterThanOrEqual(Core.CLOCK_SLIP_MIN_WC_LOSS);
        }
        expect([...seen].sort()).toEqual(['greu', 'greu2']);
    });

    test('no regala un mat ni la dama (errades possibles però no mesurades a part)', () => {
        const rnd = random(9);
        for (let i = 0; i < 300; i++) expect(['mat', 'dama']).not.toContain(Core.pickClockSlip(cands, { random: rnd }).move);
    });

    test('tria les jugades que una persona amb pressa faria (atractiu humà)', () => {
        const rnd = random(11);
        let natural = 0;
        for (let i = 0; i < 2000; i++) if (Core.pickClockSlip(cands, { random: rnd }).move === 'greu') natural++;
        // pesos 3 contra 1: ~75%
        expect(natural / 2000).toBeGreaterThan(0.70);
        expect(natural / 2000).toBeLessThan(0.80);
    });

    test('només en posicions obertes: amb la partida decidida no n’hi ha (així es va mesurar)', () => {
        expect(Core.pickClockSlip([{ move: 'a', score: 450 }, { move: 'b', score: -200 }])).toBeNull();
        expect(Core.pickClockSlip([{ move: 'a', score: -450 }, { move: 'b', score: -900 }])).toBeNull();
        expect(Core.pickClockSlip([{ move: 'a', score: 10000 }, { move: 'b', score: 0 }])).toBeNull();
    });

    test('la pèrdua de material (cara) només es calcula per a les que ja són errades greus', () => {
        const asked = [];
        const slip = Core.pickClockSlip(cands.map(({ materialLoss, appeal, ...c }) => c), {
            random: random(3),
            materialLoss: move => { asked.push(move); return move === 'dama' ? 9 : 0; },
            appeal: () => 1
        });
        expect(asked.sort()).toEqual(['dama', 'greu', 'greu2']);
        expect(['greu', 'greu2']).toContain(slip.move);
    });

    test('si cap candidata no és prou dolenta, o n’hi ha massa poques, no s’inventa res', () => {
        expect(Core.pickClockSlip([{ move: 'a', score: 30 }, { move: 'b', score: -40 }])).toBeNull();
        expect(Core.pickClockSlip([{ move: 'a', score: 30 }])).toBeNull();
        expect(Core.pickClockSlip([])).toBeNull();
        expect(Core.pickClockSlip(null)).toBeNull();
    });
});

describe('el rival de l’app (chooseHumanLikeMove)', () => {
    // Posició inicial: totes legals. h2h3 i a2a3 perden ≥ 0,30 (puntuacions de mentida).
    const candidates = [{ move: 'e2e4', score: 40, multipv: 1 }, { move: 'd2d4', score: 10, multipv: 2 },
        { move: 'g1f3', score: -60, multipv: 3 }, { move: 'b1c3', score: -120, multipv: 4 },
        { move: 'h2h3', score: -250, multipv: 5 }, { move: 'a2a3', score: -450, multipv: 6 }];
    const clock = { timeControlId: '1+0', remainingMs: 5000, incMs: 0, elo: 2000 };

    test.each([600, 1000, 1600, 2000, 2400])('a ROC %i, amb l’errada armada juga una errada greu', elo => {
        const c = chooser(elo);
        for (let i = 0; i < 40; i++) {
            const pick = c.chooseHumanLikeMove(candidates, c.game, { clock, clockSlip: true,
                engineBestMove: 'e2e4', nativeStrength: true });
            expect(['h2h3', 'a2a3']).toContain(pick.move);
        }
    });

    test('sense l’errada armada, els nivells natius continuen jugant el bestmove del motor', () => {
        const c = chooser(2000);
        for (let i = 0; i < 40; i++) {
            expect(c.chooseHumanLikeMove(candidates, c.game, { clock, engineBestMove: 'e2e4', nativeStrength: true }).move).toBe('e2e4');
        }
    });

    test('l’errada només compta amb rellotge (sense rellotge no s’arma mai)', () => {
        const c = chooser(2000);
        expect(c.chooseHumanLikeMove(candidates, c.game, { clockSlip: true, engineBestMove: 'e2e4', nativeStrength: true }).move)
            .not.toMatch(/^(h2h3|a2a3)$/);
    });

    test('amb la partida decidida, l’errada armada no fa res i mana el nivell', () => {
        const decided = candidates.map(x => ({ ...x, score: x.score + 600 }));
        const c = chooser(2000);
        for (let i = 0; i < 20; i++) {
            expect(c.chooseHumanLikeMove(decided, c.game, { clock, clockSlip: true, engineBestMove: 'e2e4', nativeStrength: true }).move).toBe('e2e4');
        }
    });

    test('makeEngineMove arma l’errada amb la probabilitat de la taula i demana més línies', () => {
        // El codi de la tirada, tal com és a app.js.
        const a = source.indexOf('engineClockSlipArmed = false;\n    if (gameClock.enabled)');
        const b = source.indexOf('const multiPvValue = ', a);
        expect(a).toBeGreaterThan(0);
        expect(b).toBeGreaterThan(a);
        const tirada = source.slice(a, source.indexOf('\n', b));
        // humanChoiceElo: amb el model de tria humana el motor puntua TOTES les
        // jugades (aquí 20), i l'errada en tria una entre totes.
        const run = (remainingMs, n, seed, humanChoiceElo = null) => {
            const ctx = vm.createContext({ ElTaulerCore: Core, gameClock: { enabled: true }, engineClockSlipArmed: false,
                engineClockContext: () => ({ timeControlId: '1+0', remainingMs }), engineReplyElapsedMs: () => 0,
                shortClock: true, requestedPv: 5, humanChoiceElo, engineComplexityPv: null, game: { moves: () => new Array(20) },
                Math: Object.assign(Object.create(Math), { random: random(seed) }) });
            let armed = 0, maxPv = 0;
            for (let i = 0; i < n; i++) {
                vm.runInContext('{' + tirada + '\narmedOut = engineClockSlipArmed; pvOut = multiPvValue; }', ctx);
                if (humanChoiceElo !== null) expect(ctx.pvOut).toBe(20);
                else if (ctx.armedOut) expect(ctx.pvOut).toBe(Core.CLOCK_SLIP_MULTIPV); else expect(ctx.pvOut).toBe(5);
                if (ctx.armedOut) armed++;
                maxPv = Math.max(maxPv, ctx.pvOut);
            }
            return armed / n;
        };
        expect(run(45000, 2000, 1)).toBe(0);
        const freq = run(5000, 20000, 2);
        expect(Math.abs(freq - sec('1+0', 5))).toBeLessThan(0.006);
        // La tirada no depèn de qui tria després.
        expect(Math.abs(run(5000, 20000, 2, 940) - freq)).toBe(0);
    });
});
