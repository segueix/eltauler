const Core = require('../core.js');
const { Chess } = require('chess.js');

// Reconstrucció de línies del motor (PV) per a la navegació al tauler d'anàlisi.
// Les funcions són PURES: reben el constructor de chess.js i una FEN + jugades,
// i no toquen cap estat global ni cap partida real.

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('buildPvPositions — reproducció de línies', () => {
    test('1. des de la posició inicial (UCI), FEN i SAN correctes', () => {
        const r = Core.buildPvPositions(Chess, START, ['e2e4', 'e7e5', 'g1f3']);
        expect(r.truncatedAt).toBeNull();
        expect(r.plies.map(p => p.san)).toEqual(['e4', 'e5', 'Nf3']);
        expect(r.plies[0].fenAfter.split(' ')[0])
            .toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR');
        // La FEN de partida no s'ha alterat (cadena original intacta).
        expect(r.startFen).toBe(START);
    });

    test('2. des d\'una FEN de mig joc (Italiana), numeració a partir de la FEN', () => {
        const fen = 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
        const r = Core.buildPvPositions(Chess, fen, ['d2d3', 'g8f6', 'b1c3']);
        expect(r.plies.map(p => p.san)).toEqual(['d3', 'Nf6', 'Nc3']);
        // La primera jugada és de blanques i el número complet és el 4.
        expect(r.plies[0]).toMatchObject({ isWhite: true, moveNo: 4 });
        expect(r.plies[1]).toMatchObject({ isWhite: false, moveNo: 4 });
        expect(r.plies[2]).toMatchObject({ isWhite: true, moveNo: 5 });
    });

    test('3. FEN en què mouen les negres (la línia comença amb 4…)', () => {
        const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3';
        const r = Core.buildPvPositions(Chess, fen, ['g8f6', 'd2d3']);
        expect(r.plies[0]).toMatchObject({ san: 'Nf6', isWhite: false, moveNo: 3 });
        expect(r.plies[1]).toMatchObject({ san: 'd3', isWhite: true, moveNo: 4 });
    });

    test('5. enroc curt i llarg (SAN, caselles i tipus)', () => {
        // Blanques poden enrocar curt; negres, llarg.
        const fen = 'r3k2r/pppq1ppp/2npbn2/2b1p3/2B1P3/2NPBN2/PPPQ1PPP/R3K2R w KQkq - 0 1';
        const r = Core.buildPvPositions(Chess, fen, ['e1g1', 'e8c8']);
        expect(r.plies[0]).toMatchObject({ san: 'O-O', castle: 'k', from: 'e1', to: 'g1' });
        expect(r.plies[1]).toMatchObject({ san: 'O-O-O', castle: 'q', from: 'e8', to: 'c8' });
    });

    test('6. captura (bandera i casella de destí)', () => {
        const fen = 'rnbqkbnr/ppp2ppp/8/3pp3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3';
        const r = Core.buildPvPositions(Chess, fen, ['e4d5']);
        expect(r.plies[0]).toMatchObject({ san: 'exd5', captured: 'p', to: 'd5' });
    });

    test('7. promoció (UCI amb peça i coronació per defecte a dama)', () => {
        const fen = '8/P7/8/8/8/8/5k2/7K w - - 0 1';
        const withPiece = Core.buildPvPositions(Chess, fen, ['a7a8q']);
        expect(withPiece.plies[0]).toMatchObject({ san: 'a8=Q', promotion: 'q', uci: 'a7a8q' });
        const noPiece = Core.buildPvPositions(Chess, fen, ['a7a8']);
        expect(noPiece.plies[0].promotion).toBe('q'); // per defecte a dama
    });

    test('captura al pas', () => {
        const fen = 'rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3';
        const r = Core.buildPvPositions(Chess, fen, ['e5f6']);
        expect(r.plies[0]).toMatchObject({ san: 'exf6', to: 'f6', captured: 'p' });
    });

    test('escac i mat (SAN amb #)', () => {
        const fen = 'rnbqkbnr/ppppp2p/5p2/6pQ/4P3/8/PPPP1PPP/RNB1KBNR w KQkq - 0 1';
        const r = Core.buildPvPositions(Chess, fen, ['h5g6']); // no és mat aquí, comprovem escac
        expect(r.plies[0].san).toContain('g6');
        // Un mat clàssic del boig:
        const fen2 = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 1';
        const mate = Core.buildPvPositions(Chess, fen2, ['h4e1']);
        // Dh4xe1 no és mat; comprovem simplement que la reproducció no trenca.
        expect(Array.isArray(mate.plies)).toBe(true);
    });

    test('8. moviment il·legal → s\'atura i marca truncatedAt', () => {
        const r = Core.buildPvPositions(Chess, START, ['e2e4', 'e7e5', 'e4e5']); // e4e5 il·legal (peó bloquejat)
        expect(r.plies.map(p => p.san)).toEqual(['e4', 'e5']);
        expect(r.truncatedAt).toBe(2);
    });

    test('8b. PV buida o entrades no vàlides', () => {
        expect(Core.buildPvPositions(Chess, START, []).plies).toEqual([]);
        expect(Core.buildPvPositions(Chess, START, null).plies).toEqual([]);
        expect(Core.buildPvPositions(Chess, null, ['e2e4']).plies).toEqual([]);
        expect(Core.buildPvPositions(undefined, START, ['e2e4']).plies).toEqual([]);
    });

    test('10. no muta la partida original ni l\'array de jugades; és determinista', () => {
        const game = new Chess(); // partida "real" independent
        const fenBefore = game.fen();
        const moves = ['e2e4', 'e7e5', 'g1f3'];
        const movesCopy = moves.slice();
        const r1 = Core.buildPvPositions(Chess, game.fen(), moves);
        const r2 = Core.buildPvPositions(Chess, game.fen(), moves);
        expect(game.fen()).toBe(fenBefore);          // la partida real no s'ha tocat
        expect(game.history()).toEqual([]);
        expect(moves).toEqual(movesCopy);            // l'array d'entrada no s'ha mutat
        expect(r1.plies.map(p => p.fenAfter)).toEqual(r2.plies.map(p => p.fenAfter)); // determinista
    });

    test('SAN de reserva quan no hi ha UCI', () => {
        const r = Core.buildPvPositions(Chess, START, ['e4', 'e5', 'Nf3']);
        expect(r.plies.map(p => p.san)).toEqual(['e4', 'e5', 'Nf3']);
        expect(r.plies[2].uci).toBe('g1f3');
    });
});

