const Core = require('../core.js');
const { Chess } = require('chess.js');

const B = Core.createPersonalOpeningBuilder(Chess);
const CFG = Core.PERSONAL_OPENING_CONFIG;

let seq = 0;
function game(moves, color, result, precision) {
    return { id: 'g' + (++seq), moves: moves.slice(), playerColor: color, result: result, precision: precision };
}

function evaluation(pairs) {
    return { moves: pairs.map(([san, cp]) => ({ san: san, cp: cp })) };
}

describe('porta de solidesa', () => {
    test('la pèrdua es mesura contra la millor de la posició', () => {
        const ev = evaluation([['e4', 40], ['d4', 25], ['a3', -30]]);
        expect(Core.moveCpLoss(ev, 'e4')).toBe(0);
        expect(Core.moveCpLoss(ev, 'd4')).toBe(15);
        expect(Core.moveCpLoss(ev, 'a3')).toBe(70);
    });

    test('una jugada que el motor no ha avaluat no rep cap xifra inventada', () => {
        expect(Core.moveCpLoss(evaluation([['e4', 40]]), 'h3')).toBeNull();
        expect(Core.moveCpLoss(null, 'e4')).toBeNull();
    });
});

describe('tria de la jugada pròpia', () => {
    test('si la teva habitual és la millor, es queda', () => {
        const pick = Core.choosePersonalMove(
            [{ san: 'e4', games: 10, score: 60 }],
            evaluation([['e4', 40], ['d4', 30]]));
        expect(pick.san).toBe('e4');
        expect(pick.source).toBe('own');
        expect(pick.reason).toBe('own-best');
        expect(pick.cpLoss).toBe(0);
    });

    test('una habitual una mica pitjor però sòlida es respecta', () => {
        const pick = Core.choosePersonalMove(
            [{ san: 'd4', games: 12, score: 65 }],
            evaluation([['e4', 40], ['d4', 25]]));
        expect(pick.san).toBe('d4');
        expect(pick.source).toBe('own');
        expect(pick.cpLoss).toBe(15);
    });

    test('una habitual que perd massa se substitueix, i es diu per què', () => {
        const pick = Core.choosePersonalMove(
            [{ san: 'g4', games: 9, score: 55 }],
            evaluation([['e4', 40], ['g4', -80]]));
        expect(pick.san).toBe('e4');
        expect(pick.source).toBe('engine');
        expect(pick.reason).toBe('replaces-unsound');
        expect(pick.replaces).toEqual({ san: 'g4', games: 9, cpLoss: 120, why: 'unsound' });
    });

    test('sense cap partida a la posició, es proposa la millor com a nova', () => {
        const pick = Core.choosePersonalMove([], evaluation([['e4', 40], ['d4', 30]]));
        expect(pick.san).toBe('e4');
        expect(pick.source).toBe('engine');
        expect(pick.reason).toBe('new');
    });

    test('entre dues de sòlides mana la que jugues més i millor', () => {
        const ev = evaluation([['e4', 40], ['d4', 30], ['c4', 28]]);
        const pick = Core.choosePersonalMove([
            { san: 'd4', games: 12, score: 70 },
            { san: 'c4', games: 3, score: 40 }
        ], ev);
        expect(pick.san).toBe('d4');
    });

    test('amb la mateixa freqüència, el resultat desempata', () => {
        const ev = evaluation([['e4', 40], ['d4', 35], ['c4', 34]]);
        const pick = Core.choosePersonalMove([
            { san: 'd4', games: 6, score: 20 },
            { san: 'c4', games: 6, score: 80 }
        ], ev);
        expect(pick.san).toBe('c4');
    });

    test('sense avaluació no es tria res (mai s\'endevina)', () => {
        expect(Core.choosePersonalMove([{ san: 'e4', games: 10, score: 60 }], null)).toBeNull();
        expect(Core.choosePersonalMove([], evaluation([]))).toBeNull();
    });
});

