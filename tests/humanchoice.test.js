// Model de tria humana del rival amb rellotge (ANALISI_RELLOTGE.md §17): trets
// de cada jugada, pesos ajustats amb jugades reals de Lichess, nivell calibrat
// per ROC i connexió a la cerca i a la tria de l'app.
const Core = require('../core');
const { Chess } = require('chess.js');
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const fnSource = name => {
    const a = source.indexOf(`function ${name}(`);
    return source.slice(a, source.indexOf('\n}\n', a) + 2);
};
const F = name => Core.HUMAN_CHOICE_FEATURES.indexOf(name);
const featuresOf = (fen, scored, ctx) => {
    const rows = Core.humanMoveFeatures(Chess, fen, scored, ctx);
    return Object.fromEntries(rows.map(r => [r.move, Object.fromEntries(Core.HUMAN_CHOICE_FEATURES.map((k, i) => [k, r.x[i]]))]));
};
const allLegal = (fen, score = () => 0) => {
    const c = new Chess(fen);
    return c.moves({ verbose: true }).map(m => { const u = m.from + m.to + (m.promotion || ''); return [u, score(u)]; });
};

describe('trets de cada jugada (humanMoveFeatures)', () => {
    test('un vector per jugada legal, amb un valor per tret i en el mateix ordre', () => {
        const fen = new Chess().fen();
        const rows = Core.humanMoveFeatures(Chess, fen, allLegal(fen), {});
        expect(rows).toHaveLength(20);
        rows.forEach(r => expect(r.x).toHaveLength(Core.HUMAN_CHOICE_FEATURES.length));
        expect(Core.HUMAN_CHOICE_MODEL.w.every(w => w.length === Core.HUMAN_CHOICE_FEATURES.length)).toBe(true);
    });

    test('ignora jugades il·legals i puntuacions que no són números', () => {
        const fen = new Chess().fen();
        const rows = Core.humanMoveFeatures(Chess, fen, [['e2e4', 30], ['e2e5', 90], ['d2d4', NaN], ['g1f3', 20]], {});
        expect(rows.map(r => r.move)).toEqual(['e2e4', 'g1f3']);
    });

    test('pèrdua en probabilitat de guanyar, rang i millor jugada', () => {
        const fen = new Chess().fen();
        const f = featuresOf(fen, [['e2e4', 40], ['d2d4', 35], ['a2a3', -60], ['g2g4', -500]], {});
        expect(f.e2e4.loss).toBe(0);
        expect(f.e2e4.isBest).toBe(1);
        expect(f.e2e4.logRank).toBe(0);
        expect(f.d2d4.nearBest).toBe(1);
        expect(f.d2d4.logRank).toBeCloseTo(Math.log(2), 10);
        expect(f.a2a3.loss).toBeCloseTo(Core.winningChances(40) - Core.winningChances(-60), 10);
        expect(f.a2a3.lossSmall).toBe(1);   // saturat a una pèrdua de 0,1
        expect(f.g2g4.blunder).toBe(1);
        expect(f.d2d4.blunder).toBe(0);
    });

    test('penjar la dama, salvar una peça atacada i capturar de franc', () => {
        // El cavall de c6 ataca d4: la dama hi quedaria penjada.
        const hang = featuresOf('4k3/8/2n5/8/8/8/8/3QK3 w - - 0 1', allLegal('4k3/8/2n5/8/8/8/8/3QK3 w - - 0 1'), {});
        expect(hang.d1d4.hang).toBe(1);
        expect(hang.d1d5.hang).toBe(0);
        // El peó de c3 ataca el cavall de d2: moure'l és salvar-lo.
        const esc = featuresOf('4k3/8/8/8/8/2p5/3N4/4K3 w - - 0 1', allLegal('4k3/8/8/8/8/2p5/3N4/4K3 w - - 0 1'), {});
        expect(esc.d2e4.escape).toBe(1);
        expect(esc.e1f1.escape).toBe(0);
        // Peó de d5 sense defensa: la dama el captura de franc.
        const cap = featuresOf('4k3/8/8/3p4/8/8/8/3QK3 w - - 0 1', allLegal('4k3/8/8/3p4/8/8/8/3QK3 w - - 0 1'), {});
        expect(cap.d1d5.capture).toBeCloseTo(1 / 9, 10);
        expect(cap.d1d5.freeGain).toBeCloseTo(1 / 9, 10);
        expect(cap.d1d5.queen).toBe(1);
    });

    test('escac, enroc, desenvolupament, teoria, recaptura i la mateixa peça', () => {
        const c = new Chess();
        ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6'].forEach(m => c.move(m));
        const f = featuresOf(c.fen(), allLegal(c.fen()), {
            moveNumber: 4, lastMove: { to: 'f6' }, ownLastMove: { to: 'c4' }, bookMoves: new Set(['Ng5', 'd3'])
        });
        expect(f.e1g1.castle).toBe(1);
        expect(f.e1g1.king).toBe(0);
        expect(f.b1c3.develop).toBe(1);
        expect(f.c4f7.check).toBe(1);
        expect(f.c4f7.samePiece).toBe(1);
        expect(f.f3g5.book).toBe(1);
        expect(f.d2d3.book).toBe(1);
        expect(f.d2d4.book).toBe(0);
        expect(f.d2d4.pawnTwo).toBe(1);
        expect(f.a2a3.edgePawn).toBe(1);
        // Recaptura: captura a la casella on acaba de jugar el rival.
        const t = new Chess();
        ['e4', 'd5', 'exd5'].forEach(m => t.move(m));
        const h = featuresOf(t.fen(), allLegal(t.fen()), { lastMove: { to: 'd5' } });
        expect(h.d8d5.recapture).toBe(1);
        expect(h.g8f6.recapture).toBe(0);
    });
});