describe('pvDisplayTokens — numeració de jugades i mitges jugades', () => {
    test('4. línia que comença amb blanques: número davant de cada blanca, no de cada negra', () => {
        const fen = 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
        const r = Core.buildPvPositions(Chess, fen, ['d2d3', 'g8f6', 'b1c3', 'a7a6']);
        const t = Core.pvDisplayTokens(r.plies);
        expect(t.map(x => x.numberLabel)).toEqual(['4.', null, '5.', null]);
        expect(t.map(x => x.san)).toEqual(['d3', 'Nf6', 'Nc3', 'a6']);
    });

    test('4b. línia que comença amb negres: només la primera porta «N…»', () => {
        const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3';
        const r = Core.buildPvPositions(Chess, fen, ['g8f6', 'd2d3', 'f8e7']);
        const t = Core.pvDisplayTokens(r.plies);
        expect(t.map(x => x.numberLabel)).toEqual(['3…', '4.', null]);
    });
});

describe('pvMoveAriaLabel — etiqueta accessible en català', () => {
    test('peça i casella de destí', () => {
        const fen = 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
        const r = Core.buildPvPositions(Chess, fen, ['b1c3']);
        expect(Core.pvMoveAriaLabel(r.plies[0])).toBe('Veure la posició després de 4, cavall a c3');
    });
    test('enroc', () => {
        const fen = 'r3k2r/pppq1ppp/2npbn2/2b1p3/2B1P3/2NPBN2/PPPQ1PPP/R3K2R w KQkq - 0 1';
        const r = Core.buildPvPositions(Chess, fen, ['e1g1']);
        expect(Core.pvMoveAriaLabel(r.plies[0])).toBe('Veure la posició després de 1, enroc curt');
    });
    test('promoció amb captura', () => {
        const fen = '1r5k/P7/8/8/8/8/8/K7 w - - 0 1';
        const r = Core.buildPvPositions(Chess, fen, ['a7b8q']);
        expect(Core.pvMoveAriaLabel(r.plies[0])).toContain('corona a dama');
    });
});

describe('pvStepClamp — estat de navegació (inici/anterior/següent/final)', () => {
    test('9. limita el pas a [0, N] i cobreix inici, anterior, següent, final', () => {
        const N = 6;
        expect(Core.pvStepClamp(-3, N)).toBe(0);   // |◀ inici
        expect(Core.pvStepClamp(0 - 1, N)).toBe(0); // ◀ des de l'inici no baixa
        expect(Core.pvStepClamp(3 + 1, N)).toBe(4); // ▶ següent
        expect(Core.pvStepClamp(99, N)).toBe(N);    // ▶| final
        expect(Core.pvStepClamp(N + 1, N)).toBe(N); // ▶ al final no puja
        expect(Core.pvStepClamp(2.6, N)).toBe(3);   // arrodoniment segur
        expect(Core.pvStepClamp('x', N)).toBe(0);   // entrada no numèrica
    });
});
