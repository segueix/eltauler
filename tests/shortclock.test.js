const Core = require('../core');
const { Chess } = require('chess.js');
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const base = { timeControlId: '1+0', remainingMs: 45000, incMs: 0, elo: 1000, moveNumber: 15,
    phase: 'middlegame', complexity: 0.5, clockTemperament: 1, random: () => 0.5 };
function random(seed = 42) { let n = seed; return () => ((n = (Math.imul(n, 1664525) + 1013904223) >>> 0) / 4294967296); }
// Sòl físic per jugada d'aquest nivell i ritme (el mateix que aplica el model).
function humanFloorMs(timeControlId, elo) {
    return Core.humanMoveFloorMs(Core.humanClockProfile(timeControlId, elo).spendMs,
        Core.HUMAN_TIME_PROFILES[timeControlId].minMs);
}
function chooser(elo = 1000) {
    const context = vm.createContext({ ElTaulerCore: Core, Chess, game: new Chess(),
        ELO_MIN: 200, ELO_MAX: 2600, engineEloMin: 1350, DEBUG_WEAK_AI: false,
        getActiveStrengthElo: () => elo, Math: Object.assign(Object.create(Math), { random: random() }) });
    vm.runInContext(source.slice(source.indexOf('const WEAK_AI_CONFIG ='), source.indexOf('let game =')) +
        source.slice(source.indexOf('const PIECE_VALUE ='), source.indexOf('// MODIFICAT: Ara carrega directament')), context);
    return context;
}

