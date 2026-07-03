const Core = require('../core.js');
const Redactor = require('../redactor.js');
const { Chess } = require('chess.js');

// ---------------------------------------------------------------------------
// Línies del motor (PV): forçada, il·lustrativa o sense prou dades
// ---------------------------------------------------------------------------
// El cas que motiva tot això: Stockfish dona una PV com "Bf4 Qxh2+ Kxh2" i la
// ressenya deia "la línia guanyadora era...". Però Qxh2+ NO és una jugada
// obligada del rival: és només la variant principal del motor. La ressenya ha
// de dir "una possible variant del motor és..." i reservar "seqüència forçada"
// per als casos demostrats (única jugada legal o mat verificat).

const board = Core.createPvBoardHelpers(Chess);

// Posició A — il·lustrativa: després de Bf4 el rival té 32 respostes legals;
// la PV segueix amb Qxh2+ (captura de peó amb escac) i Kxh2 (el rei captura la
// dama), però res no obliga el rival a jugar Qxh2+.
const FEN_A = 'r5k1/5ppp/8/8/7q/8/5PPP/2B2RK1 w - - 0 1';
const PV_A = ['c1f4', 'h4h2', 'g1h2'];

// Posició C — única resposta legal: Qd5+ és escac i el rival només té Kh8.
const FEN_C = 'r5k1/6pp/8/8/8/8/6PP/3Q1RK1 w - - 0 1';
const PV_C = ['d1d5', 'g8h8', 'd5d7'];

// Posició B — mat forçat verificable amb chess.js: Qd5+ Kh8 (única) i Rf8#.
const FEN_B = '6k1/6pp/8/8/8/8/6PP/3Q1RK1 w - - 0 1';
const PV_B = ['d1d5', 'g8h8', 'f1f8'];

describe('createPvBoardHelpers.pvBoardFacts — fets verificables de la PV', () => {
    test('posició A: la resposta del rival NO és única i la línia no acaba en mat', () => {
        const facts = board.pvBoardFacts(FEN_A, PV_A);
        expect(facts.pliesVerified).toBe(3);
        expect(facts.opponentLegalReplies).toBe(32);
        expect(facts.replyIsOnlyLegal).toBe(false);
        expect(facts.opponentInCheck).toBe(false);
        expect(facts.pvEndsInMate).toBe(false);
        // La resposta de la PV és una captura amb escac (però no de dama).
        expect(facts.replyIsCheck).toBe(true);
        expect(facts.replyIsCapture).toBe(true);
        expect(facts.replyCapturesQueen).toBe(false);
    });

    test('posició C: el rival estava en escac i només tenia una resposta legal', () => {
        const facts = board.pvBoardFacts(FEN_C, PV_C);
        expect(facts.opponentInCheck).toBe(true);
        expect(facts.opponentLegalReplies).toBe(1);
        expect(facts.replyIsOnlyLegal).toBe(true);
        expect(facts.firstMoveIsCheck).toBe(true);
    });

    test('posició B: la línia acaba en mat fet pel jugador', () => {
        const facts = board.pvBoardFacts(FEN_B, PV_B);
        expect(facts.pvEndsInMate).toBe(true);
    });

    test('un mat REBUT pel jugador no compta com a línia forçada seva', () => {
        // 1.f3 e5 2.g4?? Qh4# — la PV des d\'abans de g4 acaba amb mat del rival.
        const fen = 'rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2';
        const facts = board.pvBoardFacts(fen, ['g2g4', 'd8h4']);
        expect(facts.pvEndsInMate).toBe(false);
    });

    test('una PV il·legal no verifica cap ply', () => {
        const facts = board.pvBoardFacts(FEN_A, ['a1a8']);
        expect(facts.pliesVerified).toBe(0);
        expect(facts.opponentLegalReplies).toBeNull();
    });
});

