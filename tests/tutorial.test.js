const Tutorial = require('../tutorial.js');
const { Chess } = require('chess.js');

// ---------------------------------------------------------------------------
// Tutorials: «Aprèn a jugar» (lliçons d'escacs amb tauler) i «Guia d'El
// Tauler». El contingut és dades: aquí es comprova amb chess.js REAL que
// totes les posicions carreguen, que cada exercici té solució i que les
// solucions anunciades són legals; i la lògica pura d'intent, destins i
// progrés que fa servir la interfície.
// ---------------------------------------------------------------------------

const { LESSONS, GUIDE } = Tutorial;
const SQUARE = /^[a-h][1-8]$/;

function allSteps() {
    const out = [];
    LESSONS.forEach(l => l.steps.forEach((s, i) => out.push({ lesson: l, step: s, i })));
    return out;
}
function findStep(lessonId, predicate) {
    const lesson = LESSONS.find(l => l.id === lessonId);
    return lesson.steps.find(predicate);
}

describe('lliçons: estructura', () => {
    test('hi ha lliçons amb ids únics, títol, resum i passos', () => {
        expect(LESSONS.length).toBeGreaterThanOrEqual(10);
        const ids = LESSONS.map(l => l.id);
        expect(new Set(ids).size).toBe(ids.length);
        LESSONS.forEach(l => {
            expect(typeof l.title).toBe('string');
            expect(l.title.length).toBeGreaterThan(0);
            expect(typeof l.summary).toBe('string');
            expect(Array.isArray(l.steps) && l.steps.length > 0).toBe(true);
        });
    });

    test('cada pas té un tipus conegut i text', () => {
        allSteps().forEach(({ lesson, step, i }) => {
            expect(Tutorial.STEP_KINDS).toContain(step.kind);
            expect(typeof step.text).toBe('string');
            expect(step.text.length).toBeGreaterThan(10);
            if (step.kind === 'task') {
                expect(step.accept && typeof step.accept === 'object').toBe(true);
                const hasMoves = Array.isArray(step.accept.moves) && step.accept.moves.length > 0;
                const hasPredicate = Tutorial.PREDICATES.includes(step.accept.predicate);
                expect(hasMoves || hasPredicate).toBe(true);
                expect(typeof step.success).toBe('string');
                expect(typeof step.fail).toBe('string');
            }
            if (step.kind === 'square') expect(SQUARE.test(step.square)).toBe(true);
            if (step.kind === 'explore' || step.kind === 'task') expect(typeof step.fen).toBe('string');
            void lesson; void i;
        });
    });

    test('cada lliçó té almenys un pas interactiu tret de les purament explicatives', () => {
        const interactive = LESSONS.filter(l => l.steps.some(s => s.kind === 'task' || s.kind === 'explore' || s.kind === 'square'));
        expect(interactive.length).toBeGreaterThanOrEqual(9);
    });
});

describe('lliçons: posicions i solucions (chess.js real)', () => {
    test('totes les posicions carreguen exactament com estan escrites', () => {
        allSteps().forEach(({ lesson, step, i }) => {
            if (typeof step.fen !== 'string' || step.fen === 'empty') return;
            const chess = new Chess(step.fen);
            expect({ lesson: lesson.id, step: i, fen: chess.fen().split(' ')[0] })
                .toEqual({ lesson: lesson.id, step: i, fen: step.fen.split(' ')[0] });
        });
    });

    test('les posicions d\'exploració i exercici no són partides acabades', () => {
        allSteps().forEach(({ step }) => {
            if (step.kind !== 'explore' && step.kind !== 'task') return;
            expect(new Chess(step.fen).game_over()).toBe(false);
        });
    });

    test('cada exercici té almenys una solució legal i les jugades anunciades hi són', () => {
        allSteps().forEach(({ lesson, step, i }) => {
            if (step.kind !== 'task') return;
            const solutions = Tutorial.lessonSolutions(Chess, step);
            expect({ lesson: lesson.id, step: i, n: solutions.length > 0 }).toEqual({ lesson: lesson.id, step: i, n: true });
            if (Array.isArray(step.accept.moves)) {
                step.accept.moves.forEach(m => {
                    expect(solutions.some(s => s === m || s.slice(0, 4) === m)).toBe(true);
                });
            }
        });
    });

    test('quan la solució és una jugada concreta, la resta de jugades legals es rebutgen', () => {
        allSteps().forEach(({ step }) => {
            if (step.kind !== 'task' || !Array.isArray(step.accept.moves)) return;
            const chess = new Chess(step.fen);
            const wrong = chess.moves({ verbose: true }).filter(m => !step.accept.moves.includes(m.from + m.to));
            wrong.forEach(m => {
                const r = Tutorial.lessonAttempt(Chess, step, m.from, m.to, m.promotion);
                expect(r.ok).toBe(false);
                expect(['wrong', 'stalemate']).toContain(r.reason);
            });
        });
    });

    test('showTargets apunta a una peça del bàndol que mou amb destins; marks són caselles', () => {
        allSteps().forEach(({ step }) => {
            if (step.showTargets) {
                expect(SQUARE.test(step.showTargets)).toBe(true);
                const chess = new Chess(step.fen);
                const piece = chess.get(step.showTargets);
                expect(piece && piece.color === chess.turn()).toBe(true);
                expect(Tutorial.lessonTargets(Chess, step.fen, step.showTargets).length).toBeGreaterThan(0);
            }
            if (Array.isArray(step.marks)) step.marks.forEach(sq => expect(SQUARE.test(sq)).toBe(true));
        });
    });

    test('les exploracions tenen alguna peça pròpia amb jugades', () => {
        allSteps().forEach(({ step }) => {
            if (step.kind !== 'explore') return;
            const chess = new Chess(step.fen);
            const movable = chess.moves({ verbose: true }).map(m => m.from);
            expect(new Set(movable).size).toBeGreaterThan(0);
        });
    });
});

