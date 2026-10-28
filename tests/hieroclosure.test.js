const { Chess } = require('chess.js');
const H = require('../hieroclosure');
const Core = require('../core');
// Un jeroglífic són sempre tres jugades del jugador amb dues rèpliques entremig.
const mate3 = { fen: 'rnb1kb1r/pp3ppp/2p5/4q3/4n3/3Q4/PPPB1PPP/2KR1BNR w kq - 0 9',
    solutionMoves: ['d3d8', 'd2g5', 'g5d8'], replyMoves: ['e8d8', 'd8c7'] };
const win3 = { fen: 'r5k1/8/8/8/8/8/8/R5K1 w - - 0 1', solutionMoves: ['g1f2', 'f2e2', 'a1a8'], replyMoves: ['g8f7', 'f7e7'] };
const black3 = { fen: 'r5k1/8/8/8/8/8/8/R5K1 b - - 0 1', solutionMoves: ['g8f7', 'f7e7', 'a8a1'], replyMoves: ['g1f2', 'f2e2'] };
const twoMates3 = { fen: '6k1/8/5K2/8/8/8/8/1Q6 w - - 0 1', solutionMoves: ['f6g6', 'b1b2', 'b2b8'], replyMoves: ['g8h8', 'h8g8'] };
// Formats antics d'una sola jugada: ja no són jeroglífics.
const mate1 = { fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', solutionMoves: ['d1d8'], replyMoves: [] };
const win1 = { fen: 'r5k1/8/8/8/8/8/8/R5K1 w - - 0 1', solutionMoves: ['a1a8'], replyMoves: [] };
const a = (move, value, type = 'cp', depth = 16) => ({ move, eval: value, evalType: type, depth, pv: [move] });
const analysis = (...alternatives) => ({ bestMove: alternatives[0], alternatives });
const verifier = H.createVerifier(Chess);
// Anàlisis del mat en tres (jugador, rival, jugador, rival, jugador).
const mateRows = () => [
    analysis(a('d3d8', 3, 'mate'), a('d1e1', 136)), analysis(a('e8d8', -2, 'mate')),
    analysis(a('d2g5', 2, 'mate'), a('d2f4', -1098)), analysis(a('d8c7', -1, 'mate')),
    analysis(a('g5d8', 1, 'mate'), a('g1f3', -1585))
];
const mockRows = rows => { const fn = jest.fn(); rows.forEach(row => fn.mockResolvedValueOnce(row)); return fn; };

describe('sempre tres jugades', () => {
    test('només una línia de tres jugades del jugador i dues rèpliques és un jeroglífic', () => {
        expect(H.PLAYER_MOVES).toBe(3);
        expect(H.hasThreeMoves(mate3)).toBe(true);
        expect(H.hasThreeMoves(mate1)).toBe(false);
        expect(H.hasThreeMoves({ ...mate3, replyMoves: ['e8d8'] })).toBe(false);
        expect(H.hasThreeMoves({ ...mate3, solutionMoves: ['d3d8', 'd2g5'], replyMoves: ['e8d8'] })).toBe(false);
        expect(H.hasThreeMoves({ ...mate3, solutionMoves: [...mate3.solutionMoves, 'a2a3'], replyMoves: [...mate3.replyMoves, 'a7a6'] })).toBe(false);
        expect(H.hasThreeMoves(null)).toBe(false);
    });
    test('un mat en 1 o en 2, o un guany immediat, no reben cap certificat', () => {
        expect(verifier.inspect(mate1)).toBeNull();
        expect(verifier.inspect(win1)).toBeNull();
        // Mat a la primera jugada: la línia no pot continuar fins a la tercera.
        expect(verifier.inspect({ ...mate1, solutionMoves: ['d1d8', 'd8d7', 'd7d8'], replyMoves: ['g8h8', 'h8g8'] })).toBeNull();
        // Les dues primeres jugades del mat en tres no són encara un desenllaç.
        expect(verifier.inspect({ ...mate3, solutionMoves: ['d3d8', 'd2g5'], replyMoves: ['e8d8'] })).toBeNull();
    });
});

describe('desenllaç real, no només un motiu tàctic', () => {
    test('mat únic a la tercera jugada, verificat contra totes les jugades legals', () => {
        const end = verifier.inspect(mate3);
        expect(end).toMatchObject({ kind: 'mate', finalSan: 'Bd8#', replies: 0 });
        expect(end.line).toEqual(['d3d8', 'e8d8', 'd2g5', 'd8c7', 'g5d8']);
        expect(end.positions).toHaveLength(5);
        expect(end.alternatives.length).toBe(36);
    });
    test('dos o més mats a l’última jugada fan ambigu el final', () => {
        const g = new Chess(twoMates3.fen);
        H.lineOf(twoMates3).forEach(u => expect(g.move({ from: u.slice(0, 2), to: u.slice(2, 4) })).not.toBeNull());
        expect(verifier.inspect(twoMates3)).toBeNull();
    });
    test('guany real i consolidat d’una torre, amb totes les defenses comprovades', () => {
        expect(verifier.inspect(win3)).toMatchObject({ kind: 'material', gain: 5, replies: 5, finalSan: 'Rxa8' });
    });
    test('una recaptura que anul·la el guany descarta la captura aparent', () => {
        expect(verifier.inspect({ fen: 'r5k1/r7/8/8/8/8/8/R5K1 w - - 0 1', solutionMoves: ['g1f2', 'f2e2', 'a1a7'], replyMoves: ['g8f7', 'f7e7'] })).toBeNull();
    });
    test('no s’atura en una forquilla sense haver cobrat el guany', () => {
        expect(verifier.inspect({ fen: '4k3/8/8/1q6/8/2N5/8/4K3 w - - 0 1', solutionMoves: ['e1d1', 'd1d2', 'c3d5'], replyMoves: ['e8f8', 'f8e8'] })).toBeNull();
    });
    test('rebutja una coronació amb dues eleccions guanyadores', () => {
        expect(verifier.inspect({ fen: '8/P6k/8/8/8/8/8/6K1 w - - 0 1', solutionMoves: ['g1f2', 'f2e2', 'a7a8q'], replyMoves: ['h7g7', 'g7h7'] })).toBeNull();
    });
    test('una línia il·legal, incompleta o amb taules no rep cap certificat', () => {
        expect(verifier.inspect({ ...mate3, solutionMoves: ['d3d8', 'd2g5', 'g5d9'] })).toBeNull();
        expect(verifier.inspect({ ...mate3, replyMoves: ['e8d8'] })).toBeNull();
        expect(verifier.inspect({ fen: '7k/5K2/4Q3/8/8/8/8/8 w - - 0 1', solutionMoves: ['e6g6'] })).toBeNull();
    });
    test('capturar una torre dins d’un intercanvi no és guany net de peça major', () => {
        const helpers = Core.createHieroglyphicMotifHelpers(Chess);
        expect(helpers.detectMajorWinMotif('r5k1/r7/8/8/8/8/8/R5K1 w - - 0 1', ['a1a7', 'a8a7', 'g1f2'])).toBeNull();
    });
});

describe('unicitat sense falsos marges infinits ni mats alternatius', () => {
    test('una sola variant només val si hi ha una sola jugada legal', () => {
        expect(H.uniqueChoice(analysis(a('a1a8', 500)), 'a1a8', 17)).toBe(false);
        expect(H.uniqueChoice(analysis(a('a1a8', 500)), 'a1a8', 1)).toBe(true);
    });
    test.each([
        analysis(a('a1a8', 500), a('a1a2', 450)),
        analysis(a('a1a8', 900), a('a1a2', 400)),
        analysis(a('a1a8', -500), a('a1a2', -900)),
        analysis(a('a1a8', 2, 'mate'), a('a1a2', 3, 'mate')),
        analysis(a('a1a8', 500, 'cp', 13), a('a1a2', 0, 'cp', 13)),
        analysis(a('a1a8', 500), a('a1a2', 0, 'cp', 15)),
        analysis(a('a1a8', 500), { ...a('a1a2', 0), bound: 'upper' }),
        analysis(a('a1a8', 500), a('a1a8', 0))
    ])('rebutja ambigüitat o evidència insuficient: %j', result => {
        expect(H.uniqueChoice(result, 'a1a8', 17)).toBe(false);
    });
    test('distingir un mat immediat únic d’un mat més llarg no inventa unicitat de victòria', () => {
        const result = analysis(a('d1d8', 1, 'mate'), a('d1d7', 4, 'mate'));
        expect(H.uniqueChoice(result, 'd1d8', 20, 14, true)).toBe(true);
        expect(H.uniqueChoice(result, 'd1d8', 20)).toBe(false);
    });
});

describe('certificació amb Stockfish injectat i persistència', () => {
    test('valida els tres passos i les dues millors defenses; rebutja una defensa diferent no contrastada', async () => {
        const analyze = mockRows(mateRows());
        const result = await H.createVerifier(Chess, analyze).verify(mate3);
        expect(result.conclusion).toMatchObject({ kind: 'mate', finalSan: 'Bd8#', checkedAlternatives: 36 });
        expect(analyze).toHaveBeenCalledTimes(5);
        expect(result.stepAlternatives).toHaveLength(3);
        const rows = mateRows(); rows[3] = analysis(a('d8e8', -1, 'mate'));
        expect(await H.createVerifier(Chess, mockRows(rows)).verify(mate3)).toBeNull();
    });

    test('la perspectiva negra també exigeix un guany net real', () => {
        expect(verifier.inspect(black3)).toMatchObject({ kind: 'material', color: 'b', gain: 5 });
    });

    test('una fallada del motor no produeix cap aprovació', async () => {
        expect(await H.createVerifier(Chess, async () => { throw new Error('worker failed'); }).verify(mate3)).toBeNull();
    });

    test('certifica mat i vincula la prova a la posició i la seqüència exactes de tres jugades', async () => {
        const result = await H.createVerifier(Chess, mockRows(mateRows())).verify(mate3);
        expect(result.conclusion).toMatchObject({ kind: 'mate', finalSan: 'Bd8#', alternativeSan: 'Nf3' });
        expect(result.conclusion.line).toHaveLength(5);
        expect(result.conclusion.uniqueness).toContain('cap no fa mat');
        expect(H.matches(JSON.parse(JSON.stringify(result)))).toBe(true);
        expect(H.matches({ ...result, solutionMoves: ['d3d8', 'd2g5', 'g5d7'] })).toBe(false);
        expect(H.matches({ ...result, fen: win3.fen })).toBe(false);
    });
    test('una prova antiga d’una línia més curta ja no val', () => {
        const old = { ...mate1, conclusion: { version: H.VERSION, fen: mate1.fen, line: ['d1d8'], kind: 'mate' } };
        expect(H.matches(old)).toBe(false);
    });
    test('comprova el signe de l’avaluació final des del torn del rival', async () => {
        const rows = [
            analysis(a('g1f2', 500), a('a1a2', 0)), analysis(a('g8f7', -500)),
            analysis(a('f2e2', 500), a('a1a2', 0)), analysis(a('f7e7', -500)),
            analysis(a('a1a8', 500), a('a1a2', -500))
        ];
        const result = await H.createVerifier(Chess, mockRows([...rows, analysis(a('e7d6', -500))])).verify(win3);
        expect(result.conclusion).toMatchObject({ kind: 'material', gain: 5, checkedReplies: 5 });
        expect(await H.createVerifier(Chess, mockRows([...rows, analysis(a('e7d6', 500))])).verify(win3)).toBeNull();
    });
    test('un final ambigu no consumeix anàlisi i una cancel·lació no aprova res', async () => {
        const analyze = jest.fn(async () => analysis(a('d3d8', 3, 'mate'), a('d1e1', 0)));
        expect(await H.createVerifier(Chess, analyze).verify(twoMates3)).toBeNull();
        expect(await H.createVerifier(Chess, analyze).verify(mate1)).toBeNull();
        expect(analyze).not.toHaveBeenCalled();
        expect(await H.createVerifier(Chess, analyze).verify(mate3, { shouldAbort: () => true })).toBeNull();
        expect(analyze).not.toHaveBeenCalled();
    });
});