describe('model de tria (pesos ajustats amb Lichess)', () => {
    const c = new Chess();
    ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd4', 'exd4', 'cxd4', 'Bb4+', 'Bd2', 'Bxd2+', 'Nbxd2', 'd5']
        .forEach(m => c.move(m));
    const legal = c.moves({ verbose: true }).map(m => m.from + m.to + (m.promotion || ''));
    const rows = Core.humanMoveFeatures(Chess, c.fen(),
        legal.map((u, i) => [u, u === 'e4d5' ? 60 : (u === 'c4d5' ? 20 : -40 - 25 * i)]), { moveNumber: 9 });
    const expectedLoss = elo => Core.humanChoiceProbs(rows, elo).reduce((s, p, i) => s + p * rows[i].x[F('loss')], 0);

    test('les probabilitats sumen 1 i cap jugada no en queda exclosa', () => {
        for (const elo of [400, 1500, 2600]) {
            const p = Core.humanChoiceProbs(rows, elo);
            expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
            p.forEach(v => expect(v).toBeGreaterThan(0));
        }
        expect(Core.humanChoiceProbs([], 1500)).toEqual([]);
    });

    test('com més ELO, menys pèrdua esperada i més sovint la millor', () => {
        const levels = [400, 800, 1200, 1600, 2000, 2400];
        const losses = levels.map(expectedLoss);
        for (let i = 1; i < losses.length; i++) expect(losses[i]).toBeLessThan(losses[i - 1]);
        const pBest = elo => Core.humanChoiceProbs(rows, elo)[rows.findIndex(r => r.move === 'e4d5')];
        expect(pBest(2000)).toBeGreaterThan(pBest(800));
    });

    test('fora del rang de les dades no s’extrapola: l’ELO es retalla', () => {
        expect(expectedLoss(100)).toBeCloseTo(expectedLoss(Core.HUMAN_CHOICE_MODEL.center + Core.HUMAN_CHOICE_MODEL.zMin * 500), 12);
        expect(expectedLoss(5000)).toBeCloseTo(expectedLoss(Core.HUMAN_CHOICE_MODEL.center + Core.HUMAN_CHOICE_MODEL.zMax * 500), 12);
    });

    test('el sorteig segueix les probabilitats (atzar injectat)', () => {
        const p = Core.humanChoiceProbs(rows, 1200);
        expect(Core.pickHumanChoice(rows, 1200, () => 0)).toBe(rows[0]);
        expect(Core.pickHumanChoice(rows, 1200, () => 0.999999999)).toBe(rows[rows.length - 1]);
        const k = 5;
        const before = p.slice(0, k).reduce((a, b) => a + b, 0);
        expect(Core.pickHumanChoice(rows, 1200, () => before + p[k] / 2)).toBe(rows[k]);
        expect(Core.pickHumanChoice([], 1200, () => 0.5)).toBe(null);
    });

    test('la teoria fa més probable la jugada de llibre (mateixa posició i puntuacions)', () => {
        const s = new Chess();
        s.move('e4');
        const scored = allLegal(s.fen());
        const plain = Core.humanMoveFeatures(Chess, s.fen(), scored, { moveNumber: 1 });
        const book = Core.humanMoveFeatures(Chess, s.fen(), scored, { moveNumber: 1, bookMoves: new Set(['c5']) });
        const i = plain.findIndex(r => r.move === 'c7c5');
        expect(Core.humanChoiceProbs(book, 1500)[i]).toBeGreaterThan(Core.humanChoiceProbs(plain, 1500)[i]);
    });
});