describe('lessonAttempt: casos concrets', () => {
    test('jugada il·legal, jugada equivocada i jugada bona', () => {
        const step = findStep('peo', s => s.kind === 'task' && s.accept.moves && s.accept.moves[0] === 'e2e4');
        expect(Tutorial.lessonAttempt(Chess, step, 'e2', 'e5').reason).toBe('illegal');
        const wrong = Tutorial.lessonAttempt(Chess, step, 'd2', 'd4');
        expect(wrong.ok).toBe(false);
        expect(wrong.reason).toBe('wrong');
        expect(wrong.fenAfter).toContain('3P4');
        const good = Tutorial.lessonAttempt(Chess, step, 'e2', 'e4');
        expect(good.ok).toBe(true);
        expect(good.reason).toBeNull();
        expect(good.move.san).toBe('e4');
    });

    test('mat sense ofegar: l\'ofegat es detecta amb el seu missatge propi', () => {
        const step = findStep('taules', s => s.kind === 'task');
        const stalemate = Tutorial.lessonAttempt(Chess, step, 'e7', 'f7');
        expect(stalemate.ok).toBe(false);
        expect(stalemate.reason).toBe('stalemate');
        expect(typeof step.stalemate).toBe('string');
        const mate = Tutorial.lessonAttempt(Chess, step, 'e7', 'g7');
        expect(mate.ok).toBe(true);
        expect(new Chess(mate.fenAfter).in_checkmate()).toBe(true);
    });

    test('mat del passadís amb la torre i mat de dama', () => {
        const rook = findStep('escac', s => s.kind === 'task' && s.accept.predicate === 'checkmate' && s.fen.startsWith('6k1'));
        expect(Tutorial.lessonAttempt(Chess, rook, 'a1', 'a8').ok).toBe(true);
        expect(Tutorial.lessonAttempt(Chess, rook, 'a1', 'a7').ok).toBe(false);
        const queen = findStep('escac', s => s.kind === 'task' && s.accept.predicate === 'checkmate' && s.fen.startsWith('7k'));
        expect(Tutorial.lessonAttempt(Chess, queen, 'd7', 'g7').ok).toBe(true);
        expect(Tutorial.lessonAttempt(Chess, queen, 'd7', 'a7').ok).toBe(false);
        expect(Tutorial.lessonAttempt(Chess, queen, 'd7', 'f7').reason).toBe('stalemate');
    });

    test('enroc curt i llarg, captura al pas i coronació', () => {
        const short = findStep('especials', s => s.kind === 'task' && s.accept.moves && s.accept.moves[0] === 'e1g1');
        const r1 = Tutorial.lessonAttempt(Chess, short, 'e1', 'g1');
        expect(r1.ok && r1.move.flags.includes('k')).toBe(true);
        const long = findStep('especials', s => s.kind === 'task' && s.accept.moves && s.accept.moves[0] === 'e1c1');
        const r2 = Tutorial.lessonAttempt(Chess, long, 'e1', 'c1');
        expect(r2.ok && r2.move.flags.includes('q')).toBe(true);
        const ep = findStep('especials', s => s.kind === 'task' && s.accept.moves && s.accept.moves[0] === 'e5d6');
        const r3 = Tutorial.lessonAttempt(Chess, ep, 'e5', 'd6');
        expect(r3.ok && r3.move.flags.includes('e')).toBe(true);
        const promo = findStep('especials', s => s.kind === 'task' && s.accept.predicate === 'promote');
        expect(Tutorial.lessonAttempt(Chess, promo, 'a7', 'a8', 'q').ok).toBe(true);
        expect(Tutorial.lessonAttempt(Chess, promo, 'a7', 'a8', 'n').ok).toBe(true);
        expect(Tutorial.lessonAttempt(Chess, promo, 'e1', 'e2').ok).toBe(false);
    });

    test('sortir de l\'escac: qualsevol jugada legal val, una d\'il·legal no', () => {
        const step = findStep('escac', s => s.kind === 'task' && s.accept.predicate === 'any');
        expect(Tutorial.lessonAttempt(Chess, step, 'e8', 'd7').ok).toBe(true);
        expect(Tutorial.lessonAttempt(Chess, step, 'e8', 'e7').reason).toBe('illegal');
    });

    test('forquilla de cavall: la casella bona fa escac al rei i ataca la torre', () => {
        const step = findStep('cavall', s => s.kind === 'task' && s.accept.moves && s.accept.moves[0] === 'd5e7');
        const r = Tutorial.lessonAttempt(Chess, step, 'd5', 'e7');
        expect(r.ok).toBe(true);
        const after = new Chess(r.fenAfter);
        expect(after.in_check()).toBe(true);
        expect(after.moves({ verbose: true }).every(m => m.piece === 'k')).toBe(true);
    });

    test('entrades invàlides no rebenten', () => {
        expect(Tutorial.lessonAttempt(null, null, 'e2', 'e4').ok).toBe(false);
        expect(Tutorial.lessonAttempt(Chess, { kind: 'text' }, 'e2', 'e4').ok).toBe(false);
        expect(Tutorial.lessonAttempt(Chess, { kind: 'task', fen: 'no és una fen', accept: { predicate: 'any' } }, 'e2', 'e4').reason).toBe('illegal');
        expect(Tutorial.lessonTargets(Chess, 'empty', 'e2')).toEqual([]);
        expect(Tutorial.lessonTargets(Chess, LESSONS[0].steps[0].fen, 'z9')).toEqual([]);
        expect(Tutorial.lessonTargets(Chess, LESSONS[0].steps[0].fen, 'e2')).toEqual(['e3', 'e4']);
    });
});

