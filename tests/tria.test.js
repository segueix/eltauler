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

describe('les dues formes en què arriben les tres línies', () => {
    // A l'historial NO s'hi desa `multipvBefore`: hi viatgen `bestMove` +
    // `evalBefore` (línia 1) i `alternatives` (línies 2 i 3). Si el test només
    // sabés llegir la primera forma, el fons es reduiria a la partida en curs.
    function storedShape(extra = {}) {
        return Object.assign({
            fen: FEN, moveNumber: 4, quality: 'mistake', swing: 120, cpLoss: 120,
            playerMove: 'f3e5', playerMoveSan: 'Nxe5',
            bestMove: 'd2d3', bestMoveSan: 'd3', evalBefore: 40,
            alternatives: [{ move: 'b1c3', eval: 22, pv: [] }, { move: 'e1g1', eval: -5, pv: [] }]
        }, extra);
    }

    test('una jugada desada a l\'historial és elegible igual', () => {
        expect(Core.triaEligibleMoves([storedShape()], {})).toHaveLength(1);
    });

    test('i en surt la mateixa pregunta que amb el MultiPV cru', () => {
        const fromStored = T.buildQuestion(storedShape(), {});
        const fromRaw = T.buildQuestion(review(), {});
        expect(fromStored).toBeTruthy();
        expect(fromStored.options.map(o => o.san).sort()).toEqual(fromRaw.options.map(o => o.san).sort());
        expect(fromStored.options[fromStored.answerIndex].san).toBe('d3');
    });

    test('el MultiPV cru mana quan hi és (no hi perd els mats)', () => {
        const both = storedShape({
            multipvBefore: [mpv('d2d3', 40), mpv('b1c3', 22), mpv('e1g1', -5)]
        });
        const cands = Core.triaCandidatesFromReview(both);
        expect(cands).toHaveLength(3);
        expect(cands[0].evalType).toBe('cp');
    });

    test('sense alternatives desades no es pot reconstruir res', () => {
        expect(Core.triaEligibleMoves([storedShape({ alternatives: [] })], {})).toHaveLength(0);
    });

    test('una alternativa que repeteix la millor no compta com a segona línia', () => {
        const dup = storedShape({ alternatives: [{ move: 'd2d3', eval: 40, pv: [] }] });
        expect(Core.triaEligibleMoves([dup], {})).toHaveLength(0);
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

    test('el compte anunciat coincideix amb el test que es pot fer de debò', () => {
        [1, 2, 4, 8].forEach(games => {
            const p = pool(games * 6).map((r, i) => Object.assign({}, r, { gameId: 'g' + Math.floor(i / 6) }));
            const planned = Core.triaPlannedQuestionCount(p, {});
            const real = T.buildTest(p, { elo: 1600 }).length;
            expect(planned).toBeGreaterThanOrEqual(real);
            expect(planned - real).toBeLessThanOrEqual(2);
        });
    });

    test('una sola partida no pot anunciar un test sencer (mana el màxim per partida)', () => {
        const oneGame = pool(30).map(r => Object.assign({}, r, { gameId: 'unica' }));
        expect(Core.triaPlannedQuestionCount(oneGame, {}))
            .toBeLessThanOrEqual(CFG.eligibility.maxPerGame);
    });

    test('sense jugades elegibles no hi ha test', () => {
        expect(T.buildTest([], { elo: 1600 })).toEqual([]);
        expect(T.buildTest(null, { elo: 1600 })).toEqual([]);
    });
});

describe('memòria entre tests (no repetir, repescar les fallades)', () => {
    test('una pregunta encertada queda tancada; una de fallada, pendent', () => {
        let p = Core.triaEmptyProgress();
        p = Core.triaApplyResults(p, [{ key: 'k1', correct: true }, { key: 'k2', correct: false }], { now: 1000 });
        expect(Core.triaProgressStatus(p, 'k1')).toBe('mastered');
        expect(Core.triaProgressStatus(p, 'k2')).toBe('pending');
        expect(Core.triaProgressStatus(p, 'mai-vista')).toBeNull();
    });

    test('encertar una pendent la tanca, i es recorda que havia fallat', () => {
        let p = Core.triaApplyResults(Core.triaEmptyProgress(), [{ key: 'k', correct: false }], { now: 1000 });
        p = Core.triaApplyResults(p, [{ key: 'k', correct: true }], { now: 2000 });
        expect(Core.triaProgressStatus(p, 'k')).toBe('mastered');
        expect(p.entries.k.attempts).toBe(2);
        expect(p.entries.k.wrong).toBe(1);
    });

    test('fallar-la diverses vegades la manté pendent', () => {
        let p = Core.triaEmptyProgress();
        for (let i = 0; i < 3; i++) p = Core.triaApplyResults(p, [{ key: 'k', correct: false }], { now: 1000 + i });
        expect(Core.triaProgressStatus(p, 'k')).toBe('pending');
        expect(p.entries.k.wrong).toBe(3);
    });

    test('el recompte separa resoltes i pendents', () => {
        const p = Core.triaApplyResults(Core.triaEmptyProgress(), [
            { key: 'a', correct: true }, { key: 'b', correct: true }, { key: 'c', correct: false }
        ], { now: 1 });
        expect(Core.triaProgressCounts(p)).toMatchObject({ mastered: 2, pending: 1, total: 3 });
    });

    test('una memòria buida o corrupta no rebenta res', () => {
        expect(Core.triaProgressStatus(null, 'k')).toBeNull();
        expect(Core.triaProgressStatus({}, 'k')).toBeNull();
        expect(Core.triaProgressCounts(null).total).toBe(0);
        expect(Core.triaApplyResults(null, null, {}).entries).toEqual({});
    });

    test('la partició deixa les encertades fora i separa pendents de noves', () => {
        const p = Core.triaApplyResults(Core.triaEmptyProgress(), [
            { key: 'vista-ok', correct: true }, { key: 'vista-ko', correct: false }
        ], { now: 1 });
        const split = Core.triaPartitionByProgress(
            [{ key: 'vista-ok' }, { key: 'vista-ko' }, { key: 'nova' }], p);
        expect(split.mastered.map(x => x.key)).toEqual(['vista-ok']);
        expect(split.pending.map(x => x.key)).toEqual(['vista-ko']);
        expect(split.fresh.map(x => x.key)).toEqual(['nova']);
    });

    test('les pendents no poden omplir un test sencer si hi ha material nou', () => {
        const pending = Array.from({ length: 20 }, (_, i) => 'p' + i);
        const fresh = Array.from({ length: 20 }, (_, i) => 'f' + i);
        const mix = Core.triaMixPendingAndFresh(pending, fresh, 20, {});
        const pendingCount = mix.filter(x => String(x).startsWith('p')).length;
        expect(mix).toHaveLength(20);
        expect(pendingCount).toBe(Math.round(20 * CFG.repetition.maxPendingShare));
    });

    test('sense material nou, la repesca sí que omple el test', () => {
        const pending = Array.from({ length: 20 }, (_, i) => 'p' + i);
        const mix = Core.triaMixPendingAndFresh(pending, [], 20, {});
        expect(mix).toHaveLength(20);
    });

    test('sense pendents, el test és tot de noves', () => {
        const fresh = Array.from({ length: 20 }, (_, i) => 'f' + i);
        expect(Core.triaMixPendingAndFresh([], fresh, 20, {})).toHaveLength(20);
    });
});

describe('el test respecta la memòria', () => {
    function poolWithGames(n) {
        const out = [];
        let seed = 555;
        const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
        const uci = m => `${m.from}${m.to}${m.promotion || ''}`;
        for (let g = 0; g < n; g++) {
            const b = new Chess();
            for (let k = 0; k < 5; k++) {
                const legal = b.moves({ verbose: true });
                if (legal.length < 4) break;
                const p = legal.slice(0, 4);
                out.push(review({
                    fen: b.fen(), moveNumber: k + 1, gameId: 'g' + g,
                    playerMove: uci(p[3]), bestMove: uci(p[0]),
                    multipvBefore: [mpv(uci(p[0]), 40), mpv(uci(p[1]), 15), mpv(uci(p[2]), -10)]
                }));
                b.move(legal[Math.floor(rnd() * legal.length)]);
            }
        }
        return out;
    }

    test('una pregunta encertada no torna a sortir mai', () => {
        const pool = poolWithGames(8);
        const first = T.buildTest(pool, { elo: 1600 });
        expect(first.length).toBeGreaterThan(0);
        // S'encerten totes les del primer test.
        const progress = Core.triaApplyResults(Core.triaEmptyProgress(),
            first.map(q => ({ key: q.key, correct: true })), { now: 1 });
        const second = T.buildTest(pool, { elo: 1600, progress: progress });
        const repeated = second.filter(q => first.some(f => f.key === q.key));
        expect(repeated).toHaveLength(0);
    });

    test('una pregunta fallada torna al test següent', () => {
        const pool = poolWithGames(8);
        const first = T.buildTest(pool, { elo: 1600 });
        const failed = first.slice(0, 3).map(q => q.key);
        const progress = Core.triaApplyResults(Core.triaEmptyProgress(),
            first.map(q => ({ key: q.key, correct: !failed.includes(q.key) })), { now: 1 });
        const second = T.buildTest(pool, { elo: 1600, progress: progress });
        failed.forEach(key => expect(second.some(q => q.key === key)).toBe(true));
    });

    test('les repescades vénen marcades com a tals', () => {
        const pool = poolWithGames(8);
        const first = T.buildTest(pool, { elo: 1600 });
        const progress = Core.triaApplyResults(Core.triaEmptyProgress(),
            [{ key: first[0].key, correct: false }], { now: 1 });
        const second = T.buildTest(pool, { elo: 1600, progress: progress });
        const again = second.find(q => q.key === first[0].key);
        expect(again).toBeTruthy();
        expect(again.pending).toBe(true);
    });

    test('el compte anunciat baixa a mesura que se n\'encerten', () => {
        const pool = poolWithGames(8);
        const before = Core.triaPlannedQuestionCount(pool, {});
        expect(before).toBeGreaterThan(0);
        // S'encerten les preguntes del primer test.
        const first = T.buildTest(pool, { elo: 1600 });
        const progress = Core.triaApplyResults(Core.triaEmptyProgress(),
            first.map(q => ({ key: q.key, correct: true })), { now: 1 });
        const after = Core.triaPlannedQuestionCount(pool, { progress: progress });
        expect(after).toBeLessThan(before);
    });

    test('fallar-les no en redueix el compte: segueixen disponibles', () => {
        const pool = poolWithGames(8);
        const before = Core.triaPlannedQuestionCount(pool, {});
        const first = T.buildTest(pool, { elo: 1600 });
        const progress = Core.triaApplyResults(Core.triaEmptyProgress(),
            first.map(q => ({ key: q.key, correct: false })), { now: 1 });
        expect(Core.triaPlannedQuestionCount(pool, { progress: progress })).toBe(before);
    });

    test('quan tot està encertat, no queda cap pregunta', () => {
        const pool = poolWithGames(4);
        const eligible = Core.triaEligibleMoves(pool, {});
        const keys = eligible.map(r => T.buildQuestion(r, {})).filter(Boolean).map(q => q.key);
        const progress = Core.triaApplyResults(Core.triaEmptyProgress(),
            keys.map(k => ({ key: k, correct: true })), { now: 1 });
        expect(T.buildTest(pool, { elo: 1600, progress: progress })).toHaveLength(0);
        expect(Core.triaPlannedQuestionCount(pool, { progress: progress })).toBe(0);
    });
});

describe('obertures: una per posició, tret dels errors recurrents', () => {
    // Partides que comencen igual: les posicions d'obertura es repeteixen tal
    // com passa de debò (tothom juga el seu repertori), i sense filtre un test
    // s'ompliria de variacions de les mateixes quatre jugades.
    function openingPool(games, opts = {}) {
        const out = [];
        const uci = m => `${m.from}${m.to}${m.promotion || ''}`;
        for (let g = 0; g < games; g++) {
            const b = new Chess();
            for (let k = 0; k < 4; k++) {
                const legal = b.moves({ verbose: true });
                const p = legal.slice(0, 4);
                out.push(review({
                    fen: b.fen(), moveNumber: k + 1, gameId: 'g' + g,
                    // Per defecte cada partida falla una jugada DIFERENT, així
                    // que són decisions distintes sobre posicions iguals.
                    playerMove: uci(p[3 - (opts.sameMistake ? 0 : (g % 2))]),
                    bestMove: uci(p[0]),
                    multipvBefore: [mpv(uci(p[0]), 40), mpv(uci(p[1]), 15), mpv(uci(p[2]), -10)]
                }));
                b.move(legal[0]); // mateixa línia a totes: posicions compartides
            }
        }
        return out;
    }

    function questionsOf(pool) {
        return Core.triaEligibleMoves(pool, {})
            .map(r => T.buildQuestion(r, {}))
            .filter(Boolean)
            .map((q, i) => Object.assign(q, { repeatedGames: Core.triaEligibleMoves(pool, {})[i].repeatedGames }));
    }

    test('la mateixa decisió repetida en partides diferents es compta com a recurrent', () => {
        const pool = openingPool(3, { sameMistake: true });
        const elig = Core.triaEligibleMoves(pool, {});
        // Totes les partides fallen el mateix a les mateixes posicions.
        expect(elig.length).toBe(4);
        elig.forEach(r => expect(r.repeatedGames).toBe(3));
    });

    test('fallar-la dues vegades a la MATEIXA partida no la fa recurrent', () => {
        const one = openingPool(1, { sameMistake: true });
        const twice = one.concat(one.map(r => Object.assign({}, r)));
        Core.triaEligibleMoves(twice, {}).forEach(r => expect(r.repeatedGames).toBe(1));
    });

    test('d\'una mateixa posició d\'obertura només en surt una pregunta', () => {
        const pool = openingPool(6);
        const qs = questionsOf(pool);
        const openings = qs.filter(q => q.phase === 'opening');
        expect(openings.length).toBeGreaterThan(1);
        const kept = Core.triaFilterOpenings(qs, { testSize: 20 })
            .questions.filter(q => q.phase === 'opening');
        const positions = kept.map(q => q.fen.split(' ')[0]);
        expect(new Set(positions).size).toBe(positions.length);
    });

    test('un error recurrent d\'obertura hi passa encara que se superi el sostre', () => {
        // Una recurrent (fallada a tres partides) i moltes de soltes.
        const recurrent = Object.assign(review({ moveNumber: 1 }), { phase: 'opening' });
        const singles = [];
        for (let i = 0; i < 30; i++) {
            singles.push({ phase: 'opening', fen: `pos${i}/8/8/8/8/8/8/8 w - - 0 1`, repeatedGames: 1, id: 's' + i });
        }
        const rec = { phase: 'opening', fen: 'REC/8/8/8/8/8/8/8 w - - 0 1', repeatedGames: 3, id: 'rec' };
        const kept = Core.triaFilterOpenings(singles.concat([rec]), { testSize: 20 });
        expect(kept.questions.some(q => q.id === 'rec')).toBe(true);
    });

    test('les obertures no recurrents queden limitades a una part del test', () => {
        const singles = [];
        for (let i = 0; i < 40; i++) {
            singles.push({ phase: 'opening', fen: `p${i}/8/8/8/8/8/8/8 w - - 0 1`, repeatedGames: 1 });
        }
        const kept = Core.triaFilterOpenings(singles, { testSize: 20 });
        expect(kept.questions.length).toBe(Math.round(20 * CFG.openings.maxShare));
        // Les que sobren no es llencen: queden per si calgués omplir el test.
        expect(kept.overflow.length).toBe(40 - Math.round(20 * CFG.openings.maxShare));
    });

    test('les altres fases no les toca el filtre', () => {
        const mixed = [
            { phase: 'middlegame', fen: 'a/8/8/8/8/8/8/8 w - - 0 1' },
            { phase: 'endgame', fen: 'b/8/8/8/8/8/8/8 w - - 0 1' },
            { phase: 'middlegame', fen: 'c/8/8/8/8/8/8/8 w - - 0 1' }
        ];
        expect(Core.triaFilterOpenings(mixed, { testSize: 20 }).questions).toHaveLength(3);
    });

    test('sense obertures el filtre no fa res', () => {
        const only = [{ phase: 'endgame', fen: 'x/8/8/8/8/8/8/8 w - - 0 1' }];
        expect(Core.triaFilterOpenings(only, { testSize: 20 }).questions).toHaveLength(1);
        expect(Core.triaFilterOpenings(null, { testSize: 20 }).questions).toEqual([]);
    });

    test('el que es talla d\'obertura ho omple el migjoc', () => {
        const qs = [];
        for (let i = 0; i < 40; i++) qs.push({ phase: 'opening', fen: `o${i}/8/8/8/8/8/8/8 w - - 0 1`, repeatedGames: 1 });
        for (let i = 0; i < 40; i++) qs.push({ phase: 'middlegame', fen: `m${i}/8/8/8/8/8/8/8 w - - 0 1` });
        const filtered = Core.triaFilterOpenings(qs, { testSize: 20 }).questions;
        const test20 = Core.triaInterleaveByPhase(filtered).slice(0, 20);
        const counts = Core.triaPhaseCounts(test20);
        expect(counts.opening).toBeLessThanOrEqual(Math.round(20 * CFG.openings.maxShare));
        expect(counts.middlegame).toBeGreaterThan(counts.opening);
        expect(counts.opening + counts.middlegame).toBe(20);
    });

    test('si NOMÉS hi ha obertures VARIADES, el test s\'omple igualment', () => {
        // El sostre és una preferència, no una gana: qui només tingui partides
        // curtes —però de línies diferents— no ha de rebre un test de cinc.
        const pool = [];
        const uci = m => `${m.from}${m.to}${m.promotion || ''}`;
        let seed = 808;
        const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
        for (let g = 0; g < 30; g++) {
            const b = new Chess();
            for (let k = 0; k < 4; k++) {
                const legal = b.moves({ verbose: true });
                const p = legal.slice(0, 4);
                pool.push(review({
                    fen: b.fen(), moveNumber: k + 1, gameId: 'v' + g,
                    playerMove: uci(p[3]), bestMove: uci(p[0]),
                    multipvBefore: [mpv(uci(p[0]), 40), mpv(uci(p[1]), 15), mpv(uci(p[2]), -10)]
                }));
                b.move(legal[Math.floor(rnd() * legal.length)]);
            }
        }
        const openings = Core.triaEligibleMoves(pool, {})
            .map(r => T.buildQuestion(r, {})).filter(Boolean)
            .filter(q => q.phase === 'opening');
        const distinctPositions = new Set(openings.map(q => q.fen.split(' ')[0])).size;
        expect(distinctPositions).toBeGreaterThan(CFG.testSize);

        const test = T.buildTest(pool, { elo: 1600 });
        expect(test.length).toBeGreaterThan(Math.round(CFG.testSize * CFG.openings.maxShare));
    });
});

describe('barreja de fases (obertura, migjoc i final)', () => {
    test('el repartiment alterna fases en comptes de servir-les en blocs', () => {
        const qs = [
            { phase: 'middlegame', id: 'm1' }, { phase: 'middlegame', id: 'm2' },
            { phase: 'middlegame', id: 'm3' }, { phase: 'opening', id: 'o1' },
            { phase: 'opening', id: 'o2' }, { phase: 'endgame', id: 'e1' }
        ];
        const mixed = Core.triaInterleaveByPhase(qs);
        expect(mixed).toHaveLength(6);
        // Les tres primeres han de cobrir les tres fases.
        expect(new Set(mixed.slice(0, 3).map(q => q.phase)).size).toBe(3);
    });

    test('agafant-ne les primeres, el test toca les tres fases encara que el fons sigui desigual', () => {
        const qs = [];
        for (let i = 0; i < 40; i++) qs.push({ phase: 'middlegame', id: 'm' + i });
        for (let i = 0; i < 6; i++) qs.push({ phase: 'opening', id: 'o' + i });
        for (let i = 0; i < 3; i++) qs.push({ phase: 'endgame', id: 'e' + i });
        const first20 = Core.triaInterleaveByPhase(qs).slice(0, 20);
        const counts = Core.triaPhaseCounts(first20);
        expect(counts.opening).toBeGreaterThan(0);
        expect(counts.middlegame).toBeGreaterThan(0);
        expect(counts.endgame).toBeGreaterThan(0);
        // Sense repartiment, les vint primeres serien totes de migjoc.
        expect(counts.middlegame).toBeLessThan(20);
    });

    test('el màxim per partida es reparteix al llarg de la partida, no pel cap', () => {
        // Les revisions vénen en ordre de joc. Si el màxim es cobrís amb les
        // primeres, un test no arribaria mai al migjoc ni al final d'aquella
        // partida: totes les preguntes serien obertures.
        const long = [];
        for (let i = 0; i < 40; i++) long.push({ gameId: 'unica', moveNumber: i + 1 });
        const spread = Core.triaSpreadAcrossGames(long, 5);
        expect(spread).toHaveLength(5);
        const numbers = spread.map(x => x.moveNumber);
        // La tria ha de cobrir tota la partida, no els cinc primers moviments.
        expect(Math.max(...numbers)).toBeGreaterThan(30);
        expect(numbers).not.toEqual([1, 2, 3, 4, 5]);
    });

    test('una partida amb menys jugades que el màxim es conserva sencera', () => {
        const short = [{ gameId: 'g', moveNumber: 1 }, { gameId: 'g', moveNumber: 2 }];
        expect(Core.triaSpreadAcrossGames(short, 5)).toHaveLength(2);
    });

    test('dins de cada fase es conserva l\'ordre que venia (la dificultat mana a dins)', () => {
        const qs = [
            { phase: 'opening', id: 'o1' }, { phase: 'opening', id: 'o2' },
            { phase: 'opening', id: 'o3' }
        ];
        expect(Core.triaInterleaveByPhase(qs).map(q => q.id)).toEqual(['o1', 'o2', 'o3']);
    });

    test('una fase desconeguda o absent es compta com a migjoc', () => {
        const counts = Core.triaPhaseCounts([{ phase: 'inventada' }, {}, { phase: 'endgame' }]);
        expect(counts.middlegame).toBe(2);
        expect(counts.endgame).toBe(1);
    });

    test('llistes buides o corruptes no rebenten res', () => {
        expect(Core.triaInterleaveByPhase(null)).toEqual([]);
        expect(Core.triaPhaseCounts(null)).toEqual({ opening: 0, middlegame: 0, endgame: 0 });
    });

    test('el resum del test diu de quina fase era cada pregunta', () => {
        const s = Core.triaTestSummary(
            [{ correct: true }, { correct: false }, { correct: true }],
            { questions: [{ phase: 'opening' }, { phase: 'middlegame' }, { phase: 'endgame' }] });
        expect(s.phases).toEqual({ opening: 1, middlegame: 1, endgame: 1 });
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
