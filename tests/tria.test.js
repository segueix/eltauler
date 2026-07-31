const Core = require('../core.js');
const { Chess } = require('chess.js');

const T = Core.createTriaHelpers(Chess);
const CFG = Core.TRIA_CONFIG;

// Posició real després de 1.e4 e5 2.Cf3 Cc6 3.Ac4 Cf6 (italiana, juguen
// blanques): totes les jugades de les proves hi són legals.
const FEN = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
// Posició d'una jugada de negres, per comprovar el torn.
const FEN_B = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQK2R b KQkq - 4 5';

function mpv(move, evalCp) {
    return { move, eval: evalCp, evalType: 'cp', pv: [] };
}

// Jugada revisada tipus: manava d3; vas jugar Cxe5 i vas perdre 260 cp. Les
// tres línies del motor són les que desa l'anàlisi en viu (MultiPV 3).
function review(extra = {}) {
    return Object.assign({
        fen: FEN,
        moveNumber: 4,
        quality: 'blunder',
        swing: 260,
        cpLoss: 260,
        playerMove: 'f3e5',
        playerMoveSan: 'Nxe5',
        bestMove: 'd2d3',
        bestMoveSan: 'd3',
        multipvBefore: [mpv('d2d3', 40), mpv('b1c3', 22), mpv('e1g1', -5)]
    }, extra);
}

describe('triaEligibleMoves (qualsevol jugada no 100% correcta)', () => {
    test('una jugada fallada hi entra encara que no sigui una errada greu', () => {
        const soft = review({ quality: 'inaccuracy', swing: 60, cpLoss: 60 });
        expect(Core.triaEligibleMoves([soft], {})).toHaveLength(1);
    });

    test('la jugada que vas encertar queda fora', () => {
        const perfect = review({ playerMove: 'd2d3', playerMoveSan: 'd3', quality: 'excel', swing: 0, cpLoss: 0 });
        expect(Core.triaEligibleMoves([perfect], {})).toHaveLength(0);
    });

    test('una pèrdua insignificant no compta com a fallada', () => {
        const noise = review({ swing: 2, cpLoss: 2 });
        expect(Core.triaEligibleMoves([noise], {})).toHaveLength(0);
    });

    test('sense tres línies de motor la jugada no es pot fer servir', () => {
        const thin = review({ multipvBefore: [mpv('d2d3', 40), mpv('b1c3', 22)] });
        expect(Core.triaEligibleMoves([thin], {})).toHaveLength(0);
    });

    test('no es repeteix dues vegades la mateixa decisió', () => {
        expect(Core.triaEligibleMoves([review(), review()], {})).toHaveLength(1);
    });

    test('entrades corruptes no rebenten res', () => {
        expect(Core.triaEligibleMoves(null, {})).toEqual([]);
        expect(Core.triaEligibleMoves([null, {}, { fen: FEN }], {})).toEqual([]);
    });
});