describe('computePvForcingInfo — demostració prudent del forçament', () => {
    test('resposta única legal → forçada', () => {
        const info = Core.computePvForcingInfo({ opponentLegalReplies: 1 });
        expect(info.isOpponentReplyForced).toBe(true);
        expect(info.isLineForced).toBe(true);
        expect(info.replyIsOnlyLegal).toBe(true);
    });

    test('gap gran de la resposta (MultiPV) → forçada', () => {
        const info = Core.computePvForcingInfo({
            opponentLegalReplies: 12,
            replyAlternatives: [{ eval: 500, evalType: 'cp' }, { eval: 100, evalType: 'cp' }]
        });
        expect(info.opponentReplyGapCp).toBe(400);
        expect(info.isOpponentReplyForced).toBe(true);
        expect(info.isLineForced).toBe(true);
    });

    test('gap petit → NO forçada (il·lustrativa)', () => {
        const info = Core.computePvForcingInfo({
            opponentLegalReplies: 12,
            replyAlternatives: [{ eval: -40, evalType: 'cp' }, { eval: -70, evalType: 'cp' }]
        });
        expect(info.opponentReplyGapCp).toBe(30);
        expect(info.isOpponentReplyForced).toBe(false);
        expect(info.isLineForced).toBe(false);
    });

    test('una sola línia de resposta amb més jugades legals NO demostra res', () => {
        // bestLineGapCp retorna Infinity amb una sola opció, però si el rival
        // té 20 jugades legals el gap real és desconegut: no es pot dir "forçat".
        const info = Core.computePvForcingInfo({
            opponentLegalReplies: 20,
            replyAlternatives: [{ eval: 300, evalType: 'cp' }]
        });
        expect(info.opponentReplyGapCp).toBeNull();
        expect(info.isOpponentReplyForced).toBe(false);
        expect(info.isLineForced).toBe(false);
    });

    test('sense cap dada → tot queda desconegut (null)', () => {
        const info = Core.computePvForcingInfo({});
        expect(info.isOpponentReplyForced).toBeNull();
        expect(info.isLineForced).toBeNull();
        expect(info.replyIsOnlyLegal).toBeNull();
    });

    test('mat a favor demostrat → línia forçada encara que la resposta tingui opcions', () => {
        const info = Core.computePvForcingInfo({ opponentLegalReplies: 5, mateForPlayer: true });
        expect(info.isLineForced).toBe(true);
        expect(info.endsInMate).toBe(true);
    });

    test('el gap de la millor jugada es calcula amb el MultiPV de la decisió', () => {
        const info = Core.computePvForcingInfo({
            multipvBefore: [{ eval: 300, evalType: 'cp' }, { eval: 120, evalType: 'cp' }]
        });
        expect(info.bestMoveGapCp).toBe(180);
    });
});

describe('classifyPvLanguage', () => {
    const pv = ['c1f4', 'h4h2', 'g1h2'];

    test('forçada quan està demostrat', () => {
        expect(Core.classifyPvLanguage({ bestPv: pv, forcingInfo: { isLineForced: true } })).toBe('forced');
    });

    test('il·lustrativa quan la línia és real però no demostrada com a forçada', () => {
        expect(Core.classifyPvLanguage({ bestPv: pv, forcingInfo: { isLineForced: false } })).toBe('illustrative');
    });

    test('sense dades de forçament → unclear', () => {
        expect(Core.classifyPvLanguage({ bestPv: pv })).toBe('unclear');
        expect(Core.classifyPvLanguage({ bestPv: pv, forcingInfo: { isLineForced: null } })).toBe('unclear');
    });

    test('sense línia més enllà de la millor jugada → unclear', () => {
        expect(Core.classifyPvLanguage({ bestPv: ['c1f4'], forcingInfo: { isLineForced: true } })).toBe('unclear');
        expect(Core.classifyPvLanguage({})).toBe('unclear');
    });
});

describe('PV tipus "Bf4 Qxh2+ Kxh2" — el text NO pot dir que era forçada', () => {
    test('la resposta del rival no era obligada → llenguatge il·lustratiu', () => {
        const forcingInfo = Core.buildPvForcingInfo({
            fen: FEN_A,
            bestPv: PV_A,
            multipvBefore: [{ eval: 90, evalType: 'cp' }, { eval: 40, evalType: 'cp' }],
            // El motor diu que altres respostes del rival eren gairebé igual de
            // bones: el gap no demostra res.
            replyAlternatives: [{ eval: -40, evalType: 'cp' }, { eval: -70, evalType: 'cp' }],
            evalBefore: 90,
            board
        });
        expect(forcingInfo.isOpponentReplyForced).toBe(false);
        expect(forcingInfo.isLineForced).toBe(false);

        const lang = Core.classifyPvLanguage({ bestPv: PV_A, forcingInfo });
        expect(lang).toBe('illustrative');

        const text = Core.pvNarrationText(lang, { lineText: 'l’alfil blanc va a f4, i la dama negra captura el peó a h2 amb escac (Qxh2+), i el rei blanc captura la dama a h2 (Kxh2)' });
        expect(text).toContain('possible variant');
        expect(text.toLowerCase()).not.toContain('forçad');
        expect(text.toLowerCase()).not.toContain('guanyadora');
        expect(text.toLowerCase()).not.toContain('obligat');
        expect(text.toLowerCase()).not.toContain('única resposta');
    });

    test('sense anàlisi de la resposta, els fets del tauler ja neguen el forçament', () => {
        // Cap replyAlternatives (partida en viu): chess.js veu 32 respostes
        // legals i cap mat, així que "forçada" queda com a no demostrat.
        const forcingInfo = Core.buildPvForcingInfo({ fen: FEN_A, bestPv: PV_A, evalBefore: 90, board });
        expect(forcingInfo.isLineForced).toBe(false);
        expect(Core.classifyPvLanguage({ bestPv: PV_A, forcingInfo })).toBe('illustrative');
    });
});

