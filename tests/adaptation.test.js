const Core = require('../core.js');

// Subconjunt rellevant de CONTINUOUS_ADJUST_CONFIG (app.js).
const QUALITY_CONFIG = {
    QUALITY_HIGH: 0.7,
    ERROR_PRECISION_MAX: 60,
    ERROR_CPLOSS_MIN: 140,
    ERROR_BLUNDERS_MIN: 2
};

describe('computeEloDelta', () => {
    const base = { consecutiveWins: 0, consecutiveLosses: 0, recentGames: [] };

    test('victòria amb alta precisió puja molt', () => {
        expect(Core.computeEloDelta({ ...base, normalizedScore: 1, precision: 90 })).toBe(50);
    });

    test('victòria amb precisió mitjana puja moderadament', () => {
        expect(Core.computeEloDelta({ ...base, normalizedScore: 1, precision: 70 })).toBe(35);
    });

    test('victòria amb precisió baixa puja poc', () => {
        expect(Core.computeEloDelta({ ...base, normalizedScore: 1, precision: 50 })).toBe(15);
    });

    test('derrota amb baixa precisió baixa molt', () => {
        expect(Core.computeEloDelta({ ...base, normalizedScore: 0, precision: 30 })).toBe(-50);
    });

    test('derrota tot i jugar bé baixa poc', () => {
        expect(Core.computeEloDelta({ ...base, normalizedScore: 0, precision: 75 })).toBe(-15);
    });

    test('taules donen un petit bonus', () => {
        expect(Core.computeEloDelta({ ...base, normalizedScore: 0.5, precision: 50 })).toBe(10);
    });

    test('ratxa de 3 victòries afegeix bonus', () => {
        const sense = Core.computeEloDelta({ ...base, normalizedScore: 1, precision: 50 });
        const amb = Core.computeEloDelta({ ...base, normalizedScore: 1, precision: 50, consecutiveWins: 3 });
        expect(amb).toBe(sense + 30);
    });

    test('ratxa de 3 derrotes aplica penalització', () => {
        const sense = Core.computeEloDelta({ ...base, normalizedScore: 0, precision: 75 });
        const amb = Core.computeEloDelta({ ...base, normalizedScore: 0, precision: 75, consecutiveLosses: 3 });
        expect(amb).toBe(sense - 25);
    });

    test('un winrate recent alt afegeix bonus de flux', () => {
        // precisió 50 (+15) per evitar topar amb el límit de +60 i veure el bonus net.
        const recentGames = Array.from({ length: 8 }, () => ({ result: 1 }));
        const sense = Core.computeEloDelta({ ...base, normalizedScore: 1, precision: 50 });
        const amb = Core.computeEloDelta({ ...base, normalizedScore: 1, precision: 50, recentGames });
        expect(amb).toBe(sense + 30);
    });

    test('el delta queda limitat a [-60, 60]', () => {
        const recentWins = Array.from({ length: 10 }, () => ({ result: 1 }));
        const max = Core.computeEloDelta({ normalizedScore: 1, precision: 95, consecutiveWins: 5, consecutiveLosses: 0, recentGames: recentWins });
        expect(max).toBe(60);

        const recentLosses = Array.from({ length: 10 }, () => ({ result: 0 }));
        const min = Core.computeEloDelta({ normalizedScore: 0, precision: 10, consecutiveWins: 0, consecutiveLosses: 5, recentGames: recentLosses });
        expect(min).toBe(-60);
    });

    test('precisió per defecte (50) quan no és numèrica', () => {
        const amb = Core.computeEloDelta({ ...base, normalizedScore: 1, precision: undefined });
        const ref = Core.computeEloDelta({ ...base, normalizedScore: 1, precision: 50 });
        expect(amb).toBe(ref);
    });
});

describe('evaluateGameQuality', () => {
    test('partida excel·lent: alta qualitat i sense errors', () => {
        const r = Core.evaluateGameQuality(95, 10, 0, QUALITY_CONFIG);
        expect(r.qualityScore).toBeGreaterThan(0.9);
        expect(r.isHighQuality).toBe(true);
        expect(r.hasErrors).toBe(false);
    });

    test('partida dolenta: baixa qualitat i amb errors', () => {
        const r = Core.evaluateGameQuality(40, 200, 3, QUALITY_CONFIG);
        expect(r.qualityScore).toBeLessThan(0.5);
        expect(r.isHighQuality).toBe(false);
        expect(r.hasErrors).toBe(true);
    });

    test('els blunders penalitzen fins a un màxim de 0.3', () => {
        const cap = Core.evaluateGameQuality(100, 0, 99, QUALITY_CONFIG);
        // precisió 1.0*0.6 + pèrdua 1.0*0.4 - 0.3 = 0.7
        expect(cap.qualityScore).toBeCloseTo(0.7, 5);
    });

    test('la qualitat queda fixada a [0, 1]', () => {
        const r = Core.evaluateGameQuality(0, 999, 99, QUALITY_CONFIG);
        expect(r.qualityScore).toBeGreaterThanOrEqual(0);
        expect(r.qualityScore).toBeLessThanOrEqual(1);
    });

    test('valors per defecte robustos amb entrades no numèriques', () => {
        const r = Core.evaluateGameQuality(undefined, undefined, undefined, QUALITY_CONFIG);
        expect(Number.isFinite(r.qualityScore)).toBe(true);
        expect(typeof r.hasErrors).toBe('boolean');
    });
});
