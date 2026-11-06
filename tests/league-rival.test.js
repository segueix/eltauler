// Rival de les partides de lliga (LLIGA.md §2): Stockfish 19 i el model de
// tria humana també a la lliga sense rellotge, i la profunditat de la mateixa
// corba per ROC que la partida lliure (la que es va fer servir per calibrar).
const Core = require('../core');
const { Chess } = require('chess.js');
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const fnSource = name => {
    const a = source.indexOf(`function ${name}(`);
    if (a < 0) throw new Error(`no hi ha ${name}`);
    return source.slice(a, source.indexOf('\n}\n', a) + 2);
};

describe('quan juga el rival de Stockfish 19', () => {
    function ctxFor({ mode, tc, clock = false, ready = true }) {
        const ctx = vm.createContext({
            currentGameMode: mode, getActiveTimeControlId: () => tc, gameClock: { enabled: clock },
            timedRivalInUse: ready, timedRivalEngine: ready ? {} : null, timedRivalReady: ready
        });
        ['sf19RivalWanted', 'timedRivalActive'].forEach(n => vm.runInContext(fnSource(n), ctx));
        return ctx;
    }

    test('lliga sense rellotge: sí (abans, el motor de sempre)', () => {
        const ctx = ctxFor({ mode: 'league', tc: 'none' });
        expect(ctx.sf19RivalWanted(true)).toBe(true);
        expect(ctx.timedRivalActive()).toBe(true);
    });

    test('lliga amb rellotge i partida lliure amb rellotge: sí, com fins ara', () => {
        expect(ctxFor({ mode: 'league', tc: '3+2', clock: true }).sf19RivalWanted(true)).toBe(true);
        expect(ctxFor({ mode: 'league', tc: '3+2', clock: true }).timedRivalActive()).toBe(true);
        expect(ctxFor({ mode: 'free', tc: '1+0', clock: true }).sf19RivalWanted(true)).toBe(true);
        expect(ctxFor({ mode: 'free', tc: '1+0', clock: true }).timedRivalActive()).toBe(true);
    });

    test('partida lliure sense rellotge: no, continua amb el motor de sempre', () => {
        const ctx = ctxFor({ mode: 'free', tc: 'none' });
        expect(ctx.sf19RivalWanted(true)).toBe(false);
        expect(ctx.timedRivalActive()).toBe(false);
    });

    test('modes on el rival no juga amb rellotge (exercicis, joc vista...): no', () => {
        expect(ctxFor({ mode: 'league', tc: 'none' }).sf19RivalWanted(false)).toBe(false);
    });

    test('si Stockfish 19 no ha arrencat, la lliga es juga amb el motor de sempre', () => {
        expect(ctxFor({ mode: 'league', tc: 'none', ready: false }).timedRivalActive()).toBe(false);
    });

    test('en començar la partida es decideix amb sf19RivalWanted', () => {
        expect(source).toMatch(/timedRivalInUse = false;\s*if \(sf19RivalWanted\(clockApplies\)\)/);
    });

    test('obrir la lliga ja prepara Stockfish 19', () => {
        expect(fnSource('openLeague')).toMatch(/prewarmTimedRivalEngine\(\)/);
    });
});

describe('profunditat de cerca a la lliga: la mateixa corba per ROC', () => {
    function depthCtx(mode, roc) {
        const ctx = vm.createContext({
            isCalibrationGame: false, currentGameMode: mode, getActiveStrengthElo: () => roc,
            eloToSearchDepth: elo => Core.eloToSearchDepth(elo, 1350, 2000),
            getPositionalVisionLevel: () => ({ depth: 4 }),
            Math: Object.assign(Object.create(Math), { random: () => 0.5 })   // atzar 0
        });
        vm.runInContext(fnSource('getAIDepth'), ctx);
        return ctx;
    }

    test('el rival de lliga cerca a la profunditat del seu ROC, com a la partida lliure', () => {
        for (const roc of [200, 300, 500, 800, 1100, 1400, 1700, 2000]) {
            expect(depthCtx('league', roc).getAIDepth()).toBe(depthCtx('free', roc).getAIDepth());
            expect(depthCtx('league', roc).getAIDepth()).toBe(Math.min(15, Core.eloToSearchDepth(roc, 1350, 2000)));
        }
    });

    test('ja no és la fórmula antiga (8 + diferència/250): ROC 300 i ROC 1900 no cerquen igual', () => {
        expect(depthCtx('league', 300).getAIDepth()).toBeLessThan(8);
        expect(depthCtx('league', 1900).getAIDepth()).toBeGreaterThan(8);
        expect(fnSource('getAIDepth')).not.toMatch(/delta \/ 250/);
    });
});