describe('nivell del model per a cada ROC', () => {
    test('passa pels punts calibrats', () => {
        for (const [roc, elo] of Core.HUMAN_CHOICE_ROC_POINTS) expect(Core.humanChoiceEloForRoc(roc)).toBe(elo);
    });
    test('per sota del primer punt no hi ha model (es manté la tria anterior)', () => {
        expect(Core.humanChoiceEloForRoc(871)).toBe(null);
        expect(Core.humanChoiceEloForRoc(200)).toBe(null);
        expect(Core.humanChoiceEloForRoc(NaN)).toBe(null);
        expect(Core.humanChoiceEloForRoc(undefined)).toBe(null);
    });
    test('és monòton i allarga el darrer tram fins al ROC màxim', () => {
        let prev = -Infinity;
        for (let roc = 872; roc <= 2000; roc += 4) {
            const e = Core.humanChoiceEloForRoc(roc);
            expect(e).toBeGreaterThanOrEqual(prev);
            prev = e;
        }
        expect(Core.humanChoiceEloForRoc(2000)).toBe(1854);
    });
    test('el primer punt és el límit inferior de les dades del model', () => {
        const M = Core.HUMAN_CHOICE_MODEL;
        expect(Core.HUMAN_CHOICE_ROC_POINTS[0][1]).toBe(M.center + M.zMin * M.scale);
    });
});

