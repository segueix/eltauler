const Core = require('../core.js');
const { Chess } = require('chess.js');

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('premoveTargets', () => {
    test('genera destins encara que el torn sigui del rival (chess.js no en dóna cap)', () => {
        const g = new Chess();
        g.move('e4'); // ara mou el negre; el cavall de g1 és del blanc
        expect(g.moves({ square: 'g1', verbose: true })).toHaveLength(0);
        expect(Core.premoveTargets(g.fen(), 'g1', 'w').sort()).toEqual(['e2', 'f3', 'h3']);
    });

    test('la peça ha de ser del color que marca la premove', () => {
        expect(Core.premoveTargets(START_FEN, 'e2', 'b')).toEqual([]);
        expect(Core.premoveTargets(START_FEN, 'e7', 'w')).toEqual([]);
        expect(Core.premoveTargets(START_FEN, 'e4', 'w')).toEqual([]); // casella buida
    });

    test('accepta com a destí una casella ocupada per una peça pròpia (recaptura)', () => {
        // El peó blanc de d4 està a punt de ser menjat (...cxd4): la premove
        // més típica de totes és recuperar-lo amb el cavall de f3 a l'instant.
        // Cap generador normal no dóna Cf3-d4 aquí, perquè d4 és casella pròpia.
        const fen = 'rnbqkbnr/pp1ppppp/8/2p5/3P4/5N2/PPP1PPPP/RNBQKB1R b KQkq - 0 1';
        expect(Core.premoveTargets(fen, 'f3', 'w')).toContain('d4');
        // I la torre a1 pot marcar les caselles de les seves pròpies peces veïnes.
        expect(Core.premoveTargets(fen, 'a1', 'w')).toEqual(expect.arrayContaining(['a2', 'b1']));
    });

    test('les línies s\'aturen a la primera peça del camí, sigui de qui sigui', () => {
        const targets = Core.premoveTargets(START_FEN, 'a1', 'w');
        expect(targets).toEqual(['a2', 'b1']);
        expect(targets).not.toContain('a3');
        expect(targets).not.toContain('c1');
    });

    test('el peó pot marcar les diagonals encara que ara siguin buides', () => {
        // Captura anticipada: el rival encara no hi ha posat cap peça.
        const targets = Core.premoveTargets(START_FEN, 'e2', 'w');
        expect(targets.sort()).toEqual(['d3', 'e3', 'e4', 'f3']);
    });

    test('el peó negre avança i captura en el sentit correcte', () => {
        expect(Core.premoveTargets(START_FEN, 'd7', 'b').sort()).toEqual(['c6', 'd5', 'd6', 'e6']);
    });

    test('el peó fora de la fila inicial no té avanç doble', () => {
        const fen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2';
        expect(Core.premoveTargets(fen, 'e4', 'w').sort()).toEqual(['d5', 'e5', 'f5']);
    });

    test('l\'enroc només si la FEN encara en dóna el dret', () => {
        const withRights = Core.premoveTargets('r3k2r/8/8/8/8/8/8/R3K2R w Kq - 0 1', 'e1', 'w');
        expect(withRights).toContain('g1');   // dret K
        expect(withRights).not.toContain('c1'); // dret Q perdut
        const black = Core.premoveTargets('r3k2r/8/8/8/8/8/8/R3K2R w Kq - 0 1', 'e8', 'b');
        expect(black).toContain('c8');
        expect(black).not.toContain('g8');
        const none = Core.premoveTargets('r3k2r/8/8/8/8/8/8/R3K2R w - - 0 1', 'e1', 'w');
        expect(none).not.toContain('g1');
        expect(none).not.toContain('c1');
    });

    test('el rei pot marcar caselles ara atacades (el rival encara ha de moure)', () => {
        // Torre negra a e8 clavant la columna: el rei no hi podria anar ara,
        // però la jugada del rival pot canviar-ho.
        const fen = '4r3/8/8/8/8/8/4K3/7k b - - 0 1';
        expect(Core.premoveTargets(fen, 'e2', 'w')).toContain('e3');
    });

    test('mai marca la casella d\'origen ni surt del tauler', () => {
        const corner = Core.premoveTargets('8/8/8/8/8/8/8/N6k w - - 0 1', 'a1', 'w');
        expect(corner).not.toContain('a1');
        expect(corner.sort()).toEqual(['b3', 'c2']);
        corner.forEach(sq => expect(sq).toMatch(/^[a-h][1-8]$/));
    });

    test('FEN o casella il·legibles no rebenten: llista buida', () => {
        expect(Core.premoveTargets('no-es-una-fen', 'e2', 'w')).toEqual([]);
        expect(Core.premoveTargets(START_FEN, 'z9', 'w')).toEqual([]);
        expect(Core.premoveTargets(START_FEN, null, 'w')).toEqual([]);
        expect(Core.premoveTargets(null, 'e2', 'w')).toEqual([]);
        expect(Core.premoveTargets('rnbqkbnr/pppppppp/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'e2', 'w')).toEqual([]);
    });
});

describe('isPremoveTarget', () => {
    test('accepta els destins generats i rebutja la resta', () => {
        expect(Core.isPremoveTarget(START_FEN, 'g1', 'f3', 'w')).toBe(true);
        expect(Core.isPremoveTarget(START_FEN, 'g1', 'g3', 'w')).toBe(false);
        expect(Core.isPremoveTarget(START_FEN, 'g1', '', 'w')).toBe(false);
        expect(Core.isPremoveTarget(START_FEN, 'g1', 'x0', 'w')).toBe(false);
    });
});

describe('premoveMatchesLegalMove', () => {
    // Quan torna el torn, la premove només es juga si chess.js la valida a la
    // posició REAL: aquí es fa servir el motor de regles de debò.
    function legalMovesFrom(fen, square) {
        return new Chess(fen).moves({ square, verbose: true });
    }

    test('la recaptura marcada es juga quan el rival menja de debò', () => {
        const g = new Chess('rnbqkbnr/pp1ppppp/8/2p5/3P4/5N2/PPP1PPPP/RNBQKB1R b KQkq - 0 1');
        const premove = { from: 'f3', to: 'd4', promotion: 'q' };
        // Es pot marcar mentre el rival pensa, tot i que ara seria il·legal.
        expect(Core.isPremoveTarget(g.fen(), 'f3', 'd4', 'w')).toBe(true);
        expect(Core.premoveMatchesLegalMove(legalMovesFrom(g.fen(), 'f3'), premove)).toBe(false);
        // El rival menja a d4 i la premove passa a ser legal: es juga sola.
        expect(g.move('cxd4')).not.toBeNull();
        expect(Core.premoveMatchesLegalMove(legalMovesFrom(g.fen(), 'f3'), premove)).toBe(true);
    });

    test('si el rival no menja, la mateixa premove s\'anul·la', () => {
        const g = new Chess('rnbqkbnr/pp1ppppp/8/2p5/3P4/5N2/PPP1PPPP/RNBQKB1R b KQkq - 0 1');
        expect(g.move('e6')).not.toBeNull(); // el peó de d4 segueix al seu lloc
        expect(Core.premoveMatchesLegalMove(
            legalMovesFrom(g.fen(), 'f3'), { from: 'f3', to: 'd4' })).toBe(false);
    });

    test('la premove que el rival ha fet impossible es rebutja', () => {
        const g = new Chess();
        g.move('e4'); g.move('e5'); g.move('Nf3');
        // El negre marca ...Cc6; el blanc respon i el cavall segueix podent-hi anar.
        expect(Core.premoveMatchesLegalMove(legalMovesFrom(g.fen(), 'b8'), { from: 'b8', to: 'c6' })).toBe(true);
        // Però una jugada geomètricament impossible mai no passa.
        expect(Core.premoveMatchesLegalMove(legalMovesFrom(g.fen(), 'b8'), { from: 'b8', to: 'c5' })).toBe(false);
    });

    test('la coronació guardada ha de coincidir amb la de la jugada legal', () => {
        const fen = '8/4P3/8/8/8/8/8/K6k w - - 0 1';
        const moves = legalMovesFrom(fen, 'e7');
        expect(Core.premoveMatchesLegalMove(moves, { from: 'e7', to: 'e8', promotion: 'q' })).toBe(true);
        expect(Core.premoveMatchesLegalMove(moves, { from: 'e7', to: 'e8', promotion: 'n' })).toBe(true);
        // Sense coronació explícita, el criteri de l'app és dama.
        expect(Core.premoveMatchesLegalMove(moves, { from: 'e7', to: 'e8' })).toBe(true);
    });

    test('entrades buides o corruptes es rebutgen', () => {
        expect(Core.premoveMatchesLegalMove(null, { from: 'e2', to: 'e4' })).toBe(false);
        expect(Core.premoveMatchesLegalMove([], { from: 'e2', to: 'e4' })).toBe(false);
        expect(Core.premoveMatchesLegalMove(legalMovesFrom(START_FEN, 'e2'), null)).toBe(false);
        expect(Core.premoveMatchesLegalMove(legalMovesFrom(START_FEN, 'e2'), { from: 'e2' })).toBe(false);
    });
});
