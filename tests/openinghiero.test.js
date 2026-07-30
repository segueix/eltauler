const fs = require('fs');
const path = require('path');
const Chess = require('chess.js').Chess;
const Core = require('../core.js');

const helpers = Core.createOpeningHieroglyphicHelpers(Chess);

// Dues obertures del repertori real (una amb blanques i una amb negres).
const CATALANA = {
    eco: 'E01', name: 'Obertura Catalana', userColor: 'w',
    idea: 'Combina d4 i c4 amb el fianchetto de l’alfil de rei.',
    moves: ['d4', 'Nf6', 'c4', 'e6', 'g3', 'd5', 'Bg2', 'Be7', 'Nf3', 'O-O', 'O-O'],
    movePhrases: ['a', 'b', 'c', 'd', '3.g3 és el segell català', 'f', 'g', 'h', 'i', 'j', 'k']
};
const NAJDORF = {
    eco: 'B90', name: 'Siciliana Najdorf', userColor: 'b',
    idea: 'a6 prepara contrajoc als dos flancs.',
    moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6']
};
const CURTA = { eco: 'X00', name: 'Línia curta', userColor: 'w', moves: ['e4', 'e5', 'Nf3'] };

describe('openingHieroglyphicStartPly', () => {
    test('el 3r i el 4t moviment cauen al ply correcte', () => {
        expect(Core.openingHieroglyphicStartPly(3, 'w')).toBe(4);
        expect(Core.openingHieroglyphicStartPly(3, 'b')).toBe(5);
        expect(Core.openingHieroglyphicStartPly(4, 'w')).toBe(6);
        expect(Core.openingHieroglyphicStartPly(4, 'b')).toBe(7);
    });
});

