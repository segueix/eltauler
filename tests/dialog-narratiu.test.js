const TV = require('../stockfishtv');

test('el diàleg estructurat manté pregunta, resposta i ordre de veus', () => {
    const c = { speech: 'Pregunta? Resposta.', dialogue: [
        { role: 'presenter', text: 'Què passa amb el peó passat?' },
        { role: 'analyst', text: 'El peó blanc avança a e6.' }
    ] };
    const duo = TV.tvDialogueTurns(c, true);
    expect(duo.map(t => t.role)).toEqual(['presenter', 'analyst']);
    expect(duo[0].text).toContain('peó passat');
    expect(duo[1].text).toContain('e 6');
    expect(duo[0].voiceId).not.toBe(duo[1].voiceId);
    expect(TV.tvDialogueTurns(c, false).every(t => t.voiceId === null)).toBe(true);
});

const { Chess } = require('chess.js');

function pressurePosition() {
    return TV.tvSimulateCommentary(Chess, {
        startFen: '1n2k1n1/8/4p3/3p4/8/8/8/1N1RK3 w - - 0 1',
        moves: ['b1c3', 'g8f6']
    });
}

test('el reforç defensiu respon al mateix peó anunciat a la jugada anterior', () => {
    const [attack, defence] = pressurePosition();
    expect(attack.kind).toBe('pressure');
    expect(defence.dialogueEvent).toBe('defence');
    expect(defence.dialogue[0].text).toMatch(/pressió sobre el peó negre/);
    expect(defence.dialogue[0].text).not.toMatch(/\b[a-h][1-8]\b/);
    expect(defence.dialogue[1].text).toMatch(/hi pot recapturar/);
    const speech = TV.tvDialogueTurns({ ...defence, speech: defence.speech }, false);
    expect(speech[0].text).not.toContain('?');
    expect(speech[1].text).toContain('hi pot recapturar');
});

test('Stockfish només compara dues variants legals de la mateixa posició i profunditat', () => {
    const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const moves = ['a2a3', 'a7a6', 'h2h3', 'h7h6', 'b2b3', 'b7b5', 'g2g3', 'g7g6', 'c2c3'];
    const chess = new Chess(startFen);
    for (const uci of moves.slice(0, -1)) chess.move({ from: uci.slice(0, 2), to: uci.slice(2) });
    const fen = chess.fen();
    function simulate(change) {
        const analysis = Object.assign({ depth: 14, type: 'cp', value: -70, pv: ['c2c4', 'b5c4'] }, change);
        const analyses = { 8: { fen: fen, bestUci: 'c2c3', infos: {
            1: { depth: 14, type: 'cp', value: 50, pv: ['c2c3', 'd7d6'] }, 2: analysis
        } } };
        return TV.tvSimulateCommentary(Chess, { startFen, moves, analyses }).at(-1);
    }
    const row = simulate({});
    expect(row.dialogueEvent).toBe('variant');
    // Ni l'Èlia ni en Grau no diuen caselles: l'alternativa es diu per la intenció.
    expect(row.dialogue[0].text).not.toMatch(/\b[a-h][1-8]\b/);
    expect(row.dialogue[0].text).toMatch(/I si haguessin triat avançar el peó d’alfil de dama dues caselles\?/);
    // En Grau no diu caselles: explica la intenció de l'alternativa i de la resposta.
    expect(row.dialogue[1].text).not.toMatch(/\b[a-h][1-8]\b/);
    expect(row.dialogue[1].text).toMatch(/captur/);
    expect(simulate({ pv: ['c2c4', 'd7d5'] }).dialogueEvent).not.toBe('variant');
    expect(simulate({ depth: 13 }).dialogueEvent).not.toBe('variant');
    expect(simulate({ pv: ['c2c4', 'h7h6'] }).dialogueEvent).not.toBe('variant');
});


test.each([
    ['p', 'el peó blanc'], ['n', 'el cavall blanc'], ['b', "l'alfil blanc"],
    ['r', 'la torre blanca'], ['q', 'la dama blanca'], ['k', 'el rei blanc']
])('les deu preguntes anomenen la peça real (%s) i la casella de destí', (piece, label) => {
    const move = { piece, color: 'w', to: 'd4', flags: 'n' };
    const questions = Array.from({ length: 10 }, (_, index) => TV.tvMoveQuestion(move, index));
    expect(new Set(questions).size).toBe(10);
    for (const question of questions) {
        expect(question.toLowerCase()).toContain(label);
        expect(question).toContain('d4');
        expect(question.endsWith('?')).toBe(true);
    }
});

test('només hi ha diàleg sobre una jugada quan en Grau hi pot explicar una conseqüència tàctica', () => {
    const [opening] = TV.tvSimulateCommentary(Chess, { moves: ['e2e4'], prepared: 1 });
    expect(opening.dialogue).toBeNull();
    const [capture] = TV.tvSimulateCommentary(Chess, {
        startFen: '3rk3/8/8/3n4/3R4/8/8/4K3 w - - 0 1', moves: ['d4d5'], visio: null
    });
    expect(capture.dialogueEvent).toBe('move');
    expect(capture.dialogue[0].text).toMatch(/d5/);
    expect(capture.dialogue[1].text).toMatch(/recaptura legal/);
    expect(capture.dialogue[1].text).toMatch(/d5/);
    const [pinned] = TV.tvSimulateCommentary(Chess, {
        startFen: '4r2k/8/8/8/8/2b1R3/3P4/4K3 w - - 0 1', moves: ['e3e2']
    });
    expect(pinned.candidates).toContain('defend');
    expect(pinned.dialogue).toBeNull();
});

test('un rei que es limita a canviar de lloc no provoca una pregunta sense resposta', () => {
    const [row] = TV.tvSimulateCommentary(Chess, {
        startFen: '6rk/8/8/8/8/8/6R1/K7 w - - 0 1', moves: ['a1a2']
    });
    expect(row.kind).toBe('describe');
    expect(row.dialogue).toBeNull();
});