describe('teoria i casella d’arribada (igual que a l’ajust)', () => {
    test('l’índex de teoria llegeix el format de obertures.js', () => {
        const idx = Core.humanBookIndex([{ pgn: '1. e4 c5 2. Nf3 d6' }, { pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5' }]);
        expect([...idx.get('')]).toEqual(['e4']);
        expect([...idx.get('e4')].sort()).toEqual(['c5', 'e5']);
        expect([...idx.get('e4 e5 Nf3')]).toEqual(['Nc6']);
        expect(Core.humanBookMoves(idx, ['e4', 'e5', 'Nf3', 'Nc6'])).toEqual(new Set(['Bb5']));
        expect(Core.humanBookMoves(idx, ['d4'])).toBe(null);
        expect(Core.humanBookMoves(null, ['e4'])).toBe(null);
    });
    test('els escacs de la partida no impedeixen trobar la línia', () => {
        const idx = Core.humanBookIndex([{ pgn: '1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#' }]);
        expect(Core.humanBookMoves(idx, ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6'])).toEqual(new Set(['Qxf7']));
    });
    test('les dades reals d’obertures es poden indexar', () => {
        const ctx = vm.createContext({});
        vm.runInContext(fs.readFileSync(require.resolve('../obertures.js'), 'utf8') + '\n;globalThis.__O = OPENINGS_DATA;', ctx);
        const idx = Core.humanBookIndex(ctx.__O);
        expect(idx.get('').has('e4')).toBe(true);
        expect(idx.get('e4').has('c5')).toBe(true);
    });
    test('casella d’arribada d’una SAN', () => {
        expect(Core.humanSanTarget('Nxe5+')).toBe('e5');
        expect(Core.humanSanTarget('exd6')).toBe('d6');
        expect(Core.humanSanTarget('e8=Q#')).toBe('e8');
        expect(Core.humanSanTarget('O-O')).toBe(null);
        expect(Core.humanSanTarget('O-O-O+')).toBe(null);
    });
});

describe('makeEngineMove amb el model de tria humana', () => {
    function moveCtx(roc, useSf19 = true) {
        const sent = { main: [], sf19: [] };
        const chess = new Chess();
        chess.move('e4');
        const clockCtx = { timeControlId: '3+2', remainingMs: 170000, incMs: 2000, elo: roc, phase: 'opening',
            moveNumber: 1, clockTemperament: 1, forced: false, humanPaceMs: null, paceSamples: 0 };
        const ctx = vm.createContext({
            ElTaulerCore: Core, game: chess, playerColor: 'w', currentGameMode: 'free', bessoState: null,
            $: () => ({ hasClass: () => true, text() {} }), phaseReplayInputLocked: () => false, isAntidoteMode: () => false,
            stockfish: { postMessage: c => sent.main.push(c) }, ensureStockfish: () => true,
            timedRivalEngine: { postMessage: c => sent.sf19.push(c) }, timedRivalActive: () => useSf19,
            timedRivalCaps: { limit: true, elo: { min: 1320, max: 3190 }, skill: { min: 0, max: 20 } },
            timedRivalSearch: { active: false, skip: 0 },
            getActiveStrengthElo: () => roc, ELO_MIN: 200, ELO_MAX: 2000,
            getAIDepth: () => { ctx.depthCalls = (ctx.depthCalls || 0) + 1; return 13; },
            resetEngineMoveCandidates() {}, clearEngineMoveTimers() {}, nowMs: () => 0, engineReplyStartTs: 0,
            isCalibrationGame: false, updateCalibrationOpponentRoc() {},
            applyEngineEloStrength: e => sent.main.push(`strength ${e}`),
            getEngineMoveMultiPvValue: (lvl, d) => d,
            gameClock: { enabled: true }, getActiveTimeControlId: () => '3+2',
            engineClockContext: () => clockCtx, engineReplyElapsedMs: () => 0, DEBUG_ENGINE_TIMING: false,
            Math: Object.assign(Object.create(Math), { random: () => 0.99 })
        });
        vm.runInContext(fnSource('makeEngineMove'), ctx);
        ctx.makeEngineMove();
        return { ctx, sent, clockCtx };
    }

    test('des de ROC 872: Stockfish 19 a força màxima puntua totes les jugades a la profunditat del model', () => {
        const { ctx, sent, clockCtx } = moveCtx(1604);
        expect(ctx.engineSearchHumanElo).toBe(Core.humanChoiceEloForRoc(1604));
        expect(sent.sf19).toContain('setoption name UCI_LimitStrength value false');
        expect(sent.sf19.some(c => /UCI_Elo/.test(c))).toBe(false);
        expect(sent.sf19).toContain('setoption name MultiPV value 20');   // les 20 jugades legals
        expect(ctx.depthCalls).toBeUndefined();
        const budget = Core.gameSearchBudgetMs({ ...clockCtx, elapsedMs: 0 });
        expect(sent.sf19[sent.sf19.length - 1]).toBe(`go depth ${Core.HUMAN_CHOICE_DEPTH} movetime ${budget}`);
        // La dificultat del temps de reflexió es continua mirant a les línies d'abans.
        expect(ctx.engineComplexityPv).toBe(5);
        expect(sent.main).toEqual([]);
    });

    test('per sota de ROC 872: la cerca i la tria d’abans', () => {
        const { ctx, sent } = moveCtx(800);
        expect(ctx.engineSearchHumanElo).toBe(null);
        expect(ctx.depthCalls).toBe(1);
        expect(sent.sf19).toContain('setoption name UCI_LimitStrength value true');
        expect(sent.sf19).toContain('setoption name MultiPV value 5');
        expect(sent.sf19[sent.sf19.length - 1]).toMatch(/^go depth 13 movetime \d+$/);
    });

    test('sense Stockfish 19 (motor de sempre): sense model', () => {
        const { ctx, sent } = moveCtx(1604, false);
        expect(ctx.engineSearchHumanElo).toBe(null);
        expect(sent.main).toContain('strength 1604');
        expect(sent.sf19).toEqual([]);
    });

    test('la resposta del motor passa el nivell del model a la tria', () => {
        const a = source.indexOf("if (msg.indexOf('bestmove') !== -1 && isEngineThinking && !engineMoveApplyPending)");
        expect(source.slice(a, a + 2400)).toMatch(/humanChoiceElo: engineSearchHumanElo/);
    });
});

describe('tria de l’app amb el model (chooseHumanLikeMove)', () => {
    function choiceCtx(randomValue, extra = {}) {
        const ctx = vm.createContext({
            ElTaulerCore: Core, Chess, OPENINGS_DATA: [{ pgn: '1. e4 c5 2. Nf3' }], getActiveStrengthElo: () => 1500,
            engineEloMin: 1350, logWeakAiSelection() {}, pickClockSlipMove: () => extra.slip || null,
            Math: Object.assign(Object.create(Math), { random: () => randomValue }), ...extra.ctx
        });
        ['getHumanBookIndex', 'humanBookMovesFor', 'pickHumanModelMove', 'chooseHumanLikeMove']
            .forEach(n => vm.runInContext(fnSource(n), ctx));
        vm.runInContext('let humanBookIndexCache = null;', ctx);
        return ctx;
    }
    const game = () => { const c = new Chess(); c.move('e4'); return c; };
    const candidates = c => c.moves({ verbose: true }).map((m, i) => ({ multipv: i + 1, move: m.from + m.to, score: m.san === 'c5' ? 30 : -10 * i, depth: 10 }));

    test('tria la jugada que sorteja el model, amb la partida com a context (teoria inclosa)', () => {
        for (const r of [0.05, 0.4, 0.8]) {
            const c = game();
            const cands = candidates(c);
            const ctx = choiceCtx(r);
            const chosen = ctx.chooseHumanLikeMove(cands, c, { engineBestMove: 'c7c5', clock: {}, humanChoiceElo: 940 });
            const rows = Core.humanMoveFeatures(Chess, c.fen(), cands.map(x => [x.move, x.score]), {
                moveNumber: 1, lastMove: { to: 'e4' }, ownLastMove: null, bookMoves: new Set(['c5']) });
            expect(chosen).toBe(cands.find(x => x.move === Core.pickHumanChoice(rows, 940, () => r).move));
        }
    });

    test('l’errada per pressió de rellotge passa davant del model', () => {
        const c = game();
        const cands = candidates(c);
        const slip = cands[7];
        const ctx = choiceCtx(0.5, { slip });
        expect(ctx.chooseHumanLikeMove(cands, c, { engineBestMove: 'c7c5', clock: {}, clockSlip: true, humanChoiceElo: 940 })).toBe(slip);
    });

    test('jugada única o cerca sense alternatives: la del motor', () => {
        const c = game();
        const ctx = choiceCtx(0.5);
        const only = { multipv: 1, move: 'c7c5', score: 30, depth: 10 };
        expect(ctx.chooseHumanLikeMove([only], c, { engineBestMove: 'c7c5', clock: {}, humanChoiceElo: 940 })).toBe(only);
        expect(ctx.chooseHumanLikeMove([], c, { engineBestMove: 'c7c5', clock: {}, humanChoiceElo: 940 })).toEqual({ move: 'c7c5' });
    });

    test('una partida que no ve de la posició inicial no té teoria', () => {
        const ctx = choiceCtx(0.5);
        const fromStart = game();
        expect(ctx.humanBookMovesFor(fromStart, fromStart.history())).toEqual(new Set(['c5']));
        const loaded = new Chess('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKB1R w KQkq - 0 1');   // sense el cavall de g1
        loaded.move('e4');
        expect(ctx.humanBookMovesFor(loaded, loaded.history())).toBe(null);
    });
});

describe('dificultat per al temps de reflexió', () => {
    test('es mira a les mateixes línies que abans, encara que el motor les puntuï totes', () => {
        const cands = Array.from({ length: 30 }, (_, i) => ({ multipv: i + 1, move: 'a2a3', score: 50 - (i < 4 ? i * 5 : 60 + i * 10) }));
        const game = new Chess();
        const ctx = vm.createContext({ ElTaulerCore: Core, engineMoveSearchTrace: [], engineMoveCandidates: cands,
            engineComplexityPv: 5, game });
        vm.runInContext(fnSource('estimateEngineMoveComplexity'), ctx);
        const expected = Core.estimateMoveComplexity({ candidates: cands.slice(0, 5), bestMoveChanges: 0, evalSamples: [],
            shallowDeepSwingCp: 0, tacticalFlag: 0 });
        expect(ctx.estimateEngineMoveComplexity()).toEqual(expected);
        expect(Core.estimateMoveComplexity({ candidates: cands, bestMoveChanges: 0, evalSamples: [], shallowDeepSwingCp: 0,
            tacticalFlag: 0 })).not.toEqual(expected);
    });
});
