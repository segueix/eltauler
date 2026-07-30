const Core = require('../core.js');

// Etiquetes que MAI poden aparèixer abans que el jugador decideixi: si el
// missatge previ en diu cap, ja és una pista i l'exercici perd la meitat.
const ALL_LABELS = Core.ANTIDOTE_WEAKNESS_IDS.map(id => Core.antidoteWeaknessLabel(id))
    .concat(Object.keys(Core.ANTIDOTE_THEME_FAMILY).map(id => Core.antidoteThemeLabel(id)));

function visibleText(msg) {
    return [msg.title, msg.text, msg.guide].filter(Boolean).join(' ').toLowerCase();
}

function makeTest(extra) {
    return Object.assign({
        id: 'at_1',
        theme: 'missed_tactic',
        subtheme: 'fork',
        sourceFen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
        engineMove: 'f3g5',
        engineMoveSan: 'Ng5',
        bestResponse: 'd7d5',
        bestResponseSan: 'd5',
        responseCpLoss: 310,
        result: 'failed'
    }, extra || {});
}

describe('Rival Antídot — res no es revela abans de moure', () => {
    test('la consigna del torn no anomena cap debilitat ni cap subtema', () => {
        const blob = visibleText(Core.antidoteTurnPrompt());
        ALL_LABELS.forEach(label => {
            expect(blob).not.toContain(label.toLowerCase());
        });
    });

    test('el missatge mentre el motor pensa tampoc no en diu cap', () => {
        const blob = visibleText(Core.antidoteThinkingPrompt());
        ALL_LABELS.forEach(label => {
            expect(blob).not.toContain(label.toLowerCase());
        });
    });

    test('la consigna del torn és CONSTANT: no depèn de res', () => {
        // Si acceptés arguments o variés entre crides, delataria quins torns
        // porten prova i quins no.
        expect(Core.antidoteTurnPrompt.length).toBe(0);
        const a = Core.antidoteTurnPrompt();
        const b = Core.antidoteTurnPrompt();
        expect(a).toEqual(b);
        expect(a.guide).toBe(Core.ANTIDOTE_SCAN_STEPS);
    });

    test('la consigna no revela tampoc cap jugada ni cap avaluació', () => {
        const blob = visibleText(Core.antidoteTurnPrompt());
        expect(blob).not.toMatch(/\b[a-h][1-8][a-h][1-8]\b/);   // UCI
        expect(blob).not.toMatch(/centpeons|mat en \d/i);
    });
});

describe('Rival Antídot — l’explicació posterior sí que ensenya', () => {
    test('després de respondre es diu el tema, el subtema i la pauta', () => {
        const msg = Core.antidoteResultFeedback(makeTest());
        expect(msg.title).toContain(Core.antidoteWeaknessLabel('missed_tactic'));
        expect(msg.title).toContain(Core.antidoteThemeLabel('fork'));
        expect(msg.guide).toContain(Core.antidoteGuidanceForTheme('missed_tactic'));
    });

    test('només la resposta fallada o parcial revela la millor jugada', () => {
        expect(Core.antidoteResultFeedback(makeTest({ result: 'failed' })).text).toContain('d5');
        expect(Core.antidoteResultFeedback(makeTest({ result: 'partial' })).text).toContain('d5');
        // Superada: no cal dir-li què havia de jugar, ja ho ha trobat.
        expect(Core.antidoteResultFeedback(makeTest({ result: 'passed' })).text).not.toContain('d5');
    });

    test('els quatre resultats donen un missatge amb estil propi', () => {
        const kinds = ['passed', 'partial', 'failed', 'inconclusive']
            .map(result => Core.antidoteResultFeedback(makeTest({ result })).kind);
        expect(kinds).toEqual(['success', 'partial', 'failed', 'info']);
        expect(new Set(kinds).size).toBe(4);
    });

    test('la prova superada esmenta la pèrdua només si n’hi ha', () => {
        expect(Core.antidoteResultFeedback(makeTest({ result: 'passed', responseCpLoss: 18 })).text)
            .toContain('18 centpeons');
        expect(Core.antidoteResultFeedback(makeTest({ result: 'passed', responseCpLoss: 0 })).text)
            .not.toContain('centpeons');
    });

    test('la situació sense conclusió no genera cap avís emergent', () => {
        expect(Core.antidoteResultFeedback(makeTest({ result: 'inconclusive' })).toast).toBeNull();
        expect(Core.antidoteResultFeedback(makeTest({ result: 'failed' })).toast).toBeTruthy();
    });

    test('cada categoria de debilitat té la seva pauta', () => {
        Core.ANTIDOTE_WEAKNESS_IDS.forEach(id => {
            const guide = Core.antidoteGuidanceForTheme(id);
            expect(typeof guide).toBe('string');
            expect(guide.length).toBeGreaterThan(30);
            expect(Core.ANTIDOTE_THEME_GUIDANCE[id]).toBe(guide);
        });
        // Un tema desconegut cau a una pauta genèrica, no a undefined.
        expect(Core.antidoteGuidanceForTheme('inventat')).toBeTruthy();
        expect(Core.antidoteGuidanceForTheme(null)).toBeTruthy();
    });

    test('dades incompletes o corruptes no trenquen el missatge', () => {
        [undefined, null, {}, { result: 'failed' }, { theme: 'inventat', result: 'passed' }]
            .forEach(input => {
                const msg = Core.antidoteResultFeedback(input);
                expect(typeof msg.title).toBe('string');
                expect(msg.title.length).toBeGreaterThan(3);
                expect(typeof msg.text).toBe('string');
                expect(msg.text).not.toContain('undefined');
                expect(msg.title).not.toContain('undefined');
                expect(msg.guide).not.toContain('undefined');
            });
    });
});
