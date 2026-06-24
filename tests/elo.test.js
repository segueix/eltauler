const Core = require('../core.js');

// Constants reals d'app.js (mantingudes sincronitzades amb la configuració).
const ELO_MIN = 200;
const ELO_MAX = 2000;
const MIN_LEVEL = 50;
const MAX_LEVEL = 3000;
const ENGINE_MIN = 1350;
const ENGINE_MAX = 2850;

describe('clampElo', () => {
    test('limita per dalt i per baix i arrodoneix', () => {
        expect(Core.clampElo(50, ELO_MIN, ELO_MAX)).toBe(200);
        expect(Core.clampElo(5000, ELO_MIN, ELO_MAX)).toBe(2000);
        expect(Core.clampElo(1234.6, ELO_MIN, ELO_MAX)).toBe(1235);
    });

    test('un valor dins del rang es manté (arrodonit)', () => {
        expect(Core.clampElo(800, ELO_MIN, ELO_MAX)).toBe(800);
    });

    test('si el valor no és numèric usa el fallback', () => {
        expect(Core.clampElo(NaN, ELO_MIN, ELO_MAX, 777)).toBe(777);
        expect(Core.clampElo('abc', ELO_MIN, ELO_MAX, 600)).toBe(600);
    });
});

describe('normalize', () => {
    test('extrems i punt mig', () => {
        expect(Core.normalize(MIN_LEVEL, MIN_LEVEL, MAX_LEVEL)).toBe(0);
        expect(Core.normalize(MAX_LEVEL, MIN_LEVEL, MAX_LEVEL)).toBe(1);
        expect(Core.normalize((MIN_LEVEL + MAX_LEVEL) / 2, MIN_LEVEL, MAX_LEVEL)).toBeCloseTo(0.5, 5);
    });

    test('queda fixat a [0, 1] fora de rang', () => {
        expect(Core.normalize(-100, MIN_LEVEL, MAX_LEVEL)).toBe(0);
        expect(Core.normalize(99999, MIN_LEVEL, MAX_LEVEL)).toBe(1);
    });
});

describe('difficultyToLevel / levelToDifficulty', () => {
    test('rang antic 5-15 mapeja als extrems del nivell', () => {
        expect(Core.difficultyToLevel(5, MIN_LEVEL, MAX_LEVEL)).toBe(MIN_LEVEL);
        expect(Core.difficultyToLevel(15, MIN_LEVEL, MAX_LEVEL)).toBe(MAX_LEVEL);
    });

    test('valor per defecte (8) per a entrada nul·la', () => {
        const expected = Math.round(MIN_LEVEL + ((8 - 5) / 10) * (MAX_LEVEL - MIN_LEVEL));
        expect(Core.difficultyToLevel(null, MIN_LEVEL, MAX_LEVEL)).toBe(expected);
    });

    test('levelToDifficulty mapeja els extrems a 5 i 15', () => {
        expect(Core.levelToDifficulty(MIN_LEVEL, MIN_LEVEL, MAX_LEVEL)).toBe(5);
        expect(Core.levelToDifficulty(MAX_LEVEL, MIN_LEVEL, MAX_LEVEL)).toBe(15);
    });

    test('difficultyToLevel queda fixat fora del rang 5-15', () => {
        // 4 és per sota del mínim (5) → queda fixat al nivell mínim.
        // (Nota: 0 és falsy i el codi el tracta com el valor per defecte 8.)
        expect(Core.difficultyToLevel(4, MIN_LEVEL, MAX_LEVEL)).toBe(MIN_LEVEL);
        expect(Core.difficultyToLevel(50, MIN_LEVEL, MAX_LEVEL)).toBe(MAX_LEVEL);
    });
});

describe('rocToEngineElo', () => {
    test('limita al rang real del motor', () => {
        expect(Core.rocToEngineElo(200, ENGINE_MIN, ENGINE_MAX)).toBe(ENGINE_MIN);
        expect(Core.rocToEngineElo(9999, ENGINE_MIN, ENGINE_MAX)).toBe(ENGINE_MAX);
        expect(Core.rocToEngineElo(2000, ENGINE_MIN, ENGINE_MAX)).toBe(2000);
    });

    test('valor no numèric cau al terra del motor', () => {
        expect(Core.rocToEngineElo(NaN, ENGINE_MIN, ENGINE_MAX)).toBe(ENGINE_MIN);
    });
});

describe('eloToSearchDepth', () => {
    test('al terra i per sobre dona profunditat alta (12..16)', () => {
        expect(Core.eloToSearchDepth(ENGINE_MIN, ENGINE_MIN, ELO_MAX)).toBe(12);
        expect(Core.eloToSearchDepth(ELO_MAX, ENGINE_MIN, ELO_MAX)).toBe(16);
    });

    test("per sota del terra escala proporcionalment i mai baixa d'1", () => {
        expect(Core.eloToSearchDepth(0, ENGINE_MIN, ELO_MAX)).toBe(2);
        const mid = Core.eloToSearchDepth(ENGINE_MIN / 2, ENGINE_MIN, ELO_MAX);
        expect(mid).toBeGreaterThanOrEqual(2);
        expect(mid).toBeLessThan(12);
    });

    test("és monòtona no decreixent amb l'ELO", () => {
        let prev = -Infinity;
        for (let elo = 0; elo <= ELO_MAX; elo += 100) {
            const d = Core.eloToSearchDepth(elo, ENGINE_MIN, ELO_MAX);
            expect(d).toBeGreaterThanOrEqual(prev);
            prev = d;
        }
    });
});