describe('mat forçat — aquí sí que es pot dir "forçada"', () => {
    test('mat verificat amb chess.js sobre la PV', () => {
        const forcingInfo = Core.buildPvForcingInfo({ fen: FEN_B, bestPv: PV_B, board });
        expect(forcingInfo.endsInMate).toBe(true);
        expect(forcingInfo.isLineForced).toBe(true);

        const lang = Core.classifyPvLanguage({ bestPv: PV_B, forcingInfo });
        expect(lang).toBe('forced');
        const text = Core.pvNarrationText(lang, { lineText: 'la dama blanca va a d5 amb escac, i el rei negre va a h8, i la torre blanca va a f8 amb escac i mat' });
        expect(text).toContain('La seqüència forçada era');
    });

    test('mat anunciat pel motor (score mate) també és demostració', () => {
        const forcingInfo = Core.buildPvForcingInfo({
            fen: FEN_B,
            bestPv: PV_B,
            evalBefore: 2,
            evalBeforeType: 'mate'
        });
        expect(forcingInfo.isLineForced).toBe(true);
    });
});

describe('única jugada legal — aquí sí que es pot dir "única resposta"', () => {
    test('la posició C força el rei a h8 i el text ho diu', () => {
        const forcingInfo = Core.buildPvForcingInfo({ fen: FEN_C, bestPv: PV_C, evalBefore: 350, board });
        expect(forcingInfo.opponentInCheck).toBe(true);
        expect(forcingInfo.replyIsOnlyLegal).toBe(true);
        expect(forcingInfo.isLineForced).toBe(true);

        const lang = Core.classifyPvLanguage({ bestPv: PV_C, forcingInfo });
        expect(lang).toBe('forced');
        const text = Core.pvNarrationText(lang, {
            lineText: 'la dama blanca va a d5 amb escac, i el rei negre va a h8, i la dama blanca va a d7',
            replyIsOnlyLegal: forcingInfo.replyIsOnlyLegal
        });
        expect(text).toContain('La seqüència forçada era');
        expect(text).toContain('l’única legal');
    });
});

describe('"perduda igualment" — la línia no és forçada però el resultat sí', () => {
    test('si la millor resposta del rival ja el deixa perdut, totes el deixen', () => {
        const info = Core.computePvForcingInfo({
            opponentLegalReplies: 25,
            // Perspectiva del rival: fins i tot la millor opció està a -450.
            replyAlternatives: [{ eval: -450, evalType: 'cp' }, { eval: -520, evalType: 'cp' }]
        });
        expect(info.allRepliesLosing).toBe(true);
        // El gap entre respostes és petit: la LÍNIA continua sense ser forçada.
        expect(info.isLineForced).toBe(false);
    });

    test('si el rival té una resposta que aguanta, no es pot dir "perduda igualment"', () => {
        const info = Core.computePvForcingInfo({
            opponentLegalReplies: 25,
            replyAlternatives: [{ eval: -40, evalType: 'cp' }, { eval: -350, evalType: 'cp' }]
        });
        expect(info.allRepliesLosing).toBe(false);
    });

    test('mat en contra del rival a totes les respostes → perduda igualment', () => {
        const info = Core.computePvForcingInfo({
            opponentLegalReplies: 8,
            replyAlternatives: [{ eval: -3, evalType: 'mate' }, { eval: -2, evalType: 'mate' }]
        });
        expect(info.allRepliesLosing).toBe(true);
    });

    test('també es demostra amb evalAfterBest (perspectiva del jugador)', () => {
        expect(Core.computePvForcingInfo({ evalAfterBest: 600 }).allRepliesLosing).toBe(true);
        expect(Core.computePvForcingInfo({ evalAfterBest: 150 }).allRepliesLosing).toBe(false);
    });

    test('sense dades queda desconegut', () => {
        expect(Core.computePvForcingInfo({}).allRepliesLosing).toBeNull();
    });

    test('el text il·lustratiu es reforça sense dir mai "forçada"', () => {
        const forcingInfo = Core.buildPvForcingInfo({
            fen: FEN_A,
            bestPv: PV_A,
            replyAlternatives: [{ eval: -450, evalType: 'cp' }, { eval: -520, evalType: 'cp' }],
            evalBefore: 450,
            board
        });
        expect(forcingInfo.isLineForced).toBe(false);
        expect(forcingInfo.allRepliesLosing).toBe(true);

        const lang = Core.classifyPvLanguage({ bestPv: PV_A, forcingInfo });
        expect(lang).toBe('illustrative');
        const text = Core.pvNarrationText(lang, {
            lineText: 'l’alfil blanc va a f4, i la dama negra captura el peó a h2 amb escac (Qxh2+), i el rei blanc captura la dama a h2 (Kxh2)',
            allRepliesLosing: forcingInfo.allRepliesLosing
        });
        expect(text).toContain('possible variant');
        expect(text).toContain('totes el deixaven igual de perdut');
        expect(text.toLowerCase()).not.toContain('forçad');
    });

    test('sense el reforç, el text il·lustratiu queda com abans', () => {
        const text = Core.pvNarrationText('illustrative', { lineText: 'una línia', allRepliesLosing: false });
        expect(text).toBe('Una possible variant del motor és una línia.');
    });
});