describe('cobertura de les rèpliques del rival', () => {
    test('reparteix la probabilitat pel que t\'han jugat de debò', () => {
        const counts = Core.opponentReplyCounts({ e5: 6, c5: 3, e6: 1 });
        const picked = Core.coverOpponentReplies(counts, [], {});
        expect(picked[0]).toMatchObject({ san: 'e5', games: 6, source: 'personal' });
        expect(Math.round(picked[0].prob * 100)).toBe(60);
    });

    test('para en arribar a la cobertura demanada', () => {
        const counts = Core.opponentReplyCounts({ e5: 9, c5: 1 });
        const picked = Core.coverOpponentReplies(counts, [{ san: 'e6' }], { coverage: 0.85 });
        expect(picked.map(p => p.san)).toEqual(['e5']);   // e5 sol ja cobreix el 90%
    });

    test('no passa mai del sostre de rèpliques', () => {
        const counts = Core.opponentReplyCounts({ e5: 3, c5: 3, e6: 3, c6: 3, d5: 3, d6: 3 });
        expect(Core.coverOpponentReplies(counts, [], { maxReplies: 3 })).toHaveLength(3);
    });

    test('sense dades pròpies, la reserva són les millors del motor', () => {
        const picked = Core.coverOpponentReplies([], [{ san: 'e5' }, { san: 'c5' }, { san: 'e6' }], {});
        expect(picked.map(p => p.san)).toEqual(['e5', 'c5', 'e6']);
        expect(picked.every(p => p.source === 'engine')).toBe(true);
        expect(Math.round(picked.reduce((s, p) => s + p.prob, 0) * 100)).toBe(100);
    });

    test('amb poca mostra pròpia, el motor omple el forat de cobertura', () => {
        const counts = Core.opponentReplyCounts({ e5: 1 });
        const picked = Core.coverOpponentReplies(counts, [{ san: 'c5' }, { san: 'e6' }], { maxReplies: 3 });
        expect(picked[0]).toMatchObject({ san: 'e5', source: 'personal' });
        expect(picked.filter(p => p.source === 'engine').map(p => p.san)).toEqual(['c5', 'e6']);
    });

    test('la reserva del motor no repeteix el que ja s\'ha cobert', () => {
        const counts = Core.opponentReplyCounts({ e5: 1 });
        const picked = Core.coverOpponentReplies(counts, [{ san: 'e5' }, { san: 'c5' }], { maxReplies: 3 });
        expect(picked.filter(p => p.san === 'e5')).toHaveLength(1);
    });
});

// Motor fals però COHERENT: una avaluació de fulla (material + control del
// centre + desenvolupament) i negamax d'una jugada. La coherència és
// imprescindible per provar la mesura a part d'una candidata, que val
// -avaluació(posició després): amb un motor inventat per jugada, aquest
// número no voldria dir res.
const PIECE_CP = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const CENTRE = { d4: 12, e4: 12, d5: 12, e5: 12, c4: 5, f4: 5, c5: 5, f5: 5, d3: 5, e3: 5, d6: 5, e6: 5 };
const FILES = 'abcdefgh';

// Avaluació d'una posició des del punt de vista de qui ha de moure.
function leafScore(fen) {
    const [board, turn] = fen.split(' ');
    let white = 0, black = 0;
    board.split('/').forEach((row, rankIdx) => {
        let file = 0;
        for (const ch of row) {
            if (/\d/.test(ch)) { file += Number(ch); continue; }
            const square = FILES[file] + (8 - rankIdx);
            const isWhite = ch === ch.toUpperCase();
            const value = (PIECE_CP[ch.toLowerCase()] || 0) + (CENTRE[square] || 0)
                // Petit premi per treure les peces menors de la fila de casa.
                + (/[nb]/i.test(ch) && (isWhite ? (8 - rankIdx) > 1 : (8 - rankIdx) < 8) ? 8 : 0);
            if (isWhite) white += value; else black += value;
            file += 1;
        }
    });
    const diff = white - black;
    return turn === 'w' ? diff : -diff;
}