describe('progrés', () => {
    test('normalització de dades corruptes', () => {
        expect(Tutorial.normalizeProgress(null)).toEqual({ done: {}, last: null });
        expect(Tutorial.normalizeProgress('x')).toEqual({ done: {}, last: null });
        expect(Tutorial.normalizeProgress({ done: { peo: true, torre: 0 }, last: 42 })).toEqual({ done: { peo: true }, last: null });
    });

    test('resum: fetes, següent pendent i tot fet', () => {
        const none = Tutorial.progressSummary(null);
        expect(none.done).toBe(0);
        expect(none.total).toBe(LESSONS.length);
        expect(none.nextId).toBe(LESSONS[0].id);
        expect(none.allDone).toBe(false);
        expect(Tutorial.progressLabel(none)).toContain('lliçons');

        const some = Tutorial.progressSummary({ done: { [LESSONS[0].id]: true, [LESSONS[2].id]: true } });
        expect(some.done).toBe(2);
        expect(some.nextId).toBe(LESSONS[1].id);
        expect(Tutorial.progressLabel(some)).toBe('2 de ' + LESSONS.length + ' lliçons fetes');

        const all = {};
        LESSONS.forEach(l => { all[l.id] = true; });
        const done = Tutorial.progressSummary({ done: all });
        expect(done.allDone).toBe(true);
        expect(done.nextId).toBeNull();
        expect(Tutorial.progressLabel(done)).toContain('✓');
    });
});

describe('guia de l\'app', () => {
    test('seccions i targetes amb ids únics, títol i text', () => {
        expect(GUIDE.length).toBeGreaterThanOrEqual(5);
        const secIds = GUIDE.map(s => s.id);
        expect(new Set(secIds).size).toBe(secIds.length);
        const itemIds = [];
        GUIDE.forEach(sec => {
            expect(typeof sec.title).toBe('string');
            expect(sec.items.length).toBeGreaterThan(0);
            sec.items.forEach(item => {
                itemIds.push(item.id);
                expect(typeof item.title).toBe('string');
                expect(item.text.length).toBeGreaterThan(40);
                if (item.action !== null) expect(Tutorial.ACTION_IDS).toContain(item.action);
            });
        });
        expect(new Set(itemIds).size).toBe(itemIds.length);
    });

    test('cobreix les modalitats principals de l\'app', () => {
        const actions = new Set();
        GUIDE.forEach(sec => sec.items.forEach(item => { if (item.action) actions.add(item.action); }));
        ['new-game', 'daily', 'positional', 'antidote', 'league', 'hieroglyphics', 'tria', 'tactics', 'errors',
            'openings', 'explorer', 'catalans', 'ranking', 'history', 'stats', 'settings'].forEach(a => expect(actions.has(a)).toBe(true));
    });
});
