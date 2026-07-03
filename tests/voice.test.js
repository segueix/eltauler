const Core = require('../core.js');
const Redactor = require('../redactor.js');

// ---------------------------------------------------------------------------
// Veu de l'entrenador (casual / balanced / technical)
// ---------------------------------------------------------------------------
// La regla d'or: les DADES són idèntiques en totes les veus (mateixos temes,
// mateixes jugades, mateixos números); només canvia la redacció. Cap veu no
// pot generar frases tallades ni afirmar coses que les dades no demostren.

const STYLES = Core.REVIEW_VOICE_STYLES;

describe('normalizeReviewVoiceStyle', () => {
    test('accepta els tres estils vàlids', () => {
        STYLES.forEach(s => expect(Core.normalizeReviewVoiceStyle(s)).toBe(s));
    });
    test('un valor invàlid, antic o buit cau a balanced', () => {
        expect(Core.normalizeReviewVoiceStyle('formal')).toBe('balanced');
        expect(Core.normalizeReviewVoiceStyle('')).toBe('balanced');
        expect(Core.normalizeReviewVoiceStyle(null)).toBe('balanced');
        expect(Core.normalizeReviewVoiceStyle(undefined)).toBe('balanced');
        expect(Core.normalizeReviewVoiceStyle(42)).toBe('balanced');
    });
});

describe('lessonOfTheDay per veu', () => {
    test('sense estil es manté el text equilibrat de sempre', () => {
        expect(Core.lessonOfTheDay('material')).toBe('abans de capturar, compta atacants i defensors.');
    });
    test('el mateix tema té una redacció diferent per estil', () => {
        const texts = STYLES.map(s => Core.lessonOfTheDay('material', s));
        expect(new Set(texts).size).toBe(3);
    });
    test('tots els temes existeixen en tots els estils', () => {
        ['material', 'king_attack', 'prophylaxis', 'opening', 'endgame', 'general'].forEach(theme => {
            STYLES.forEach(s => {
                const t = Core.lessonOfTheDay(theme, s);
                expect(typeof t).toBe('string');
                expect(t.length).toBeGreaterThan(10);
                expect(Redactor.esTextIncomplet(t)).toBe(false);
            });
        });
    });
    test('un tema desconegut cau a la lliçó general del mateix estil', () => {
        expect(Core.lessonOfTheDay('tema_inventat', 'casual')).toBe(Core.lessonOfTheDay('general', 'casual'));
        expect(Core.lessonOfTheDay('tema_inventat', 'technical')).toBe(Core.lessonOfTheDay('general', 'technical'));
    });
    test('un estil desconegut cau a balanced', () => {
        expect(Core.lessonOfTheDay('material', 'antic')).toBe(Core.lessonOfTheDay('material', 'balanced'));
    });
});

describe('formatPhaseLine per veu', () => {
    test('la part factual (percentatge i jugades) és idèntica en totes les veus', () => {
        STYLES.forEach(s => {
            expect(Core.formatPhaseLine(70, 10, s)).toBe('correcció 70% en 10 jugades.');
        });
    });
    test("l'avís de poques dades canvia de registre però hi és sempre", () => {
        const notes = STYLES.map(s => Core.formatPhaseLine(100, 2, s));
        expect(new Set(notes).size).toBe(3);
        notes.forEach(n => expect(n).toMatch(/^correcció 100% en 2 jugades\./));
        expect(Core.formatPhaseLine(100, 2, 'casual')).toContain('poques jugades');
        expect(Core.formatPhaseLine(100, 2, 'balanced')).toContain('Poques dades');
        expect(Core.formatPhaseLine(100, 2, 'technical')).toContain('mostra');
    });
    test('sense jugades no es diu res, en cap veu', () => {
        STYLES.forEach(s => expect(Core.formatPhaseLine(null, 0, s)).toBe(''));
    });
});

