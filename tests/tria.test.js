const Core = require('../core.js');
const { Chess } = require('chess.js');

const T = Core.createTriaHelpers(Chess);
const CFG = Core.TRIA_CONFIG;

// Posició real després de 1.e4 e5 2.Nf3 Nc6 3.Bc4 Nf6 (obertura italiana,
// juguen blanques). Serveix per a totes les proves que necessiten jugades
// legals de veritat.
const FEN = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';

function mpv(move, evalCp, extra = {}) {
    return Object.assign({ move, moveSan: null, eval: evalCp, evalType: 'cp', pv: [] }, extra);
}

// Errada tipus: la millor era d2d3 (+40); vas jugar f3e5 (perdent 260 cp) i el
// MultiPV desat porta una tercera línia jugable.
function errorRecord(extra = {}) {
    return Object.assign({
        fen: FEN,
        moveNumber: 4,
        quality: 'blunder',
        swing: 260,
        cpLoss: 260,
        playerMove: 'f3e5',
        playerMoveSan: 'Nxe5',
        bestMove: 'd2d3',
        bestMoveSan: 'd3',
        multipvBefore: [
            mpv('d2d3', 40),
            mpv('f3g5', -110),   // distractor natural i dolent (cavall a g5)
            mpv('f3e5', -220)    // la teva jugada
        ]
    }, extra);
}

describe('triaTimeBudgetMs (temps per ELO i dificultat)', () => {
    test('una posició difícil dona més temps que una de fàcil, al mateix ELO', () => {
        const easy = Core.triaTimeBudgetMs({ elo: 2000, complexity: 0.1, phase: 'middlegame' });
        const hard = Core.triaTimeBudgetMs({ elo: 2000, complexity: 0.9, phase: 'middlegame' });
        expect(hard).toBeGreaterThan(easy * 1.8);
    });

    test('és determinista: la mateixa entrada dona sempre el mateix pressupost', () => {
        const a = Core.triaTimeBudgetMs({ elo: 1750, complexity: 0.42, phase: 'endgame' });
        const b = Core.triaTimeBudgetMs({ elo: 1750, complexity: 0.42, phase: 'endgame' });
        expect(a).toBe(b);
    });

    test('conserva la forma humana: com més fort, més contrast entre fàcil i difícil', () => {
        const spread = elo => Core.triaTimeBudgetMs({ elo, complexity: 0.9, phase: 'middlegame' })
            / Core.triaTimeBudgetMs({ elo, complexity: 0.1, phase: 'middlegame' });
        expect(spread(2400)).toBeGreaterThan(spread(1200));
    });

    test('respecta el terra i el sostre', () => {
        const floor = Core.triaTimeBudgetMs({ elo: 2800, complexity: 0, phase: 'opening' });
        expect(floor).toBe(CFG.time.floorMs);
        const capped = Core.triaTimeBudgetMs({ elo: 2800, complexity: 1, phase: 'endgame' });
        expect(capped).toBeLessThanOrEqual(CFG.time.capMs);
    });

    test('cada preview afegeix el seu plus, i el nombre de plusos té sostre', () => {
        const base = Core.triaTimeBudgetMs({ elo: 1800, complexity: 0.5, phase: 'middlegame' });
        const one = Core.triaTimeBudgetMs({ elo: 1800, complexity: 0.5, phase: 'middlegame', previews: 1 });
        expect(one - base).toBe(CFG.time.previewBonusMs);
        const many = Core.triaTimeBudgetMs({ elo: 1800, complexity: 0.5, phase: 'middlegame', previews: 9 });
        expect(many - base).toBe(CFG.time.maxPreviewBonuses * CFG.time.previewBonusMs);
    });

    test('sense dades cau a una incertesa neutra en comptes de petar', () => {
        expect(Core.triaTimeBudgetMs({})).toBeGreaterThan(0);
        expect(Core.triaTimeBudgetMs()).toBeGreaterThan(0);
    });
});