function fakeEngine(fen, multiPv = 3) {
    const chess = new Chess(fen);
    const moves = chess.moves().map(san => {
        chess.move(san, { sloppy: true });
        const cp = -leafScore(chess.fen());   // negamax d'una jugada
        chess.undo();
        return { san: san, cp: cp };
    }).sort((a, b) => b.cp - a.cp);
    return { moves: moves.slice(0, multiPv) };
}

// Mesura d'UNA jugada a la mateixa posició, com fa `searchmoves` al navegador.
function fakeCandidate(fen, san) {
    const all = fakeEngine(fen, 999).moves;
    const found = all.find(m => m.san === san);
    return found ? { moves: [found] } : null;
}

function runBuild(entries, color, options, engine) {
    const state = B.start(entries, color, options || {});
    const multiPv = (options && options.multiPv) || 3;
    const evaluator = engine || (job => job.kind === 'candidate'
        ? fakeCandidate(job.fen, job.san)
        : fakeEngine(job.fen, multiPv));
    const jobs = [];
    let job, guard = 0;
    while ((job = B.nextPosition(state))) {
        jobs.push(job);
        B.feed(state, evaluator(job));
        if (++guard > 500) break;
    }
    return { result: B.result(state), jobs: jobs };
}

describe('construcció completa', () => {
    const entries = [];
    for (let i = 0; i < 6; i++) entries.push(game(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'], 'w', 'Victòria', 75));
    for (let i = 0; i < 3; i++) entries.push(game(['e4', 'c5', 'Nf3', 'd6'], 'w', 'Derrota', 60));
    for (let i = 0; i < 2; i++) entries.push(game(['e4', 'e6', 'd4', 'd5'], 'w', 'Taules', 70));

    test('surt un arbre que arrenca amb la teva jugada de debò', () => {
        const { result } = runBuild(entries, 'w');
        expect(result.root.children).toHaveLength(1);
        expect(result.root.children[0].san).toBe('e4');
        expect(result.root.children[0].mine).toBe(true);
        expect(result.root.children[0].source).toBe('own');
    });

    test('cobreix les rèpliques que et fan de debò, per ordre de freqüència', () => {
        const { result } = runBuild(entries, 'w');
        const replies = result.root.children[0].children.map(c => c.san);
        expect(replies[0]).toBe('e5');           // 6 de 11 partides
        expect(replies).toContain('c5');
        expect(replies.every(san => typeof san === 'string')).toBe(true);
    });

    test('no passa de la profunditat configurada', () => {
        const { result } = runBuild(entries, 'w', { maxPlies: 4 });
        expect(result.summary.maxDepth).toBeLessThanOrEqual(4);
    });

    test('el pressupost diu quantes línies s\'obren, no on s\'acaben', () => {
        const tight = runBuild(entries, 'w', { maxPositions: 8 }).result;
        const loose = runBuild(entries, 'w', { maxPositions: 60 }).result;
        // Amb menys pressupost surten menys línies, no línies més curtes.
        expect(Core.personalOpeningLines(tight.root).length)
            .toBeLessThan(Core.personalOpeningLines(loose.root).length);
        // El sobrecost té sostre: només el que queda d'UNA línia, i sense
        // mesures a part (aquestes sí que paren en sec amb el pressupost).
        expect(tight.evaluated).toBeLessThanOrEqual(8 + tight.config.maxPlies);
    });

    test('mesura a part la jugada pròpia que el MultiPV no ensenya', () => {
        // Bb5 no entra al top-3 d'aquesta posició amb el motor fals, però és el
        // que jugues: s'ha de demanar una avaluació de candidata per a ella.
        const { jobs } = runBuild(entries, 'w');
        const candidates = jobs.filter(j => j.kind === 'candidate');
        expect(candidates.length).toBeGreaterThan(0);
        expect(candidates.every(j => !!j.fen && !!j.san)).toBe(true);
    });

    test('sense la mesura a part, el repertori deixaria de ser teu', () => {
        // Amb MultiPV 1 el motor només ensenya la seva jugada: si no es
        // mesuressin les pròpies, totes les tries vindrien del motor.
        const withChecks = runBuild(entries, 'w', { multiPv: 1 });
        const withoutChecks = runBuild(entries, 'w', { multiPv: 1, maxCandidateChecks: 0 });
        expect(withChecks.result.summary.fromOwnGames)
            .toBeGreaterThan(withoutChecks.result.summary.fromOwnGames);
    });

    test('una mesura que no és de la jugada demanada no es dona per bona', () => {
        // El motor respon amb una altra jugada: la candidata queda sense
        // mesurar i no pot colar-se al repertori com si fos sòlida.
        const { result } = runBuild(entries, 'w', { multiPv: 1 }, job => job.kind === 'candidate'
            ? { moves: [{ san: 'a3', cp: 999 }] }
            : fakeEngine(job.fen, 1));
        (function walk(node) {
            (node.children || []).forEach(child => {
                if (child.mine) expect(child.source).toBe('engine');
                walk(child);
            });
        })(result.root);
    });

    test('el resum compta el que s\'ha de memoritzar i d\'on surt', () => {
        const { result } = runBuild(entries, 'w');
        const s = result.summary;
        expect(s.ownMoves).toBeGreaterThan(0);
        expect(s.fromOwnGames + s.fromEngine).toBe(s.ownMoves);
        expect(s.lines).toBeGreaterThan(0);
        expect(s.maxCpLoss).toBeLessThanOrEqual(CFG.maxCpLoss);
    });

    test('cap jugada pròpia del repertori passa de la porta de solidesa', () => {
        const { result } = runBuild(entries, 'w');
        (function walk(node) {
            (node.children || []).forEach(child => {
                if (child.mine && typeof child.cpLoss === 'number') {
                    expect(child.cpLoss).toBeLessThanOrEqual(CFG.maxCpLoss);
                }
                walk(child);
            });
        })(result.root);
    });

    test('avisa quan encara no hi ha prou partides amb aquell color', () => {
        const { result } = runBuild(entries.slice(0, 3), 'w');
        expect(result.enough).toBe(false);
        expect(result.games).toBe(3);
    });

    test('amb negres, l\'arrel són les jugades del rival', () => {
        const black = [];
        for (let i = 0; i < 9; i++) black.push(game(['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4'], 'b', 'Victòria', 70));
        const { result } = runBuild(black, 'b');
        expect(result.root.children[0].mine).toBe(false);
        expect(result.root.children[0].san).toBe('e4');
        expect(result.root.children[0].children[0].mine).toBe(true);
        expect(result.root.children[0].children[0].san).toBe('c5');
    });

    test('un historial buit dona un repertori buit, no un error', () => {
        const { result } = runBuild([], 'w');
        expect(result.games).toBe(0);
        expect(result.enough).toBe(false);
        expect(result.root.children.length).toBeLessThanOrEqual(1);
    });

    test('si el motor no respon mai, no s\'inventa cap jugada pròpia', () => {
        const { result } = runBuild(entries, 'w', {}, () => null);
        expect(result.summary.ownMoves).toBe(0);
        expect(result.skipped).toBeGreaterThan(0);
    });
});

// La fondària es demana en jugades TEVES —les que has de memoritzar—, no en
// semijugades: cinc de teves cauen dins de les 10 primeres semijugades de la
// partida amb blanques i de les 11 amb negres, perquè amb negres el rival hi
// afegeix la que obre.
describe('profunditat: les teves 5 primeres jugades', () => {
    const ownMovesIn = line => line.moves.filter(step => step.mine).length;
    const RUY = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5'];
    const SICILIANA = ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6', 'Be2', 'e5'];

    test('el color desplaça les semijugades, però les teves jugades són les mateixes', () => {
        expect(CFG.maxOwnMoves).toBe(5);
        expect(Core.personalOpeningPlies('w')).toBe(10);   // 1,3,5,7,9 teves + la rèplica
        expect(Core.personalOpeningPlies('b')).toBe(11);   // obre el rival: 2,4,6,8,10 teves
        expect(Core.personalOpeningPlies('w', { maxOwnMoves: 3 })).toBe(6);
        expect(Core.personalOpeningPlies('b', { maxOwnMoves: 3 })).toBe(7);
    });

    test('una profunditat fixa demanada a mà continua manant', () => {
        expect(Core.personalOpeningPlies('w', { maxPlies: 4 })).toBe(4);
        expect(Core.personalOpeningPlies('b', { maxPlies: 4 })).toBe(4);
    });

    test('i al revés: les mateixes semijugades no donen les mateixes jugades teves', () => {
        expect(Core.personalOpeningOwnMoves('w', 10)).toBe(5);
        expect(Core.personalOpeningOwnMoves('b', 11)).toBe(5);
        expect(Core.personalOpeningOwnMoves('b', 10)).toBe(5);   // la 10a és teva
        expect(Core.personalOpeningOwnMoves('w', 9)).toBe(5);    // la 9a és teva
        expect(Core.personalOpeningOwnMoves('w', 4)).toBe(2);
        expect(Core.personalOpeningOwnMoves('b', 4)).toBe(2);
    });

    test('una línia que acaba amb la teva jugada ja està acabada', () => {
        // El rival no hi té rèplica (el motor no en dona cap): la línia porta
        // les 5 jugades teves i s'ha de quedar, no podar-se.
        const entries = [];
        for (let i = 0; i < 9; i++) entries.push(game(RUY, 'w', 'Victòria', 75));
        const { result } = runBuild(entries, 'w', { maxPositions: 200 }, job => {
            if (job.kind === 'candidate') return fakeCandidate(job.fen, job.san);
            // A la novena semijugada (rèplica a la teva 5a) el motor calla.
            return job.ply >= 9 && !job.mine ? null : fakeEngine(job.fen, 3);
        });
        const lines = Core.personalOpeningLines(result.root);
        expect(lines.length).toBeGreaterThan(0);
        lines.forEach(line => {
            expect(ownMovesIn(line)).toBe(5);
            expect(line.moves[line.moves.length - 1].mine).toBe(true);
        });
    });

    test('amb blanques: 5 jugades teves dins de 10 semijugades', () => {
        const entries = [];
        for (let i = 0; i < 9; i++) entries.push(game(RUY, 'w', 'Victòria', 75));
        const { result } = runBuild(entries, 'w', { maxPositions: 200 });
        expect(result.config.maxOwnMoves).toBe(5);
        expect(result.config.maxPlies).toBe(10);
        expect(result.summary.maxDepth).toBeLessThanOrEqual(10);
        const lines = Core.personalOpeningLines(result.root);
        lines.forEach(line => {
            expect(line.moves.length).toBeLessThanOrEqual(10);
            expect(ownMovesIn(line)).toBeLessThanOrEqual(5);
        });
        // I la línia principal hi arriba de debò: no es queda curta.
        expect(ownMovesIn(lines[0])).toBe(5);
    });

    test('amb negres: les mateixes 5 jugades teves, dins d\'11 semijugades', () => {
        const entries = [];
        for (let i = 0; i < 9; i++) entries.push(game(SICILIANA, 'b', 'Victòria', 70));
        const { result } = runBuild(entries, 'b', { maxPositions: 200 });
        expect(result.config.maxPlies).toBe(11);
        expect(result.summary.maxDepth).toBeLessThanOrEqual(11);
        const lines = Core.personalOpeningLines(result.root);
        lines.forEach(line => {
            expect(line.moves.length).toBeLessThanOrEqual(11);
            expect(ownMovesIn(line)).toBeLessThanOrEqual(5);
        });
        expect(ownMovesIn(lines[0])).toBe(5);
    });

    test('cap línia no es queda a mitges: o arriba, o no hi és', () => {
        // Amb un pressupost curt, la construcció ha d'ensenyar menys línies,
        // però totes senceres. Una línia que calla a la jugada 3 no diu què
        // jugar a la 4a, que és justament per al que serveix el repertori.
        const entries = [];
        for (let i = 0; i < 9; i++) entries.push(game(RUY, 'w', 'Victòria', 75));
        for (let i = 0; i < 4; i++) entries.push(game(SICILIANA, 'w', 'Derrota', 60));
        [6, 12, 30].forEach(budget => {
            const { result } = runBuild(entries, 'w', { maxPositions: budget });
            const lines = Core.personalOpeningLines(result.root);
            lines.forEach(line => expect(ownMovesIn(line)).toBe(5));
        });
    });

    test('el sostre de probabilitat retalla l\'amplada, no la fondària', () => {
        // Rèpliques molt repartides: la probabilitat d'arribar al final de cada
        // línia cau per sota del sostre, i tot i així la línia hi ha d'arribar.
        const entries = [];
        [['e5', 'Nc6', 'Bc5'], ['c5', 'd6', 'a6'], ['e6', 'd5', 'Be7'], ['c6', 'd5', 'Nf6']]
            .forEach(replies => {
                const moves = ['e4', replies[0], 'Nf3', replies[1], 'Bc4', replies[2]];
                for (let i = 0; i < 2; i++) entries.push(game(moves, 'w', 'Victòria', 70));
            });
        const { result } = runBuild(entries, 'w', { maxPositions: 200 });
        const lines = Core.personalOpeningLines(result.root);
        expect(lines.length).toBeGreaterThan(0);
        lines.forEach(line => {
            expect(ownMovesIn(line)).toBe(5);
            expect(line.prob).toBeLessThan(CFG.minBranchProb);   // cap no hi arribaria pel sostre
        });
    });

    test('l\'historial es llegeix fins a la profunditat que es construeix', () => {
        // Les jugades de la partida que queden fora de la profunditat no entren
        // als llibres de posició: no poden influir en cap tria.
        const books = B.buildPositionBooks([game(RUY, 'w', 'Victòria', 75)], 'w', Core.personalOpeningPlies('w'));
        const flat = Object.keys(books.mine).map(key => Object.keys(books.mine[key])[0]);
        expect(flat).toContain('O-O');     // la teva 5a jugada hi és
        expect(flat).not.toContain('Re1'); // la 6a ja no
    });
});

describe('línies llegibles', () => {
    test('s\'aplanen de la més probable a la menys', () => {
        const entries = [];
        for (let i = 0; i < 8; i++) entries.push(game(['e4', 'e5', 'Nf3', 'Nc6'], 'w', 'Victòria', 75));
        for (let i = 0; i < 2; i++) entries.push(game(['e4', 'c5', 'Nf3', 'd6'], 'w', 'Derrota', 60));
        const { result } = runBuild(entries, 'w', { maxPlies: 4 });
        const lines = Core.personalOpeningLines(result.root);
        expect(lines.length).toBeGreaterThan(1);
        for (let i = 1; i < lines.length; i++) {
            expect(lines[i - 1].prob).toBeGreaterThanOrEqual(lines[i].prob);
        }
        expect(lines[0].moves.map(m => m.san).slice(0, 2)).toEqual(['e4', 'e5']);
    });

    test('un arbre buit no dona cap línia', () => {
        expect(Core.personalOpeningLines(null)).toEqual([]);
        expect(Core.personalOpeningLines({ children: [] })).toEqual([]);
    });
});
