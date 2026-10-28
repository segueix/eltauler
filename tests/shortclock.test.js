const Core = require('../core');
const { Chess } = require('chess.js');
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const base = { timeControlId: '1+0', remainingMs: 45000, incMs: 0, elo: 1000, moveNumber: 15,
    phase: 'middlegame', complexity: 0.5, clockTemperament: 1, random: () => 0.5 };
function random(seed = 42) { let n = seed; return () => ((n = (Math.imul(n, 1664525) + 1013904223) >>> 0) / 4294967296); }
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
            const samples = Array.from({ length: 300 }, (_, i) => Core.gameThinkTimeMs({ ...base, timeControlId,
                remainingMs, incMs, elo, complexity: (i % 10) / 10, random: rnd, clockTemperament: 3.2 }));
            expect(Math.min(...samples)).toBeGreaterThanOrEqual(Core.SHORT_CLOCK_LIMITS[timeControlId].floor);
            expect(Math.max(...samples)).toBeLessThanOrEqual(Core.SHORT_CLOCK_LIMITS[timeControlId].ceiling);
            expect(new Set(samples).size).toBeGreaterThan(30);
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
    test('s’accelera quan queda poc temps, fins i tot amb màxima propensió a encallar-se', () => {
        const rnd = random(8);
        for (const timeControlId of Object.keys(Core.SHORT_CLOCK_LIMITS)) {
            for (let i = 0; i < 100; i++) {
                const think = Core.gameThinkTimeMs({ ...base, timeControlId, remainingMs: 2000,
                    complexity: 1, deepThinkRate: 1, clockTemperament: 3.2, random: rnd });
                expect(think).toBeGreaterThan(80);
                expect(think).toBeLessThan(400);
            }
        }
    });
    test('l’increment dona marge real de reflexió', () => {
        expect(Core.gameThinkTimeMs({ ...base, timeControlId: '3+2', remainingMs: 5000, incMs: 2000 }))
            .toBeGreaterThan(Core.gameThinkTimeMs({ ...base, timeControlId: '3+2', remainingMs: 5000, incMs: 0 }));
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