describe('buildQuestion (les tres millors i l\'original)', () => {
    test('les tres opcions són les tres millors del motor, etiquetades A/B/C', () => {
        const q = T.buildQuestion(review(), {});
        expect(q).toBeTruthy();
        expect(q.options).toHaveLength(3);
        expect(q.options.map(o => o.letter)).toEqual(['A', 'B', 'C']);
        expect(q.options.map(o => o.san).sort()).toEqual(['Nc3', 'O-O', 'd3']);
    });

    test('la resposta correcta és la primera línia del motor', () => {
        const q = T.buildQuestion(review(), {});
        expect(q.options[q.answerIndex].san).toBe('d3');
        expect(q.options[q.answerIndex].isBest).toBe(true);
    });

    test('cada opció porta la posició resultant, per pintar el seu tauler', () => {
        const q = T.buildQuestion(review(), {});
        q.options.forEach(op => {
            expect(typeof op.fen).toBe('string');
            const after = new Chess(op.fen);
            expect(after.turn()).toBe('b'); // només avança la jugada triada
            expect(op.from).toMatch(/^[a-h][1-8]$/);
            expect(op.to).toMatch(/^[a-h][1-8]$/);
        });
    });

    test('cap opció avança la resposta del rival', () => {
        const q = T.buildQuestion(review(), {});
        const before = new Chess(q.fen);
        q.options.forEach(op => {
            const after = new Chess(op.fen);
            expect(after.turn()).not.toBe(before.turn());
        });
    });

    test('l\'original és la jugada que vas fer de veritat, amb la seva posició', () => {
        const q = T.buildQuestion(review(), {});
        expect(q.original.san).toBe('Nxe5');
        expect(q.original.lossCp).toBe(260);
        expect(typeof q.original.fen).toBe('string');
    });

    test('si la teva jugada és una de les tres, l\'original ho diu', () => {
        const q = T.buildQuestion(review({ playerMove: 'b1c3', playerMoveSan: 'Nc3', cpLoss: 18, swing: 18 }), {});
        expect(q.original.matchesOptionLetter).toBeTruthy();
        const letter = q.original.matchesOptionLetter;
        expect(q.options.find(o => o.letter === letter).san).toBe('Nc3');
    });

    test('l\'ordre A/B/C és estable per a la mateixa jugada', () => {
        const a = T.buildQuestion(review(), {});
        const b = T.buildQuestion(review(), {});
        expect(a.options.map(o => o.san)).toEqual(b.options.map(o => o.san));
        expect(a.answerIndex).toBe(b.answerIndex);
    });

    test('la millor no cau sempre a la mateixa lletra', () => {
        // Decisions DIFERENTS (la barreja depèn de la posició i de la jugada
        // feta): sobre posicions reals distintes, la bona ha de rotar.
        const letters = new Set();
        const board = new Chess();
        for (let i = 0; i < 14; i++) {
            const legal = board.moves({ verbose: true });
            if (legal.length < 4) break;
            const uci = m => `${m.from}${m.to}${m.promotion || ''}`;
            const p = legal.slice(0, 4);
            const q = T.buildQuestion(review({
                fen: board.fen(),
                playerMove: uci(p[3]),
                bestMove: uci(p[0]),
                multipvBefore: [mpv(uci(p[0]), 40), mpv(uci(p[1]), 20), mpv(uci(p[2]), 0)]
            }), {});
            if (q) letters.add(q.options[q.answerIndex].letter);
            board.move(legal[0]);
        }
        expect(letters.size).toBeGreaterThan(1);
    });

    test('el torn de la posició viatja amb la pregunta', () => {
        const q = T.buildQuestion(review(), {});
        expect(q.turn).toBe('w');
        const qb = T.buildQuestion(review({
            fen: FEN_B, playerMove: 'c6d4', playerMoveSan: 'Nd4', bestMove: 'e8g8',
            multipvBefore: [mpv('e8g8', -20), mpv('d7d6', -60), mpv('d8e7', -95)]
        }), {});
        expect(qb.turn).toBe('b');
    });

    test('amb menys de tres línies no hi ha pregunta', () => {
        expect(T.buildQuestion(review({ multipvBefore: [mpv('d2d3', 40), mpv('b1c3', 22)] }), {})).toBeNull();
    });

    test('una línia il·legal a la posició invalida la pregunta', () => {
        expect(T.buildQuestion(review({
            multipvBefore: [mpv('d2d3', 40), mpv('h8h1', 22), mpv('e1g1', -5)]
        }), {})).toBeNull();
    });

    test('dues línies repetides invaliden la pregunta', () => {
        expect(T.buildQuestion(review({
            multipvBefore: [mpv('d2d3', 40), mpv('d2d3', 22), mpv('e1g1', -5)]
        }), {})).toBeNull();
    });
});

describe('dificultat i ajust a l\'ELO/ROC', () => {
    test('molta distància entre la 1a i la 2a és una pregunta fàcil', () => {
        const easy = Core.triaQuestionDifficulty([mpv('d2d3', 300), mpv('b1c3', 20), mpv('e1g1', 0)]);
        expect(easy).toBeLessThan(0.2);
    });

    test('poca distància és una pregunta difícil', () => {
        const hard = Core.triaQuestionDifficulty([mpv('d2d3', 40), mpv('b1c3', 35), mpv('e1g1', 30)]);
        expect(hard).toBeGreaterThan(0.8);
    });

    test('com més fort és el jugador, més subtils se li demanen', () => {
        expect(Core.triaTargetDifficulty(2400)).toBeGreaterThan(Core.triaTargetDifficulty(1600));
        expect(Core.triaTargetDifficulty(1600)).toBeGreaterThan(Core.triaTargetDifficulty(1000));
    });

    test('l\'objectiu no s\'extrapola fora de la taula', () => {
        expect(Core.triaTargetDifficulty(200)).toBe(Core.triaTargetDifficulty(800));
        expect(Core.triaTargetDifficulty(4000)).toBe(Core.triaTargetDifficulty(2800));
    });

    test('sense ELO cau a un valor central en comptes de petar', () => {
        const mid = Core.triaTargetDifficulty(undefined);
        expect(mid).toBeGreaterThan(0);
        expect(mid).toBeLessThan(1);
    });
});

