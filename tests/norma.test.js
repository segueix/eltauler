const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ---------------------------------------------------------------------------
// Joc vista: la Norma (principi que guia la jugada) i la Pista (la jugada de
// Stockfish). La Norma marca al tauler on s'aplica i, quan jugues, diu si
// l'has seguida. Aquí es prova el catàleg de normes amb una radiografia
// simulada i que els botons duen les icones del joc d'icones de l'app.
// ---------------------------------------------------------------------------

const app = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

function loadPrinciples() {
    const helpersStart = app.indexOf('const NORMA_CENTER');
    const helpersEnd = app.indexOf('// Clon de la posició actual amb el torn forçat');
    const start = app.indexOf('const NORMA_PRINCIPLES = [');
    const end = app.indexOf('const NORMA_FALLBACK');
    const ctx = {
        PIECE_VALUE: { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 },
        normaPieceName: t => ({ p: 'el peó', n: 'el cavall', b: "l'alfil", r: 'la torre', q: 'la dama', k: 'el rei' }[t]),
        game: { get: () => null }
    };
    vm.createContext(ctx);
    vm.runInContext(app.slice(helpersStart, helpersEnd) + '\n' + app.slice(start, end) + '\nthis.P = NORMA_PRINCIPLES;', ctx);
    return ctx.P;
}

function baseCtx(over) {
    return Object.assign({
        my: 'w', opp: 'b', pieces: [], mine: [], theirs: [], plies: 2, inCheck: false,
        myMaterial: 39, oppMaterial: 39, queensOn: true, oppQueenOn: true, heavyTotal: 62,
        myKingSq: 'e1', oppKingSq: 'e8', castlingField: 'KQkq', endgame: false, opening: true, middlegame: false,
        undevelopedMinors: [['b1', 'n'], ['g1', 'n'], ['c1', 'b'], ['f1', 'b']], oppUndevelopedMinors: [],
        castled: false, canCastle: true, myPawns: [], oppPawns: [], centerPresence: 0, openFiles: [], semiOpenFiles: [],
        myRooks: [], rookOnOpenFile: false, doubledFiles: [], isolatedPawns: [], passedPawns: [],
        myQueenOutEarly: false, oppQueenOutEarly: false, rimKnights: [], blockedBishops: 0, shieldIntact: null,
        myMoves: [], checksAvailable: 0, capturesAvailable: 0, winningCaptures: [], hangingMine: [], loosePieces: [],
        kingZoneAttackers: 0, pawnTension: false
    }, over || {});
}
const rule = (P, id) => P.find(r => r.id === id);
const mv = (piece, from, to, extra) => Object.assign({ piece, from, to, flags: 'n', color: 'w' }, extra || {});

describe('la Norma: on s’aplica i si la jugada la segueix', () => {
    const P = loadPrinciples();

    test('desenvolupa: marca les peces menors a casa; treure-les la segueix, un peó de banda no', () => {
        const n = rule(P, 'desenvolupa').build(baseCtx());
        expect(n.squares.sort()).toEqual(['b1', 'c1', 'f1', 'g1']);
        expect(n.obeys(mv('n', 'g1', 'f3'))).toBe(true);
        expect(n.obeys(mv('p', 'h2', 'h4'))).toBe(false);
        expect(n.obeys(mv('q', 'd1', 'h5'))).toBe(false);
        expect(n.obeys(mv('p', 'e2', 'e4'))).toBeNull();
    });

    test('peça amenaçada: es comprova a la posició resultant', () => {
        const n = rule(P, 'peca_penjada').build(baseCtx({ hangingMine: [{ sq: 'e4', type: 'p', value: 1 }] }));
        expect(n.squares).toEqual(['e4']);
        expect(n.obeys(mv('p', 'h2', 'h4'), () => ({ hangingMine: [{ sq: 'e4' }], loosePieces: [] }))).toBe(false);
        expect(n.obeys(mv('n', 'b1', 'c3'), () => ({ hangingMine: [], loosePieces: [] }))).toBe(true);
        expect(n.obeys(mv('p', 'e4', 'e5'), () => ({ hangingMine: [{ sq: 'e4' }], loosePieces: [] }))).toBe(true);
    });

    test('enroca, captura gratis, centre i escut del rei', () => {
        const enroca = rule(P, 'defensa_rei').build(baseCtx({ plies: 8 }));
        expect(enroca.obeys(mv('k', 'e1', 'g1', { flags: 'k' }))).toBe(true);
        expect(enroca.obeys(mv('k', 'e1', 'e2'))).toBe(false);
        const cap = rule(P, 'captura_gratis').build(baseCtx({ winningCaptures: [{ move: { from: 'f3', to: 'e5' }, net: 3 }] }));
        expect(cap.squares).toEqual(['f3', 'e5']);
        expect(cap.obeys(mv('n', 'f3', 'e5', { captured: 'n' }))).toBe(true);
        expect(cap.obeys(mv('p', 'a2', 'a3'))).toBe(false);
        const centre = rule(P, 'centre').build(baseCtx());
        expect(centre.squares).toEqual(['d4', 'e4', 'd5', 'e5']);
        expect(centre.obeys(mv('p', 'd2', 'd4'))).toBe(true);
        const escut = rule(P, 'escut_del_rei').build(baseCtx({ castled: true, myKingSq: 'g1', shieldIntact: true, opening: false, middlegame: true }));
        expect(escut.squares).toEqual(['f2', 'g2', 'h2']);
        expect(escut.obeys(mv('p', 'g2', 'g4'))).toBe(false);
    });
});

describe('Norma i Pista: botons, icones i textos', () => {
    test('icones del joc d’icones: escaire per a la Norma, bombeta per a la Pista', () => {
        expect(html).toMatch(/<symbol id="ic-norma"/);
        expect(html).toMatch(/id="btn-norma"[^>]*><svg class="btn-ic"[^>]*><use href="#ic-norma"\/><\/svg>Norma<\/button>/);
        expect(html).toMatch(/id="btn-hint"[^>]*><svg class="btn-ic"[^>]*><use href="#ic-bulb"\/><\/svg>Pista<\/button>/);
        expect(html).not.toContain('📜 Norma');
        expect(html).not.toContain('>💡 Pista<');
    });
    test('el bàner mostra el resultat i l’app connecta el veredicte amb l’índex Stockfish', () => {
        expect(html).toContain('id="norma-result"');
        expect(app).toMatch(/const normaVerdict = normaVerdictForLastMove\(green\);/);
        expect(app).toMatch(/positionalPendingNormaIntro === 'auto'/);
        expect(app).toMatch(/norma\.obeys\(last, after\)/);
    });
});
