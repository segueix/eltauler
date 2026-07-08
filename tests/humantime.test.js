const Core = require('../core.js');

// Generador "aleatori" constant per fer deterministes els tests: amb el mateix
// valor injectat, el soroll log-normal és idèntic entre crides i les
// comparacions només depenen dels paràmetres que canviem.
const fixedRandom = () => 0.5;

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('estimateMoveComplexity', () => {
    test('posició trivial (gran escletxa, cerca estable) surt baixa', () => {
        const result = Core.estimateMoveComplexity({
            candidates: [
                { multipv: 1, move: 'e2e4', score: 250 },
                { multipv: 2, move: 'd2d4', score: -80 },
                { multipv: 3, move: 'g1f3', score: -120 }
            ],
            bestMoveChanges: 0,
            evalSamples: [245, 250, 250],
            shallowDeepSwingCp: 5,
            tacticalFlag: 0
        });
        expect(result.level).toBe('low');
        expect(result.score).toBeLessThan(0.33);
    });

    test('posició incerta i tàctica (candidates empatades, PV inestable) surt alta', () => {
        const result = Core.estimateMoveComplexity({
            candidates: [
                { multipv: 1, move: 'e2e4', score: 20 },
                { multipv: 2, move: 'd2d4', score: 15 },
                { multipv: 3, move: 'g1f3', score: 10 },
                { multipv: 4, move: 'c2c4', score: 5 }
            ],
            bestMoveChanges: 4,
            evalSamples: [80, -40, 60, -30],
            shallowDeepSwingCp: 180,
            tacticalFlag: 1
        });
        expect(result.level).toBe('high');
        expect(result.score).toBeGreaterThanOrEqual(0.66);
    });

    test('sense dades retorna una complexitat neutra dins [0, 1]', () => {
        const result = Core.estimateMoveComplexity({});
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
        expect(['low', 'medium', 'high']).toContain(result.level);
    });
});

describe('eloComplexityTimeMultiplier (matriu de l\'informe)', () => {
    test('ELO baix: gasta MÉS en posicions fàcils que en difícils', () => {
        const easy = Core.eloComplexityTimeMultiplier(900, 0.1);
        const hard = Core.eloComplexityTimeMultiplier(900, 0.9);
        expect(easy).toBeGreaterThan(hard);
    });

    test('ELO alt: gasta MENYS en posicions fàcils i més en les crítiques', () => {
        const easy = Core.eloComplexityTimeMultiplier(2500, 0.1);
        const hard = Core.eloComplexityTimeMultiplier(2500, 0.9);
        expect(hard).toBeGreaterThan(easy);
        expect(easy).toBeLessThan(1);
    });

    test('els valors extrems coincideixen amb les cantonades de la matriu', () => {
        expect(Core.eloComplexityTimeMultiplier(500, 0)).toBeCloseTo(1.15, 2);
        expect(Core.eloComplexityTimeMultiplier(3000, 1)).toBeCloseTo(1.30, 2);
    });
});

describe('phaseFromFen', () => {
    test('posició inicial és obertura', () => {
        expect(Core.phaseFromFen(START_FEN)).toBe('opening');
    });

    test('poc material no-peó és final', () => {
        expect(Core.phaseFromFen('8/8/4k3/8/8/4K3/8/4R3 w - - 0 50')).toBe('endgame');
    });

    test('material complet passada la jugada 10 és migjoc', () => {
        const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/4P3/2N2N2/PPPP1PPP/R1BQKB1R w KQkq - 0 15';
        expect(Core.phaseFromFen(fen)).toBe('middlegame');
    });

    test('FEN invàlid no peta i retorna migjoc', () => {
        expect(Core.phaseFromFen('')).toBe('middlegame');
        expect(Core.phaseFromFen(null)).toBe('middlegame');
    });
});

