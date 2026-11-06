// Rival de les partides amb rellotge amb Stockfish 19 (ANALISI_RELLOTGE.md §16):
// força calibrada perquè cada ROC jugui com el motor anterior, worker propi,
// respostes de cerques aturades descartades i retorn al motor de sempre.
const Core = require('../core');
const { Chess } = require('chess.js');
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const fnSource = name => {
    const a = source.indexOf(`function ${name}(`);
    return source.slice(a, source.indexOf('\n}\n', a) + 2);
};

describe('força de Stockfish 19 per ROC (calibrada contra el motor anterior)', () => {
    test('passa pels punts calibrats', () => {
        for (const [roc, s] of Core.TIMED_RIVAL_STRENGTH_POINTS) expect(Core.timedRivalStrengthElo(roc)).toBe(s);
    });
    test('és monòtona en tot el rang de ROC (més ROC, mai menys força)', () => {
        let prev = -Infinity;
        for (let roc = 200; roc <= 2000; roc += 5) {
            const s = Core.timedRivalStrengthElo(roc);
            expect(s).toBeGreaterThanOrEqual(prev);
            prev = s;
        }
    });
    test('al mateix nivell nominal Stockfish 19 és més fort: mai no se li dóna més nivell que el ROC', () => {
        for (let roc = 200; roc <= 2000; roc += 25) expect(Core.timedRivalStrengthElo(roc)).toBeLessThanOrEqual(roc);
    });
});

describe('cerques del worker del rival (rivalSearch*)', () => {
    const run = (state, msgs) => msgs.reduce((acc, m) => {
        const r = Core.rivalSearchMessage(acc.state, m);
        if (r.forward) acc.out.push(m);
        return { state: r.state, out: acc.out };
    }, { state, out: [] });

    test('una cerca normal: les línies i el bestmove passen, i després res més', () => {
        let st = Core.rivalSearchStart({ active: false, skip: 0 });
        expect(st.needStop).toBe(false);
        const r = run(st.state, ['info depth 5 multipv 1 score cp 20 pv e2e4', 'bestmove e2e4', 'bestmove d2d4']);
        expect(r.out).toEqual(['info depth 5 multipv 1 score cp 20 pv e2e4', 'bestmove e2e4']);
        expect(r.state).toEqual({ active: false, skip: 0 });
    });

    test('nova cerca amb una de viva: s’atura i les respostes velles no es prenen per noves', () => {
        let st = Core.rivalSearchStart({ active: false, skip: 0 }).state;
        const second = Core.rivalSearchStart(st);
        expect(second.needStop).toBe(true);
        const r = run(second.state, ['info depth 9 multipv 1 score cp 50 pv a2a3', 'bestmove a2a3',
            'info depth 3 multipv 1 score cp 10 pv e2e4', 'bestmove e2e4']);
        expect(r.out).toEqual(['info depth 3 multipv 1 score cp 10 pv e2e4', 'bestmove e2e4']);
    });

    test('aturar (partida acabada) descarta la resposta que encara arriba', () => {
        let st = Core.rivalSearchStart({ active: false, skip: 0 }).state;
        const stopped = Core.rivalSearchStop(st);
        expect(stopped.needStop).toBe(true);
        expect(run(stopped.state, ['info depth 7 pv e2e4', 'bestmove e2e4']).out).toEqual([]);
        // Sense cerca viva, aturar no envia res.
        expect(Core.rivalSearchStop({ active: false, skip: 0 }).needStop).toBe(false);
    });

    test('les opcions, uciok i readyok no passen mai al circuit de partida', () => {
        const st = Core.rivalSearchStart({ active: false, skip: 0 }).state;
        expect(run(st, ['option name UCI_Elo type spin default 1320 min 1320 max 3190', 'uciok', 'readyok']).out).toEqual([]);
    });
});

describe('worker del rival a l’app', () => {
    function workerCtx() {
        const forwarded = [];
        const ctx = vm.createContext({
            ElTaulerCore: Core, handleEngineMessage: m => forwarded.push(m), engineStrengthCaps: { skill: { min: 0, max: 20 } },
            timedRivalEngine: { postMessage() {} }, timedRivalCaps: {}, timedRivalReady: false, timedRivalReadyWaiters: [],
            timedRivalSearch: { active: false, skip: 0 }
        });
        vm.runInContext(fnSource('handleTimedRivalMessage'), ctx);
        return { ctx, forwarded };
    }

    test('les opcions de Stockfish 19 es desen a part de les del motor principal', () => {
        const { ctx } = workerCtx();
        ctx.handleTimedRivalMessage('option name UCI_LimitStrength type check default false');
        ctx.handleTimedRivalMessage('option name UCI_Elo type spin default 1320 min 1320 max 3190');
        expect(ctx.timedRivalCaps.limit).toBe(true);
        expect(ctx.timedRivalCaps.elo).toEqual({ min: 1320, max: 3190 });
        expect(ctx.engineStrengthCaps).toEqual({ skill: { min: 0, max: 20 } });
    });

    test('readyok avisa qui l’esperava; només la cerca viva arriba a handleEngineMessage', () => {
        const { ctx, forwarded } = workerCtx();
        let ready = null;
        ctx.timedRivalReadyWaiters.push(ok => { ready = ok; });
        ctx.handleTimedRivalMessage('readyok');
        expect(ready).toBe(true);
        expect(ctx.timedRivalReady).toBe(true);
        ctx.handleTimedRivalMessage('bestmove e2e4');              // cap cerca viva
        ctx.timedRivalSearch = { active: true, skip: 0 };
        ctx.handleTimedRivalMessage('info depth 4 multipv 1 score cp 12 pv d2d4');
        ctx.handleTimedRivalMessage('bestmove d2d4');
        expect(forwarded).toEqual(['info depth 4 multipv 1 score cp 12 pv d2d4', 'bestmove d2d4']);
    });

    test('aturar els temporitzadors del rival també n’atura la cerca', () => {
        expect(fnSource('clearEngineMoveTimers')).toMatch(/stopTimedRivalSearch\(\)/);
    });
});

