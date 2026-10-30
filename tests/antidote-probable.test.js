const fs = require('fs');
const path = require('path');
const { Chess } = require('chess.js');
const Core = require('../core.js');

const CFG = Core.ANTIDOTE_CONFIG;
const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const position = (extra = {}) => ({
    eval: 0, evalType: 'cp',
    move: 'e2e4', san: 'e4', themes: [{ id: 'fork', strength: 0.9 }],
    complexity: 0.6, materialLoss: 0, ...extra
});
const reply = { move: 'd7d5', san: 'd5', cue: 'peó central', plausibility: .75 };
const search = (score, depth = 10) => ({
    depth, timedOut: false,
    alternatives: [{ eval: score, evalType: 'cp', move: 'g1f3' }]
});

describe('Rival Antídot — anàlisi prudent de respostes temptadores', () => {
    test('genera únicament respostes legals i exclou la millor de la PV', () => {
        const replies = Core.antidoteTemptingReplies(
            fen, 'e2e4', ['e2e4', 'e7e5'], 800, Chess
        );
        expect(replies.length).toBeGreaterThan(0);
        const after = new Chess(fen);
        expect(after.move({ from: 'e2', to: 'e4' })).toBeTruthy();
        for (const r of replies) {
            expect(r.move).not.toBe('e7e5');
            expect(r.plausibility).toBeGreaterThanOrEqual(CFG.probableReply.minPlausibility);
            const copy = new Chess(after.fen());
            const move = copy.move({ from: r.move.slice(0, 2),
                to: r.move.slice(2, 4), promotion: r.move[4] || 'q' });
            expect(move).toBeTruthy();
        }
    });

    test('no inventa respostes en FEN il·legal, jugada il·legal o mat', () => {
        expect(Core.antidoteTemptingReplies('invàlid', 'e2e4', [], 800, Chess)).toEqual([]);
        expect(Core.antidoteTemptingReplies(fen, 'a1a8', [], 800, Chess)).toEqual([]);
        expect(Core.antidoteTemptingReplies(fen, '', [], 800, Chess)).toEqual([]);
    });

    test('el resultat només és confirmat amb una cerca completa i pèrdua clara', () => {
        const confirmed = Core.antidoteVerifyProbableReply(reply, position(), search(205));
        expect(confirmed).toMatchObject({ move: 'd7d5', cpLoss: 205, verified: true });
        expect(Core.antidoteVerifyProbableReply(reply, position(), search(25))).toBeNull();
        expect(Core.antidoteVerifyProbableReply(reply, position(), search(250, 3))).toBeNull();
        expect(Core.antidoteVerifyProbableReply(reply, position(),
            { ...search(250), timedOut: true })).toBeNull();
        expect(Core.antidoteVerifyProbableReply(reply, position({ evalType: 'mate', eval: 3 }), search(205))).toBeNull();
        expect(Core.antidoteVerifyProbableReply(reply, position(),
            { depth: 10, alternatives: [{ eval: -3, evalType: 'mate' }] })).toBeNull();
        expect(Core.antidoteVerifyProbableReply({ ...reply, plausibility: 0.1 }, position(), search(300))).toBeNull();
    });

    test('la pèrdua usa sempre perspectiva del rival: valor després menys valor abans', () => {
        expect(Core.antidoteVerifyProbableReply(reply, position({ eval: 70 }), search(230)).cpLoss).toBe(160);
        expect(Core.antidoteVerifyProbableReply(reply, position({ eval: -30 }), search(120)).cpLoss).toBe(150);
    });

    test('el bonus pedagògic no crea proves sense debilitat ni trenca els filtres', () => {
        const empty = Core.antidoteEmptyProfile();
        const p = Core.antidoteEmptyProfile();
        p.weaknesses.missed_tactic.weight = .85;
        p.weaknesses.missed_tactic.occurrences = 12;
        const risk = Core.antidoteVerifyProbableReply(reply, position(), search(225));
        const c = position({ probableReply: risk });
        const ctx = { bestValue: 0, playerElo: 800, phase: 'middlegame' };
        const normal = Core.scoreAntidoteCandidate(position(), p, ctx);
        const increased = Core.scoreAntidoteCandidate(c, p, ctx);
        expect(increased.finalScore).toBeGreaterThan(normal.finalScore);
        const noProfile = Core.scoreAntidoteCandidate(c, empty, ctx);
        expect(noProfile.components.probableReply).toBe(0);
        expect(Core.scoreAntidoteCandidate(position({ eval: -1000, probableReply: risk }), p, ctx).allowed).toBe(false);
        const fakeRisk = Core.scoreAntidoteCandidate(position({ probableReply: { cpLoss: 999, verified: false, plausibility: 1 } }), p, ctx);
        expect(fakeRisk.components.probableReply).toBe(0);
    });

    test('la predicció queda oculta fins després de respondre', () => {
        const p = Core.antidoteEmptyProfile();
        p.weaknesses.missed_tactic.weight = .9;
        p.weaknesses.missed_tactic.occurrences = 10;
        const c = position({ probableReply: Core.antidoteVerifyProbableReply(reply, position(), search(230)) });
        const selected = Core.chooseAntidoteCandidate([c], p, { bestValue: 0, playerElo: 800, phase: 'middlegame' });
        expect(selected.probableReply.move).toBe('d7d5');
        const t = Core.antidoteCreateTest(selected, { fen, ply: 2 });
        expect(t.predictedReply).toBe('d7d5');
        expect(Core.antidoteTurnPrompt().text).not.toMatch(/d5|d7d5|captura|forquilla/);
        expect(Core.antidoteThinkingPrompt().text).not.toMatch(/d5|d7d5|captura|forquilla/);
        const missed = Core.evaluateAntidoteResponse(t, {
            playerMove: 'd7d5', cpLoss: 230, evalBefore: 0, bestMove: 'e7e5'
        });
        expect(missed.predictedMatch).toBe(true);
        expect(missed.result).toBe('failed');
        expect(Core.antidoteResultFeedback(missed).text).toContain('respostes temptadores');
        const avoided = Core.evaluateAntidoteResponse(t, {
            playerMove: 'e7e5', cpLoss: 0, evalBefore: 0, bestMove: 'e7e5'
        });
        expect(avoided.predictedMatch).toBe(false);
        expect(avoided.result).toBe('passed');
    });

    test('les prediccions es conserven al resum i a l’historial, amb compatibilitat antiga', () => {
        const tests = [
            { theme: 'missed_tactic', result: 'failed', predictedReply: 'd7d5', predictedMatch: true, predictedCpLoss: 205 },
            { theme: 'king_safety', result: 'passed', predictedReply: 'c7c5', predictedMatch: false, predictedCpLoss: 160 },
            { theme: 'missed_win', result: 'inconclusive', predictedReply: 'a7a6', predictedMatch: false }
        ];
        const summary = Core.antidoteGameSummary(tests);
        expect(summary.predictions).toBe(2);
        expect(summary.predictionMatches).toBe(1);
        const stored = Core.antidoteSerializeGame(tests);
        expect(stored.tests[0].predictedCpLoss).toBe(205);
        expect(Core.antidoteRestoreGame({ antidote: stored }).tests[0].predictedMatch).toBe(true);
        const legacy = Core.antidoteGameSummary([{ theme: 'missed_tactic', result: 'passed' }]);
        expect(legacy.predictions).toBe(0);
        expect(legacy.predictionMatches).toBe(0);
    });

    test('la segona cerca és acotada i no s’executa en blitz ni bullet', () => {
        const app = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
        const start = app.indexOf('async function enrichAntidoteProbableReplies(');
        const end = app.indexOf('// Converteix el MultiPV cru', start);
        const section = app.slice(start, end);
        expect(start).toBeGreaterThan(0);
        expect(section).toContain("pace === 'bullet' || pace === 'blitz'");
        expect(section).toContain('maxProbes');
        expect(section).toContain('Math.min(2, opts.maxProbes)');
        expect(section).toContain('releaseAntidoteEngine()');
        expect(section).toContain('isCurrent()');
        expect(app).toContain('await enrichAntidoteProbableReplies(');
        expect(app).toContain('probableReply: analysis.probableReplies && analysis.probableReplies[alt.move] || null');
    });
});
