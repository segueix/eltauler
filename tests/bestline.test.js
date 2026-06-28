const Core = require('../core.js');

describe('bestLineEvalScore', () => {
    test('cp es manté tal qual', () => {
        expect(Core.bestLineEvalScore({ eval: 120, evalType: 'cp' })).toBe(120);
        expect(Core.bestLineEvalScore({ eval: -75, evalType: 'cp' })).toBe(-75);
    });

    test('el mat domina qualsevol cp', () => {
        const mate3 = Core.bestLineEvalScore({ eval: 3, evalType: 'mate' });
        expect(mate3).toBeGreaterThan(5000);
    });

    test('un mat més curt val més que un de més llarg', () => {
        const mate1 = Core.bestLineEvalScore({ eval: 1, evalType: 'mate' });
        const mate8 = Core.bestLineEvalScore({ eval: 8, evalType: 'mate' });
        expect(mate1).toBeGreaterThan(mate8);
    });

    test('mat en contra és molt negatiu', () => {
        expect(Core.bestLineEvalScore({ eval: -2, evalType: 'mate' })).toBeLessThan(-5000);
    });

    test('valors no numèrics retornen null', () => {
        expect(Core.bestLineEvalScore(null)).toBeNull();
        expect(Core.bestLineEvalScore({ eval: 'x', evalType: 'cp' })).toBeNull();
    });
});

describe('bestLineGapCp', () => {
    test('gap entre les dues millors opcions', () => {
        const gap = Core.bestLineGapCp([
            { eval: 300, evalType: 'cp' },
            { eval: 120, evalType: 'cp' }
        ]);
        expect(gap).toBe(180);
    });

    test('una sola jugada (forçada) → Infinity', () => {
        expect(Core.bestLineGapCp([{ eval: 50, evalType: 'cp' }])).toBe(Infinity);
    });

    test('llista buida o invàlida → null', () => {
        expect(Core.bestLineGapCp([])).toBeNull();
        expect(Core.bestLineGapCp(null)).toBeNull();
    });

    test('mat forçat contra cp normal → gap enorme', () => {
        const gap = Core.bestLineGapCp([
            { eval: 2, evalType: 'mate' },
            { eval: 250, evalType: 'cp' }
        ]);
        expect(gap).toBeGreaterThan(5000);
    });
});

describe('bestLineStepQualifies', () => {
    test('passa quan el gap arriba al llindar', () => {
        expect(Core.bestLineStepQualifies([
            { eval: 300, evalType: 'cp' },
            { eval: 120, evalType: 'cp' }
        ], 150)).toBe(true);
    });

    test('no passa quan el gap és petit', () => {
        expect(Core.bestLineStepQualifies([
            { eval: 200, evalType: 'cp' },
            { eval: 160, evalType: 'cp' }
        ], 150)).toBe(false);
    });

    test('jugada forçada sempre passa', () => {
        expect(Core.bestLineStepQualifies([{ eval: -30, evalType: 'cp' }], 150)).toBe(true);
    });

    test('llindar per defecte 150', () => {
        expect(Core.bestLineStepQualifies([
            { eval: 300, evalType: 'cp' },
            { eval: 100, evalType: 'cp' }
        ])).toBe(true);
    });
});