describe('buildTest (el test de 20)', () => {
    // Fons ample amb POSICIONS REALS I DIFERENTS: es juga una partida amb
    // chess.js i de cada posició se'n treuen tres jugades legals com a
    // candidates del motor i una quarta com la que va jugar el jugador. Cal
    // que siguin posicions diferents perquè la dedup per decisió no les
    // col·lapsi, que és exactament el que passa en una partida de veritat.
    function pool(count, opts = {}) {
        const out = [];
        let seed = 12345;
        const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
        const uci = m => `${m.from}${m.to}${m.promotion || ''}`;
        let board = new Chess();
        let gameNo = 0;
        let plies = 0;
        while (out.length < count) {
            const legal = board.moves({ verbose: true });
            // Cada partida aporta un grapat de decisions i es passa a la
            // següent, que és com arriba el fons de veritat: moltes partides
            // amb poques jugades revisables cadascuna.
            if (legal.length < 4 || plies >= 6) {
                board = new Chess();
                plies = 0;
                gameNo++;
                if (gameNo > 60) break;
                continue;
            }
            const i = out.length;
            const picks = legal.slice(0, 4);
            const gap = opts.gap != null ? opts.gap : (10 + (i % 10) * 30);
            out.push(review({
                fen: board.fen(),
                moveNumber: Math.ceil((plies + 1) / 2),
                gameId: 'g' + gameNo,
                playerMove: uci(picks[3]),
                playerMoveSan: picks[3].san,
                bestMove: uci(picks[0]),
                bestMoveSan: picks[0].san,
                multipvBefore: [
                    mpv(uci(picks[0]), 40),
                    mpv(uci(picks[1]), 40 - gap),
                    mpv(uci(picks[2]), 40 - gap - 30)
                ]
            }));
            board.move(legal[Math.floor(rnd() * legal.length)]);
            plies++;
        }
        return out;
    }

    test('un test té com a màxim la mida configurada', () => {
        const test = T.buildTest(pool(60), { elo: 1800 });
        expect(test.length).toBeLessThanOrEqual(CFG.testSize);
        expect(test.length).toBe(CFG.testSize);
    });

    test('amb poques jugades el test és més curt, però existeix', () => {
        const test = T.buildTest(pool(4), { elo: 1800 });
        expect(test.length).toBeGreaterThan(0);
        expect(test.length).toBeLessThanOrEqual(4);
    });

    test('un jugador fort rep preguntes més subtils que un de fluix', () => {
        const wide = pool(60);
        const strong = T.buildTest(wide, { elo: 2400 });
        const weak = T.buildTest(wide, { elo: 900 });
        const avg = list => list.reduce((s, q) => s + q.difficulty, 0) / list.length;
        expect(avg(strong)).toBeGreaterThan(avg(weak));
    });

    test('no es buida una sola partida: hi ha un màxim per partida', () => {
        const sameGame = pool(30).map(r => Object.assign({}, r, { gameId: 'unica' }));
        const test = T.buildTest(sameGame, { elo: 1600 });
        expect(test.length).toBeLessThanOrEqual(CFG.eligibility.maxPerGame);
    });

    test('les preguntes es reparteixen entre partides diferents', () => {
        const test = T.buildTest(pool(60), { elo: 1600 });
        const games = new Set(test.map(q => q.gameId));
        expect(games.size).toBeGreaterThan(3);
    });

    test('sense jugades elegibles no hi ha test', () => {
        expect(T.buildTest([], { elo: 1600 })).toEqual([]);
        expect(T.buildTest(null, { elo: 1600 })).toEqual([]);
    });
});

