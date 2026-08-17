const Core = require('../core.js');

// Generador "aleatori" constant per fer deterministes els tests: amb el mateix
// valor injectat, el soroll log-normal és idèntic entre crides i les
// comparacions només depenen dels paràmetres que canviem.
const fixedRandom = () => 0.5;

// Generador pseudoaleatori reproduïble (LCG): les simulacions d'aquest fitxer
// han de donar el mateix resultat a cada execució.
function lcg(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('estimateMoveComplexity', () => {
    test('posició trivial (gran escletxa, cerca estable) surt baixa', () => {
        const result = Core.estimateMoveComplexity({
            candidates: [
                { multipv: 1, move: 'e2e4', score: 250 },
                { multipv: 2, move: 'd2d4', score: -80 },
                { multipv: 3, move: 'g1f3', score: -120 }
            ],
            bestMoveChanges: 0,
            evalSamples: [245, 250, 250],
            shallowDeepSwingCp: 5,
            tacticalFlag: 0
        });
        expect(result.level).toBe('low');
        expect(result.score).toBeLessThan(0.33);
    });

    test('posició incerta i tàctica (candidates empatades, PV inestable) surt alta', () => {
        const result = Core.estimateMoveComplexity({
            candidates: [
                { multipv: 1, move: 'e2e4', score: 20 },
                { multipv: 2, move: 'd2d4', score: 15 },
                { multipv: 3, move: 'g1f3', score: 10 },
                { multipv: 4, move: 'c2c4', score: 5 }
            ],
            bestMoveChanges: 4,
            evalSamples: [80, -40, 60, -30],
            shallowDeepSwingCp: 180,
            tacticalFlag: 1
        });
        expect(result.level).toBe('high');
        expect(result.score).toBeGreaterThanOrEqual(0.66);
    });

    test('sense dades retorna una complexitat neutra dins [0, 1]', () => {
        const result = Core.estimateMoveComplexity({});
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
        expect(['low', 'medium', 'high']).toContain(result.level);
    });
});

describe('eloComplexityTimeMultiplier (matriu de l\'informe)', () => {
    test('ELO baix: gasta MÉS en posicions fàcils que en difícils', () => {
        const easy = Core.eloComplexityTimeMultiplier(900, 0.1);
        const hard = Core.eloComplexityTimeMultiplier(900, 0.9);
        expect(easy).toBeGreaterThan(hard);
    });

    test('ELO alt: gasta MENYS en posicions fàcils i més en les crítiques', () => {
        const easy = Core.eloComplexityTimeMultiplier(2500, 0.1);
        const hard = Core.eloComplexityTimeMultiplier(2500, 0.9);
        expect(hard).toBeGreaterThan(easy);
        expect(easy).toBeLessThan(1);
    });

    test('els valors extrems coincideixen amb les cantonades de la matriu', () => {
        expect(Core.eloComplexityTimeMultiplier(500, 0)).toBeCloseTo(1.15, 2);
        expect(Core.eloComplexityTimeMultiplier(3000, 1)).toBeCloseTo(1.30, 2);
    });
});

describe('phaseFromFen', () => {
    test('posició inicial és obertura', () => {
        expect(Core.phaseFromFen(START_FEN)).toBe('opening');
    });

    test('poc material no-peó és final', () => {
        expect(Core.phaseFromFen('8/8/4k3/8/8/4K3/8/4R3 w - - 0 50')).toBe('endgame');
    });

    test('material complet passada la jugada 10 és migjoc', () => {
        const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/4P3/2N2N2/PPPP1PPP/R1BQKB1R w KQkq - 0 15';
        expect(Core.phaseFromFen(fen)).toBe('middlegame');
    });

    test('FEN invàlid no peta i retorna migjoc', () => {
        expect(Core.phaseFromFen('')).toBe('middlegame');
        expect(Core.phaseFromFen(null)).toBe('middlegame');
    });
});

describe('HUMAN_CLOCK_STATS (perfil mesurat en partides reals)', () => {
    const TCS = ['30s', '1+0', '3+2', '5+0', '10+0', '15+10'];

    test('hi ha quatre àncores d\'ELO per ritme, ordenades i amb mostra suficient', () => {
        for (const tc of TCS) {
            const rows = Core.HUMAN_CLOCK_STATS[tc];
            expect(rows).toHaveLength(4);
            for (let i = 1; i < rows.length; i++) {
                expect(rows[i].elo).toBeGreaterThan(rows[i - 1].elo);
            }
            for (const r of rows) {
                expect(r.n).toBeGreaterThan(300);
                expect(r.moves).toBeGreaterThan(15);
                expect(r.spendMs).toBeGreaterThan(0);
                expect(r.flagRate).toBeGreaterThan(0);
                expect(r.flagRate).toBeLessThan(0.8);
            }
        }
    });

    test('com més fort és el jugador, més jugades fa dins del mateix temps', () => {
        for (const tc of TCS) {
            const rows = Core.HUMAN_CLOCK_STATS[tc];
            expect(rows[rows.length - 1].moves).toBeGreaterThan(rows[0].moves + 5);
        }
    });

    test('perdre per temps és molt més freqüent com més ràpid és el ritme', () => {
        const weakest = tc => Core.HUMAN_CLOCK_STATS[tc][0].flagRate;
        expect(weakest('30s')).toBeGreaterThan(weakest('1+0'));
        expect(weakest('1+0')).toBeGreaterThan(weakest('3+2'));
        expect(weakest('5+0')).toBeGreaterThan(weakest('10+0'));
        expect(weakest('10+0')).toBeGreaterThan(weakest('15+10'));
    });
});

describe('humanClockProfile (interpolació del perfil per ELO)', () => {
    test('a les àncores reprodueix els valors mesurats', () => {
        const row = Core.HUMAN_CLOCK_STATS['1+0'][0];
        const p = Core.humanClockProfile('1+0', row.elo);
        expect(p.moves).toBeCloseTo(row.moves, 5);
        expect(p.spendMs).toBeCloseTo(row.spendMs, 5);
        expect(p.flagRate).toBeCloseTo(row.flagRate, 5);
    });

    test('entre àncores interpola i fora de rang manté l\'extrem (no extrapola)', () => {
        const rows = Core.HUMAN_CLOCK_STATS['1+0'];
        const mid = Core.humanClockProfile('1+0', (rows[0].elo + rows[1].elo) / 2);
        expect(mid.moves).toBeGreaterThan(rows[0].moves);
        expect(mid.moves).toBeLessThan(rows[1].moves);
        // ROC molt baix (el cas de qui va perdent al bullet): es queda al perfil
        // més fluix MESURAT, no s'inventa res per sota.
        const veryLow = Core.humanClockProfile('1+0', 85);
        expect(veryLow.moves).toBeCloseTo(rows[0].moves, 5);
        expect(veryLow.flagRate).toBeCloseTo(rows[0].flagRate, 5);
        const veryHigh = Core.humanClockProfile('1+0', 4000);
        expect(veryHigh.moves).toBeCloseTo(rows[rows.length - 1].moves, 5);
    });

    test('el pic de consum arriba cap a la jugada 0,57 × jugades esperades', () => {
        const p = Core.humanClockProfile('5+0', 1300);
        expect(p.kPeak).toBe(Math.round(Core.HUMAN_PACE_PEAK_RATIO * p.moves));
        let best = 0;
        let bestK = 0;
        for (let k = 1; k <= 60; k++) {
            const v = Core.humanPlannedSpendMs(p, k);
            if (v > best) { best = v; bestK = k; }
        }
        expect(bestK).toBe(p.kPeak);
    });

    test('el pla sencer suma exactament el ritme de creuer de la partida', () => {
        for (const tc of ['30s', '1+0', '3+2', '10+0']) {
            const p = Core.humanClockProfile(tc, 1300);
            let total = 0;
            const n = Math.round(p.moves);
            for (let k = 1; k <= n; k++) total += Core.humanPlannedSpendMs(p, k);
            expect(total / n).toBeCloseTo(p.cruiseMs, 0);
            // El ritme de creuer és el mesurat menys el que se'n van les
            // pensades llargues, i no se n'allunya gaire.
            expect(p.cruiseMs).toBeLessThanOrEqual(p.spendMs);
            expect(p.cruiseMs).toBeGreaterThan(p.spendMs * 0.7);
        }
    });

    test('un ritme sense dades no retorna perfil', () => {
        expect(Core.humanClockProfile('none', 1400)).toBeNull();
        expect(Core.humanClockProfile('7+7', 1400)).toBeNull();
    });
});

describe('clockManagementSkill (gestió del rellotge segons ELO)', () => {
    test('un ROC baix mira poc el rellotge i triga a adonar-se que va just', () => {
        const low = Core.clockManagementSkill(800);
        expect(low.clockAwareness).toBeCloseTo(0.35, 5);
        expect(low.panicMoves).toBeCloseTo(1.0, 5);
        expect(low.maxSpendFrac).toBeCloseTo(0.17, 5);
    });

    test('un ROC alt reparteix millor: mira el rellotge i reacciona abans', () => {
        const high = Core.clockManagementSkill(2400);
        expect(high.clockAwareness).toBeCloseTo(0.75, 5);
        expect(high.panicMoves).toBeCloseTo(3.5, 5);
        expect(high.maxSpendFrac).toBeCloseTo(0.11, 5);
    });

    test('és monòtona entre els dos extrems', () => {
        let prevAware = -Infinity;
        let prevPanic = -Infinity;
        let prevFrac = Infinity;
        for (let elo = 200; elo <= 2600; elo += 200) {
            const s = Core.clockManagementSkill(elo);
            expect(s.clockAwareness).toBeGreaterThanOrEqual(prevAware);
            expect(s.panicMoves).toBeGreaterThanOrEqual(prevPanic);
            expect(s.maxSpendFrac).toBeLessThanOrEqual(prevFrac);
            prevAware = s.clockAwareness;
            prevPanic = s.panicMoves;
            prevFrac = s.maxSpendFrac;
        }
    });

    test('el sòl per jugada surt del ritme mesurat i té sostre d\'un segon', () => {
        expect(Core.humanMoveFloorMs(2169, 160)).toBeCloseTo(2169 * 0.34, 0);
        expect(Core.humanMoveFloorMs(20000, 700)).toBe(900);
        expect(Core.humanMoveFloorMs(100, 300)).toBe(300);
    });
});

describe('rollClockTemperament (tarannà de rellotge per partida)', () => {
    test('la mediana és ~1 i els extrems queden acotats', () => {
        const rnd = lcg(7);
        const vals = [];
        for (let i = 0; i < 4000; i++) vals.push(Core.rollClockTemperament('1+0', 900, rnd));
        vals.sort((a, b) => a - b);
        expect(vals[Math.floor(vals.length / 2)]).toBeGreaterThan(0.85);
        expect(vals[Math.floor(vals.length / 2)]).toBeLessThan(1.15);
        expect(vals[0]).toBeGreaterThanOrEqual(0.4);
        expect(vals[vals.length - 1]).toBeLessThanOrEqual(3.2);
    });

    test('un tarannà alt fa gastar més temps per jugada', () => {
        const calm = Core.humanThinkTimeMs({ timeControlId: '1+0', remainingMs: 40000, incMs: 0, elo: 900,
            complexity: 0.5, phase: 'middlegame', moveNumber: 12, clockTemperament: 0.7, random: fixedRandom });
        const rushed = Core.humanThinkTimeMs({ timeControlId: '1+0', remainingMs: 40000, incMs: 0, elo: 900,
            complexity: 0.5, phase: 'middlegame', moveNumber: 12, clockTemperament: 1.6, random: fixedRandom });
        expect(rushed).toBeGreaterThan(calm);
    });
});

describe('humanThinkTimeMs', () => {
    const base = {
        incMs: 0,
        phase: 'middlegame',
        moveNumber: 20,
        random: fixedRandom
    };

    test('a igual rellotge, un ELO baix pensa més que un d\'alt en jugades fàcils', () => {
        const low = Core.humanThinkTimeMs({ ...base, timeControlId: '10+0', remainingMs: 600000, elo: 800, complexity: 0.1 });
        const high = Core.humanThinkTimeMs({ ...base, timeControlId: '10+0', remainingMs: 600000, elo: 2000, complexity: 0.1 });
        expect(low).toBeGreaterThan(high);
    });

    test('un ELO alt pensa més en jugades difícils que en fàcils', () => {
        const easy = Core.humanThinkTimeMs({ ...base, timeControlId: '10+0', remainingMs: 600000, elo: 2000, complexity: 0.1 });
        const hard = Core.humanThinkTimeMs({ ...base, timeControlId: '10+0', remainingMs: 600000, elo: 2000, complexity: 0.9 });
        expect(hard).toBeGreaterThan(easy);
    });

    test('amb menys temps al rellotge es pensa menys', () => {
        const fresh = Core.humanThinkTimeMs({ ...base, timeControlId: '5+0', remainingMs: 300000, elo: 1400, complexity: 0.5 });
        const drained = Core.humanThinkTimeMs({ ...base, timeControlId: '5+0', remainingMs: 60000, elo: 1400, complexity: 0.5 });
        expect(drained).toBeLessThan(fresh);
    });

    test('els ritmes bullet responen molt més ràpid que els lents', () => {
        const bullet = Core.humanThinkTimeMs({ ...base, timeControlId: '30s', remainingMs: 30000, elo: 1400, complexity: 0.5 });
        const rapid = Core.humanThinkTimeMs({ ...base, timeControlId: '10+0', remainingMs: 600000, elo: 1400, complexity: 0.5 });
        expect(bullet).toBeLessThan(rapid / 4);
    });

    test('mode d\'emergència: amb el rellotge sota mínims respon de seguida', () => {
        // El sòl per jugada (temps físic de moure) mana per damunt de la pressa:
        // amb 3 s a un 5+0 encara es fan unes quantes jugades, no vint.
        const panic = Core.humanThinkTimeMs({ ...base, timeControlId: '5+0', remainingMs: 3000, elo: 1400, complexity: 0.9, random: () => 0.99 });
        const normal = Core.humanThinkTimeMs({ ...base, timeControlId: '5+0', remainingMs: 300000, elo: 1400, complexity: 0.9, random: () => 0.99 });
        expect(panic).toBeLessThan(normal / 4);
        expect(panic).toBeLessThanOrEqual(Core.HUMAN_FLOOR_CAP_MS);
        expect(panic).toBeGreaterThan(0);
    });

    test('respecta el sòl i el sostre del perfil', () => {
        const profile = Core.HUMAN_TIME_PROFILES['15+10'];
        const tiny = Core.humanThinkTimeMs({ ...base, timeControlId: '15+10', remainingMs: 200000, incMs: 10000, elo: 2000, complexity: 0, moveNumber: 1 });
        const huge = Core.humanThinkTimeMs({ ...base, timeControlId: '15+10', remainingMs: 900000, incMs: 10000, elo: 2000, complexity: 1, moveNumber: 40 });
        expect(tiny).toBeGreaterThanOrEqual(profile.minMs);
        expect(huge).toBeLessThanOrEqual(profile.maxMs);
    });

    test('les primeres jugades "de llibre" surten més ràpid que el migjoc', () => {
        const first = Core.humanThinkTimeMs({ ...base, timeControlId: '10+0', remainingMs: 600000, elo: 1400, complexity: 0.5, moveNumber: 1, phase: 'opening' });
        const later = Core.humanThinkTimeMs({ ...base, timeControlId: '10+0', remainingMs: 580000, elo: 1400, complexity: 0.5, moveNumber: 20 });
        expect(first).toBeLessThan(later);
    });

    test('sense rellotge (perfil none) dona un temps acotat i raonable', () => {
        const profile = Core.HUMAN_TIME_PROFILES.none;
        const t = Core.humanThinkTimeMs({ ...base, timeControlId: 'none', remainingMs: null, elo: 1400, complexity: 0.5 });
        expect(t).toBeGreaterThanOrEqual(profile.minMs);
        expect(t).toBeLessThanOrEqual(profile.maxMs);
    });

    test('un ritme desconegut cau al perfil none sense petar', () => {
        const t = Core.humanThinkTimeMs({ ...base, timeControlId: 'ritme-inexistent', remainingMs: null, elo: 1400, complexity: 0.5 });
        expect(t).toBeGreaterThan(0);
    });

    test('un ROC baix crema més rellotge al llarg de la partida i acaba amb menys temps', () => {
        const remainingAfter = (elo) => {
            let rem = 60000;
            for (let mv = 1; mv <= 40; mv++) {
                const t = Core.humanThinkTimeMs({
                    timeControlId: '1+0', remainingMs: rem, incMs: 0, elo,
                    complexity: 0.5, phase: mv <= 10 ? 'opening' : 'middlegame',
                    moveNumber: mv, random: fixedRandom
                });
                rem = Math.max(0, rem - t);
            }
            return rem;
        };
        expect(remainingAfter(300)).toBeLessThan(remainingAfter(1600));
    });



    test("el ritme de l'usuari modula suaument el temps del motor", () => {
        const fast = Core.humanThinkTimeMs({ ...base, timeControlId: '10+0', remainingMs: 600000, elo: 1400, complexity: 0.5, humanPaceMs: 1200, paceSamples: 8 });
        const slow = Core.humanThinkTimeMs({ ...base, timeControlId: '10+0', remainingMs: 600000, elo: 1400, complexity: 0.5, humanPaceMs: 12000, paceSamples: 8 });
        expect(fast).toBeLessThan(slow);
    });

    test('amb soroll real es manté dins dels límits del perfil', () => {
        const profile = Core.HUMAN_TIME_PROFILES['3+2'];
        for (let i = 0; i < 400; i++) {
            const t = Core.humanThinkTimeMs({
                timeControlId: '3+2', remainingMs: 180000, incMs: 2000,
                elo: 1400, complexity: 0.5, phase: 'middlegame', moveNumber: 15
            });
            expect(t).toBeGreaterThanOrEqual(profile.minMs);
            // El sostre del perfil val per al ritme normal; una pensada llarga
            // el pot superar (és el que fa una persona quan s'encalla), però mai
            // no passa del sostre absolut ni del rellotge que li queda.
            expect(t).toBeLessThanOrEqual(Math.min(180000 * 1.15, Core.HUMAN_DEEP_THINK_MAX_MS));
        }
    });

    test('una pensada llarga supera el ritme normal però queda acotada', () => {
        const params = {
            timeControlId: '3+2', remainingMs: 180000, incMs: 2000, elo: 1400,
            complexity: 0.5, phase: 'middlegame', moveNumber: 15
        };
        // random() = 0.01 dispara la pensada llarga; 0.99 no la dispara mai.
        const deep = Core.humanThinkTimeMs({ ...params, random: () => 0.01 });
        const normal = Core.humanThinkTimeMs({ ...params, random: () => 0.99 });
        expect(deep).toBeGreaterThan(normal * 2);
        expect(deep).toBeLessThanOrEqual(Core.HUMAN_DEEP_THINK_MAX_MS);
    });
});

// ---------------------------------------------------------------------------
// El model contra les mesures reals
// ---------------------------------------------------------------------------
// Aquestes proves són les que lliguen el codi amb les dades: simulen partides
// amb el model REAL de core.js i comproven que el rellotge es consumeix com es
// va mesurar al bolcat de Lichess (vegeu la capçalera de core.js). Si algú toca
// els paràmetres del model i el motor deixa de gastar el temps com una persona,
// aquí salta.
describe('el model reprodueix el consum de rellotge mesurat', () => {
    const INC = { '30s': 0, '1+0': 0, '3+2': 2000, '5+0': 0, '10+0': 0, '15+10': 10000 };

    // Simula N partides de fins a `maxMoves` jugades i retorna, per a cada
    // número de jugada, la mitjana de rellotge que queda (fracció del temps
    // inicial) entre les partides que encara hi són, i la proporció que ha
    // caigut de bandera.
    function simulate(tcId, elo, { games = 600, maxMoves = 30, seed = 12345 } = {}) {
        const rnd = lcg(seed);
        const baseMs = Core.humanClockProfile(tcId, elo).baseMs;
        const incMs = INC[tcId];
        const leftSum = new Array(maxMoves + 1).fill(0);
        const alive = new Array(maxMoves + 1).fill(0);
        let flagged = 0;
        for (let g = 0; g < games; g++) {
            const temperament = Core.rollClockTemperament(tcId, elo, rnd);
            let remaining = baseMs;
            for (let k = 1; k <= maxMoves; k++) {
                const tau = Core.humanThinkTimeMs({
                    timeControlId: tcId, remainingMs: remaining, incMs, elo,
                    complexity: 0.45, phase: k <= 10 ? 'opening' : 'middlegame',
                    moveNumber: k, clockTemperament: temperament, random: rnd
                });
                if (tau >= remaining) { flagged++; break; }
                remaining = remaining - tau + incMs;
                alive[k]++;
                leftSum[k] += remaining / baseMs;
            }
        }
        return {
            flagRate: flagged / games,
            left: k => (alive[k] ? leftSum[k] / alive[k] : null)
        };
    }

    // Rellotge que queda (en % de l'inicial) després de la jugada k, mesurat al
    // bolcat de Lichess 2026-06 per a la franja d'ELO de referència.
    const MESURAT = [
        { tc: '1+0', elo: 880, left: { 5: 89, 10: 68, 15: 46, 20: 29, 25: 20 } },
        { tc: '1+0', elo: 2400, left: { 5: 96, 10: 89, 15: 77, 20: 61, 25: 46 } },
        { tc: '3+2', elo: 890, left: { 5: 96, 10: 85, 15: 70, 20: 56, 25: 45 } },
        { tc: '10+0', elo: 850, left: { 5: 96, 10: 88, 15: 79, 20: 70, 25: 62 } }
    ];

    test.each(MESURAT)('$tc (ELO $elo): la corba simulada segueix la mesurada', ({ tc, elo, left }) => {
        const sim = simulate(tc, elo);
        for (const k of Object.keys(left)) {
            const simPct = sim.left(Number(k)) * 100;
            expect(Math.abs(simPct - left[k])).toBeLessThanOrEqual(12);
        }
    });

    test('a 1+0 el motor SÍ que pot caure de bandera, i molt més com més fluix és', () => {
        // Aquest és el canvi de fons: a les dades reals, el 74% de les partides
        // de 1+0 entre jugadors de menys de 1000 s'acaben amb una bandera. Un
        // rival que no en cau mai no és humà, i deixa la victòria per temps
        // fora de l'abast del jugador.
        const weak = simulate('1+0', 200, { maxMoves: 30 });
        const strong = simulate('1+0', 2400, { maxMoves: 30 });
        expect(weak.flagRate).toBeGreaterThan(0.15);
        expect(weak.flagRate).toBeGreaterThan(strong.flagRate * 2);
    });

    test('als ritmes lents la bandera és rara, com a les partides reals', () => {
        const rapid = simulate('10+0', 200, { maxMoves: 40 });
        const classic = simulate('15+10', 200, { maxMoves: 40 });
        expect(rapid.flagRate).toBeLessThan(0.25);
        expect(classic.flagRate).toBeLessThan(0.25);
    });

    test('un ROC baix consumeix el rellotge molt més de pressa que un d\'alt', () => {
        const weak = simulate('1+0', 200, { maxMoves: 20 });
        const strong = simulate('1+0', 2400, { maxMoves: 20 });
        expect(weak.left(20)).toBeLessThan(strong.left(20) * 0.7);
    });
});

describe('visibleHumanReplyDelayMs', () => {
    test('visibleDelay = max(0, targetThinkMs - elapsed)', () => {
        expect(Core.visibleHumanReplyDelayMs(1200, 450)).toBe(750);
        expect(Core.visibleHumanReplyDelayMs(1200, 1500)).toBe(0);
    });

    test('en ritme none també hi ha retard acotat', () => {
        const target = Core.humanThinkTimeMs({
            timeControlId: 'none', remainingMs: null, incMs: 0, elo: 1400,
            complexity: 0.5, phase: 'middlegame', moveNumber: 20, random: fixedRandom
        });
        const delay = Core.visibleHumanReplyDelayMs(target, 100);
        expect(delay).toBeGreaterThan(0);
        expect(delay).toBeLessThanOrEqual(Core.HUMAN_TIME_PROFILES.none.maxMs);
    });

    test('en bullet el retard visible és molt inferior al de ritmes lents', () => {
        const baseParams = { incMs: 0, elo: 1400, complexity: 0.5, phase: 'middlegame', moveNumber: 20, random: fixedRandom };
        const bullet = Core.visibleHumanReplyDelayMs(Core.humanThinkTimeMs({ ...baseParams, timeControlId: '30s', remainingMs: 30000 }), 0);
        const slow = Core.visibleHumanReplyDelayMs(Core.humanThinkTimeMs({ ...baseParams, timeControlId: '15+10', remainingMs: 900000, incMs: 10000 }), 0);
        expect(bullet).toBeLessThan(slow / 4);
    });

    test('amb remainingMs molt baix el retard no allarga la partida més enllà de la bandera', () => {
        const remainingMs = 1200;
        const target = Core.humanThinkTimeMs({
            timeControlId: '1+0', remainingMs, incMs: 0, elo: 1400,
            complexity: 0.9, phase: 'middlegame', moveNumber: 35, random: () => 0.99
        });
        // Amb el rellotge quasi a zero el motor mou al sòl físic (no s'hi pot
        // anar més ràpid) i mai no es programa una espera que passi de llarg
        // del temps que li queda.
        expect(target).toBeLessThanOrEqual(remainingMs + 250);
        expect(Core.visibleHumanReplyDelayMs(target, 0)).toBeLessThanOrEqual(remainingMs + 250);
    });
});

describe('engineSearchBudgetMs (sostre de temps real de la cerca)', () => {
    const base = {
        incMs: 0,
        phase: 'middlegame',
        moveNumber: 20,
        elo: 2000,
        elapsedMs: 0
    };

    test('sense rellotge no hi ha sostre: la cerca es deixa completar', () => {
        expect(Core.engineSearchBudgetMs({ ...base, timeControlId: 'none', remainingMs: null })).toBeNull();
        expect(Core.engineSearchBudgetMs({ ...base, timeControlId: '1+0' })).toBeNull();
    });

    test('és determinista: el mateix rellotge dona el mateix pressupost', () => {
        const params = { ...base, timeControlId: '3+2', remainingMs: 150000, incMs: 2000 };
        expect(Core.engineSearchBudgetMs(params)).toBe(Core.engineSearchBudgetMs(params));
    });

    test('a bullet el pressupost és de menys de 4 s (la cerca a ROC alt en gastava 8-21)', () => {
        const bullet = Core.engineSearchBudgetMs({ ...base, timeControlId: '1+0', remainingMs: 60000 });
        expect(bullet).toBeGreaterThan(Core.ENGINE_SEARCH_MIN_MS);
        expect(bullet).toBeLessThan(4000);
    });

    test('com més ràpid el ritme, menys temps de cerca', () => {
        const hyper = Core.engineSearchBudgetMs({ ...base, timeControlId: '30s', remainingMs: 30000 });
        const bullet = Core.engineSearchBudgetMs({ ...base, timeControlId: '1+0', remainingMs: 60000 });
        const classic = Core.engineSearchBudgetMs({ ...base, timeControlId: '15+10', remainingMs: 900000, incMs: 10000 });
        expect(hyper).toBeLessThan(bullet);
        expect(bullet).toBeLessThan(classic);
    });

    test('no mossega el model: el sostre cobreix el temps que es vol pensar en una jugada normal', () => {
        // Amb complexitat mitjana i sense pensada llarga, el que el model vol
        // gastar ha de cabre dins del pressupost de cerca: el sostre només
        // retalla la cerca que gastaria MÉS del que el nivell es pot permetre.
        [['30s', 30000], ['1+0', 60000], ['3+2', 150000], ['15+10', 800000]].forEach(([tcId, remainingMs]) => {
            const incMs = tcId === '3+2' ? 2000 : (tcId === '15+10' ? 10000 : 0);
            const think = Core.humanThinkTimeMs({
                ...base, timeControlId: tcId, remainingMs, incMs,
                complexity: 0.5, random: () => 0.25   // soroll per damunt de la mediana
            });
            expect(Core.engineSearchBudgetMs({ ...base, timeControlId: tcId, remainingMs, incMs }))
                .toBeGreaterThanOrEqual(think);
        });
    });

    test('descompta el temps ja consumit des que l\'usuari ha mogut', () => {
        const fresh = Core.engineSearchBudgetMs({ ...base, timeControlId: '5+0', remainingMs: 300000 });
        const afterAnalysis = Core.engineSearchBudgetMs({ ...base, timeControlId: '5+0', remainingMs: 300000, elapsedMs: 1500 });
        expect(afterAnalysis).toBe(fresh - 1500);
    });

    test('no es cerca més enllà de la bandera', () => {
        const remainingMs = 400;
        const drained = Core.engineSearchBudgetMs({ ...base, timeControlId: '1+0', remainingMs, moveNumber: 40 });
        expect(drained).toBeLessThanOrEqual(remainingMs);
        expect(drained).toBeGreaterThanOrEqual(Core.ENGINE_SEARCH_MIN_MS);
    });

    test('amb el pressupost ja gastat queda el mínim per trobar una jugada', () => {
        const overspent = Core.engineSearchBudgetMs({ ...base, timeControlId: '10+0', remainingMs: 600000, elapsedMs: 999999 });
        expect(overspent).toBe(Core.ENGINE_SEARCH_MIN_MS);
    });

    test('mai passa del sostre escènic del ritme', () => {
        Object.keys(Core.HUMAN_CLOCK_STATS).forEach(tcId => {
            const budget = Core.engineSearchBudgetMs({
                ...base, timeControlId: tcId, remainingMs: 900000, incMs: 10000, moveNumber: 22, elo: 2400
            });
            expect(budget).toBeLessThanOrEqual(Core.HUMAN_TIME_PROFILES[tcId].maxMs);
            expect(budget).toBeGreaterThanOrEqual(Core.ENGINE_SEARCH_MIN_MS);
        });
    });
});
