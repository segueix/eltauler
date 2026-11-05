// El rival gestiona el rellotge com la persona a qui s'assembla jugant
// (core.js: clockEloForRoc; ANALISI_RELLOTGE.md §15), i la cerca —que és la
// que decideix la força— continua amb el ROC.
const Core = require('../core');
const { Chess } = require('chess.js');
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');

function lcg(seed) { let n = seed >>> 0; return () => ((n = (Math.imul(n, 1664525) + 1013904223) >>> 0) / 4294967296); }
function simulate(tc, elo, { games = 1500, maxMoves = 40, seed = 99 } = {}) {
    const rnd = lcg(seed);
    const baseMs = Core.humanClockProfile(tc, elo).baseMs;
    let flagged = 0, tau = 0, n = 0;
    for (let g = 0; g < games; g++) {
        const clockTemperament = Core.rollClockTemperament(tc, elo, rnd);
        let remainingMs = baseMs;
        for (let k = 1; k <= maxMoves; k++) {
            const t = Core.gameThinkTimeMs({ timeControlId: tc, remainingMs, incMs: 0, elo, complexity: 0.45,
                phase: k <= 10 ? 'opening' : 'middlegame', moveNumber: k, clockTemperament, random: rnd });
            if (t >= remainingMs) { flagged++; break; }
            if (k <= 30) { tau += t; n++; }
            remainingMs -= t;
        }
    }
    return { flagRate: flagged / games, spendMs: tau / n };
}

describe('correspondència ROC → ELO de Lichess per al rellotge (mesurada, §14)', () => {
    test('passa exactament pels punts mesurats', () => {
        expect(Core.clockEloForRoc(1604)).toBe(1025);
        expect(Core.clockEloForRoc(1942)).toBe(1750);
    });

    test('és monòtona i mai no dóna una persona més forta que el ROC', () => {
        let prev = -Infinity;
        for (let roc = 200; roc <= 2000; roc += 5) {
            const e = Core.clockEloForRoc(roc);
            expect(e).toBeGreaterThanOrEqual(prev);
            expect(e).toBeLessThanOrEqual(roc);
            prev = e;
        }
    });

    test('per sota de les dades (ROC ≤ ~1230) dóna el perfil de rellotge més fluix mesurat', () => {
        for (const tc of ['30s', '1+0', '3+2', '5+0', '10+0', '15+10']) {
            const weakest = Core.humanClockProfile(tc, 0);
            for (const roc of [200, 600, 900, 1227]) {
                const p = Core.humanClockProfile(tc, Core.clockEloForRoc(roc));
                expect(p.spendMs).toBeCloseTo(weakest.spendMs, 6);
                expect(p.moves).toBeCloseTo(weakest.moves, 6);
            }
        }
    });

    test('el tram final es prolonga sense sortir del rang (ROC màxim 2000)', () => {
        const top = Core.clockEloForRoc(2000);
        expect(top).toBeGreaterThan(1750);
        expect(top).toBeLessThan(2000);
    });
});

describe('què canvia al rellotge del rival (1+0)', () => {
    test('ROC ~1600: gestiona el temps com una persona de ~1025 i cau de bandera molt més', () => {
        const abans = simulate('1+0', 1604);
        const ara = simulate('1+0', Core.clockEloForRoc(1604));
        expect(ara.spendMs).toBeGreaterThan(abans.spendMs * 1.1);
        expect(ara.flagRate).toBeGreaterThan(abans.flagRate * 1.8);
        // ...i és exactament el d'una persona de Lichess de 1025.
        expect(ara).toEqual(simulate('1+0', 1025));
    });

    test('ROC ~1940: gairebé no canvia (allà els dos números ja s’acosten)', () => {
        const abans = simulate('1+0', 1942);
        const ara = simulate('1+0', Core.clockEloForRoc(1942));
        expect(ara.spendMs / abans.spendMs).toBeLessThan(1.1);
        expect(ara.flagRate - abans.flagRate).toBeLessThan(0.12);
    });

    test('ROC 870: ja era el perfil més fluix, i canvia poc', () => {
        const abans = simulate('1+0', 870);
        const ara = simulate('1+0', Core.clockEloForRoc(870));
        expect(Math.abs(ara.spendMs / abans.spendMs - 1)).toBeLessThan(0.06);
    });
});

describe('a l’app: el temps de reflexió canvia, la força no', () => {
    test('computeHumanReplyDelayMs demana el temps a la persona equivalent', () => {
        const a = source.indexOf('function computeHumanReplyDelayMs(');
        const b = source.indexOf('\n}\n', a) + 2;
        const calls = [];
        const ctx = vm.createContext({
            ElTaulerCore: { ...Core, gameThinkTimeMs: p => { calls.push(p); return 1000; } },
            engineClockContext: () => ({ timeControlId: '1+0', remainingMs: 40000, incMs: 0, elo: 1604, phase: 'middlegame', moveNumber: 20 }),
            estimateEngineMoveComplexity: () => ({ score: 0.5, level: 'medium' }),
            game: new Chess(), engineReplyElapsedMs: () => 0, humanPaceMs: null, humanPaceSamples: 0, DEBUG_ENGINE_TIMING: false
        });
        vm.runInContext(source.slice(a, b) + '\nresult = computeHumanReplyDelayMs();', ctx);
        expect(calls).toHaveLength(1);
        expect(calls[0].elo).toBe(1025);
        expect(ctx.result).toBe(1000);
    });

    test('el context de rellotge continua portant el ROC (el fan servir la cerca i la revisió)', () => {
        const a = source.indexOf('function engineClockContext(');
        const body = source.slice(a, source.indexOf('\n}\n', a));
        expect(body).toMatch(/elo: getActiveStrengthElo\(\)/);
        expect(body).not.toMatch(/clockEloForRoc/);
        // La cerca de makeEngineMove i la revisió reben aquest context tal qual.
        const m = source.indexOf('function makeEngineMove(');
        const search = source.slice(m, source.indexOf('\n}\n', m));
        expect(search).toMatch(/gameSearchBudgetMs\(\{\s*\.\.\.engineClockContext\(\),\s*elapsedMs: engineReplyElapsedMs\(\)\s*\}\)/);
        expect(search).not.toMatch(/clockEloForRoc/);
        const r = source.indexOf('function postClockAwareReviewSearch(');
        expect(source.slice(r, source.indexOf('\n}\n', r))).not.toMatch(/clockEloForRoc/);
    });

    test('el tarannà de la partida també es tira per a la persona equivalent', () => {
        expect(source).toMatch(/rollClockTemperament\(currentGameTimeControlId,\s*ElTaulerCore\.clockEloForRoc\(currentGameActiveStrengthElo\)\)/);
    });
});