describe('ritme natural als tres rellotges curts', () => {
    test.each([['30s', 30000, 0], ['1+0', 60000, 0], ['3+2', 180000, 2000]])('%s: ritme variable, perceptible i acotat per nivell', (timeControlId, remainingMs, incMs) => {
        for (const elo of [200, 600, 1000, 1600, 2400]) {
            const rnd = random(elo);
            const sample = clockTemperament => Array.from({ length: 300 }, (_, i) => Core.gameThinkTimeMs({ ...base,
                timeControlId, remainingMs, incMs, elo, complexity: (i % 10) / 10, random: rnd, clockTemperament }));
            // Fins i tot amb el tarannà més cremat possible: mai més de pressa
            // que el sòl físic mesurat per al nivell, ni més enllà del sostre
            // de pensada llarga del ritme.
            for (const clockTemperament of [0.4, 1, 3.2]) {
                const samples = sample(clockTemperament);
                expect(Math.min(...samples)).toBeGreaterThanOrEqual(Math.floor(humanFloorMs(timeControlId, elo)));
                expect(Math.max(...samples)).toBeLessThanOrEqual(Core.humanDeepThinkCeilingMs(timeControlId));
            }
            // En una partida normal, cap jugada no dura igual que l'anterior.
            // (Amb el tarannà extrem, ~0,1% de partides, les jugades del migjoc
            // topen totes amb el sostre del ritme: és la partida que es crema
            // el rellotge i cau de bandera.)
            expect(new Set(sample(1)).size).toBeGreaterThan(30);
        }
    });
    test('les decisions difícils reben més temps; les úniques i recaptures, menys', () => {
        const easy = Core.gameThinkTimeMs({ ...base, complexity: 0.1 });
        const hard = Core.gameThinkTimeMs({ ...base, complexity: 0.9 });
        expect(hard).toBeGreaterThan(easy);
        expect(Core.gameThinkTimeMs({ ...base, forced: true })).toBeLessThan(Core.gameThinkTimeMs(base));
        expect(Core.gameThinkTimeMs({ ...base, recapture: true })).toBeLessThan(Core.gameThinkTimeMs(base));
    });
    test('el ritme observat del jugador també entra al pressupost de cerca', () => {
        const fast = { ...base, humanPaceMs: 300, paceSamples: 10 };
        const slow = { ...base, humanPaceMs: 5000, paceSamples: 10 };
        expect(Core.gameThinkTimeMs(fast)).toBeLessThan(Core.gameThinkTimeMs(slow));
        expect(Core.gameSearchBudgetMs(fast)).toBeLessThan(Core.gameSearchBudgetMs(slow));
    });
    test('en zona de pànic mou de seguida, sense encallar-s’hi i sense baixar del sòl humà', () => {
        const rnd = random(8);
        for (const timeControlId of Object.keys(Core.SHORT_CLOCK_LIMITS)) {
            for (const elo of [600, 1000, 1600, 2400]) {
                const profile = Core.humanClockProfile(timeControlId, elo);
                const remainingMs = 0.9 * Core.clockManagementSkill(elo).panicMoves * profile.spendMs;
                for (let i = 0; i < 100; i++) {
                    // Màxima propensió a encallar-se: amb l'aigua al coll no s'hi encalla.
                    const think = Core.gameThinkTimeMs({ ...base, timeControlId, elo, remainingMs,
                        complexity: 1, deepThinkRate: 1, clockTemperament: 3.2, random: rnd });
                    expect(think).toBeLessThanOrEqual(Core.HUMAN_FLOOR_CAP_MS);
                    expect(think).toBeLessThan(remainingMs);
                    // ...però tampoc no mou més de pressa que una persona: abans
                    // baixava fins a 0,12 s i per això no queia mai de bandera.
                    expect(think).toBeGreaterThanOrEqual(Math.floor(humanFloorMs(timeControlId, elo)));
                }
            }
        }
    });
    test('l’increment dona marge real: amb poc temps, a 3+2 el rival se’n refà i sense increment cau', () => {
        const play = incMs => {
            const rnd = random(5);
            let remainingMs = 5000;
            for (let moveNumber = 30; moveNumber < 70; moveNumber++) {
                const think = Core.gameThinkTimeMs({ ...base, timeControlId: '3+2', remainingMs, incMs,
                    moveNumber, deepThinkRate: 0, random: rnd });
                if (think >= remainingMs) return 'bandera';
                remainingMs += incMs - think;
            }
            return 'viu';
        };
        expect(play(2000)).toBe('viu');
        expect(play(0)).toBe('bandera');
    });
    test('ni la cerca mínima passa del temps restant; temps consumit es descompta una vegada', () => {
        for (const remainingMs of [2, 10, 40, 79, 120, 400]) {
            const budget = Core.gameSearchBudgetMs({ ...base, remainingMs });
            expect(budget).toBeLessThanOrEqual(remainingMs);
            expect(budget).toBeGreaterThanOrEqual(1);
        }
        const full = Core.gameSearchBudgetMs(base);
        expect(Core.gameSearchBudgetMs({ ...base, elapsedMs: 200 })).toBe(full - 200);
    });
    test.each(Object.keys(Core.SHORT_CLOCK_LIMITS))('%s: les dues revisions no acaparen la resposta', timeControlId => {
        const p = { ...base, timeControlId };
        const a = Core.gameReviewSearchBudgetMs({ ...p, stage: 1, elapsedMs: 0 });
        const b = Core.gameReviewSearchBudgetMs({ ...p, stage: 2, elapsedMs: a });
        expect(a + b).toBeLessThanOrEqual(Core.SHORT_CLOCK_LIMITS[timeControlId].review);
        expect(a + b).toBeLessThan(Core.gameSearchBudgetMs(p) / 3);
        expect(Core.gameReviewSearchBudgetMs({ ...p, stage: 2, elapsedMs: 900 })).toBe(1);
    });
    test('els ritmes llargs i sense rellotge conserven el seu model', () => {
        for (const timeControlId of ['none', '5+0', '10+0', '15+10']) {
            const p = { ...base, timeControlId, remainingMs: timeControlId === 'none' ? null : 300000 };
            expect(Core.gameThinkTimeMs(p)).toBe(Core.humanThinkTimeMs(p));
            expect(Core.gameSearchBudgetMs(p)).toBe(Core.engineSearchBudgetMs(p));
            expect(Core.gameReviewSearchBudgetMs(p)).toBe(Core.moveReviewSearchBudgetMs(p));
        }
    });
});

