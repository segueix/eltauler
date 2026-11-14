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