describe('makeEngineMove amb rellotge', () => {
    // Per sota de ROC 872 (sense model de tria humana, vegeu humanchoice.test.js).
    function moveCtx(useSf19, roc = 860) {
        const sent = { main: [], sf19: [] };
        const chess = new Chess();
        chess.move('e4');
        const clockCtx = { timeControlId: '1+0', remainingMs: 52000, incMs: 0, elo: roc, phase: 'opening',
            moveNumber: 1, clockTemperament: 1, forced: false, humanPaceMs: null, paceSamples: 0 };
        const ctx = vm.createContext({
            ElTaulerCore: Core, game: chess, playerColor: 'w', currentGameMode: 'free', bessoState: null,
            $: () => ({ hasClass: () => true, text() {} }), phaseReplayInputLocked: () => false, isAntidoteMode: () => false,
            stockfish: { postMessage: c => sent.main.push(c) }, ensureStockfish: () => true,
            timedRivalEngine: { postMessage: c => sent.sf19.push(c) }, timedRivalActive: () => useSf19,
            timedRivalCaps: { limit: true, elo: { min: 1320, max: 3190 }, skill: { min: 0, max: 20 } },
            timedRivalSearch: { active: false, skip: 0 },
            getActiveStrengthElo: () => roc, ELO_MIN: 200, ELO_MAX: 2000,
            getAIDepth: (...args) => { ctx.depthCalls = (ctx.depthCalls || 0) + 1; ctx.depthArgs = args; return 10; },
            resetEngineMoveCandidates() {}, clearEngineMoveTimers() {}, nowMs: () => 0, engineReplyStartTs: 0,
            isCalibrationGame: false, updateCalibrationOpponentRoc() {},
            applyEngineEloStrength: e => sent.main.push(`strength ${e}`),
            getEngineMoveMultiPvValue: (lvl, d) => { ctx.pvLevel = lvl; return d; },
            gameClock: { enabled: true }, getActiveTimeControlId: () => '1+0',
            engineClockContext: () => clockCtx, engineReplyElapsedMs: () => 0, DEBUG_ENGINE_TIMING: false,
            Math: Object.assign(Object.create(Math), { random: () => 0.99 })
        });
        vm.runInContext(fnSource('makeEngineMove'), ctx);
        ctx.makeEngineMove();
        return { ctx, sent, clockCtx };
    }

    test('amb Stockfish 19: tota la cerca va al seu worker, força al nivell calibrat, profunditat i temps del ROC', () => {
        const { ctx, sent, clockCtx } = moveCtx(true);
        const level = Core.timedRivalStrengthElo(860);
        expect(sent.main).toEqual([]);
        expect(ctx.engineSearchUsesTimedRival).toBe(true);
        expect(ctx.engineSearchStrengthElo).toBe(level);
        expect(ctx.depthCalls).toBe(1);   // getAIDepth() sense nivell: surt del ROC
        expect(ctx.depthArgs).toEqual([]);
        expect(ctx.pvLevel).toBe(level);
        for (const c of Core.nativeStrengthCommands(ctx.timedRivalCaps, level, false)) expect(sent.sf19).toContain(c);
        const budget = Core.gameSearchBudgetMs({ ...clockCtx, elapsedMs: 0 });
        expect(sent.sf19[sent.sf19.length - 1]).toBe(`go depth 10 movetime ${budget}`);
        expect(ctx.timedRivalSearch.active).toBe(true);
    });

    test('si Stockfish 19 no ha arrencat: el motor de sempre, amb el ROC tal qual', () => {
        const { ctx, sent } = moveCtx(false);
        expect(sent.sf19).toEqual([]);
        expect(sent.main).toContain('strength 860');
        expect(sent.main[sent.main.length - 1]).toMatch(/^go depth 10 movetime \d+$/);
        expect(ctx.engineSearchUsesTimedRival).toBe(false);
        expect(ctx.engineSearchStrengthElo).toBe(860);
        expect(ctx.depthArgs).toEqual([]);
    });

    test('la tria final rep el nivell i la força nativa del motor que ha cercat', () => {
        const a = source.indexOf("if (msg.indexOf('bestmove') !== -1 && isEngineThinking && !engineMoveApplyPending)");
        const block = source.slice(a, a + 2200);
        expect(block).toMatch(/const searchCaps = engineSearchUsesTimedRival \? timedRivalCaps : engineStrengthCaps;/);
        expect(block).toMatch(/strengthElo: engineSearchStrengthElo/);
        expect(fnSource('chooseHumanLikeMove')).toMatch(/Number\.isFinite\(options\.strengthElo\) \? options\.strengthElo : getActiveStrengthElo\(\)/);
    });

    test('en començar una partida amb rellotge es prepara Stockfish 19 i es fixa per a tota la partida', () => {
        // sf19RivalWanted: amb rellotge (o a la lliga, vegeu league-rival.test.js).
        expect(source).toMatch(/timedRivalInUse = false;\s*if \(sf19RivalWanted\(clockApplies\)\)/);
        expect(fnSource('sf19RivalWanted')).toMatch(/getActiveTimeControlId\(\) !== 'none'/);
        expect(source).toMatch(/const rivalReady = alreadyReady \|\| await prewarmTimedRivalEngine\(10000\);/);
        expect(source).toMatch(/timedRivalInUse = rivalReady;/);
    });
});