// El rival dels ritmes curts juga amb gameThinkTimeMs, no amb humanThinkTimeMs.
// Les proves de calibratge de humantime.test.js miren el model calibrat, i per
// això no van veure que aquesta funció el substituïa per una reserva que no
// arribava mai a zero: el rival de 30s, 1+0 i 3+2 no podia caure de bandera
// (0% simulat) i, al bullet, l'usuari era l'únic que podia perdre per temps.
// Aquí es tornen a passar les mateixes mesures per la funció que fa servir
// l'app.
describe('el rival dels ritmes curts gestiona el rellotge com una persona', () => {
    const INC = { '30s': 0, '1+0': 0, '3+2': 2000 };
    function simulate(timeControlId, elo, { games = 1500, maxMoves = 40, seed = 12345 } = {}) {
        const rnd = random(seed);
        const baseMs = Core.humanClockProfile(timeControlId, elo).baseMs;
        const incMs = INC[timeControlId];
        const alive = new Array(maxMoves + 1).fill(0);
        const flags = new Array(maxMoves + 1).fill(0);
        const leftSum = new Array(maxMoves + 1).fill(0);
        let tauSum = 0, tauCount = 0;
        for (let g = 0; g < games; g++) {
            const clockTemperament = Core.rollClockTemperament(timeControlId, elo, rnd);
            let remainingMs = baseMs;
            for (let k = 1; k <= maxMoves; k++) {
                alive[k]++;
                const tau = Core.gameThinkTimeMs({ timeControlId, remainingMs, incMs, elo, complexity: 0.45,
                    phase: k <= 10 ? 'opening' : 'middlegame', moveNumber: k, clockTemperament, random: rnd });
                if (tau >= remainingMs) { flags[k]++; break; }
                tauSum += tau; tauCount++;
                remainingMs += incMs - tau;
                leftSum[k] += remainingMs / baseMs;
            }
        }
        let risk = 0;
        for (let k = 1; k <= maxMoves; k++) if (alive[k]) risk += flags[k] / alive[k];
        return {
            // Risc de bandera acumulat (ANALISI_RELLOTGE.md §8): probabilitat de
            // caure a la jugada k havent arribat viu a la k-1, sumada.
            risk,
            left: k => leftSum[k] / Math.max(1, alive[k] - flags[k]),
            meanTau: tauSum / Math.max(1, tauCount)
        };
    }

    // Risc mesurat al bolcat de Lichess (ANALISI_RELLOTGE.md §9) i el mínim que
    // se n'exigeix. El model erra cap al costat prudent (els jugadors forts
    // gairebé no s'encallen amb el rellotge just), però cap nivell no és immune.
    test.each([[880, 1.27, 0.9], [1310, 0.74, 0.4], [1700, 0.43, 0.15], [2400, 0.14, 0.02]])(
        '1+0 a ELO %i: el rival pot caure de bandera (mesurat %f)', (elo, measured, minimum) => {
            const { risk } = simulate('1+0', elo);
            expect(risk).toBeGreaterThan(minimum);
            expect(risk).toBeLessThan(measured * 1.1);
        });

    test('1+0: com més fluix és el rival, més sovint cau de bandera', () => {
        const risks = [880, 1310, 1700, 2400].map(elo => simulate('1+0', elo).risk);
        for (let i = 1; i < risks.length; i++) expect(risks[i]).toBeLessThan(risks[i - 1]);
    });

    test.each([['30s', 900], ['30s', 1700], ['3+2', 900], ['3+2', 1700]])(
        '%s a ELO %i: guanyar per temps també és possible', (timeControlId, elo) => {
            expect(simulate(timeControlId, elo).risk).toBeGreaterThan(0.05);
        });

    test('1+0 a la franja més fluixa: el rellotge que queda segueix el mesurat', () => {
        const measured = { 5: 89, 10: 68, 15: 46, 20: 29, 25: 20 };
        const sim = simulate('1+0', 880, { maxMoves: 25 });
        for (const [k, pct] of Object.entries(measured)) {
            expect(Math.abs(sim.left(Number(k)) * 100 - pct)).toBeLessThanOrEqual(8);
        }
    });

    test.each(Object.keys(INC))('%s: els segons per jugada són els mesurats a cada nivell', timeControlId => {
        for (const elo of [900, 1400, 1800, 2200]) {
            const p = Core.humanClockProfile(timeControlId, elo);
            const sim = simulate(timeControlId, elo, { games: 400, maxMoves: Math.round(p.moves) });
            const ratio = sim.meanTau / p.spendMs;
            expect(ratio).toBeGreaterThan(0.78);
            expect(ratio).toBeLessThan(1.22);
        }
    });
});

