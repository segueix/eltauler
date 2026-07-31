const Core = require('../core.js');

// Constants reals de catalans.js (bucle de les partides col·lectives).
const SPREAD = 400;
const FLOOR = 1350;      // terra del motor: per sota, mode ROC
const MIN = 200;
const MAX = 2850;
const MIN_W = 0.2;

const OPTS_PERF = { spread: SPREAD, qualityCap: FLOOR };
const OPTS_RATING = { minWeight: MIN_W, min: MIN, max: MAX };

const perf = (opp, s, q) => Core.collectiveGamePerformance(opp, s, q, OPTS_PERF);
const rate = (prev, games, p) => Core.updatedCollectiveRating(prev, games, p, OPTS_RATING);

describe('collectiveGamePerformance', () => {
    test('sense senyal de qualitat, el resultat mou mig marge amunt o avall', () => {
        expect(perf(1350, 1, null)).toBe(1550);
        expect(perf(1350, 0, null)).toBe(1150);
        expect(perf(1350, 0.5, null)).toBe(1350);
    });

    test('la qualitat de joc mesurada hi pesa un terç quan és informativa', () => {
        // Guanya a 1000 (rendiment 1200) però jugant com un ROC 600.
        expect(perf(1000, 1, 600)).toBe(Math.round(1200 * (2 / 3) + 600 / 3));
    });

    test('una qualitat topada al terra del motor no compta', () => {
        // Per sobre del terra l'estimador de qualitat només diu «almenys 1350»:
        // no ha de fer baixar un exèrcit que ha guanyat a un rival fort.
        expect(perf(1800, 1, FLOOR)).toBe(2000);
        expect(perf(1800, 1, 2000)).toBe(2000);
    });

    test('valors absents o dolents no trenquen el càlcul', () => {
        expect(perf(undefined, undefined, undefined)).toBe(1350);
        expect(perf(1500, 2, null)).toBe(1700);   // el resultat es limita a [0, 1]
        expect(perf(1500, -1, null)).toBe(1300);
    });
});

describe('updatedCollectiveRating', () => {
    test('la primera partida fixa l\'estimació al rendiment', () => {
        expect(rate(null, 0, 1150)).toEqual({ rating: 1150, games: 1, weight: 1 });
    });

    test('el pes de cada partida nova decreix (1/2, 1/3, 1/4…)', () => {
        expect(rate(1000, 1, 1400).rating).toBe(1200);   // pes 1/2
        expect(rate(1200, 2, 1500).rating).toBe(1300);   // pes 1/3
        expect(rate(1000, 3, 1400).rating).toBe(1100);   // pes 1/4
    });

    test('el pes no baixa mai del sòl: l\'estimació segueix un equip que canvia', () => {
        const r = rate(1000, 99, 2000);
        expect(r.weight).toBe(MIN_W);
        expect(r.rating).toBe(1200);
        expect(r.games).toBe(100);
    });

    test('l\'estimació es manté dins dels límits del motor', () => {
        expect(rate(null, 0, 50).rating).toBe(MIN);
        expect(rate(null, 0, 9000).rating).toBe(MAX);
        expect(rate(250, 1, -500).rating).toBe(MIN);
    });

    test('sense rendiment (partida sense dades) no es toca l\'estimació', () => {
        expect(rate(1200, 5, null)).toEqual({ rating: 1200, games: 5, weight: 0 });
        expect(rate(null, 0, null).rating).toBeNull();
    });
});

describe('bucle autoregulat: Stockfish juga a l\'estimació i l\'estimació persegueix la força real', () => {
    // Simula la sèrie de partides. L'exèrcit té una força REAL desconeguda; la
    // probabilitat de guanyar surt de la fórmula d'Elo contra la força a què juga
    // Stockfish, que sempre és l'estimació vigent.
    function runLoop(trueStrength, games, seed, opts) {
        const o = opts || {};
        let rating = null, n = 0, rnd = seed;
        // Generador determinista (els tests no poden dependre de Math.random).
        const next = () => {
            rnd = (rnd * 1103515245 + 12345) % 2147483648;
            return rnd / 2147483648;
        };
        let opponent = o.start || 1350;
        for (let i = 0; i < games; i++) {
            const expected = 1 / (1 + Math.pow(10, (opponent - trueStrength) / 400));
            const r = next();
            const score = r < expected * 0.9 ? 1 : (r < expected * 0.9 + 0.2 ? 0.5 : 0);
            // Qualitat de joc coherent amb la força real (topada pel terra del motor).
            const quality = Math.min(FLOOR, trueStrength);
            const p = perf(opponent, score, quality);
            const upd = rate(rating, n, p);
            rating = upd.rating; n = upd.games;
            opponent = rating;
        }
        return { rating: rating, games: n, opponent: opponent };
    }

    test('convergeix prop d\'un exèrcit feble (ROC) partint de 1350', () => {
        const out = runLoop(600, 40, 7);
        expect(Math.abs(out.rating - 600)).toBeLessThan(250);
        expect(out.games).toBe(40);
    });

    test('convergeix prop d\'un exèrcit fort partint de 1350', () => {
        const out = runLoop(2000, 40, 11);
        expect(Math.abs(out.rating - 2000)).toBeLessThan(250);
    });

    test('el rival sempre juga a l\'estimació vigent', () => {
        const out = runLoop(1100, 15, 3);
        expect(out.opponent).toBe(out.rating);
    });

    test('si l\'equip canvia de força, l\'estimació el segueix (sòl del pes)', () => {
        // 30 partides a 800 i després l'equip es reforça a 1600.
        let rating = runLoop(800, 30, 5).rating;
        let n = 30;
        for (let i = 0; i < 25; i++) {
            const upd = rate(rating, n, perf(rating, 1, FLOOR));  // ara guanya sempre
            rating = upd.rating; n = upd.games;
        }
        expect(rating).toBeGreaterThan(1500);
    });
});
