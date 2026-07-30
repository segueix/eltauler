const Core = require('../core.js');
const { Chess } = require('chess.js');

const D = Core.createAntidoteDetectors(Chess);
const CFG = Core.ANTIDOTE_CONFIG;

const DAY = 86400000;
const NOW = Date.UTC(2026, 0, 15);

// Entrada d'historial amb revisions de jugades pròpies.
function gameEntry(reviews, opts = {}) {
    return {
        id: opts.id || 'g_' + Math.random().toString(36).slice(2),
        date: new Date(opts.at || NOW).toISOString(),
        mode: opts.mode || 'free',
        playerColor: opts.playerColor || 'w',
        moves: opts.moves || ['e4', 'e5', 'Nf3', 'Nc6'],
        moveReviews: reviews
    };
}

// Revisió d'una jugada pròpia. `evalBefore`/`evalAfter` en cp des del jugador.
function review(moveNumber, quality, swing, extra = {}) {
    return Object.assign({
        moveNumber,
        color: 'w',
        quality,
        swing,
        fen: extra.fen || 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
        evalBefore: extra.evalBefore !== undefined ? extra.evalBefore : 40,
        evalAfter: extra.evalAfter !== undefined ? extra.evalAfter : 40 - swing
    }, extra);
}

// Candidata en el format que retorna el MultiPV enriquit + els detectors.
function candidate(move, evalCp, themes, extra = {}) {
    return Object.assign({
        move,
        san: extra.san || move,
        eval: evalCp,
        evalType: extra.evalType || 'cp',
        themes: themes || [],
        complexity: extra.complexity !== undefined ? extra.complexity : 0.6,
        materialLoss: extra.materialLoss || 0,
        pv: extra.pv || []
    }, extra);
}