describe('MultiPV coherent amb cerques curtes', () => {
    const row = (depth, multipv, move, score = 20) => ({ depth, multipv, move, score });
    test('conserva l’última profunditat completa davant d’una iteració inacabada', () => {
        const c = Core.createMoveCandidateCollector(3);
        const first = [row(4, 1, 'e2e4'), row(4, 2, 'd2d4'), row(4, 3, 'g1f3')];
        first.forEach(x => c.push(x));
        c.push(row(5, 1, 'd2d4', 500)); c.push(row(5, 2, 'e2e4', 450));
        expect(c.values()).toEqual(first);
        c.push(row(5, 3, 'g1f3', 430));
        expect(c.values().map(x => x.depth)).toEqual([5, 5, 5]);
    });
    test('ignora límits de puntuació, duplicats i resultats antics', () => {
        const c = Core.createMoveCandidateCollector(2);
        c.push(row(3, 1, 'e2e4')); c.push(row(3, 2, 'd2d4'));
        c.push(row(4, 1, 'e2e4')); c.push({ ...row(4, 2, 'd2d4'), bound: true });
        c.push(row(4, 2, 'e2e4'));
        c.push(row(2, 1, 'g1f3')); c.push(row(2, 2, 'd2d4'));
        expect(c.values().map(x => x.depth)).toEqual([3, 3]);
    });
    test('si encara no hi ha cap iteració completa només exposa la principal', () => {
        const c = Core.createMoveCandidateCollector(5);
        c.push(row(1, 1, 'e2e4')); c.push(row(1, 2, 'd2d4')); c.push(row(2, 1, 'g1f3'));
        expect(c.values()).toEqual([row(2, 1, 'g1f3')]);
    });
    test('el parser real reté profunditat, bounds i la millor iteració completa', () => {
        const ctx = vm.createContext({ ElTaulerCore: Core, engineMoveCandidates: [],
            engineMoveCandidateCollector: Core.createMoveCandidateCollector(2), engineMoveSearchTrace: [], isEngineThinking: true });
        vm.runInContext(source.slice(source.indexOf('function trackEngineCandidate'), source.indexOf('const PIECE_VALUE')), ctx);
        ['info depth 3 multipv 1 score cp 20 pv e2e4', 'info depth 3 multipv 2 score cp 10 pv d2d4',
            'info depth 4 multipv 1 score cp 80 lowerbound pv g1f3'].forEach(ctx.trackEngineCandidate);
        expect(ctx.engineMoveCandidates.map(x => x.move)).toEqual(['e2e4', 'd2d4']);
        expect(ctx.engineMoveSearchTrace).toHaveLength(1);
    });
});

