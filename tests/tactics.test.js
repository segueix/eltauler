const Core = require('../core.js');

// Banc petit de proves (els FEN es tracten com a cadenes opaques).
const BANK = ['fenA', 'fenB', 'fenC'];

describe('rotació del banc de tàctiques', () => {
    test('una posició resolta queda fora del cicle', () => {
        const recent = Core.tacticsRecordSolved(BANK, [], 'fenA');
        expect(recent).toEqual(['fenA']);
        expect(Core.tacticsPickPool(BANK, recent)).toEqual(['fenB', 'fenC']);
    });

    test('resoldre dues posicions deixa només la pendent', () => {
        let recent = Core.tacticsRecordSolved(BANK, [], 'fenA');
        recent = Core.tacticsRecordSolved(BANK, recent, 'fenB');
        expect(Core.tacticsPickPool(BANK, recent)).toEqual(['fenC']);
    });

    test('resoldre la mateixa posició dues vegades no duplica el registre', () => {
        let recent = Core.tacticsRecordSolved(BANK, [], 'fenA');
        recent = Core.tacticsRecordSolved(BANK, recent, 'fenA');
        expect(recent).toEqual(['fenA']);
    });

    test('en completar tot el banc el cicle es reinicia sense repetir l\'última', () => {
        let recent = [];
        ['fenA', 'fenB', 'fenC'].forEach(f => { recent = Core.tacticsRecordSolved(BANK, recent, f); });
        // Nou cicle: només es recorda l'última resolta.
        expect(recent).toEqual(['fenC']);
        expect(Core.tacticsPickPool(BANK, recent)).toEqual(['fenA', 'fenB']);
    });

    test('cap posició no es repeteix dins d\'un mateix cicle', () => {
        let recent = [];
        const served = [];
        for (let i = 0; i < BANK.length; i++) {
            const pool = Core.tacticsPickPool(BANK, recent);
            const fen = pool[0];
            expect(served).not.toContain(fen);
            served.push(fen);
            recent = Core.tacticsRecordSolved(BANK, recent, fen);
        }
        expect(served.sort()).toEqual(BANK.slice().sort());
    });
});

describe('robustesa davant dades inconsistents', () => {
    test('recents no vàlids (garbage) → banc sencer', () => {
        expect(Core.tacticsPickPool(BANK, null)).toEqual(BANK);
        expect(Core.tacticsPickPool(BANK, undefined)).toEqual(BANK);
        expect(Core.tacticsPickPool(BANK, 'x')).toEqual(BANK);
    });

    test('si els recents cobreixen tot el banc (estat corrupte) → banc sencer, mai buit', () => {
        const pool = Core.tacticsPickPool(BANK, ['fenA', 'fenB', 'fenC']);
        expect(pool).toEqual(BANK);
    });

    test('recents amb posicions que ja no són al banc no bloquegen la rotació', () => {
        const recent = ['fenVella', 'fenA'];
        expect(Core.tacticsPickPool(BANK, recent)).toEqual(['fenB', 'fenC']);
        // El reinici de cicle també funciona amb entrades velles pel mig.
        let r = recent;
        r = Core.tacticsRecordSolved(BANK, r, 'fenB');
        r = Core.tacticsRecordSolved(BANK, r, 'fenC');
        expect(r).toEqual(['fenC']);
    });

    test('banc buit → cap candidata i registre inofensiu', () => {
        expect(Core.tacticsPickPool([], ['fenA'])).toEqual([]);
        expect(Core.tacticsRecordSolved([], [], 'fenA')).toEqual(['fenA']);
    });

    test('registre sense FEN no altera la llista', () => {
        expect(Core.tacticsRecordSolved(BANK, ['fenA'], null)).toEqual(['fenA']);
    });
});

describe('protecció de recursos durant la generació', () => {
    test('els intents fallits apliquen backoff exponencial amb un límit', () => {
        expect(Core.tacticsGenerationBackoffMs(0, false)).toBe(1500);
        expect(Core.tacticsGenerationBackoffMs(1, false)).toBe(60000);
        expect(Core.tacticsGenerationBackoffMs(3, false)).toBe(240000);
        expect(Core.tacticsGenerationBackoffMs(99, false)).toBe(1800000);
    });

    test('el segon pla modest té un pressupost mínim i no fa auto-joc', () => {
        expect(Core.tacticsGenerationBudget({ lowEnd: true })).toEqual({
            deadlineMs: 10000, realCandidates: 1, recentGames: 1,
            fensPerGame: 1, selfPlaySeeds: 0
        });
    });

    test('la generació manual conserva més marge però continua acotada', () => {
        const manual = Core.tacticsGenerationBudget({ manual: true });
        const background = Core.tacticsGenerationBudget({});
        expect(manual.deadlineMs).toBeGreaterThan(background.deadlineMs);
        expect(manual.selfPlaySeeds).toBe(2);
        expect(manual.realCandidates).toBeLessThanOrEqual(5);
    });
});
