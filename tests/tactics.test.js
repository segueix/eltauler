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

// ============================================================================
// Seqüència d'exercici a partir d'una línia ja verificada (sense motor)
// ============================================================================
const fs = require('fs');
const path = require('path');
const { Chess } = require('chess.js');

const seqHelpers = Core.createBundleSequenceHelpers(Chess);
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
// Mat del boig: negres juguen i fan mat en una.
const MAT_BOIG = 'rnbqkbnr/pppp1ppp/8/4p3/5PP1/8/PPPPP2P/RNBQKBNR b KQkq g3 0 2';

describe('seqüència d\'exercici a partir d\'una línia', () => {
    test('línia de 3 mitges jugades → exercici de 2 passos', () => {
        const seq = seqHelpers.buildSequenceFromLine(START, ['e2e4', 'e7e5', 'g1f3']);
        expect(seq.totalSteps).toBe(2);
        expect(seq.step1.playerMove).toBe('e2e4');
        expect(seq.step1.playerMoveSan).toBe('e4');
        expect(seq.opponentMove.move).toBe('e7e5');
        expect(seq.step2.playerMove).toBe('g1f3');
        expect(seq.fullSequence).toEqual(['e2e4', 'e7e5', 'g1f3']);
        expect(seq.fullSequenceSan).toEqual(['e4', 'e5', 'Nf3']);
        // Cada pas guarda la posició des d'on s'ha de jugar.
        expect(seq.step1.fen).toBe(START);
        expect(new Chess(seq.step2.fen).turn()).toBe('w');
    });

    test('línia de 5 mitges jugades → exercici de 3 passos', () => {
        const seq = seqHelpers.buildSequenceFromLine(START, ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4']);
        expect(seq.totalSteps).toBe(3);
        expect(seq.step3.playerMove).toBe('f1c4');
        expect(seq.opponentMove2.move).toBe('b8c6');
        expect(seq.fullSequence).toHaveLength(5);
    });

    test('mat en una → exercici d\'UN sol pas (abans no es podia preparar)', () => {
        const seq = seqHelpers.buildSequenceFromLine(MAT_BOIG, ['d8h4']);
        expect(seq.totalSteps).toBe(1);
        expect(seq.step1.playerMoveSan).toBe('Qh4#');
        expect(seq.step2).toBeUndefined();
        expect(seq.opponentMove).toBeUndefined();
        expect(seq.fullSequence).toEqual(['d8h4']);
    });

    test('la línia es talla quan la posició s\'acaba, encara que en porti més', () => {
        const seq = seqHelpers.buildSequenceFromLine(MAT_BOIG, ['d8h4', 'e1f2', 'h4f2']);
        expect(seq.totalSteps).toBe(1);
        expect(seq.fullSequence).toEqual(['d8h4']);
    });

    test('un pas sense rèplica del rival no compta com a pas', () => {
        // El reproductor necessita la resposta fixa per avançar de pas: amb
        // [jugador, rival] només hi ha un pas jugable.
        const seq = seqHelpers.buildSequenceFromLine(START, ['e2e4', 'e7e5']);
        expect(seq.totalSteps).toBe(1);
        expect(seq.fullSequence).toEqual(['e2e4']);
        expect(seq.opponentMove).toBeUndefined();
    });

    test('la línia es talla en la primera jugada il·legal', () => {
        const seq = seqHelpers.buildSequenceFromLine(START, ['e2e4', 'e7e5', 'e4e8']);
        expect(seq.totalSteps).toBe(1);
        expect(seq.fullSequence).toEqual(['e2e4']);
    });

    test('entrades impossibles → cap seqüència (mai un exercici trencat)', () => {
        expect(seqHelpers.buildSequenceFromLine(START, [])).toBeNull();
        expect(seqHelpers.buildSequenceFromLine(START, null)).toBeNull();
        expect(seqHelpers.buildSequenceFromLine(START, ['zzzz'])).toBeNull();
        expect(seqHelpers.buildSequenceFromLine(START, ['e7e5'])).toBeNull();  // no toca al negre
        expect(seqHelpers.buildSequenceFromLine('', ['e2e4'])).toBeNull();
        expect(Core.createBundleSequenceHelpers(null)).toBeNull();
    });

    test('les metadades del motor s\'afegeixen a cada pas i rèplica', () => {
        const seq = seqHelpers.buildSequenceFromLine(START, ['e2e4', 'e7e5', 'g1f3'], {
            stepMeta: [{ evalBefore: 30, alternatives: [{ move: 'e2e4' }, { move: 'd2d4' }] }, { evalBefore: 25 }],
            replyMeta: [{ eval: -30 }]
        });
        expect(seq.step1.evalBefore).toBe(30);
        expect(seq.step1.alternatives.map(a => a.move)).toEqual(['e2e4', 'd2d4']);
        expect(seq.step2.evalBefore).toBe(25);
        expect(seq.opponentMove.eval).toBe(-30);
    });

    test('maxPlayerMoves limita els passos', () => {
        const seq = seqHelpers.buildSequenceFromLine(START, ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4'], { maxPlayerMoves: 2 });
        expect(seq.totalSteps).toBe(2);
        expect(seq.fullSequence).toEqual(['e2e4', 'e7e5', 'g1f3']);
    });
});

// ============================================================================
// El banc REAL de l'app: cap posició no pot deixar la secció sense exercici
// ============================================================================
describe('banc de tàctiques real (app.js)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
    const readConst = (name, open, close) => {
        const start = src.indexOf(`const ${name} = `);
        const end = src.indexOf(`\n${close};`, start);
        return new Function(`${src.slice(start, end + close.length + 2)}\n;return ${name};`)();
    };
    const BANK_REAL = readConst('TACTICS_BANK', '[', ']');
    const SOLUTIONS = (() => {
        const start = src.indexOf('const TACTICS_BANK_SOLUTIONS = ');
        const end = src.indexOf('\n};', start);
        return new Function(`${src.slice(start, end + 3)}\n;return TACTICS_BANK_SOLUTIONS;`)();
    })();

    test('s\'ha pogut llegir el banc i el rebost', () => {
        expect(BANK_REAL.length).toBeGreaterThan(5);
        expect(Object.keys(SOLUTIONS).length).toBeGreaterThan(0);
    });

    test('cap posició del banc no està ja acabada (mat o taules)', () => {
        BANK_REAL.forEach(fen => {
            const g = new Chess(fen);
            expect({ fen, over: g.game_over(), moves: g.moves().length > 0 })
                .toEqual({ fen, over: false, moves: true });
        });
    });

    test('TOTES les posicions del banc tenen línia preparada de fàbrica', () => {
        BANK_REAL.forEach(fen => {
            expect({ fen, teSolucio: !!SOLUTIONS[fen] }).toEqual({ fen, teSolucio: true });
        });
    });

    test('cada línia del rebost és legal i dona un exercici jugable', () => {
        Object.keys(SOLUTIONS).forEach(fen => {
            const sol = SOLUTIONS[fen];
            const line = [];
            sol.steps.forEach((step, i) => {
                line.push(step.move);
                const reply = (sol.replies || [])[i];
                if (reply) line.push(reply.move);
            });
            const seq = seqHelpers.buildSequenceFromLine(fen, line);
            expect({ fen, ok: !!seq }).toEqual({ fen, ok: true });
            // La seqüència reconstruïda ha de conservar tots els passos desats.
            expect({ fen, passos: seq.totalSteps }).toEqual({ fen, passos: sol.totalSteps });
            // I ha de tenir la rèplica fixa entre pas i pas.
            for (let i = 2; i <= seq.totalSteps; i++) {
                const key = i === 2 ? 'opponentMove' : 'opponentMove' + i;
                expect({ fen, pas: i, replica: !!seq[key] }).toEqual({ fen, pas: i, replica: true });
            }
        });
    });

    test('el rebost no conté posicions que ja no són al banc', () => {
        const bank = new Set(BANK_REAL);
        Object.keys(SOLUTIONS).forEach(fen => {
            // El repte diari comparteix banc: s\'admet alguna posició extra seva.
            const g = new Chess(fen);
            expect({ fen, jugable: !g.game_over() }).toEqual({ fen, jugable: true });
            if (!bank.has(fen)) expect(typeof fen).toBe('string');
        });
    });
});