describe('precisió del rival coherent amb el nivell', () => {
    const candidates = [{ move: 'e2e4', score: 40, multipv: 1 }, { move: 'd2d4', score: 10, multipv: 2 },
        { move: 'g1f3', score: -60, multipv: 3 }, { move: 'b1c3', score: -120, multipv: 4 },
        { move: 'h2h3', score: -250, multipv: 5 }, { move: 'a2a3', score: -450, multipv: 6 }];
    test.each([1350, 1600, 2000, 2400])('a ROC %i respecta el bestmove limitat per UCI, encara que no sigui PV1', elo => {
        const c = chooser(elo);
        expect(c.chooseHumanLikeMove(candidates, c.game, { clock: base, nativeStrength: true, engineBestMove: 'g1f3' }).move).toBe('g1f3');
    });
    test('amb poques dades no inventa errors ni substitueix el bestmove per una PV parcial', () => {
        const c = chooser(400);
        expect(c.chooseHumanLikeMove([candidates[0]], c.game, { clock: base, engineBestMove: 'd2d4' }).move).toBe('d2d4');
        expect(c.chooseHumanLikeMove([], c.game, { clock: base, engineBestMove: 'd2d4' }).move).toBe('d2d4');
    });
    test('els nivells baixos cometen errors amb freqüència i magnitud progressives', () => {
        const means = [200, 600, 1000, 1250].map(elo => {
            const c = chooser(elo);
            // Aïlla la distribució de nivell: aquestes candidates no perden
            // material immediat. La legalitat i l’atractiu són els de chess.js.
            c.immediateMaterialLoss = () => 0;
            let loss = 0;
            for (let i = 0; i < 800; i++) {
                const pick = c.chooseHumanLikeMove(candidates, c.game, { clock: base, engineBestMove: 'd2d4' });
                loss += candidates[0].score - pick.score;
            }
            return loss / 800;
        });
        expect(means[0]).toBeGreaterThan(means[1]);
        expect(means[1]).toBeGreaterThan(means[2]);
        expect(means[2]).toBeGreaterThan(means[3]);
    });
    test('sota el terra no corregeix els errors natius ni inverteix la progressió de força', () => {
        for (const elo of [400, 800, 1250]) {
            const c = chooser(elo); c.immediateMaterialLoss = () => 0;
            for (let i = 0; i < 100; i++) {
                const pick = c.chooseHumanLikeMove(candidates, c.game, { clock: base, nativeStrength: true, engineBestMove: 'g1f3' });
                expect(pick.score).toBeLessThanOrEqual(-60);
            }
        }
    });
    test('la pressió amplia suaument els errors, sense invertir l’ordre de nivells', () => {
        const levels = [200, 400, 600, 800, 1000, 1250, 1600].map(elo => Core.timedSelectionLevel({ ...base, elo, remainingMs: 500 }));
        expect(levels).toEqual(levels.slice().sort((a, b) => a - b));
        expect(levels[0]).toBe(200); expect(levels[6]).toBe(1600);
        expect(Core.timedSelectionLevel(base)).toBe(base.elo);
    });
    test('mai compta una jugada no avaluada com a perfecta', () => {
        const ctx = vm.createContext({ totalEngineMoves: 0, goodEngineMoves: 0, updateAIPrecisionDisplay() {} });
        const a = source.indexOf('function registerEngineMovePrecision('), b = source.indexOf('\nfunction ', a + 10);
        vm.runInContext(source.slice(a, b), ctx);
        ctx.registerEngineMovePrecision('g1f3', candidates.slice(0, 2));
        expect(ctx.totalEngineMoves).toBe(0);
        ctx.registerEngineMovePrecision('g1f3', candidates);
        expect(ctx.totalEngineMoves).toBe(1); expect(ctx.goodEngineMoves).toBe(0);
    });
});

