const Core = require('../core.js');
const Redactor = require('../redactor.js');
const { Chess } = require('chess.js');

// ---------------------------------------------------------------------------
// Nomenclatura de jugades per veu (v2): font única de veritat + validació +
// auditoria. Les DADES són sempre les mateixes; només canvia la manera de
// descriure la jugada, i mai es pot mostrar una jugada que contradigui el PGN
// ni notació UCI en text visible.
// ---------------------------------------------------------------------------

const board = Core.createPvBoardHelpers(Chess);

// Fets reals d'una jugada (UCI o SAN) sobre una FEN, com fa app.js.
function facts(fen, move) { return board.moveFacts(fen, move); }

describe('descriuJugadaPerVeu — tres registres per a la mateixa jugada', () => {
    // Nxf6+ del cavall de g4 (forquilla-tipus). FEN construïda amb chess.js.
    const gm = new Chess();
    ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'd3', 'Nf6', 'Ng5', 'd5', 'exd5', 'Nxd5', 'Nxf7'].forEach(m => {
        try { gm.move(m); } catch (e) {}
    });

    test('jugada tranquil·la (Nh4) amb dos cavalls: desambigua per casella d\'origen', () => {
        // Cavall de f3 a h4; hi ha també el cavall de b1, així que cal "de f3".
        const g = new Chess();
        ['e4', 'e5', 'Nf3', 'Nc6'].forEach(m => g.move(m));
        const f = facts(g.fen(), 'f3h4');
        expect(f).toBeTruthy();
        expect(f.san).toBe('Nh4');
        const casual = Redactor.descriuJugadaPerVeu(f, { estil: 'casual' });
        const tech = Redactor.descriuJugadaPerVeu(f, { estil: 'technical' });
        expect(casual.accio).toBe('portar el cavall de f3 a h4');
        expect(casual.clausula).toBe('el cavall de f3 va a h4');
        // El registre tècnic diu "es reubica a" en jugades tranquil·les.
        expect(tech.clausula).toBe('el cavall de f3 es reubica a h4');
        // Cap forma no porta color ("blanc"/"negre") ni UCI ni SAN.
        [casual.accio, casual.clausula, tech.accio, tech.clausula].forEach(s => {
            expect(s).not.toMatch(/blanc|negre|negra|blanca/);
            expect(s).not.toMatch(/\b[a-h][1-8][a-h][1-8]\b/);
            expect(s).not.toMatch(/\bNh4\b/);
        });
    });

    test('peça única (dama): sense casella d\'origen', () => {
        // Qh5 (dama única) → sense desambiguació: "portar la dama a h5".
        const g = new Chess();
        ['e4', 'e5'].forEach(m => g.move(m));
        const f = facts(g.fen(), 'd1h5');
        expect(f.san).toBe('Qh5');
        const casual = Redactor.descriuJugadaPerVeu(f, { estil: 'casual' });
        expect(casual.accio).toBe('portar la dama a h5');
        expect(casual.clausula).toBe('la dama va a h5');
    });

    test('captura: "capturar ... a f7 amb el teu cavall" i clausula "captura a f7"', () => {
        // Posició amb Ng5 i peó a f7 negre; Nxf7.
        const g = new Chess('r1bqkb1r/pppp1ppp/2n2n2/4p1N1/2B1P3/8/PPPP1PPP/RNBQK2R w KQkq - 0 5');
        const f = facts(g.fen(), 'g5f7');
        expect(f.san).toBe('Nxf7');
        expect(f.captura).toBe('p');
        // Hi ha dos cavalls blancs (b1 i g5): es desambigua amb "de g5".
        const casual = Redactor.descriuJugadaPerVeu(f, { estil: 'casual' });
        expect(casual.accio).toBe('capturar el peó a f7 amb el cavall de g5');
        expect(casual.clausula).toBe('el cavall de g5 captura a f7');
    });

    test('captura amb un sol cavall: "amb el teu cavall"', () => {
        // Posició amb un únic cavall blanc (a g5) capturant a f7.
        const g = new Chess('r1bqkb1r/pppp1ppp/2n5/4p1N1/2B1P3/8/PPPP1PPP/R1BQK2R w KQkq - 0 6');
        const f = facts(g.fen(), 'g5f7');
        expect(f.san).toBe('Nxf7');
        const casual = Redactor.descriuJugadaPerVeu(f, { estil: 'casual' });
        expect(casual.accio).toBe('capturar el peó a f7 amb el teu cavall');
    });

    test('coronació: "coronar el peó a e8 en dama"', () => {
        const g = new Chess('8/4P3/8/8/8/8/8/k1K5 w - - 0 1');
        const f = facts(g.fen(), 'e7e8q');
        expect(f.san).toMatch(/e8=Q/);
        const casual = Redactor.descriuJugadaPerVeu(f, { estil: 'casual' });
        expect(casual.accio).toBe('coronar el peó a e8 en dama');
    });

    test('mat i escac s\'afegeixen a totes dues formes', () => {
        const g = new Chess();
        ['e4', 'e5', 'Bc4', 'Bc5', 'Qh5', 'Nf6'].forEach(m => g.move(m));
        const f = facts(g.fen(), 'h5f7');
        expect(f.san).toBe('Qxf7#');
        const casual = Redactor.descriuJugadaPerVeu(f, { estil: 'casual' });
        expect(casual.accio).toMatch(/amb escac i mat$/);
        expect(casual.clausula).toMatch(/amb escac i mat$/);
    });

    test('enroc curt i llarg', () => {
        const g = new Chess('rnbqk2r/pppp1ppp/5n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4');
        const f = facts(g.fen(), 'e1g1');
        const casual = Redactor.descriuJugadaPerVeu(f, { estil: 'casual' });
        expect(casual.accio).toBe("fer l'enroc curt");
    });

    test('fets invàlids o buits → null', () => {
        expect(Redactor.descriuJugadaPerVeu(null, { estil: 'casual' })).toBeNull();
        expect(Redactor.descriuJugadaPerVeu({}, { estil: 'casual' })).toBeNull();
    });
});