// ═══════════════════════════════════════════════════════════════════════════
//  Perfil
// ═══════════════════════════════════════════════════════════════════════════
describe('perfil Antídot', () => {
    test('perfil buit: cap debilitat, cap mostra, i es considera prim', () => {
        const p = Core.buildAntidoteProfile({ games: [], savedErrors: [], tests: [], now: NOW });
        expect(p.version).toBe(1);
        expect(p.sampleGames).toBe(0);
        expect(p.sampleMoves).toBe(0);
        expect(Core.ANTIDOTE_WEAKNESS_IDS.every(id => p.weaknesses[id].weight === 0)).toBe(true);
        expect(Core.ANTIDOTE_WEAKNESS_IDS.every(id => p.weaknesses[id].occurrences === 0)).toBe(true);
        expect(Core.antidoteProfileIsThin(p)).toBe(true);
        expect(Core.antidoteTopWeaknesses(p, 3)).toEqual([]);
    });

    test('sense arguments no peta i retorna un perfil buit vàlid', () => {
        const p = Core.buildAntidoteProfile();
        expect(p.weaknesses.missed_tactic.weight).toBe(0);
        expect(p.phaseWeaknesses).toEqual({ opening: 0, middlegame: 0, endgame: 0 });
    });

    test('una sola mostra dona confiança baixa', () => {
        const g = gameEntry([review(12, 'blunder', 400, { evalBefore: 50, evalAfter: -350 })]);
        const p = Core.buildAntidoteProfile({ games: [g], now: NOW });
        const top = Core.antidoteTopWeaknesses(p, 3);
        expect(top.length).toBe(1);
        expect(top[0].occurrences).toBe(1);
        expect(top[0].confidence).toBeLessThan(0.25);
        expect(Core.antidoteConfidenceLabel(top[0].confidence)).toBe('indici inicial');
    });

    test('moltes mostres augmenten la confiança', () => {
        const few = Core.buildAntidoteProfile({
            games: [gameEntry([review(12, 'blunder', 400, { evalBefore: 50, evalAfter: -350 })])],
            now: NOW
        });
        const manyReviews = [];
        for (let i = 1; i <= 20; i++) {
            manyReviews.push(review(i, 'blunder', 400, { evalBefore: 50, evalAfter: -350 }));
        }
        const many = Core.buildAntidoteProfile({ games: [gameEntry(manyReviews)], now: NOW });
        const fewConf = Core.antidoteTopWeaknesses(few, 1)[0].confidence;
        const manyConf = Core.antidoteTopWeaknesses(many, 1)[0].confidence;
        expect(manyConf).toBeGreaterThan(fewConf);
        expect(manyConf).toBeGreaterThan(0.5);
        // Mai categòric: la confiança no arriba a 1 amb dades normals.
        expect(manyConf).toBeLessThanOrEqual(1);
    });

    test('la confiança creix de manera monòtona amb el nombre de mostres', () => {
        const values = [1, 2, 5, 10, 25, 50].map(n => Core.antidoteConfidence(n));
        for (let i = 1; i < values.length; i++) {
            expect(values[i]).toBeGreaterThan(values[i - 1]);
        }
        expect(Core.antidoteConfidence(0)).toBe(0);
    });

    test('els errors recents pesen més que els antics', () => {
        const recent = Core.buildAntidoteProfile({
            games: [gameEntry([review(12, 'blunder', 400, { evalBefore: 50, evalAfter: -350 })], { at: NOW - DAY })],
            now: NOW
        });
        const old = Core.buildAntidoteProfile({
            games: [gameEntry([review(12, 'blunder', 400, { evalBefore: 50, evalAfter: -350 })], { at: NOW - 120 * DAY })],
            now: NOW
        });
        const recentWeight = Core.antidoteTopWeaknesses(recent, 1)[0].weight;
        const oldWeight = Core.antidoteTopWeaknesses(old, 1)[0].weight;
        expect(recentWeight).toBeGreaterThan(oldWeight);
        expect(Core.antidoteRecencyFactor(NOW - DAY, NOW)).toBeGreaterThan(Core.antidoteRecencyFactor(NOW - 60 * DAY, NOW));
    });

    test('els errors greus pesen més que les imprecisions', () => {
        const severe = Core.buildAntidoteProfile({
            games: [gameEntry([review(12, 'blunder', 700, { evalBefore: 50, evalAfter: -650 })])],
            now: NOW
        });
        const mild = Core.buildAntidoteProfile({
            games: [gameEntry([review(12, 'mistake', 120, { evalBefore: 50, evalAfter: -70 })])],
            now: NOW
        });
        expect(Core.antidoteTopWeaknesses(severe, 1)[0].severity)
            .toBeGreaterThan(Core.antidoteTopWeaknesses(mild, 1)[0].severity);
        expect(Core.antidoteTopWeaknesses(severe, 1)[0].weight)
            .toBeGreaterThan(Core.antidoteTopWeaknesses(mild, 1)[0].weight);
    });

    test('les jugades bones no generen cap debilitat', () => {
        const g = gameEntry([
            review(1, 'excel', 0),
            review(2, 'good', 20),
            review(3, 'excel', 5)
        ]);
        const p = Core.buildAntidoteProfile({ games: [g], now: NOW });
        expect(Core.antidoteTopWeaknesses(p, 3)).toEqual([]);
        expect(p.sampleMoves).toBe(3);
    });

    test('les proves superades rebaixen progressivament el pes', () => {
        const reviews = [];
        for (let i = 1; i <= 10; i++) reviews.push(review(i, 'blunder', 400, { evalBefore: 50, evalAfter: -350 }));
        const games = [gameEntry(reviews)];
        const base = Core.buildAntidoteProfile({ games, tests: [], now: NOW });
        const theme = Core.antidoteTopWeaknesses(base, 1)[0].id;
        const passing = n => Array.from({ length: n }, (_, i) =>
            ({ id: 't' + i, theme, result: 'passed', severity: 0.6, at: NOW }));
        const after3 = Core.buildAntidoteProfile({ games, tests: passing(3), now: NOW });
        const after8 = Core.buildAntidoteProfile({ games, tests: passing(8), now: NOW });
        expect(after3.weaknesses[theme].weight).toBeLessThan(base.weaknesses[theme].weight);
        expect(after8.weaknesses[theme].weight).toBeLessThan(after3.weaknesses[theme].weight);
    });

    test('una sola prova superada no elimina una debilitat consolidada', () => {
        const reviews = [];
        for (let i = 1; i <= 25; i++) reviews.push(review(i, 'blunder', 500, { evalBefore: 50, evalAfter: -450 }));
        const games = [gameEntry(reviews)];
        const base = Core.buildAntidoteProfile({ games, tests: [], now: NOW });
        const theme = Core.antidoteTopWeaknesses(base, 1)[0].id;
        const after = Core.buildAntidoteProfile({
            games,
            tests: [{ id: 't1', theme, result: 'passed', severity: 0.6, at: NOW }],
            now: NOW
        });
        expect(after.weaknesses[theme].weight).toBeGreaterThan(0);
        // Conserva la major part del pes: una prova no esborra 25 errades.
        expect(after.weaknesses[theme].weight).toBeGreaterThan(base.weaknesses[theme].weight * 0.7);
        expect(Core.antidoteTopWeaknesses(after, 1)[0].id).toBe(theme);
    });

    test('les proves fallades reforcen la debilitat', () => {
        const reviews = [review(4, 'mistake', 150, { evalBefore: 40, evalAfter: -110 })];
        const games = [gameEntry(reviews)];
        const base = Core.buildAntidoteProfile({ games, tests: [], now: NOW });
        const theme = Core.antidoteTopWeaknesses(base, 1)[0].id;
        const failed = Core.buildAntidoteProfile({
            games,
            tests: [
                { id: 'f1', theme, result: 'failed', severity: 0.8, at: NOW },
                { id: 'f2', theme, result: 'failed', severity: 0.8, at: NOW }
            ],
            now: NOW
        });
        expect(failed.weaknesses[theme].weight).toBeGreaterThan(base.weaknesses[theme].weight);
        expect(failed.weaknesses[theme].occurrences).toBeGreaterThan(base.weaknesses[theme].occurrences);
    });

    test('les dades corruptes no trenquen el perfil', () => {
        const p = Core.buildAntidoteProfile({
            games: [
                null,
                'no és una partida',
                { moveReviews: 'tampoc' },
                { antidoteStats: { categories: null } },
                { antidoteStats: { categories: { inventat: { n: 3 } }, moves: 'x' } },
                gameEntry([review(3, 'blunder', 400, { evalBefore: 20, evalAfter: -380 })])
            ],
            savedErrors: [null, 42, { fen: 'x' }],
            tests: [null, { theme: 'inexistent', result: 'passed' }],
            now: NOW
        });
        expect(p.sampleGames).toBeGreaterThan(0);
        expect(Number.isFinite(p.weaknesses.missed_tactic.weight)).toBe(true);
        Core.ANTIDOTE_WEAKNESS_IDS.forEach(id => {
            expect(p.weaknesses[id].weight).toBeGreaterThanOrEqual(0);
            expect(p.weaknesses[id].weight).toBeLessThanOrEqual(1);
        });
    });

    test('el resum lleuger d\'una partida evita rellegir les revisions', () => {
        const g = gameEntry([
            review(8, 'blunder', 500, { evalBefore: 60, evalAfter: -440 }),
            review(9, 'excel', 0)
        ]);
        const stats = Core.antidoteWeaknessStatsFromGame(g);
        expect(stats.moves).toBe(2);
        expect(Object.keys(stats.categories).length).toBe(1);
        // Amb el resum desat i SENSE revisions, el perfil és el mateix.
        const light = { id: g.id, date: g.date, playerColor: 'w', antidoteStats: stats };
        const fromFull = Core.buildAntidoteProfile({ games: [g], now: NOW });
        const fromLight = Core.buildAntidoteProfile({ games: [light], now: NOW });
        expect(fromLight.weaknesses).toEqual(fromFull.weaknesses);
        expect(fromLight.sampleMoves).toBe(fromFull.sampleMoves);
    });

    test('la debilitat per fase surt de la pèrdua relativa de cada fase', () => {
        const endgameFen = '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 40';
        const g = gameEntry([
            review(2, 'good', 10),
            review(3, 'good', 10),
            review(40, 'blunder', 600, { fen: endgameFen, evalBefore: 50, evalAfter: -550 })
        ]);
        const p = Core.buildAntidoteProfile({ games: [g], now: NOW });
        expect(p.phaseWeaknesses.endgame).toBeGreaterThan(p.phaseWeaknesses.opening);
    });

    test('les errades desades reforcen el perfil', () => {
        const p = Core.buildAntidoteProfile({
            savedErrors: [
                { fen: 'a', severity: 'high', date: new Date(NOW - DAY).toLocaleDateString('en-US') },
                { fen: 'b', severity: 'low', date: new Date(NOW - DAY).toLocaleDateString('en-US') }
            ],
            now: NOW
        });
        const top = Core.antidoteTopWeaknesses(p, 3);
        expect(top.length).toBeGreaterThan(0);
        expect(top.some(w => w.id === 'lost_material' || w.id === 'missed_tactic')).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Avaluacions i marges
// ═══════════════════════════════════════════════════════════════════════════
describe('normalització d\'avaluacions', () => {
    test('el mat no es barreja amb els centpeons', () => {
        const mate3 = Core.antidoteScoreValue({ eval: 3, evalType: 'mate' });
        const mate5 = Core.antidoteScoreValue({ eval: 5, evalType: 'mate' });
        const cp900 = Core.antidoteScoreValue({ eval: 900, evalType: 'cp' });
        expect(Core.antidoteIsMateValue(mate3)).toBe(true);
        expect(Core.antidoteIsMateValue(cp900)).toBe(false);
        expect(mate3).toBeGreaterThan(mate5);
        expect(mate5).toBeGreaterThan(cp900);
        expect(Core.antidoteMateDistance(mate3)).toBe(3);
    });

    test('valors invàlids donen null i no zero', () => {
        expect(Core.antidoteScoreValue(null)).toBeNull();
        expect(Core.antidoteScoreValue({ eval: 'x', evalType: 'cp' })).toBeNull();
        expect(Core.antidoteScoreValue({ eval: 0, evalType: 'mate' })).toBeNull();
        expect(Core.antidoteScoreValue({ eval: 0, evalType: 'cp' })).toBe(0);
    });

    test('abandonar un mat forçat és pèrdua infinita', () => {
        const mate2 = Core.antidoteScoreValue({ eval: 2, evalType: 'mate' });
        expect(Core.antidoteCpLoss(mate2, 800)).toBe(Infinity);
        // Un mat una mica més llarg sí que s'accepta, amb un cost simbòlic.
        const mate3 = Core.antidoteScoreValue({ eval: 3, evalType: 'mate' });
        expect(Core.antidoteCpLoss(mate2, mate3)).toBe(CFG.mateStepCp);
        const mate9 = Core.antidoteScoreValue({ eval: 9, evalType: 'mate' });
        expect(Core.antidoteCpLoss(mate2, mate9)).toBe(Infinity);
    });

    test('rebre mat mai és una candidata acceptable', () => {
        const mateAgainst = Core.antidoteScoreValue({ eval: -4, evalType: 'mate' });
        expect(Core.antidoteCpLoss(20, mateAgainst)).toBe(Infinity);
    });

    test('en una posició perduda per mat, allargar-lo és millor defensa', () => {
        const mateIn2 = Core.antidoteScoreValue({ eval: -2, evalType: 'mate' });
        const mateIn6 = Core.antidoteScoreValue({ eval: -6, evalType: 'mate' });
        expect(Core.antidoteCpLoss(mateIn6, mateIn2)).toBeGreaterThan(0);
        expect(Core.antidoteCpLoss(mateIn6, mateIn6)).toBe(0);
    });

    test('trobar un mat que la millor línia no deia mai és una pèrdua', () => {
        const mate4 = Core.antidoteScoreValue({ eval: 4, evalType: 'mate' });
        expect(Core.antidoteCpLoss(600, mate4)).toBe(0);
    });

    test('el marge pedagògic depèn del nivell i està centralitzat', () => {
        expect(Core.antidoteCpMargin(600)).toBe(CFG.cpMargin.beginner);
        expect(Core.antidoteCpMargin(1300)).toBe(CFG.cpMargin.intermediate);
        expect(Core.antidoteCpMargin(2100)).toBe(CFG.cpMargin.advanced);
        expect(CFG.cpMargin.beginner).toBeGreaterThan(CFG.cpMargin.advanced);
    });

    test('el MultiPV s\'adapta al dispositiu i al rellotge', () => {
        expect(Core.antidoteMultiPv({})).toBe(CFG.multiPv.desktop);
        expect(Core.antidoteMultiPv({ mobile: true })).toBe(CFG.multiPv.mobile);
        expect(Core.antidoteMultiPv({ lowPower: true })).toBe(CFG.multiPv.lowPower);
        expect(Core.antidoteMultiPv({ timeControlKind: 'bullet' }))
            .toBeLessThanOrEqual(CFG.budget.bullet.multiPvCap);
        expect(Core.antidoteMultiPv({ mobile: true, timeControlKind: 'bullet' })).toBeGreaterThanOrEqual(2);
        expect(Core.antidoteSearchBudget('bullet').moveTimeMs)
            .toBeLessThan(Core.antidoteSearchBudget('none').moveTimeMs);
        expect(Core.antidoteSearchBudget('desconegut')).toEqual(CFG.budget.none);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Candidates: filtres objectius i selecció
// ═══════════════════════════════════════════════════════════════════════════
describe('selecció de candidates', () => {
    const kingProfile = () => {
        const p = Core.antidoteEmptyProfile();
        p.weaknesses.king_safety.weight = 0.8;
        p.weaknesses.king_safety.occurrences = 12;
        p.weaknesses.king_safety.confidence = 0.6;
        return p;
    };
    const ctx = (extra = {}) => Object.assign({ playerElo: 1300, phase: 'middlegame', rng: () => 0.5 }, extra);

    test('mai escull una candidata fora del marge permès', () => {
        const p = kingProfile();
        const cands = [
            candidate('a1a2', 50, [{ id: 'quiet_improvement', strength: 0.4 }]),
            // Coincidència perfecta amb la debilitat, però 300 cp pitjor.
            candidate('h1h8', -250, [{ id: 'king_attack', strength: 1 }])
        ];
        const sel = Core.chooseAntidoteCandidate(cands, p, ctx());
        expect(sel.move).toBe('a1a2');
        const guard = Core.antidoteCandidateGuard(cands[1], { bestValue: 50, playerElo: 1300 });
        expect(guard.allowed).toBe(false);
        expect(guard.reason).toBe('over_margin');
    });

    test('el marge es respecta a tots els nivells', () => {
        const p = kingProfile();
        const risky = candidate('h1h8', -10, [{ id: 'king_attack', strength: 1 }]);  // 60 cp pitjor
        // Principiant (marge 80): la candidata encara és admissible…
        const beginner = Core.antidoteCandidateGuard(risky, { bestValue: 50, playerElo: 700 });
        expect(beginner.allowed).toBe(true);
        // …però amb poca seguretat objectiva, i per això no guanya la selecció.
        expect(beginner.objectiveSafety).toBeLessThan(0.3);
        // Avançat (marge 30): queda directament fora.
        const advanced = Core.antidoteCandidateGuard(risky, { bestValue: 50, playerElo: 2000 });
        expect(advanced.allowed).toBe(false);
        expect(advanced.reason).toBe('over_margin');
        const cands = [candidate('a1a2', 50, []), risky];
        expect(Core.chooseAntidoteCandidate(cands, p, ctx({ playerElo: 700 })).move).toBe('a1a2');
        expect(Core.chooseAntidoteCandidate(cands, p, ctx({ playerElo: 2000 })).move).toBe('a1a2');
    });

    test('una prova prou propera a la millor jugada sí que guanya', () => {
        const p = kingProfile();
        const cands = [
            candidate('a1a2', 50, [{ id: 'quiet_improvement', strength: 0.5 }]),
            candidate('h4h5', 38, [{ id: 'king_attack', strength: 1 }])   // només 12 cp pitjor
        ];
        const sel = Core.chooseAntidoteCandidate(cands, p, ctx({ playerElo: 700 }));
        expect(sel.move).toBe('h4h5');
        expect(sel.source).toBe('antidote');
    });

    test('escull la millor jugada si no hi ha cap candidata pedagògica', () => {
        const p = Core.antidoteEmptyProfile();   // perfil buit: cap debilitat
        const cands = [
            candidate('a1a2', 50, [{ id: 'quiet_improvement', strength: 0.5 }]),
            candidate('b1b2', 40, [{ id: 'king_attack', strength: 0.9 }])
        ];
        const sel = Core.chooseAntidoteCandidate(cands, p, ctx());
        expect(sel.move).toBe('a1a2');
        expect(sel.source).toBe('engine_best');
        expect(sel.test).toBeFalsy();
    });

    test('entre jugades equivalents guanya la que coincideix amb la debilitat', () => {
        const p = kingProfile();
        const cands = [
            candidate('a1a2', 50, [{ id: 'quiet_improvement', strength: 0.5 }]),
            candidate('h4h5', 45, [{ id: 'king_attack', strength: 0.85 }])
        ];
        const sel = Core.chooseAntidoteCandidate(cands, p, ctx());
        expect(sel.move).toBe('h4h5');
        expect(sel.source).toBe('antidote');
        expect(sel.family).toBe('king_safety');
        expect(sel.test).toBe(true);
    });

    test('una gran diferència objectiva domina la coincidència pedagògica', () => {
        const p = kingProfile();
        const cands = [
            candidate('a1a2', 50, [{ id: 'quiet_improvement', strength: 0.5 }]),
            // Dins del marge, però just al límit: la qualitat mana.
            candidate('h4h5', 1, [{ id: 'king_attack', strength: 1 }])
        ];
        const sel = Core.chooseAntidoteCandidate(cands, p, ctx({ playerElo: 1300 }));
        expect(sel.move).toBe('a1a2');
    });

    test('no converteix una posició guanyadora en igualada', () => {
        const p = kingProfile();
        // 200 cp = guanyada (cubell 1); 140 cp = igualada (cubell 0). La pèrdua
        // és de només 60 cp, dins del marge d'un principiant: el filtre de
        // cubell és el que ho ha d'aturar.
        const cands = [
            candidate('a1a2', 200, []),
            candidate('h4h5', 140, [{ id: 'king_attack', strength: 1 }])
        ];
        const guard = Core.antidoteCandidateGuard(cands[1], { bestValue: 200, playerElo: 700 });
        expect(guard.allowed).toBe(false);
        expect(guard.reason).toBe('drops_win');
        expect(Core.chooseAntidoteCandidate(cands, p, ctx({ playerElo: 700 })).move).toBe('a1a2');
    });

    test('no converteix una posició igualada en perdedora', () => {
        const p = kingProfile();
        const cands = [
            candidate('a1a2', -80, []),
            candidate('h4h5', -155, [{ id: 'king_attack', strength: 1 }])
        ];
        const guard = Core.antidoteCandidateGuard(cands[1], { bestValue: -80, playerElo: 700 });
        expect(guard.allowed).toBe(false);
        expect(guard.reason).toBe('drops_to_losing');
    });

    test('conserva un mat forçat en lloc de fer una prova pedagògica', () => {
        const p = kingProfile();
        const cands = [
            candidate('h1h8', 3, [], { evalType: 'mate', san: 'Rh8#' }),
            candidate('g2g4', 700, [{ id: 'king_attack', strength: 1 }])
        ];
        const sel = Core.chooseAntidoteCandidate(cands, p, ctx());
        expect(sel.move).toBe('h1h8');
        expect(sel.source).toBe('engine_best');
    });

    test('un mat una mica més llarg sí que pot servir de prova', () => {
        const p = kingProfile();
        const cands = [
            candidate('h1h8', 4, [], { evalType: 'mate' }),
            candidate('g1g8', 5, [{ id: 'king_attack', strength: 0.9 }], { evalType: 'mate' })
        ];
        const sel = Core.chooseAntidoteCandidate(cands, p, ctx());
        expect(sel.move).toBe('g1g8');
        expect(sel.source).toBe('antidote');
    });

    test('defensa una posició perdedora amb la millor opció disponible', () => {
        const p = kingProfile();
        const cands = [
            candidate('a1a2', -700, []),
            candidate('b1b2', -760, [{ id: 'king_attack', strength: 1 }])
        ];
        // Amb el rival ja guanyat, cap prova no pot empitjorar més la posició.
        const sel = Core.chooseAntidoteCandidate(cands, p, ctx({ playerElo: 700 }));
        expect(['a1a2', 'b1b2']).toContain(sel.move);
        expect(Core.antidoteCandidateGuard(candidate('c1c2', -900, []), { bestValue: -700, playerElo: 700 }).allowed).toBe(false);
    });

    test('si només una jugada evita la derrota, es juga aquella', () => {
        const p = kingProfile();
        const cands = [
            candidate('a1a2', 20, []),
            candidate('b1b2', 10, [{ id: 'king_attack', strength: 1 }])
        ];
        const sel = Core.chooseAntidoteCandidate(cands, p, ctx({ onlySavingMove: 'a1a2' }));
        expect(sel.move).toBe('a1a2');
    });

    test('no escull una jugada que perd material net sense compensació', () => {
        const p = kingProfile();
        const cands = [
            candidate('a1a2', 50, []),
            candidate('b1b2', 10, [{ id: 'king_attack', strength: 1 }], { materialLoss: 3 })
        ];
        const guard = Core.antidoteCandidateGuard(cands[1], { bestValue: 50, playerElo: 700 });
        expect(guard.allowed).toBe(false);
        expect(guard.reason).toBe('hangs_material');
        expect(Core.chooseAntidoteCandidate(cands, p, ctx({ playerElo: 700 })).move).toBe('a1a2');
    });

    test('un sacrifici que el motor valora igual sí que s\'accepta', () => {
        const p = kingProfile();
        const cands = [
            candidate('a1a2', 50, []),
            candidate('b1b2', 45, [{ id: 'king_attack', strength: 0.9 }], { materialLoss: 3 })
        ];
        const guard = Core.antidoteCandidateGuard(cands[1], { bestValue: 50, playerElo: 700 });
        expect(guard.allowed).toBe(true);
    });

    test('penalitza repetir la mateixa categoria temàtica', () => {
        const p = kingProfile();
        p.weaknesses.missed_tactic.weight = 0.75;
        p.weaknesses.missed_tactic.occurrences = 10;
        const cands = [
            candidate('a1a2', 50, []),
            candidate('h4h5', 45, [{ id: 'king_attack', strength: 0.9 }]),
            candidate('c3c4', 45, [{ id: 'fork', strength: 0.9 }])
        ];
        const fresh = Core.chooseAntidoteCandidate(cands, p, ctx());
        // Amb el rei repetit a les últimes proves (i superat), la tàctica guanya.
        p.recentTests = [
            { theme: 'king_safety', result: 'passed' },
            { theme: 'king_safety', result: 'passed' },
            { theme: 'king_safety', result: 'passed' }
        ];
        const repeated = Core.chooseAntidoteCandidate(cands, p, ctx());
        expect(fresh.family).toBe('king_safety');
        expect(repeated.family).toBe('missed_tactic');
        expect(Core.antidoteRepetitionPenalty('king_safety', p)).toBeGreaterThan(0);
    });

    test('una categoria que encara es falla rep menys penalització', () => {
        const p = kingProfile();
        p.recentTests = [
            { theme: 'king_safety', result: 'failed' },
            { theme: 'king_safety', result: 'failed' }
        ];
        const failing = Core.antidoteRepetitionPenalty('king_safety', p);
        p.recentTests = [
            { theme: 'king_safety', result: 'passed' },
            { theme: 'king_safety', result: 'passed' }
        ];
        const passing = Core.antidoteRepetitionPenalty('king_safety', p);
        expect(failing).toBeLessThan(passing);
    });

    test('l\'rng injectable dona resultats deterministes', () => {
        const p = kingProfile();
        p.weaknesses.missed_tactic.weight = 0.8;
        p.weaknesses.missed_tactic.occurrences = 12;
        const cands = [
            candidate('a1a2', 50, []),
            candidate('h4h5', 48, [{ id: 'king_attack', strength: 0.85 }]),
            candidate('c3c4', 48, [{ id: 'fork', strength: 0.85 }])
        ];
        const low = Core.chooseAntidoteCandidate(cands, p, ctx({ rng: () => 0.01 }));
        const high = Core.chooseAntidoteCandidate(cands, p, ctx({ rng: () => 0.99 }));
        // Determinisme: la mateixa llavor sempre dona la mateixa jugada.
        expect(Core.chooseAntidoteCandidate(cands, p, ctx({ rng: () => 0.01 })).move).toBe(low.move);
        expect(Core.chooseAntidoteCandidate(cands, p, ctx({ rng: () => 0.99 })).move).toBe(high.move);
        // I amb llavors diferents pot variar (evita partides idèntiques).
        expect(['a1a2', 'h4h5', 'c3c4']).toContain(low.move);
        expect(['a1a2', 'h4h5', 'c3c4']).toContain(high.move);
    });

    test('sense candidates o sense avaluació retorna una jugada jugable o null', () => {
        const p = kingProfile();
        expect(Core.chooseAntidoteCandidate([], p, ctx())).toBeNull();
        expect(Core.chooseAntidoteCandidate(null, p, ctx())).toBeNull();
        const noEval = [{ move: 'a1a2', san: 'Ra2' }];
        const sel = Core.chooseAntidoteCandidate(noEval, p, ctx());
        expect(sel.move).toBe('a1a2');
        expect(sel.source).toBe('engine_best');
    });

    test('la puntuació és reproduïble i la qualitat objectiva hi pesa més', () => {
        const p = kingProfile();
        const c = candidate('h4h5', 45, [{ id: 'king_attack', strength: 0.8 }]);
        const s = Core.scoreAntidoteCandidate(c, p, { bestValue: 50, playerElo: 1300, phase: 'middlegame' });
        expect(s.allowed).toBe(true);
        expect(s.components.objectiveSafety * CFG.score.safety)
            .toBeGreaterThan(s.components.weaknessMatch * CFG.score.weakness);
        const again = Core.scoreAntidoteCandidate(c, p, { bestValue: 50, playerElo: 1300, phase: 'middlegame' });
        expect(again.finalScore).toBe(s.finalScore);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Detectors sobre posicions reals
// ═══════════════════════════════════════════════════════════════════════════
describe('detectors de temes', () => {
    test('detecta una forquilla real de cavall', () => {
        const r = D.classifyAntidoteCandidate('r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1', 'd5c7', []);
        expect(r.san).toBe('Nc7+');
        expect(r.themes.map(t => t.id)).toContain('fork');
    });

    test('no confon amb forquilla una peça que penja', () => {
        // El cavall arriba a c7 atacant rei i torre, però l'alfil de b6 se'l menja.
        const r = D.classifyAntidoteCandidate('r3k3/8/1b6/3N4/8/8/8/4K3 w - - 0 1', 'd5c7', []);
        expect(r.san).toBe('Nc7+');
        expect(r.themes.map(t => t.id)).not.toContain('fork');
    });

    test('detecta una clavada creada per la jugada', () => {
        const r = D.classifyAntidoteCandidate(
            'r1bqkb1r/ppp2ppp/2np1n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 5', 'f1b5', []);
        expect(r.san).toBe('Bb5');
        expect(r.themes.map(t => t.id)).toContain('pin');
    });

    test('no marca clavada quan hi ha una peça pel mig', () => {
        // Ruy López amb el peó a d7: Bb5 ataca el cavall però no el clava.
        const r = D.classifyAntidoteCandidate(
            'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3', 'f1b5', []);
        expect(r.themes.map(t => t.id)).not.toContain('pin');
    });

    test('reconeix un final de torres i un mat', () => {
        const r = D.classifyAntidoteCandidate('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 40', 'd1d8', []);
        const ids = r.themes.map(t => t.id);
        expect(ids).toContain('mate_threat');
        expect(ids).toContain('rook_endgame');
    });

    test('detecta la promoció', () => {
        const r = D.classifyAntidoteCandidate('8/P5k1/8/8/8/8/6K1/8 w - - 0 1', 'a7a8q', []);
        expect(r.themes.map(t => t.id)).toContain('promotion');
    });

    test('detecta el canvi de dames a la línia principal', () => {
        const fen = 'r3k2r/ppp2ppp/2n5/3q4/3Q4/2N5/PPP2PPP/R3K2R w KQkq - 0 12';
        const r = D.classifyAntidoteCandidate(fen, 'd4d5', ['c6e7']);
        expect(r.themes.map(t => t.id)).toContain('queen_trade');
    });

    test('una jugada sense res destacable cau a millora tranquil·la', () => {
        const r = D.classifyAntidoteCandidate('8/6k1/8/8/8/8/6K1/8 w - - 0 1', 'g2g3', []);
        expect(r.themes.map(t => t.id)).toContain('quiet_improvement');
        expect(r.themes.length).toBeGreaterThan(0);
    });

    test('mesura la pèrdua de material immediata', () => {
        expect(D.immediateMaterialLoss('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'e2e4')).toBe(0);
        // La dama es planta on el peó se la pot menjar de franc.
        const hang = D.immediateMaterialLoss('rnbqkbnr/pppp1ppp/8/4p3/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 2', 'd1h5');
        expect(hang).toBeGreaterThanOrEqual(0);
        // La dama es planta a d6, on el peó de e7 se la menja de franc.
        const realHang = D.immediateMaterialLoss('4k3/4p3/8/8/8/8/3Q4/4K3 w - - 0 1', 'd2d6');
        expect(realHang).toBe(9);
    });

    test('una jugada il·legal no genera cap classificació', () => {
        const r = D.classifyAntidoteCandidate('8/6k1/8/8/8/8/6K1/8 w - - 0 1', 'a1a8', []);
        expect(r.san).toBeNull();
        expect(r.themes).toEqual([]);
    });

    test('la complexitat està acotada i creix amb la densitat', () => {
        const quiet = D.positionComplexity('8/6k1/8/8/8/8/6K1/8 w - - 0 1');
        const dense = D.positionComplexity('r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 8');
        expect(quiet).toBeGreaterThanOrEqual(0);
        expect(dense).toBeLessThanOrEqual(1);
        expect(dense).toBeGreaterThan(quiet);
    });

    test('el model d\'atacs veu també les defenses pròpies', () => {
        const board = Core.antidoteParseBoard('4k3/8/8/8/8/8/4PP2/4K3 w - - 0 1');
        // El rei defensa el peó de e2.
        expect(Core.antidoteAttackersOf(board.grid, 4, 1, 'w').some(a => a.t === 'k')).toBe(true);
        expect(Core.antidoteIsAttacked(board.grid, 4, 1, 'b')).toBe(false);
    });

    test('reconeix peons passats i aïllats', () => {
        const board = Core.antidoteParseBoard('8/8/3P4/8/8/8/5p2/8 w - - 0 1');
        expect(Core.antidotePassedPawns(board.grid, 'w').length).toBe(1);
        expect(Core.antidoteIsolatedPawns(board.grid, 'w')).toEqual([3]);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Proves pedagògiques
// ═══════════════════════════════════════════════════════════════════════════
describe('proves pedagògiques', () => {
    const selection = (extra = {}) => Object.assign({
        move: 'e7e5', san: 'e5', test: true, themeId: 'king_attack',
        family: 'king_safety', themeStrength: 0.8, pv: ['g1f3', 'b8c6', 'f1c4', 'f8c5', 'd2d3', 'd7d6', 'c1e3']
    }, extra);
    const ctx = { fen: 'startfen', ply: 18, moveNumber: 10, phase: 'middlegame', now: NOW, id: 'at_1' };

    test('crea una prova només quan hi ha un tema prou clar', () => {
        expect(Core.antidoteCreateTest(selection(), ctx)).not.toBeNull();
        expect(Core.antidoteCreateTest(selection({ test: false }), ctx)).toBeNull();
        expect(Core.antidoteCreateTest(selection({ themeId: null }), ctx)).toBeNull();
        expect(Core.antidoteCreateTest(null, ctx)).toBeNull();
    });

    test('la prova neix pendent, amb la PV retallada i sense revelar res', () => {
        const t = Core.antidoteCreateTest(selection(), ctx);
        expect(t.result).toBe('pending');
        expect(t.playerResponse).toBeNull();
        expect(t.theme).toBe('king_safety');
        expect(t.subtheme).toBe('king_attack');
        expect(t.createdAtPly).toBe(18);
        expect(t.expectedPv.length).toBeLessThanOrEqual(CFG.storedPvPlies);
    });

    test('resposta bona → passed', () => {
        const t = Core.antidoteCreateTest(selection(), ctx);
        const r = Core.evaluateAntidoteResponse(t, { cpLoss: 15, playerMove: 'g8f6', bestMove: 'b8c6', evalBefore: 30 });
        expect(r.result).toBe('passed');
        expect(r.responseCpLoss).toBe(15);
    });

    test('jugar exactament la millor resposta sempre és passed', () => {
        const t = Core.antidoteCreateTest(selection(), ctx);
        const r = Core.evaluateAntidoteResponse(t, { cpLoss: 90, playerMove: 'b8c6', bestMove: 'b8c6', evalBefore: 30 });
        expect(r.result).toBe('passed');
    });

    test('resposta acceptable → partial', () => {
        const t = Core.antidoteCreateTest(selection(), ctx);
        const r = Core.evaluateAntidoteResponse(t, { cpLoss: 90, playerMove: 'a7a6', bestMove: 'b8c6', evalBefore: 30 });
        expect(r.result).toBe('partial');
    });

    test('error clar → failed', () => {
        const t = Core.antidoteCreateTest(selection(), ctx);
        const r = Core.evaluateAntidoteResponse(t, { cpLoss: 320, playerMove: 'h7h6', bestMove: 'b8c6', evalBefore: 30 });
        expect(r.result).toBe('failed');
    });

    test('situació ambigua → inconclusive', () => {
        const t = Core.antidoteCreateTest(selection(), ctx);
        // Sense mesura de pèrdua.
        expect(Core.evaluateAntidoteResponse(t, { cpLoss: null }).result).toBe('inconclusive');
        // Posició ja decidida abans de respondre: allà res no mesura el jugador.
        expect(Core.evaluateAntidoteResponse(t, { cpLoss: 400, evalBefore: -900 }).result).toBe('inconclusive');
        // Tema massa fluix per considerar-lo una prova.
        const weak = Core.antidoteCreateTest(selection({ themeStrength: 0.1 }), ctx);
        expect(Core.evaluateAntidoteResponse(weak, { cpLoss: 400, evalBefore: 20 }).result).toBe('inconclusive');
    });

    test('el resum compta cada resultat i el percentatge d\'èxit', () => {
        const s = Core.antidoteGameSummary([
            { theme: 'king_safety', result: 'passed' },
            { theme: 'king_safety', result: 'partial' },
            { theme: 'missed_tactic', result: 'failed' },
            { theme: 'missed_tactic', result: 'inconclusive' },
            { result: 'passed' }   // sense tema: no és una prova
        ]);
        expect(s.total).toBe(4);
        expect(s.passed).toBe(1);
        expect(s.partial).toBe(1);
        expect(s.failed).toBe(1);
        expect(s.inconclusive).toBe(1);
        expect(s.successRate).toBe(38);
        expect(s.themes.king_safety.total).toBe(2);
    });

    test('actualitza el progrés sense duplicar registres', () => {
        const tests = [
            { id: 'a', theme: 'king_safety', result: 'passed' },
            { id: 'b', theme: 'king_safety', result: 'failed' }
        ];
        const first = Core.updateAntidoteProgress(null, tests);
        expect(first.total).toBe(2);
        expect(first.themes.king_safety.passed).toBe(1);
        // Tornar-hi amb les mateixes proves no ha de comptar res de nou.
        const second = Core.updateAntidoteProgress(first, tests);
        expect(second.total).toBe(2);
        expect(second.themes.king_safety.total).toBe(2);
        // Una prova nova sí que suma.
        const third = Core.updateAntidoteProgress(second, tests.concat([{ id: 'c', theme: 'missed_tactic', result: 'partial' }]));
        expect(third.total).toBe(3);
        expect(third.themes.missed_tactic.partial).toBe(1);
        // Les inconclusives i les pendents no entren al progrés.
        const fourth = Core.updateAntidoteProgress(third, [{ id: 'd', theme: 'king_safety', result: 'inconclusive' }]);
        expect(fourth.total).toBe(3);
    });

    test('l\'informe d\'evolució separa el que millora del que segueix actiu', () => {
        const before = Core.antidoteEmptyProfile();
        before.weaknesses.king_safety.weight = 0.7;
        before.weaknesses.king_safety.occurrences = 8;
        before.weaknesses.missed_tactic.weight = 0.5;
        before.weaknesses.missed_tactic.occurrences = 5;
        const after = Core.antidoteEmptyProfile();
        after.weaknesses.king_safety.weight = 0.4;
        after.weaknesses.king_safety.occurrences = 8;
        after.weaknesses.missed_tactic.weight = 0.6;
        after.weaknesses.missed_tactic.occurrences = 7;
        const report = Core.antidoteEvolutionReport(before, after, [
            { id: '1', theme: 'king_safety', result: 'passed' },
            { id: '2', theme: 'missed_tactic', result: 'failed' }
        ]);
        expect(report.improved.map(w => w.id)).toContain('king_safety');
        expect(report.active.map(w => w.id)).toContain('missed_tactic');
        expect(report.nextTheme).toBe('missed_tactic');
        expect(typeof report.text).toBe('string');
        expect(report.text.length).toBeGreaterThan(20);
        // Cap expressió mèdica ni culpabilitzadora.
        expect(report.text).not.toMatch(/malalt|patologi|greu|culpa|fatal/i);
    });

    test('sense proves, l\'evolució ho diu sense inventar conclusions', () => {
        const empty = Core.antidoteEmptyProfile();
        const report = Core.antidoteEvolutionReport(empty, empty, []);
        expect(report.summary.total).toBe(0);
        expect(report.text).toMatch(/prou proves/i);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Persistència
// ═══════════════════════════════════════════════════════════════════════════
describe('persistència', () => {
    const fullTest = {
        id: 'at_1',
        theme: 'king_safety',
        subtheme: 'king_attack',
        sourceFen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
        engineMove: 'e1g1',
        engineMoveSan: 'O-O',
        expectedPv: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'a10'],
        createdAtPly: 8,
        moveNumber: 5,
        phase: 'opening',
        playerResponse: 'd7d6',
        playerResponseSan: 'd6',
        bestResponse: 'e8g8',
        bestResponseSan: 'O-O',
        responseCpLoss: 62.4,
        result: 'partial',
        severity: 0.777
    };

    test('serialització i restauració conserven la prova', () => {
        const data = Core.antidoteSerializeGame([fullTest]);
        expect(data.profileVersion).toBe(CFG.version);
        expect(data.tests.length).toBe(1);
        expect(data.targetedThemes).toEqual(['king_safety']);
        expect(data.partial).toBe(1);
        const restored = Core.antidoteRestoreGame({ antidote: data });
        expect(restored.tests[0].engineMoveSan).toBe('O-O');
        expect(restored.tests[0].result).toBe('partial');
        expect(restored.summary.partial).toBe(1);
    });

    test('les línies de motor persistides queden retallades', () => {
        const data = Core.antidoteSerializeGame([fullTest]);
        expect(data.tests[0].expectedPv.length).toBe(CFG.storedPvPlies);
        expect(data.tests[0].responseCpLoss).toBe(62);
        expect(data.tests[0].severity).toBe(0.78);
    });

    test('el nombre de proves desades està acotat', () => {
        const many = Array.from({ length: 60 }, (_, i) => Object.assign({}, fullTest, { id: 'at_' + i }));
        const data = Core.antidoteSerializeGame(many);
        expect(data.tests.length).toBe(CFG.maxStoredTests);
    });

    test('una entrada d\'historial sense camps Antídot segueix funcionant', () => {
        expect(Core.antidoteRestoreGame({ id: 'g1', mode: 'free' })).toBeNull();
        expect(Core.antidoteRestoreGame(null)).toBeNull();
        expect(Core.antidoteTestsFromHistory([{ id: 'g1', mode: 'free' }])).toEqual([]);
        const stats = Core.antidoteStatsFromHistory([{ id: 'g1', mode: 'free' }]);
        expect(stats.games).toBe(0);
        expect(stats.successRate).toBeNull();
    });

    test('dades Antídot corruptes no trenquen la restauració', () => {
        expect(Core.antidoteRestoreGame({ antidote: 'no és un objecte' })).toBeNull();
        const broken = Core.antidoteRestoreGame({ antidote: { tests: [null, 3, { sense: 'tema' }] } });
        expect(broken.tests).toEqual([]);
        expect(broken.passed).toBe(0);
    });

    test('les estadístiques surten de les partides en mode antidote', () => {
        const entries = [
            { id: 'g1', mode: 'free', date: new Date(NOW).toISOString() },
            {
                id: 'g2', mode: 'antidote', date: new Date(NOW).toISOString(),
                antidote: Core.antidoteSerializeGame([
                    Object.assign({}, fullTest, { id: 'a', result: 'passed' }),
                    Object.assign({}, fullTest, { id: 'b', result: 'failed', theme: 'missed_tactic' })
                ])
            },
            {
                id: 'g3', mode: 'antidote', date: new Date(NOW).toISOString(),
                antidote: Core.antidoteSerializeGame([Object.assign({}, fullTest, { id: 'c', result: 'passed' })])
            }
        ];
        const stats = Core.antidoteStatsFromHistory(entries);
        expect(stats.games).toBe(2);
        expect(stats.tests).toBe(3);
        expect(stats.passed).toBe(2);
        expect(stats.failed).toBe(1);
        expect(stats.mostWorked.id).toBe('king_safety');
        expect(stats.themes.find(t => t.id === 'king_safety').successRate).toBe(100);
    });

    test('el perfil es pot reconstruir des de l\'historial amb proves desades', () => {
        const entries = [{
            id: 'g2', mode: 'antidote', date: new Date(NOW).toISOString(), playerColor: 'w',
            antidoteStats: { moves: 4, categories: {}, phases: {}, phaseMoves: {} },
            antidote: Core.antidoteSerializeGame([
                Object.assign({}, fullTest, { id: 'a', result: 'failed', theme: 'missed_tactic' }),
                Object.assign({}, fullTest, { id: 'b', result: 'failed', theme: 'missed_tactic' })
            ])
        }];
        const tests = Core.antidoteTestsFromHistory(entries);
        expect(tests.length).toBe(2);
        const profile = Core.buildAntidoteProfile({ games: entries, tests, now: NOW });
        expect(profile.weaknesses.missed_tactic.occurrences).toBe(2);
        expect(profile.weaknesses.missed_tactic.weight).toBeGreaterThan(0);
    });

    test('les etiquetes visibles són en català i cobreixen totes les categories', () => {
        Core.ANTIDOTE_WEAKNESS_IDS.forEach(id => {
            const label = Core.antidoteWeaknessLabel(id);
            expect(typeof label).toBe('string');
            expect(label.length).toBeGreaterThan(3);
            expect(label).not.toBe(id);
        });
        Object.keys(Core.ANTIDOTE_THEME_FAMILY).forEach(id => {
            expect(Core.ANTIDOTE_WEAKNESS_IDS).toContain(Core.antidoteThemeFamily(id));
            expect(Core.antidoteThemeLabel(id)).not.toBe(id);
        });
    });
});
