const Core = require('../core.js');

// Constants reals de catalans.js (nivell de les partides col·lectives).
const OPTS = { startStep: 200, minStep: 40, stepHalfLife: 2, min: 200, max: 2850 };

const step = (n) => Core.collectiveLadderStep(n, OPTS);
const next = (sf, score, n) => Core.adaptedRivalStrength(sf, score, n, OPTS);

describe('collectiveLadderStep', () => {
    test('l\'ajust és gros al principi i s\'escurça amb les partides', () => {
        expect(step(0)).toBe(200);
        expect(step(2)).toBe(100);
        expect(step(4)).toBe(67);
        expect(step(8)).toBe(40);
    });

    test('mai no baixa del mínim: el nivell no es congela', () => {
        expect(step(50)).toBe(40);
        expect(step(5000)).toBe(40);
    });

    test('valors absents o negatius compten com a cap partida jugada', () => {
        expect(step(undefined)).toBe(200);
        expect(step(-3)).toBe(200);
    });
});

describe('adaptedRivalStrength', () => {
    test('l\'ELO de Stockfish puja si guanya l\'exèrcit i baixa si perd', () => {
        expect(next(1350, 1, 0).strength).toBe(1550);
        expect(next(1350, 0, 0).strength).toBe(1150);
    });

    test('en taules es queda on és (ja estan igualats)', () => {
        const r = next(1350, 0.5, 0);
        expect(r.strength).toBe(1350);
        expect(r.delta).toBe(0);
    });

    test('el moviment és el pas de la partida que toca', () => {
        expect(next(1000, 1, 4).delta).toBe(67);
        expect(next(1000, 0, 4).delta).toBe(-67);
        expect(next(1000, 1, 20).delta).toBe(40);
    });

    test('es manté dins del rang del motor i ho reflecteix al delta', () => {
        expect(next(250, 0, 0).strength).toBe(200);
        expect(next(250, 0, 0).delta).toBe(-50);
        expect(next(2800, 1, 0).strength).toBe(2850);
        expect(next(2800, 1, 0).delta).toBe(50);
    });

    test('entrades dolentes no trenquen el càlcul', () => {
        expect(next(undefined, undefined, undefined).strength).toBe(1350);
        expect(next(1350, 5, 0).strength).toBe(1550);   // el resultat es limita a [0, 1]
        expect(next(1350, -5, 0).strength).toBe(1150);
    });
});

describe('bucle autoregulat: el nivell de Stockfish busca l\'exèrcit', () => {
    // Simula la sèrie: Stockfish arrenca a 1350 i s'adapta pel resultat. L'exèrcit
    // té una força REAL desconeguda i la probabilitat de guanyar surt de la
    // fórmula d'Elo contra el nivell a què juga Stockfish.
    function runSeries(trueStrength, games, seed) {
        let sf = 1350, rnd = seed;
        const rand = () => { rnd = (rnd * 1103515245 + 12345) % 2147483648; return rnd / 2147483648; };
        for (let i = 0; i < games; i++) {
            const expected = 1 / (1 + Math.pow(10, (sf - trueStrength) / 400));
            const r = rand();
            const score = r < expected * 0.9 ? 1 : (r < expected * 0.9 + 0.2 ? 0.5 : 0);
            sf = next(sf, score, i).strength;
        }
        return sf;
    }

    test('baixa fins a trobar un exèrcit feble (mode ROC)', () => {
        expect(Math.abs(runSeries(600, 60, 7) - 600)).toBeLessThan(300);
    });

    test('puja fins a trobar un exèrcit fort', () => {
        expect(Math.abs(runSeries(2000, 60, 11) - 2000)).toBeLessThan(300);
    });

    test('davant d\'un exèrcit igualat, el nivell es queda on és', () => {
        expect(Math.abs(runSeries(1350, 60, 3) - 1350)).toBeLessThan(250);
    });

    test('si l\'exèrcit es reforça, el nivell el segueix amunt (pas mínim)', () => {
        let sf = runSeries(800, 40, 5);
        for (let i = 40; i < 80; i++) sf = next(sf, 1, i).strength;   // ara guanyen sempre
        expect(sf).toBeGreaterThan(2000);
    });
});