describe('buildTenMinutePlan per veu', () => {
    test('les jugades recomanades són les mateixes en totes les veus', () => {
        STYLES.forEach(s => {
            const t = Core.buildTenMinutePlan([19, 23, 9], s);
            expect(t).toContain('19');
            expect(t).toContain('23');
            expect(t).toContain('9');
            expect(t).toMatch(/^Pla de 10 minuts:/);
        });
    });
    test('cada estil redacta el pla de manera diferent', () => {
        expect(new Set(STYLES.map(s => Core.buildTenMinutePlan([7], s))).size).toBe(3);
        expect(new Set(STYLES.map(s => Core.buildTenMinutePlan([], s))).size).toBe(3);
    });
    test('cap variant queda tallada ni acaba en punts suspensius', () => {
        STYLES.forEach(s => {
            [[], [9], [19, 23], [19, 23, 9]].forEach(nums => {
                const t = Core.buildTenMinutePlan(nums, s);
                expect(Redactor.esTextIncomplet(t)).toBe(false);
                expect(t).not.toMatch(/(\.\.\.|…)/);
            });
        });
    });
});

describe('playerColorIntro per veu', () => {
    test('el color sempre queda clar', () => {
        STYLES.forEach(s => {
            expect(Core.playerColorIntro('b', s)).toContain('negres');
            expect(Core.playerColorIntro('w', s)).toContain('blanques');
        });
    });
    test('sense estil es manté la frase de sempre', () => {
        expect(Core.playerColorIntro('b')).toBe('Has jugat amb negres. La revisió comenta les teves decisions.');
    });
});

describe('pvNarrationText per veu — mateixa prudència, tres registres', () => {
    const seq = 'la dama blanca va a h5 amb escac, i el rei negre va a h8';

    test('línia forçada: totes les veus la poden explicar, el casual sense tecnicismes', () => {
        const casual = Core.pvNarrationText('forced', { lineText: seq }, 'casual');
        const balanced = Core.pvNarrationText('forced', { lineText: seq }, 'balanced');
        const technical = Core.pvNarrationText('forced', { lineText: seq }, 'technical');
        expect(casual).toContain(seq);
        expect(casual).not.toContain('seqüència forçada');
        expect(balanced).toContain('seqüència forçada');
        expect(technical).toContain('seqüència forçada');
    });

    test('línia NO forçada: cap veu no diu "forçada" i totes reconeixen les alternatives del rival', () => {
        STYLES.forEach(s => {
            const t = Core.pvNarrationText('illustrative', { lineText: seq, allRepliesLosing: false }, s);
            expect(t).toContain(seq);
            expect(t.toLowerCase()).not.toMatch(/seqüència forçada|era obligada|única legal/);
            expect(t.toLowerCase()).toMatch(/altres (opcions|respostes)|no forçada|possible variant|per exemple/);
        });
    });

    test('"perduda igualment": cada veu ho diu al seu registre sense canviar el fet', () => {
        const casual = Core.pvNarrationText('illustrative', { lineText: seq, allRepliesLosing: true }, 'casual');
        const technical = Core.pvNarrationText('illustrative', { lineText: seq, allRepliesLosing: true }, 'technical');
        expect(casual).toContain('seguia perdut');
        expect(technical).toContain('posició perduda');
    });

    test('sense prou dades: cap veu no narra la línia, només la millor jugada', () => {
        STYLES.forEach(s => {
            const t = Core.pvNarrationText('unclear', { lineText: seq, bestText: 'el cavall salta a f7' }, s);
            expect(t).toBe('La millor jugada era el cavall salta a f7.');
        });
    });

    test('sense estil es manté el text equilibrat de sempre', () => {
        expect(Core.pvNarrationText('forced', { lineText: seq })).toBe('La seqüència forçada era ' + seq + '.');
        expect(Core.pvNarrationText('illustrative', { lineText: seq })).toBe('Una possible variant del motor és ' + seq + '.');
    });

    test('cap narració de cap veu queda tallada', () => {
        STYLES.forEach(s => {
            ['forced', 'illustrative', 'unclear'].forEach(lang => {
                [true, false].forEach(flag => {
                    const t = Core.pvNarrationText(lang, {
                        lineText: seq, bestText: 'el cavall salta a f7',
                        replyIsOnlyLegal: flag, allRepliesLosing: flag
                    }, s);
                    if (t) expect(Redactor.esTextIncomplet(t)).toBe(false);
                });
            });
        });
    });
});