describe('triaEligibleErrors (quines errades entren)', () => {
    const blunder = { fen: FEN, quality: 'blunder', swing: 300, playerMove: 'f3e5', moveNumber: 4 };
    const mistake = { fen: FEN, quality: 'mistake', swing: 150, playerMove: 'c4f7', moveNumber: 6 };
    const inaccuracy = {
        fen: FEN, quality: 'inaccuracy', swing: 80, playerMove: 'b1c3', moveNumber: 8,
        evalBefore: 120, evalAfter: 40
    };

    test('les errades greus i els errors hi entren sempre', () => {
        const out = Core.triaEligibleErrors([blunder, mistake], {});
        expect(out).toHaveLength(2);
    });

    test('una imprecisió es queda fora si no repeteix cap tema que ja falles', () => {
        const out = Core.triaEligibleErrors([inaccuracy], { failingThemes: [] });
        expect(out).toHaveLength(0);
    });

    test('la mateixa imprecisió hi entra si el seu tema ja és una debilitat teva', () => {
        const theme = Core.antidoteReviewCategory(inaccuracy, 'w');
        expect(theme).toBeTruthy();
        const out = Core.triaEligibleErrors([inaccuracy], { failingThemes: [theme] });
        expect(out).toHaveLength(1);
    });

    test('no repeteix dues vegades la mateixa decisió (dedup per clau d\'errada)', () => {
        const out = Core.triaEligibleErrors([blunder, Object.assign({}, blunder)], {});
        expect(out).toHaveLength(1);
    });

    test('una partida no pot omplir el repàs sencer: hi ha un màxim', () => {
        const many = [];
        for (let i = 0; i < 20; i++) {
            many.push({ fen: FEN, quality: 'blunder', swing: 300, playerMove: 'f3e5', moveNumber: i + 1 });
        }
        const out = Core.triaEligibleErrors(many, { maxPerGame: 4 });
        expect(out.length).toBeLessThanOrEqual(4);
    });

    test('una pèrdua massa petita no mereix pregunta', () => {
        const tiny = { fen: FEN, quality: 'mistake', swing: 10, playerMove: 'f3e5', moveNumber: 4 };
        expect(Core.triaEligibleErrors([tiny], {})).toHaveLength(0);
    });

    test('entrades corruptes no rebenten res', () => {
        expect(Core.triaEligibleErrors(null, {})).toEqual([]);
        expect(Core.triaEligibleErrors([null, {}, { quality: 'blunder' }], {})).toEqual([]);
    });
});

describe('pickDistractor (la tercera opció és tot l\'exercici)', () => {
    test('tria una jugada de la franja: dolenta però temptadora', () => {
        const err = errorRecord();
        const picked = T.pickDistractor(err, mpv('d2d3', 40), mpv('f3e5', -220));
        expect(picked).toBeTruthy();
        expect(picked.candidate.move).toBe('f3g5');
        expect(picked.loss).toBeGreaterThanOrEqual(CFG.distractor.minLossCp);
        expect(picked.loss).toBeLessThanOrEqual(CFG.distractor.maxLossCp);
    });

    test('mai proposa una segona jugada bona: la pregunta ha de tenir UNA resposta', () => {
        const err = errorRecord({
            multipvBefore: [mpv('d2d3', 40), mpv('b1c3', 35), mpv('f3e5', -220)]
        });
        // b1c3 perd només 5 cp: seria tan bona com la millor i no pot ser opció.
        expect(T.pickDistractor(err, mpv('d2d3', 40), mpv('f3e5', -220))).toBeNull();
    });

    test('mai proposa una jugada pitjor del compte: no temptaria ningú', () => {
        const err = errorRecord({
            multipvBefore: [mpv('d2d3', 40), mpv('h1g1', -1200), mpv('f3e5', -220)]
        });
        expect(T.pickDistractor(err, mpv('d2d3', 40), mpv('f3e5', -220))).toBeNull();
    });

    test('mai proposa una jugada que perdi el mateix que la teva (empat trampa)', () => {
        const err = errorRecord({
            multipvBefore: [mpv('d2d3', 40), mpv('f3g5', -215), mpv('f3e5', -220)]
        });
        expect(T.pickDistractor(err, mpv('d2d3', 40), mpv('f3e5', -220))).toBeNull();
    });

    test('entre dos distractors vàlids mana el més natural (la captura)', () => {
        const err = errorRecord({
            multipvBefore: [
                mpv('d2d3', 40),
                mpv('a2a3', -80),      // jugada de peó lateral: gens temptadora
                mpv('c4f7', -95),      // captura: el que jugaria una persona
                mpv('f3e5', -220)
            ]
        });
        const picked = T.pickDistractor(err, mpv('d2d3', 40), mpv('f3e5', -220));
        expect(picked.candidate.move).toBe('c4f7');
    });

    test('una jugada il·legal a la posició no pot ser opció', () => {
        const err = errorRecord({
            multipvBefore: [mpv('d2d3', 40), mpv('h8h1', -120), mpv('f3e5', -220)]
        });
        expect(T.pickDistractor(err, mpv('d2d3', 40), mpv('f3e5', -220))).toBeNull();
    });

    test('sense MultiPV desat no hi ha distractor possible', () => {
        const err = errorRecord({ multipvBefore: [] });
        expect(T.pickDistractor(err, mpv('d2d3', 40), mpv('f3e5', -220))).toBeNull();
    });
});

