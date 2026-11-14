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
    expect(defence.dialogue[0].text).toMatch(/pressió sobre el peó de d5/);
    expect(defence.dialogue[1].text).toMatch(/dues peces.*una/);
    const speech = TV.tvDialogueTurns({ ...defence, speech: defence.speech }, false);
    expect(speech[0].text).not.toContain('?');
    expect(speech[1].text).toContain('dues peces');
});

test('Stockfish només compara dues variants legals de la mateixa posició i profunditat', () => {
    const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const moves = ['a2a3', 'a7a6', 'h2h3', 'h7h6', 'b2b3', 'b7b6', 'g2g3', 'g7g6', 'c2c3'];
    const chess = new Chess(startFen);
    for (const uci of moves.slice(0, -1)) chess.move({ from: uci.slice(0, 2), to: uci.slice(2) });
    const fen = chess.fen();
    function simulate(change) {
        const analysis = Object.assign({ depth: 14, type: 'cp', value: -70, pv: ['c2c4', 'd7d5'] }, change);
        const analyses = { 8: { fen: fen, bestUci: 'c2c3', infos: {
            1: { depth: 14, type: 'cp', value: 50, pv: ['c2c3', 'd7d6'] }, 2: analysis
        } } };
        return TV.tvSimulateCommentary(Chess, { startFen, moves, analyses }).at(-1);
    }
    const row = simulate({});
    expect(row.dialogueEvent).toBe('variant');
    expect(row.dialogue[0].text).toContain('c4');
    expect(row.dialogue[1].text).toContain('d5');
    expect(simulate({ depth: 13 }).dialogueEvent).toBeNull();
    expect(simulate({ pv: ['c2c4', 'h7h6'] }).dialogueEvent).toBeNull();
});