describe('ritme observat i rellotge real', () => {
    test('ignora premoves i pauses llargues, sense arrossegar ritmes inexistents', () => {
        const old = { ms: 1500, samples: 8, timeControlId: '30s' };
        expect(Core.nextHumanPace({ ...old, elapsed: 100, premove: true })).toEqual({ ms: 1500, samples: 8 });
        expect(Core.nextHumanPace({ ...old, elapsed: 120000 })).toEqual({ ms: 1500, samples: 8 });
        expect(Core.nextHumanPace({ ...old, elapsed: 500 })).toEqual({ ms: 1250, samples: 9 });
        expect(Core.nextHumanPace({ elapsed: 700 })).toEqual({ ms: 700, samples: 1 });
    });
    test('el context descompta el tram des de l’últim tic, sense tocar el rellotge', () => {
        const ctx = vm.createContext({ game: new Chess(), playerColor: 'w', gameClock: {
            enabled: true, active: 'b', paused: false, white: 1000, black: 1000, lastTs: 800, inc: 0 },
            nowMs: () => 950, getActiveTimeControlId: () => '30s', getActiveStrengthElo: () => 800,
            ElTaulerCore: Core, currentGameClockTemperament: 1, humanPaceMs: 600, humanPaceSamples: 3 });
        vm.runInContext(source.slice(source.indexOf('function engineClockContext()'), source.indexOf('function engineReplyElapsedMs()')), ctx);
        expect(ctx.engineClockContext().remainingMs).toBe(850);
        expect(ctx.gameClock.black).toBe(1000);
        ctx.gameClock.paused = true;
        expect(ctx.engineClockContext().remainingMs).toBe(1000);
    });
});


describe('capacitats i força nativa del motor', () => {
    const skill = Core.engineStrengthOption({}, 'option name Skill Level type spin default 20 min 0 max 20');
    test('el binari Skill Level no rep ordres UCI_Elo que ignoraria', () => {
        expect(Core.nativeStrengthCommands(skill, 2000, false)).toEqual(['setoption name Skill Level value 7']);
        expect(Core.nativeStrengthCommands(skill, 200, false)).toEqual(['setoption name Skill Level value 0']);
        expect(Core.nativeStrengthCommands(skill, 2600, false)).toEqual(['setoption name Skill Level value 15']);
    });
    test('si un futur motor admet ELO real, es respecten els seus límits', () => {
        let caps = Core.engineStrengthOption(skill, 'option name UCI_LimitStrength type check default false');
        caps = Core.engineStrengthOption(caps, 'option name UCI_Elo type spin default 2000 min 1320 max 3190');
        expect(Core.nativeStrengthCommands(caps, 500, false)).toEqual([
            'setoption name UCI_LimitStrength value true', 'setoption name UCI_Elo value 1320']);
        expect(Core.nativeStrengthCommands(caps, 2200, false)[1]).toBe('setoption name UCI_Elo value 2200');
        expect(Core.nativeStrengthCommands(caps, 800, true)).toEqual([
            'setoption name UCI_LimitStrength value false', 'setoption name Skill Level value 20']);
    });
    test('la revisió restaura sempre força màxima; cap opció suposada', () => {
        expect(Core.nativeStrengthCommands(skill, 200, true)).toEqual(['setoption name Skill Level value 20']);
        expect(Core.nativeStrengthCommands({}, 2000, false)).toEqual([]);
    });
    test('l’aplicació restaura força màxima per revisar i en deixar el mode amb rellotge', () => {
        const sent = [];
        const ctx = vm.createContext({ ElTaulerCore: Core, stockfish: { postMessage: m => sent.push(m) },
            engineStrengthCaps: skill, gameClock: { enabled: true }, clampEngineElo: x => x, ELO_MAX: 2600 });
        vm.runInContext(source.slice(source.indexOf('function applyEngineEloStrength('), source.indexOf('function syncEngineEloFromUser()')), ctx);
        ctx.applyEngineEloStrength(1600); ctx.applyEngineMaxStrength();
        ctx.gameClock.enabled = false; ctx.applyEngineEloStrength(1600);
        expect(sent).toEqual(['setoption name Skill Level value 2', 'setoption name Skill Level value 20', 'setoption name Skill Level value 20']);
    });
});