describe('buildQuestion (la pregunta, o cap)', () => {
    test('les tres opcions són la millor, la teva i el distractor, i totes són legals', () => {
        const q = T.buildQuestion(errorRecord(), { elo: 1800 });
        expect(q).toBeTruthy();
        expect(q.options).toHaveLength(3);
        const roles = q.options.map(o => o.role).sort();
        expect(roles).toEqual(['best', 'distractor', 'played']);
        const board = new Chess(q.fen);
        q.options.forEach(op => {
            const legal = board.moves({ verbose: true })
                .some(m => `${m.from}${m.to}${m.promotion || ''}`.startsWith(op.move.slice(0, 4)));
            expect(legal).toBe(true);
        });
    });

    test('la resposta correcta és la millor jugada i les opcions van barrejades', () => {
        const q = T.buildQuestion(errorRecord(), { elo: 1800 });
        expect(q.options[q.answerIndex].role).toBe('best');
        expect(q.answerRole).toBe('best');
    });

    test('l\'ordre és estable: la mateixa errada dona sempre la mateixa pregunta', () => {
        const a = T.buildQuestion(errorRecord(), { elo: 1800 });
        const b = T.buildQuestion(errorRecord(), { elo: 1800 });
        expect(a.options.map(o => o.move)).toEqual(b.options.map(o => o.move));
        expect(a.answerIndex).toBe(b.answerIndex);
    });

    test('la SAN de cada opció es recalcula sobre la posició real', () => {
        const q = T.buildQuestion(errorRecord(), { elo: 1800 });
        const best = q.options.find(o => o.role === 'best');
        expect(best.san).toBe('d3');
        const played = q.options.find(o => o.role === 'played');
        expect(played.san).toBe('Nxe5');
    });

    test('sense tercera opció digna NO es construeix cap pregunta', () => {
        const err = errorRecord({ multipvBefore: [mpv('d2d3', 40), mpv('f3e5', -220)] });
        expect(T.buildQuestion(err, { elo: 1800 })).toBeNull();
    });

    test('si la teva jugada i la millor són la mateixa, no hi ha res a preguntar', () => {
        const err = errorRecord({ playerMove: 'd2d3', playerMoveSan: 'd3' });
        expect(T.buildQuestion(err, { elo: 1800 })).toBeNull();
    });

    test('una errada amb jugades il·legals a la seva FEN no genera pregunta', () => {
        const err = errorRecord({ playerMove: 'a1a8' });
        expect(T.buildQuestion(err, { elo: 1800 })).toBeNull();
    });

    test('el pressupost de temps viatja amb la pregunta', () => {
        const q = T.buildQuestion(errorRecord(), { elo: 1800 });
        expect(q.budgetMs).toBe(Core.triaTimeBudgetMs({
            elo: 1800, complexity: q.complexity, phase: q.phase
        }));
    });

    test('de tant en tant la pregunta es capgira i demana la que PERD', () => {
        const normal = T.buildQuestion(errorRecord(), { elo: 1800, index: 0 });
        expect(normal.mode).toBe('best');
        const inverted = T.buildQuestion(errorRecord(), {
            elo: 1800, index: CFG.invertedEveryNth - 1
        });
        expect(inverted.mode).toBe('worst');
        // A la capgirada la resposta és la que perd més: aquí, la teva jugada.
        expect(inverted.options[inverted.answerIndex].role).toBe('played');
    });
});

describe('previewFen (veure l\'opció sense que et regalin la refutació)', () => {
    test('ensenya la teva candidata jugada sobre el tauler', () => {
        const q = T.buildQuestion(errorRecord(), { elo: 1800 });
        const best = q.options.find(o => o.role === 'best');
        const prev = T.previewFen(q.fen, best.move);
        expect(prev).toBeTruthy();
        expect(prev.san).toBe('d3');
        expect(prev.from).toBe('d2');
        expect(prev.to).toBe('d3');
    });

    test('NO avança la resposta del rival: el torn passa a l\'altre color i prou', () => {
        const q = T.buildQuestion(errorRecord(), { elo: 1800 });
        const before = new Chess(q.fen);
        const prev = T.previewFen(q.fen, q.options[0].move);
        const after = new Chess(prev.fen);
        expect(after.turn()).not.toBe(before.turn());
        // Una sola semijugada de diferència respecte de la posició de partida.
        expect(after.history()).toHaveLength(0); // la FEN no arrossega historial
        const plyBefore = before.history({ verbose: true }).length;
        expect(plyBefore).toBe(0);
    });

    test('una jugada impossible no dona cap preview', () => {
        expect(T.previewFen(FEN, 'a1a8')).toBeNull();
        expect(T.previewFen(FEN, '')).toBeNull();
    });
});