describe('reviewMoveIdentityOk — cap jugada contradiu el PGN', () => {
    // Historial real (SAN) i FEN de decisió coherents amb cada ply.
    const g = new Chess();
    const line = ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Be7', 'e3', 'O-O',
        'Nf3', 'h6', 'Bh4', 'b6', 'Bd3', 'Bb7', 'O-O', 'Nbd7', 'Rc1', 'c5',
        'Bg3', 'Ne4', 'cxd5', 'exd5', 'Nxe4', 'dxe4'];
    const fensBefore = [];
    line.forEach(san => { fensBefore.push(g.fen()); g.move(san); });
    const historySanAt = ply => (ply >= 0 && ply < line.length ? line[ply] : null);
    const sanForMove = (fen, mv) => { const f = board.moveFacts(fen, mv); return f ? f.san : null; };

    test('accepta un moment que coincideix amb la jugada real', () => {
        // Jugada 1 de blanques (ply 0) = d4.
        const err = { fen: fensBefore[0], moveNumber: 1, playerMove: 'd2d4' };
        expect(Core.reviewMoveIdentityOk(err, { playerColor: 'w', historySanAt, sanForMove })).toBe(true);
    });

    test('accepta una jugada blanca posterior real (Nc3, jugada 3)', () => {
        // Ply 4 = 3a jugada de blanques = Nc3 (b1c3).
        const fen = fensBefore[4];
        const num = parseInt(fen.split(' ')[5], 10); // ha de ser 3
        const err = { fen, moveNumber: num, playerMove: 'b1c3' };
        expect(Core.reviewMoveIdentityOk(err, { playerColor: 'w', historySanAt, sanForMove })).toBe(true);
    });

    test('rebutja una jugada que no és la real de la partida en aquell ply', () => {
        // A la 3a jugada blanca la partida fa Nc3; una altra jugada legal (Nf3)
        // no pot aparèixer com a "jugada feta" d'aquell moment.
        const fen = fensBefore[4];
        const num = parseInt(fen.split(' ')[5], 10);
        const err = { fen, moveNumber: num, playerMove: 'g1f3' };
        expect(Core.reviewMoveIdentityOk(err, { playerColor: 'w', historySanAt, sanForMove })).toBe(false);
    });

    test('el número de jugada ha de coincidir amb el comptador de la FEN', () => {
        const err = { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', moveNumber: 14, playerMove: 'e2e4' };
        expect(Core.reviewMoveIdentityOk(err, {})).toBe(false); // 14 ≠ 1
    });

    test('sense historial ni recalculadora, no es pot contradir res', () => {
        const err = { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', moveNumber: 1, playerMove: 'e2e4' };
        expect(Core.reviewMoveIdentityOk(err, {})).toBe(true);
    });
});

describe('auditReviewVoiceText — guarda de text renderitzat', () => {
    test('en casual, cap UCI ni SAN nua', () => {
        expect(Core.auditReviewVoiceText('vas jugar g4f6', 'casual').ok).toBe(false);
        expect(Core.auditReviewVoiceText('vas jugar Nxf6', 'casual').ok).toBe(false);
        expect(Core.auditReviewVoiceText('la millor era Qd2', 'casual').ok).toBe(false);
        expect(Core.auditReviewVoiceText('vas portar el cavall de f3 a h4', 'casual').ok).toBe(true);
    });

    test('en balanced/technical, la SAN és permesa però no la UCI', () => {
        expect(Core.auditReviewVoiceText('vas jugar Nxf6: el cavall de g4 captura a f6', 'balanced').ok).toBe(true);
        expect(Core.auditReviewVoiceText('vas jugar g4f6', 'technical').ok).toBe(false);
    });

    test('la fletxa maquinal "→" no és permesa en cap veu', () => {
        ['casual', 'balanced', 'technical'].forEach(s => {
            expect(Core.auditReviewVoiceText('la millor era → Qd2', s).ok).toBe(false);
        });
    });

    test('la construcció "vas jugar el cavall ... va a ..." es detecta', () => {
        expect(Core.auditReviewVoiceText('vas jugar el cavall blanc de f3 va a h4', 'balanced').ok).toBe(false);
        expect(Core.auditReviewVoiceText('vas jugar la dama va a h5', 'technical').ok).toBe(false);
    });

    test('el text tallat amb el·lipsi es detecta', () => {
        expect(Core.auditReviewVoiceText('la millor era portar la dama a…', 'casual').ok).toBe(false);
    });

    test('una casella solta en llenguatge natural és vàlida en casual', () => {
        expect(Core.auditReviewVoiceText('porta el cavall a f7 amb escac', 'casual').ok).toBe(true);
    });
});
