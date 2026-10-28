const { Chess } = require('chess.js');
const H = require('../hieroclosure');
const Core = require('../core');
const mate = { fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', solutionMoves: ['d1d8'], replyMoves: [] };
const win = { fen: 'r5k1/8/8/8/8/8/8/R5K1 w - - 0 1', solutionMoves: ['a1a8'], replyMoves: [] };
const a = (move, value, type = 'cp', depth = 16) => ({ move, eval: value, evalType: type, depth, pv: [move] });
const analysis = (...alternatives) => ({ bestMove: alternatives[0], alternatives });
const verifier = H.createVerifier(Chess);

describe('desenllaç real, no només un motiu tàctic', () => {
    test('mat únic verificat contra totes les jugades legals', () => {
        const end = verifier.inspect(mate);
        expect(end).toMatchObject({ kind: 'mate', finalSan: 'Rd8#', replies: 0 });
        expect(end.alternatives.length).toBe(new Chess(mate.fen).moves().length - 1);
    });
    test('dos o més mats immediats fan ambigu el final', () => {
        expect(verifier.inspect({ fen: '7k/5K2/6Q1/8/8/8/8/8 w - - 0 1', solutionMoves: ['g6g7'] })).toBeNull();
    });
    test('guany real i consolidat d’una torre, amb totes les defenses comprovades', () => {
        expect(verifier.inspect(win)).toMatchObject({ kind: 'material', gain: 5, replies: 3 });
    });
    test('una recaptura que anul·la el guany descarta la captura aparent', () => {
        expect(verifier.inspect({ fen: 'r5k1/r7/8/8/8/8/8/R5K1 w - - 0 1', solutionMoves: ['a1a7'] })).toBeNull();
    });
    test('no s’atura en una forquilla sense haver cobrat el guany', () => {
        expect(verifier.inspect({ fen: '4k3/8/8/1q6/8/2N5/8/4K3 w - - 0 1', solutionMoves: ['c3d5'] })).toBeNull();
    });
    test('rebutja una coronació amb dues eleccions guanyadores', () => {
        expect(verifier.inspect({ fen: '8/P6k/8/8/8/8/8/6K1 w - - 0 1', solutionMoves: ['a7a8q'] })).toBeNull();
    });
    test('una línia il·legal, incompleta o amb taules no rep cap certificat', () => {
        expect(verifier.inspect({ ...mate, solutionMoves: ['d1d9'] })).toBeNull();
        expect(verifier.inspect({ ...mate, solutionMoves: ['d1d2', 'd2d8'], replyMoves: [] })).toBeNull();
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
        const puzzle = { fen: 'rnb1kb1r/pp3ppp/2p5/4q3/4n3/3Q4/PPPB1PPP/2KR1BNR w kq - 0 9',
            solutionMoves: ['d3d8', 'd2g5', 'g5d8'], replyMoves: ['e8d8', 'd8c7'] };
        const rows = [
            analysis(a('d3d8', 3, 'mate'), a('d1e1', 136)), analysis(a('e8d8', -2, 'mate')),
            analysis(a('d2g5', 2, 'mate'), a('d2f4', -1098)), analysis(a('d8c7', -1, 'mate')),
            analysis(a('g5d8', 1, 'mate'), a('g1f3', -1585))
        ];
        const analyze = jest.fn();
        rows.forEach(row => analyze.mockResolvedValueOnce(row));
        const result = await H.createVerifier(Chess, analyze).verify(puzzle);
        expect(result.conclusion).toMatchObject({ kind: 'mate', finalSan: 'Bd8#', checkedAlternatives: 36 });
        expect(analyze).toHaveBeenCalledTimes(5);
        expect(result.stepAlternatives).toHaveLength(3);
        const different = jest.fn();
        rows.forEach((row, i) => different.mockResolvedValueOnce(i === 3 ? analysis(a('d8e8', -1, 'mate')) : row));
        expect(await H.createVerifier(Chess, different).verify(puzzle)).toBeNull();
    });

    test('la perspectiva negra també exigeix un guany net real', () => {
        expect(verifier.inspect({ ...win, fen: win.fen.replace(' w ', ' b '), solutionMoves: ['a8a1'] }))
            .toMatchObject({ kind: 'material', color: 'b', gain: 5 });
    });

    test('una fallada del motor no produeix cap aprovació', async () => {
        expect(await H.createVerifier(Chess, async () => { throw new Error('worker failed'); }).verify(mate)).toBeNull();
    });

    test('certifica mat i vincula la prova a la posició i la seqüència exactes', async () => {
        const analyze = jest.fn(async () => analysis(a('d1d8', 1, 'mate'), a('d1d7', 4, 'mate')));
        const result = await H.createVerifier(Chess, analyze).verify(mate);
        expect(result.conclusion).toMatchObject({ kind: 'mate', finalSan: 'Rd8#', checkedAlternatives: 19, alternativeSan: 'Rd7' });
        expect(result.conclusion.uniqueness).toContain('cap no fa mat');
        expect(H.matches(JSON.parse(JSON.stringify(result)))).toBe(true);
        expect(H.matches({ ...result, solutionMoves: ['d1d7'] })).toBe(false);
        expect(H.matches({ ...result, fen: win.fen })).toBe(false);
    });
    test('comprova el signe de l’avaluació final des del torn del rival', async () => {
        const initial = analysis(a('a1a8', 500), a('a1a2', -500));
        const analyze = jest.fn().mockResolvedValueOnce(initial).mockResolvedValueOnce(analysis(a('g8f7', -500)));
        const result = await H.createVerifier(Chess, analyze).verify(win);
        expect(result.conclusion).toMatchObject({ kind: 'material', gain: 5, checkedReplies: 3 });
        const bad = jest.fn().mockResolvedValueOnce(initial).mockResolvedValueOnce(analysis(a('g8f7', 500)));
        expect(await H.createVerifier(Chess, bad).verify(win)).toBeNull();
    });
    test('un final ambigu no consumeix anàlisi i una cancel·lació no aprova res', async () => {
        const analyze = jest.fn(async () => analysis(a('d1d8', 1, 'mate'), a('d1d7', 0)));
        expect(await H.createVerifier(Chess, analyze).verify({ ...mate, solutionMoves: ['d1d2'] })).toBeNull();
        expect(analyze).not.toHaveBeenCalled();
        expect(await H.createVerifier(Chess, analyze).verify(mate, { shouldAbort: () => true })).toBeNull();
        expect(analyze).not.toHaveBeenCalled();
    });
});