describe('triaGradeAnswer (el resultat compta els previews, no els castiga)', () => {
    const q = T.buildQuestion(errorRecord(), { elo: 1800 });
    const bestIdx = q.options.findIndex(o => o.role === 'best');
    const playedIdx = q.options.findIndex(o => o.role === 'played');

    test('encertar sense mirar cap opció és un encert net', () => {
        const r = Core.triaGradeAnswer(q, bestIdx, { previews: 0, elapsedMs: 4000 });
        expect(r.correct).toBe(true);
        expect(r.clean).toBe(true);
        expect(r.previews).toBe(0);
    });

    test('encertar havent mirat les opcions segueix sent encert, però no net', () => {
        const r = Core.triaGradeAnswer(q, bestIdx, { previews: 3, elapsedMs: 12000 });
        expect(r.correct).toBe(true);
        expect(r.clean).toBe(false);
        expect(r.previews).toBe(3);
    });

    test('tornar a triar la teva pròpia jugada queda marcat com a tal', () => {
        const r = Core.triaGradeAnswer(q, playedIdx, { previews: 0 });
        expect(r.correct).toBe(false);
        expect(r.repeatedOwnMistake).toBe(true);
        expect(r.chosenRole).toBe('played');
    });

    test('quedar-se sense temps no és un encert encara que hi hagi tria', () => {
        const r = Core.triaGradeAnswer(q, bestIdx, { timedOut: true, elapsedMs: 99000 });
        expect(r.correct).toBe(false);
        expect(r.timedOut).toBe(true);
    });

    test('no respondre res es registra sense petar', () => {
        const r = Core.triaGradeAnswer(q, -1, { timedOut: true });
        expect(r.answered).toBe(false);
        expect(r.correct).toBe(false);
    });
});

describe('triaSessionSummary (resum de la tanda)', () => {
    test('compta encerts, encerts nets, temps esgotat i errades repetides', () => {
        const s = Core.triaSessionSummary([
            { correct: true, clean: true, previews: 0 },
            { correct: true, clean: false, previews: 2 },
            { correct: false, timedOut: true, previews: 1 },
            { correct: false, repeatedOwnMistake: true, previews: 0 }
        ]);
        expect(s.total).toBe(4);
        expect(s.correct).toBe(2);
        expect(s.clean).toBe(1);
        expect(s.timedOut).toBe(1);
        expect(s.repeatedOwnMistake).toBe(1);
        expect(s.previews).toBe(3);
        expect(s.accuracy).toBe(50);
    });

    test('una tanda buida no divideix per zero', () => {
        expect(Core.triaSessionSummary([]).accuracy).toBe(0);
        expect(Core.triaSessionSummary(null).total).toBe(0);
    });
});

describe('buildQuestionSet (la tanda sencera d\'una partida)', () => {
    test('salta les errades de les quals no en surt cap pregunta honesta', () => {
        const good = errorRecord({ moveNumber: 4 });
        const bad = errorRecord({ moveNumber: 10, multipvBefore: [mpv('d2d3', 40)] });
        const set = T.buildQuestionSet([good, bad], { elo: 1800 });
        expect(set).toHaveLength(1);
        expect(set[0].moveNumber).toBe(4);
    });

    test('les preguntes van indexades, de manera que la capgirada apareix al seu torn', () => {
        const errors = [];
        for (let i = 0; i < CFG.invertedEveryNth; i++) {
            errors.push(errorRecord({ moveNumber: 4 + i * 2, playerMove: 'f3e5' }));
        }
        // Totes tenen la mateixa FEN i jugada: la dedup n'ha de deixar passar una.
        const set = T.buildQuestionSet(errors, { elo: 1800 });
        expect(set.length).toBeGreaterThanOrEqual(1);
        expect(set.every(q => q.options.length === 3)).toBe(true);
    });

    test('sense errades no hi ha tanda', () => {
        expect(T.buildQuestionSet([], { elo: 1800 })).toEqual([]);
        expect(T.buildQuestionSet(null, { elo: 1800 })).toEqual([]);
    });
});