describe('makeEngineMove a la lliga sense rellotge', () => {
    function moveCtx(roc, useSf19 = true) {
        const sent = { main: [], sf19: [] };
        const chess = new Chess();
        chess.move('e4');
        const clockCtx = { timeControlId: 'none', remainingMs: null, incMs: 0, elo: roc, phase: 'opening',
            moveNumber: 1, clockTemperament: 1, forced: false, humanPaceMs: null, paceSamples: 0 };
        const ctx = vm.createContext({
            ElTaulerCore: Core, game: chess, playerColor: 'w', currentGameMode: 'league', bessoState: null,
            $: () => ({ hasClass: () => true, text() {} }), phaseReplayInputLocked: () => false, isAntidoteMode: () => false,
            stockfish: { postMessage: c => sent.main.push(c) }, ensureStockfish: () => true,
            timedRivalEngine: { postMessage: c => sent.sf19.push(c) }, timedRivalActive: () => useSf19,
            timedRivalCaps: { limit: true, elo: { min: 1320, max: 3190 }, skill: { min: 0, max: 20 } },
            timedRivalSearch: { active: false, skip: 0 },
            getActiveStrengthElo: () => roc, ELO_MIN: 200, ELO_MAX: 2000,
            getAIDepth: () => { ctx.depthCalls = (ctx.depthCalls || 0) + 1; return 9; },
            resetEngineMoveCandidates() {}, clearEngineMoveTimers() {}, nowMs: () => 0, engineReplyStartTs: 0,
            isCalibrationGame: false, updateCalibrationOpponentRoc() {},
            applyEngineEloStrength: e => sent.main.push(`strength ${e}`),
            getEngineMoveMultiPvValue: (lvl, d) => d,
            gameClock: { enabled: false }, getActiveTimeControlId: () => 'none',
            engineClockContext: () => clockCtx, engineReplyElapsedMs: () => 0, DEBUG_ENGINE_TIMING: false,
            engineMoveCandidateCollector: null,
            leagueActiveMatch: null, tryLeagueBookMove: () => false,
            Math: Object.assign(Object.create(Math), { random: () => 0.0 })   // l'errada per pressió sortiria
        });
        vm.runInContext(fnSource('makeEngineMove'), ctx);
        ctx.makeEngineMove();
        return { ctx, sent };
    }

    test('des de ROC 872: model de tria humana, totes les jugades i sostre de temps sense rellotge', () => {
        const { ctx, sent } = moveCtx(1300);
        expect(ctx.engineSearchUsesTimedRival).toBe(true);
        expect(ctx.engineSearchHumanElo).toBe(Core.humanChoiceEloForRoc(1300));
        expect(sent.sf19).toContain('setoption name UCI_LimitStrength value false');
        expect(sent.sf19).toContain('setoption name MultiPV value 20');
        expect(sent.sf19[sent.sf19.length - 1])
            .toBe(`go depth ${Core.HUMAN_CHOICE_DEPTH} movetime ${Core.UNTIMED_RIVAL_SEARCH_MAX_MS}`);
        expect(sent.main).toEqual([]);
        // Sense rellotge no hi ha errades per pressió, encara que l'atzar hi caigui.
        expect(ctx.engineClockSlipArmed).toBe(false);
        // Les línies es recullen per profunditat, com amb rellotge.
        expect(ctx.engineMoveCandidateCollector).not.toBe(null);
    });

    test('per sota de ROC 872: força calibrada de Stockfish 19 i profunditat del ROC', () => {
        const { ctx, sent } = moveCtx(600);
        const level = Core.timedRivalStrengthElo(600);
        expect(ctx.engineSearchHumanElo).toBe(null);
        expect(ctx.engineSearchStrengthElo).toBe(Math.max(200, level));
        expect(ctx.depthCalls).toBe(1);
        for (const c of Core.nativeStrengthCommands(ctx.timedRivalCaps, Math.max(200, level), false)) expect(sent.sf19).toContain(c);
        expect(sent.sf19[sent.sf19.length - 1]).toBe(`go depth 9 movetime ${Core.UNTIMED_RIVAL_SEARCH_MAX_MS}`);
    });

    test('si Stockfish 19 no ha arrencat: el motor de sempre, sense sostre, com abans', () => {
        const { ctx, sent } = moveCtx(1300, false);
        expect(sent.sf19).toEqual([]);
        expect(sent.main).toContain('strength 1300');
        expect(sent.main[sent.main.length - 1]).toBe('go depth 9');
        expect(ctx.engineMoveCandidateCollector).toBe(null);
    });

    test('el sostre és el temps de reflexió més llarg sense rellotge', () => {
        expect(Core.UNTIMED_RIVAL_SEARCH_MAX_MS).toBe(4500);
    });

    test('la tria del rival de Stockfish 19 va pel camí calibrat també sense rellotge', () => {
        const a = source.indexOf("if (msg.indexOf('bestmove') !== -1 && isEngineThinking && !engineMoveApplyPending)");
        const block = source.slice(a, a + 2600);
        expect(block).toMatch(/const nativePath = gameClock\.enabled \|\| engineSearchUsesTimedRival;/);
        expect(block).toMatch(/chooseHumanLikeMove\(engineMoveCandidates, game, nativePath/);
        expect(block).toMatch(/chosen\.move \|\| \(nativePath \? fallbackMove : chooseFallbackMove\(fallbackMove\)\)/);
    });
});