describe('buildOpeningHieroglyphic', () => {
    test('arrenca al 3r moviment de les blanques amb la línia catalana', () => {
        const p = helpers.buildOpeningHieroglyphic(CATALANA, { startMoveNumber: 3 });
        expect(p.setupSan).toEqual(['d4', 'Nf6', 'c4', 'e6']);
        expect(p.startPly).toBe(4);
        expect(p.solutionSan).toEqual(['g3', 'Bg2', 'Nf3']);
        expect(p.replySan).toEqual(['d5', 'Be7']);
        expect(p.solutionMoves).toEqual(['g2g3', 'f1g2', 'g1f3']);
        expect(p.replyMoves).toEqual(['d7d5', 'f8e7']);
        expect(p.bestMoveSan).toBe('g3');
        expect(p.userColor).toBe('w');
    });

    test('la FEN de partida té el torn de l’usuari i la línia jugada', () => {
        const p = helpers.buildOpeningHieroglyphic(CATALANA, { startMoveNumber: 3 });
        const g = new Chess(p.fen);
        expect(g.turn()).toBe('w');
        expect(p.fen.split(' ')[5]).toBe('3'); // tercer moviment
        // Totes les jugades de la solució són legals des de la FEN.
        p.solutionMoves.forEach((uci, i) => {
            const board = new Chess(p.fen);
            for (let k = 0; k < i; k++) {
                board.move({ from: p.solutionMoves[k].slice(0, 2), to: p.solutionMoves[k].slice(2, 4) });
                board.move({ from: p.replyMoves[k].slice(0, 2), to: p.replyMoves[k].slice(2, 4) });
            }
            expect(board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4) })).not.toBeNull();
        });
    });

    test('amb negres arrenca al ply senar corresponent', () => {
        const p = helpers.buildOpeningHieroglyphic(NAJDORF, { startMoveNumber: 3 });
        expect(p.setupSan).toEqual(['e4', 'c5', 'Nf3', 'd6', 'd4']);
        expect(p.solutionSan).toEqual(['cxd4', 'Nf6', 'a6']);
        expect(p.replySan).toEqual(['Nxd4', 'Nc3']);
        expect(new Chess(p.fen).turn()).toBe('b');
    });

    test('el 4t moviment dona un exercici diferent de la mateixa obertura', () => {
        const p = helpers.buildOpeningHieroglyphic(CATALANA, { startMoveNumber: 4 });
        expect(p.setupSan).toEqual(['d4', 'Nf6', 'c4', 'e6', 'g3', 'd5']);
        expect(p.solutionSan).toEqual(['Bg2', 'Nf3', 'O-O']);
        expect(p.replySan).toEqual(['Be7', 'O-O']);
        expect(p.startMoveNumber).toBe(4);
        expect(p.key).not.toBe(helpers.buildOpeningHieroglyphic(CATALANA, { startMoveNumber: 3 }).key);
    });

    test('una línia massa curta no dona exercici', () => {
        expect(helpers.buildOpeningHieroglyphic(CURTA, { startMoveNumber: 3 })).toBeNull();
        expect(helpers.buildOpeningHieroglyphic(null, { startMoveNumber: 3 })).toBeNull();
        expect(helpers.buildOpeningHieroglyphic({ moves: [] }, {})).toBeNull();
    });

    test('la darrera jugada de la solució no arrossega rèplica', () => {
        const p = helpers.buildOpeningHieroglyphic(NAJDORF, { startMoveNumber: 4 });
        expect(p.solutionSan).toEqual(['Nf6', 'a6']);
        expect(p.replyMoves.length).toBe(p.solutionMoves.length - 1);
    });

    test('la darrera jugada de preparació és la del rival (per marcar-la al tauler)', () => {
        const blanques = helpers.buildOpeningHieroglyphic(CATALANA, { startMoveNumber: 3 });
        expect(blanques.lastSetupMove).toEqual({ from: 'e7', to: 'e6', san: 'e6', color: 'b' });
        const negres = helpers.buildOpeningHieroglyphic(NAJDORF, { startMoveNumber: 3 });
        expect(negres.lastSetupMove).toEqual({ from: 'd2', to: 'd4', san: 'd4', color: 'w' });
        // Sempre del bàndol contrari al de qui resol l'exercici.
        helpers.openingHieroglyphicCandidates([CATALANA, NAJDORF]).forEach(p => {
            expect(p.lastSetupMove.color).not.toBe(p.userColor);
        });
    });

    test('cada pas porta la frase pedagògica del seu ply', () => {
        const p = helpers.buildOpeningHieroglyphic(CATALANA, { startMoveNumber: 3 });
        expect(p.steps[0].phrase).toBe('3.g3 és el segell català');
        expect(p.steps[0].motif).toBe('fianchetto_prep');
    });
});

describe('classifyOpeningTheoryMove', () => {
    const cases = [
        [{ piece: 'k', flags: 'k', san: 'O-O', to: 'g1' }, 'castle'],
        [{ piece: 'b', flags: 'n', san: 'Bb4+', to: 'b4' }, 'check'],
        [{ piece: 'p', flags: 'c', san: 'cxd4', to: 'd4', captured: 'p' }, 'capture'],
        [{ piece: 'b', flags: 'n', san: 'Bg2', to: 'g2' }, 'fianchetto'],
        [{ piece: 'p', flags: 'n', san: 'g6', to: 'g6' }, 'fianchetto_prep'],
        [{ piece: 'b', flags: 'n', san: 'Bb5', to: 'b5' }, 'pin'],
        [{ piece: 'p', flags: 'b', san: 'd4', to: 'd4' }, 'center_pawn'],
        [{ piece: 'p', flags: 'b', san: 'c5', to: 'c5' }, 'pawn_lever'],
        [{ piece: 'p', flags: 'n', san: 'a6', to: 'a6' }, 'pawn_support'],
        [{ piece: 'n', flags: 'n', san: 'Nf3', to: 'f3' }, 'knight_post'],
        [{ piece: 'q', flags: 'n', san: 'Qc7', to: 'c7' }, 'queen_move'],
        [{ piece: 'r', flags: 'n', san: 'Re1', to: 'e1' }, 'rook_file']
    ];
    test.each(cases)('%o → %s', (move, expected) => {
        expect(Core.classifyOpeningTheoryMove(move)).toBe(expected);
    });

    test('sense jugada cau al motiu genèric', () => {
        expect(Core.classifyOpeningTheoryMove(null)).toBe('development');
    });
});