describe('humanThinkTimeMs', () => {
    const base = {
        incMs: 0,
        phase: 'middlegame',
        moveNumber: 20,
        random: fixedRandom
    };

    test('a igual rellotge, un ELO baix pensa més que un d\'alt en jugades fàcils', () => {
        const low = Core.humanThinkTimeMs({ ...base, timeControlId: '10+0', remainingMs: 600000, elo: 800, complexity: 0.1 });
        const high = Core.humanThinkTimeMs({ ...base, timeControlId: '10+0', remainingMs: 600000, elo: 2000, complexity: 0.1 });
        expect(low).toBeGreaterThan(high);
    });

    test('un ELO alt pensa més en jugades difícils que en fàcils', () => {
        const easy = Core.humanThinkTimeMs({ ...base, timeControlId: '10+0', remainingMs: 600000, elo: 2000, complexity: 0.1 });
        const hard = Core.humanThinkTimeMs({ ...base, timeControlId: '10+0', remainingMs: 600000, elo: 2000, complexity: 0.9 });
        expect(hard).toBeGreaterThan(easy);
    });

    test('amb menys temps al rellotge es pensa menys', () => {
        const fresh = Core.humanThinkTimeMs({ ...base, timeControlId: '5+0', remainingMs: 300000, elo: 1400, complexity: 0.5 });
        const drained = Core.humanThinkTimeMs({ ...base, timeControlId: '5+0', remainingMs: 60000, elo: 1400, complexity: 0.5 });
        expect(drained).toBeLessThan(fresh);
    });

    test('els ritmes bullet responen molt més ràpid que els lents', () => {
        const bullet = Core.humanThinkTimeMs({ ...base, timeControlId: '30s', remainingMs: 30000, elo: 1400, complexity: 0.5 });
        const rapid = Core.humanThinkTimeMs({ ...base, timeControlId: '10+0', remainingMs: 600000, elo: 1400, complexity: 0.5 });
        expect(bullet).toBeLessThan(rapid / 4);
    });

    test('mode d\'emergència: amb el rellotge sota mínims respon quasi a l\'acte i mai gasta més de la meitat del temps', () => {
        const panic = Core.humanThinkTimeMs({ ...base, timeControlId: '5+0', remainingMs: 3000, elo: 1400, complexity: 0.9 });
        expect(panic).toBeLessThanOrEqual(500);
        expect(panic).toBeLessThanOrEqual(3000 * 0.5);
        expect(panic).toBeGreaterThan(0);
    });

    test('respecta el sòl i el sostre del perfil', () => {
        const profile = Core.HUMAN_TIME_PROFILES['15+10'];
        const tiny = Core.humanThinkTimeMs({ ...base, timeControlId: '15+10', remainingMs: 200000, incMs: 10000, elo: 2000, complexity: 0, moveNumber: 1 });
        const huge = Core.humanThinkTimeMs({ ...base, timeControlId: '15+10', remainingMs: 900000, incMs: 10000, elo: 2000, complexity: 1, moveNumber: 40 });
        expect(tiny).toBeGreaterThanOrEqual(profile.minMs);
        expect(huge).toBeLessThanOrEqual(profile.maxMs);
    });

    test('les primeres jugades "de llibre" surten més ràpid que el migjoc', () => {
        const first = Core.humanThinkTimeMs({ ...base, timeControlId: '10+0', remainingMs: 600000, elo: 1400, complexity: 0.5, moveNumber: 1, phase: 'opening' });
        const later = Core.humanThinkTimeMs({ ...base, timeControlId: '10+0', remainingMs: 580000, elo: 1400, complexity: 0.5, moveNumber: 20 });
        expect(first).toBeLessThan(later);
    });

    test('sense rellotge (perfil none) dona un temps acotat i raonable', () => {
        const profile = Core.HUMAN_TIME_PROFILES.none;
        const t = Core.humanThinkTimeMs({ ...base, timeControlId: 'none', remainingMs: null, elo: 1400, complexity: 0.5 });
        expect(t).toBeGreaterThanOrEqual(profile.minMs);
        expect(t).toBeLessThanOrEqual(profile.maxMs);
    });

    test('un ritme desconegut cau al perfil none sense petar', () => {
        const t = Core.humanThinkTimeMs({ ...base, timeControlId: 'ritme-inexistent', remainingMs: null, elo: 1400, complexity: 0.5 });
        expect(t).toBeGreaterThan(0);
    });

    test('amb soroll real es manté dins dels límits del perfil', () => {
        for (let i = 0; i < 200; i++) {
            const t = Core.humanThinkTimeMs({
                timeControlId: '3+2', remainingMs: 180000, incMs: 2000,
                elo: 1400, complexity: 0.5, phase: 'middlegame', moveNumber: 15
            });
            const profile = Core.HUMAN_TIME_PROFILES['3+2'];
            expect(t).toBeGreaterThanOrEqual(profile.minMs);
            expect(t).toBeLessThanOrEqual(profile.maxMs);
        }
    });
});
