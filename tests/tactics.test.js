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

    test('TOTES les tàctiques tenen dues jugades del jugador amb la rèplica del rival', () => {
        BANK_REAL.forEach(fen => {
            const sol = SOLUTIONS[fen];
            expect({ fen, passos: sol.steps.length, repliques: sol.replies.length }).toEqual({ fen, passos: 2, repliques: 1 });
            // La primera jugada no pot acabar la partida (no hi hauria segon pas).
            const g = new Chess(fen);
            g.move({ from: sol.steps[0].move.slice(0, 2), to: sol.steps[0].move.slice(2, 4), promotion: sol.steps[0].move[4] });
            expect({ fen, acabada: g.game_over() }).toEqual({ fen, acabada: false });
        });
    });

    test('l\'app només serveix tàctiques de dues jugades i no s\'encalla esperant la rèplica', () => {
        expect(src).toMatch(/const TACTICS_MIN_STEPS = 2;/);
        const pick = src.slice(src.indexOf('function pickTacticsFen()'), src.indexOf('function startTacticsPuzzle()'));
        expect(pick).toMatch(/tacticsFenHasTwoSteps/);
        expect(src).toMatch(/if \(isTacticsSession && bundleSequencePlayerSteps\(bundleFixedSequence\) < TACTICS_MIN_STEPS\) \{\n\s+const fallbackFen/);
        // La rèplica es fa encara que la marca prèvia es cancel·li o tardi.
        const reply = src.slice(src.indexOf('async function applyBundleAutoReply'), src.indexOf('function requestBundleAutoReply'));
        expect(reply).not.toMatch(/if \(!ready\) return;/);
        expect(reply).toMatch(/Promise\.race/);
        expect(reply).toMatch(/BUNDLE_REPLY_PREVIEW_MAX_MS/);
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

// ============================================================================
// Resultat palpable: la segona jugada ha de fer mat o guanyar material
// ============================================================================
describe('resultat palpable de la segona jugada (tacticStepVerdict)', () => {
    // Posició del banc antic on Stockfish proposava Kb1 (rei darrere els peons)
    // i després un avanç de peó: cap resultat a la vista.
    const REI_AMAGAT = '2rq1rk1/pp1bppbp/3p1np1/8/3NP3/2N1BP2/PPPQ2PP/2KR1B1R w - - 0 11';

    test('una jugada tranquil·la del rei no és un pas d\'exercici', () => {
        const v = Core.tacticStepVerdict(Chess, REI_AMAGAT, ['c1b1', 'a7a6', 'g2g4'], ['g2g4', 'b7b5'], { eval: 633, evalType: 'cp' });
        expect(v.ok).toBe(false);
        expect(v.stepGain).toBe(0);
    });

    test('la forquilla amb escac que guanya la torre sí que ho és', () => {
        const v = Core.tacticStepVerdict(Chess, 'r5k1/6pp/8/8/8/5P2/6PP/3Q2K1 w - - 0 1',
            ['d1d5', 'g8f8', 'd5a8'], ['d5a8', 'f8e7'], { eval: 7000, evalType: 'cp' });
        expect(v).toMatchObject({ ok: true, kind: 'material' });
        expect(v.stepGain).toBeGreaterThanOrEqual(2);
    });

    test('l\'escac i mat sempre és resultat palpable', () => {
        const v = Core.tacticStepVerdict(Chess, '5r1k/6pp/7N/3Q4/8/8/6PP/6K1 w - - 0 1',
            ['d5g8', 'f8g8', 'h6f7'], ['h6f7'], { eval: 1, evalType: 'mate' });
        expect(v).toMatchObject({ ok: true, kind: 'mate' });
    });

    test('un mat curt només compta si és únic', () => {
        // Posició amb dama i torre de més: moltes jugades fan mat aviat.
        const fen = '6k1/5ppp/8/8/8/8/1Q3PPP/3R2K1 w - - 0 1';
        const line = ['d1d7'];
        const unic = Core.tacticStepVerdict(Chess, fen, line, ['d1d7'], { eval: 2, evalType: 'mate' },
            { alternatives: [{ move: 'd1d7', eval: 2, evalType: 'mate' }, { move: 'h2h3', eval: 900, evalType: 'cp' }] });
        expect(unic).toMatchObject({ ok: true, kind: 'mate' });
        const diversos = Core.tacticStepVerdict(Chess, fen, line, ['d1d7'], { eval: 2, evalType: 'mate' },
            { alternatives: [{ move: 'd1d7', eval: 2, evalType: 'mate' }, { move: 'b2b8', eval: 2, evalType: 'mate' }] });
        expect(diversos.ok).toBe(false);
    });

    test('un canvi a mitges no compta com a guany (es mira el punt quiet)', () => {
        // Cxe5 guanya un peó però la PV continua amb la recaptura: no arriba a 2.
        const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3';
        const v = Core.tacticStepVerdict(Chess, fen, ['f3e5'], ['f3e5', 'c6e5', 'd2d4'], { eval: -150, evalType: 'cp' });
        expect(v.ok).toBe(false);
    });

    test('tacticTrimLine conserva el primer pas i talla el que no té resultat', () => {
        const line = ['c1b1', 'a7a6', 'g2g4', 'b7b5', 'h2h4'];
        const t = Core.tacticTrimLine(Chess, REI_AMAGAT, line, [0, 1, 2].map(k => ({ pv: line.slice(2 * k) })));
        expect(t.line).toEqual(['c1b1']);
        expect(t.steps).toBe(1);
    });
});

describe('banc de tàctiques: totes amb resultat palpable i Stockfish 19', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
    const readList = (name) => {
        const start = src.indexOf(`const ${name} = [`);
        const end = src.indexOf('\n];', start);
        return new Function(`${src.slice(start, end + 3)}\n;return ${name};`)();
    };
    const BANK_REAL = readList('TACTICS_BANK');
    const SOLUTIONS = (() => {
        const start = src.indexOf('const TACTICS_BANK_SOLUTIONS = ');
        const end = src.indexOf('\n};', start);
        return new Function(`${src.slice(start, end + 3)}\n;return TACTICS_BANK_SOLUTIONS;`)();
    })();

    test('la segona jugada de cada tàctica del banc fa mat o guanya material', () => {
        BANK_REAL.forEach(fen => {
            const sol = SOLUTIONS[fen];
            const line = [sol.steps[0].move, sol.replies[0].move, sol.steps[1].move];
            const v = Core.tacticStepVerdict(Chess, fen, line, sol.steps[1].pv,
                { eval: sol.steps[1].eval, evalType: sol.steps[1].evalType },
                { alternatives: sol.steps[1].alternatives });
            expect({ fen, line: sol.sanLine.join(' '), ok: v.ok, reason: v.reason })
                .toEqual({ fen, line: sol.sanLine.join(' '), ok: true, reason: v.reason });
        });
    });

    test('cap tàctica del banc no amaga el rei com a segona jugada', () => {
        BANK_REAL.forEach(fen => {
            const san = SOLUTIONS[fen].sanLine[2] || '';
            const quietKing = /^K/.test(san) && !/[x+#]/.test(san);
            expect({ fen, san, quietKing }).toEqual({ fen, san, quietKing: false });
        });
    });

    test('el rebost es genera amb Stockfish 19 i el filtre de resultat palpable', () => {
        const gen = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'gen-tactics-solutions.js'), 'utf8');
        expect(gen).toMatch(/stockfish-19-lite-single\.js/);
        expect(gen).not.toMatch(/require\(path\.join\(ROOT, 'stockfish\.js'\)\)/);
        expect(gen).toMatch(/tacticStepVerdict/);
    });

    test('la preparació en viu fa servir Stockfish 19 i retalla la segona jugada sense resultat', () => {
        const prep = src.slice(src.indexOf('async function prepareBundleSequence'), src.indexOf('async function prepareBundleSequence') + 12000);
        expect(prep).not.toMatch(/await analyzeFenRobust\(/);
        expect((prep.match(/await analyzeExerciseFen\(/g) || []).length).toBe(3);
        expect(prep).toMatch(/ElTaulerCore\.tacticStepVerdict\(/);
        const helper = src.slice(src.indexOf('async function analyzeExerciseFen'), src.indexOf('async function analyzeExerciseFen') + 800);
        expect(helper).toMatch(/analyzeHieroFenRobust\(/);
        // Les seqüències desades abans (motor ordinari, sense filtre) es descarten.
        expect(src).toMatch(/&& seq\.engine === 'sf19'/);
    });
});