describe('pickOpeningHieroglyphic', () => {
    const repertoire = [CATALANA, NAJDORF, CURTA];

    test('els candidats surten només de les línies prou llargues', () => {
        const all = helpers.openingHieroglyphicCandidates(repertoire);
        expect(all.length).toBe(4); // catalana i najdorf, pel 3r i pel 4t moviment
        expect(all.every(p => p.name !== 'Línia curta')).toBe(true);
        expect(all.every(p => [3, 4].includes(p.startMoveNumber))).toBe(true);
    });

    test('filtra per color', () => {
        const blacks = helpers.openingHieroglyphicCandidates(repertoire, { userColor: 'b' });
        expect(blacks.every(p => p.userColor === 'b')).toBe(true);
        expect(blacks.length).toBe(2);
    });

    test('evita els exercicis recents', () => {
        const all = helpers.openingHieroglyphicCandidates(repertoire);
        const recentKeys = all.slice(1).map(p => p.key);
        const picked = helpers.pickOpeningHieroglyphic(repertoire, { recentKeys, rng: () => 0.99 });
        expect(picked.key).toBe(all[0].key);
    });

    test('si tot és recent, torna a permetre qualsevol exercici', () => {
        const all = helpers.openingHieroglyphicCandidates(repertoire);
        const picked = helpers.pickOpeningHieroglyphic(repertoire, { recentKeys: all.map(p => p.key), rng: () => 0 });
        expect(picked).not.toBeNull();
    });

    test('sense repertori no hi ha exercici', () => {
        expect(helpers.pickOpeningHieroglyphic([], {})).toBeNull();
        expect(helpers.pickOpeningHieroglyphic(null, {})).toBeNull();
    });
});

// El repertori REAL de l'app: cada obertura catalogada ha de poder donar un
// jeroglífic d'obertura pel 3r o pel 4t moviment, i tota la línia ha de ser legal.
describe('repertori real (CURATED_OPENINGS)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
    const start = src.indexOf('const CURATED_OPENINGS = [');
    const end = src.indexOf('\n];', start);
    const CURATED = new Function(`${src.slice(start, end + 3)}\n;return CURATED_OPENINGS;`)();

    test('s’ha pogut llegir el repertori', () => {
        expect(CURATED.length).toBeGreaterThan(20);
    });

    test('totes les obertures donen almenys un exercici vàlid', () => {
        CURATED.forEach(op => {
            const candidates = helpers.openingHieroglyphicCandidates([op]);
            expect({ name: op.name, n: candidates.length }).toEqual({ name: op.name, n: expect.any(Number) });
            expect(candidates.length).toBeGreaterThan(0);
        });
    });

    test('cap exercici comença abans del 3r moviment ni revela jugades il·legals', () => {
        helpers.openingHieroglyphicCandidates(CURATED).forEach(p => {
            const moveNumber = Number(p.fen.split(' ')[5]);
            expect(moveNumber).toBeGreaterThanOrEqual(3);
            expect(moveNumber).toBeLessThanOrEqual(4);
            const g = new Chess(p.fen);
            expect(g.turn()).toBe(p.userColor);
            p.solutionMoves.forEach((uci, i) => {
                const mv = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
                expect(mv).not.toBeNull();
                const reply = p.replyMoves[i];
                if (reply) {
                    expect(g.move({ from: reply.slice(0, 2), to: reply.slice(2, 4) })).not.toBeNull();
                }
            });
            expect(p.solutionMoves.length).toBeGreaterThan(0);
            expect(p.solutionMoves.length).toBeLessThanOrEqual(3);
        });
    });
});