describe('triaGradeAnswer (verd o vermell a l\'instant)', () => {
    const q = T.buildQuestion(review(), {});
    const bestIdx = q.answerIndex;
    const wrongIdx = (bestIdx + 1) % 3;

    test('encertar la millor és correcte', () => {
        const r = Core.triaGradeAnswer(q, bestIdx);
        expect(r.correct).toBe(true);
        expect(r.chosenLetter).toBe(q.options[bestIdx].letter);
        expect(r.answerLetter).toBe(q.options[bestIdx].letter);
    });

    test('una altra opció és incorrecta i diu quants cp costava', () => {
        const r = Core.triaGradeAnswer(q, wrongIdx);
        expect(r.correct).toBe(false);
        expect(r.lostCp).toBe(q.options[wrongIdx].lossCp);
    });

    test('triar la jugada que ja vas fer a la partida queda marcat', () => {
        const q2 = T.buildQuestion(review({ playerMove: 'b1c3', playerMoveSan: 'Nc3', cpLoss: 18, swing: 18 }), {});
        const idx = q2.options.findIndex(o => o.san === 'Nc3');
        const r = Core.triaGradeAnswer(q2, idx);
        expect(r.repeatedOwnMove).toBe(true);
    });

    test('no respondre no és mai un encert', () => {
        const r = Core.triaGradeAnswer(q, -1);
        expect(r.answered).toBe(false);
        expect(r.correct).toBe(false);
    });
});

describe('triaTestSummary (resultats del test)', () => {
    test('compta encerts, errades i el cost en centipeons', () => {
        const s = Core.triaTestSummary([
            { correct: true, difficulty: 0.5, lostCp: 0 },
            { correct: false, difficulty: 0.7, lostCp: 80 },
            { correct: false, difficulty: 0.3, lostCp: 40, repeatedOwnMove: true },
            { correct: true, difficulty: 0.5, lostCp: 0 }
        ], { elo: 1900 });
        expect(s.total).toBe(4);
        expect(s.correct).toBe(2);
        expect(s.wrong).toBe(2);
        expect(s.accuracy).toBe(50);
        expect(s.lostCp).toBe(120);
        expect(s.repeatedOwnMove).toBe(1);
        expect(s.avgDifficulty).toBe(0.5);
        expect(s.elo).toBe(1900);
    });

    test('un test buit no divideix per zero', () => {
        expect(Core.triaTestSummary([]).accuracy).toBe(0);
        expect(Core.triaTestSummary(null).total).toBe(0);
    });
});

describe('historial i gràfica d\'evolució', () => {
    test('cada test acabat s\'afegeix a l\'historial', () => {
        const h1 = Core.triaAppendResult([], { total: 20, correct: 14, accuracy: 70, avgDifficulty: 0.6, elo: 1800 }, { now: 1000 });
        expect(h1).toHaveLength(1);
        const h2 = Core.triaAppendResult(h1, { total: 20, correct: 16, accuracy: 80, avgDifficulty: 0.6, elo: 1810 }, { now: 2000 });
        expect(h2).toHaveLength(2);
        expect(h2[1].accuracy).toBe(80);
    });

    test('un test sense preguntes no embruta l\'historial', () => {
        expect(Core.triaAppendResult([], { total: 0, correct: 0, accuracy: 0 }, {})).toHaveLength(0);
    });

    test('l\'historial queda ordenat i limitat', () => {
        let h = [];
        for (let i = 0; i < 80; i++) {
            h = Core.triaAppendResult(h, { total: 20, correct: i % 21, accuracy: (i % 21) * 5 }, { now: 1000 + i });
        }
        expect(h.length).toBeLessThanOrEqual(60);
        for (let i = 1; i < h.length; i++) expect(h[i].at).toBeGreaterThan(h[i - 1].at);
    });

    test('la sèrie de la gràfica porta el percentatge i la tendència', () => {
        const h = [
            { at: 1, accuracy: 40, total: 20, correct: 8 },
            { at: 2, accuracy: 60, total: 20, correct: 12 },
            { at: 3, accuracy: 80, total: 20, correct: 16 }
        ];
        const series = Core.triaChartSeries(h);
        expect(series).toHaveLength(3);
        expect(series.map(p => p.accuracy)).toEqual([40, 60, 80]);
        // La tendència és la mitjana mòbil: puja més suau que el resultat cru.
        expect(series[2].trend).toBe(60);
    });

    test('la sèrie ordena per data encara que l\'historial vingui desordenat', () => {
        const series = Core.triaChartSeries([
            { at: 3, accuracy: 80 }, { at: 1, accuracy: 40 }, { at: 2, accuracy: 60 }
        ]);
        expect(series.map(p => p.accuracy)).toEqual([40, 60, 80]);
    });

    test('sense historial la gràfica no té sèrie, i no peta', () => {
        expect(Core.triaChartSeries([])).toEqual([]);
        expect(Core.triaChartSeries(null)).toEqual([]);
    });
});