describe('sense prou dades — no s\'explica la PV', () => {
    test('unclear cau a "la millor jugada era..."', () => {
        const text = Core.pvNarrationText('unclear', {
            lineText: 'una línia que no s\'ha de mostrar',
            bestText: 'l’alfil blanc va a f4 (Bf4)'
        });
        expect(text).toBe('La millor jugada era l’alfil blanc va a f4 (Bf4).');
        expect(text).not.toContain('línia que no s\'ha de mostrar');
    });

    test('sense línia ni millor jugada no es diu res', () => {
        expect(Core.pvNarrationText('unclear', {})).toBe('');
        expect(Core.pvNarrationText('forced', {})).toBe('');
    });
});

// ---------------------------------------------------------------------------
// Redacció catalana dels moviments: color de la peça i peça capturada
// ---------------------------------------------------------------------------
describe('descriuMovimentFets — redacció catalana sense ambigüitats', () => {
    // FEN de la posició A després de Bf4 (li toca al rival).
    const fenAfterBf4 = new Chess(FEN_A);
    fenAfterBf4.move({ from: 'c1', to: 'f4' });

    test('"la dama negra captura el peó a h2 amb escac" (no pas "la dama captura a h2")', () => {
        const facts = board.moveFacts(fenAfterBf4.fen(), 'h4h2');
        const text = Redactor.descriuMovimentFets(facts);
        expect(text).toBe('la dama negra captura el peó a h2 amb escac');
    });

    test('"el rei blanc captura la dama a h2" (s\'anomena la peça capturada)', () => {
        const g = new Chess(fenAfterBf4.fen());
        g.move({ from: 'h4', to: 'h2' });
        const facts = board.moveFacts(g.fen(), 'g1h2');
        expect(facts.san).toBe('Kxh2');
        const text = Redactor.descriuMovimentFets(facts);
        expect(text).toBe('el rei blanc captura la dama a h2');
    });

    test('moviments sense captura: color sempre explícit', () => {
        expect(Redactor.descriuMovimentFets(board.moveFacts(FEN_A, 'c1f4'))).toBe("l'alfil blanc va a f4");
        expect(Redactor.descriuMovimentFets(board.moveFacts(FEN_C, 'd1d5'))).toBe('la dama blanca va a d5 amb escac');
        const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
        expect(Redactor.descriuMovimentFets(board.moveFacts(start, 'e2e4'))).toBe('el peó blanc de la columna e avança a e4');
    });

    test('mat i enroc', () => {
        const g = new Chess(FEN_B);
        g.move({ from: 'd1', to: 'd5' });
        g.move({ from: 'g8', to: 'h8' });
        const facts = board.moveFacts(g.fen(), 'f1f8');
        expect(Redactor.descriuMovimentFets(facts)).toBe('la torre blanca va a f8 amb escac i mat');
        const startCastle = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
        expect(Redactor.descriuMovimentFets(board.moveFacts(startCastle, 'e1g1'))).toBe('enroc curt');
    });

    test('desambiguació per casella d\'origen quan hi ha dues peces iguals', () => {
        const twoKnights = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
        expect(Redactor.descriuMovimentFets(board.moveFacts(twoKnights, 'g1f3'))).toBe('el cavall blanc de g1 va a f3');
    });
});
