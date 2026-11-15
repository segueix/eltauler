// La visió d'en Grau (visiograu.js): la línia de Stockfish dues o tres
// jugades endavant, explicada amb fets comprovats al tauler, i el seguiment
// de la previsió (s'ha complert o un bàndol se n'ha sortit).
const fs = require('fs');
const path = require('path');
const { Chess } = require('chess.js');
const TV = require('../stockfishtv');
const V = require('../visiograu');

const FIXTURES = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'tv-games.json'), 'utf8')).games;

// Posició després de `moves` (UCI) amb una anàlisi de Stockfish inventada
// per a la posició final (punt de vista del bàndol que mou, com el motor).
function ctxAfter(moves, pv, opts = {}) {
    const chess = new Chess(opts.startFen || undefined);
    moves.slice(0, -1).forEach(u => chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' }));
    const fenBefore = chess.fen();
    const last = moves[moves.length - 1];
    const prevMove = chess.history({ verbose: true }).slice(-1)[0] || null;
    const move = chess.move({ from: last.slice(0, 2), to: last.slice(2, 4), promotion: last[4] || 'q' });
    const fenAfter = chess.fen();
    const info = { depth: opts.depth || 14, type: opts.type || 'cp', value: opts.value === undefined ? -40 : opts.value, pv: pv };
    return {
        ChessCtor: Chess, fenBefore, fenAfter, move, prevMove,
        after: TV.tvBuildAnalysis(fenAfter, { 1: info }, pv[0]),
        ply: moves.length - 1 + (opts.plyOffset || 0), tier: opts.tier || 'mid', gameId: 'prova',
        moveText: 'Les blanques porten el cavall a f3.', prepared: !!opts.prepared, end: null
    };
}
const RUY = ['e2e4', 'e7e5', 'g1f3'];
const RUY_PV = ['b8c6', 'f1b5', 'a7a6', 'b5a4', 'g8f6', 'e1g1'];
const words = t => String(t).trim().split(/\s+/).length;

function simulate(game, tier, extra) {
    return TV.tvSimulateCommentary(Chess, Object.assign({ startFen: game.startFen, moves: game.moves, analyses: game.analyses,
        prepared: game.prepared, tier: tier || 'mid', gameId: game.name }, extra || {}));
}

describe('lectura de la línia: fets comprovats a cada jugada', () => {
    test('cada jugada té finalitats certes al tauler després de jugar-la', () => {
        const c = ctxAfter(RUY, RUY_PV);
        const r = V.readLine(Chess, c.fenAfter, c.after.pv, { prev: c.move });
        expect(r.steps.map(s => s.move.san)).toEqual(['Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O']);
        const purpose = r.steps.map(s => V.purposeOf(s));
        expect(purpose[0]).toEqual({ key: 'defend', inf: 'defensar el peó d’e5' });
        expect(purpose[2]).toEqual({ key: 'attack', inf: 'atacar l’alfil de b5' });
        expect(purpose[3]).toEqual({ key: 'escape', inf: 'posar-lo fora de perill' });
        expect(purpose[5]).toEqual({ key: 'castle', inf: 'posar el rei a recer' });
        expect(r.material.stable).toBe(true);
    });

    test('la lectura s’atura a la primera jugada il·legal', () => {
        const c = ctxAfter(RUY, ['b8c6', 'f1b5', 'a7a5', 'e1e2', 'h2h4']);
        const r = V.readLine(Chess, c.fenAfter, ['b8c6', 'f1b5', 'h8h1', 'b5a4'], { prev: c.move });
        expect(r.steps.map(s => s.uci)).toEqual(['b8c6', 'f1b5']);
    });

    test('columna oberta, setena fila i peó passat', () => {
        const start = '6k1/1p3ppp/8/3P4/8/8/5PPP/R5K1 w - - 0 1';
        const c = ctxAfter(['g1f1'], ['g8f8', 'a1a7', 'f8e8', 'd5d6'], { startFen: start });
        const r = V.readLine(Chess, c.fenAfter, c.after.pv, { prev: c.move });
        const facts = r.steps.map(s => s.facts);
        expect(facts[1].seventh).toBe(true);
        // La torre ja era a la columna a: no «ocupa» cap columna nova.
        expect(facts[1].file).toBeUndefined();
        expect(V.purposeOf(r.steps[1]).key).toBe('attack'); // la torre també ataca el peó de b7
        expect(facts[3].passed).toEqual({ left: 2 });
        expect(V.purposeOf(r.steps[3]).inf).toBe('acostar el peó passat a la coronació');
    });

    test('la línia SAN de la pantalla porta els números de jugada', () => {
        const c = ctxAfter(RUY, RUY_PV);
        const r = V.readLine(Chess, c.fenAfter, c.after.pv, { prev: c.move });
        expect(V.sanLine(c.fenAfter, r.steps.slice(0, 4))).toBe('2…Nc6 3.Bb5 a6 4.Ba4');
    });
});

describe('el pla d’en Grau', () => {
    test('l’Èlia diu la jugada i pregunta; en Grau explica dues jugades de cada bàndol i la lògica', () => {
        const p = V.plan(ctxAfter(RUY, RUY_PV), null);
        expect(p).not.toBeNull();
        expect(p.kind).toBe('plan');
        expect(p.turns[0].role).toBe('presenter');
        expect(p.turns[0].text.startsWith('Les blanques porten el cavall a f3.')).toBe(true);
        expect(p.turns[0].text.endsWith('?')).toBe(true);
        expect(p.turns[0].solo).not.toMatch(/\?$/);
        const grau = p.turns.filter(t => t.role === 'analyst').map(t => t.text).join(' ');
        expect(grau).toMatch(/cavall a c6 per defensar el peó d’e5/);
        expect(grau).toMatch(/alfil a b5/);
        expect(grau).toMatch(/alfil a a4 per posar-lo fora de perill/);
        // a6 ataca l'alfil i les blanques l'han d'apartar: les negres guanyen un temps.
        expect(p.theme).toBe('tempo');
        expect(p.side).toBe('b');
        expect(p.forecast).toEqual({ from: 3, san: '2…Nc6 3.Bb5 a6 4.Ba4', uci: ['b8c6', 'f1b5', 'a7a6', 'b5a4'] });
        expect(words(p.turns.map(t => t.text).join(' '))).toBeLessThanOrEqual(V.CONFIG.MAX_WORDS.mid);
    });

    test('els torns alternen presentadora i analista, i mai no passen de quatre', () => {
        for (const tier of ['basic', 'mid', 'advanced']) {
            const p = V.plan(ctxAfter(RUY, RUY_PV, { tier }), null);
            expect(p.turns.length).toBeGreaterThanOrEqual(2);
            expect(p.turns.length).toBeLessThanOrEqual(4);
            expect(p.turns[0].role).toBe('presenter');
            expect(p.turns[1].role).toBe('analyst');
            expect(words(p.turns.map(t => t.text).join(' '))).toBeLessThanOrEqual(V.CONFIG.MAX_WORDS[tier]);
        }
        // El bàsic: una sola parella de jugades i sense segona pregunta.
        const basic = V.plan(ctxAfter(RUY, RUY_PV, { tier: 'basic' }), null);
        expect(basic.forecast.uci).toHaveLength(2);
        expect(basic.turns.filter(t => t.role === 'presenter')).toHaveLength(1);
    });

    test('sense anàlisi fiable, amb mat, decidida o preparada no hi ha pla', () => {
        expect(V.plan(ctxAfter(RUY, RUY_PV, { depth: 10 }), null)).toBeNull();
        expect(V.plan(ctxAfter(RUY, RUY_PV, { type: 'mate', value: 3 }), null)).toBeNull();
        expect(V.plan(ctxAfter(RUY, RUY_PV, { value: -900 }), null)).toBeNull();
        expect(V.plan(ctxAfter(RUY, RUY_PV, { prepared: true }), null)).toBeNull();
        expect(V.plan(ctxAfter(RUY, ['b8c6', 'f1b5']), null)).toBeNull();
        // L'anàlisi ha de ser de la mateixa posició.
        const c = ctxAfter(RUY, RUY_PV);
        c.after = Object.assign({}, c.after, { fen: ctxAfter(['e2e4'], RUY_PV).fenAfter });
        expect(V.plan(c, null)).toBeNull();
    });

    test('entre dos plans hi ha marge, i més si tornaria a ser el mateix bàndol', () => {
        const first = V.plan(ctxAfter(RUY, RUY_PV), null);
        const sameSide = n => V.plan(ctxAfter(RUY, RUY_PV, { plyOffset: n }), first.memory);
        expect(sameSide(V.CONFIG.SAME_SIDE_GAP_PLIES - 1)).toBeNull();
        expect(sameSide(V.CONFIG.SAME_SIDE_GAP_PLIES)).not.toBeNull();
    });

    test('una recaptura no es presenta com a material guanyat', () => {
        // 19.dxe5: les blanques capturen un cavall i les negres el recuperen; la
        // peça que queda penjada a e6 cau més endavant a la mateixa línia.
        const game = FIXTURES[0];
        const rows = simulate(game, 'mid');
        const row = rows[36];
        expect(row.san).toBe('dxe5');
        expect(row.dialogueEvent).toBe('plan');
        expect(row.dialogue.map(t => t.text).join(' ')).not.toMatch(/de més|guanyen (un|una|la|dos)/);
    });

    test('el guany de material s’explica amb la causa comprovada', () => {
        const rows = simulate(FIXTURES[0], 'mid');
        const row = rows.find(r => r.dialogueEvent === 'plan' && /peó de més|guanyen un peó/.test(r.dialogue.map(t => t.text).join(' ')));
        expect(row).toBeTruthy();
        expect(row.dialogue.map(t => t.text).join(' ')).toMatch(/queda sense defensa|té més atacants que defensors/);
    });
});

describe('seguiment de la previsió', () => {
    function planned() { return V.plan(ctxAfter(RUY, RUY_PV), null); }

    test('quan arriba la jugada clau, en Grau confirma la previsió amb el fet comprovat', () => {
        const p = planned();
        let mem = p.memory;
        let t = V.track(ctxAfter(RUY.concat('b8c6'), ['f1b5']), mem);
        expect(t.event).toBeNull();
        t = V.track(ctxAfter(RUY.concat('b8c6', 'f1b5'), ['a7a6']), t.memory);
        expect(t.event).toBeNull();
        const c = ctxAfter(RUY.concat('b8c6', 'f1b5', 'a7a6'), ['b5a4', 'g8f6']);
        t = V.track(c, t.memory);
        expect(t.event).toEqual(expect.objectContaining({ kind: 'hit', ply: 2, index: 2, side: 'b' }));
        const f = V.follow(c, t.event, t.memory);
        expect(f.kind).toBe('forecast-hit');
        expect(f.turns[1].text).toMatch(/Les negres avancen el peó a a6 per atacar l’alfil de b5/);
        expect(f.turns[1].text).toMatch(/fa dues jugades|línia prevista|Exacte|Efectivament/);
        expect(t.memory.forecast).toBeNull();
    });

    test('si un bàndol se’n surt, en Grau diu què esperava Stockfish i què li costa', () => {
        const p = planned();
        const c = ctxAfter(RUY.concat('d7d6'), ['d2d4', 'b8d7']);
        const t = V.track(c, p.memory);
        expect(t.event).toEqual({ kind: 'miss', ply: 2, index: 0, expected: 'b8c6', side: 'b' });
        c.before = TV.tvBuildAnalysis(ctxAfter(RUY, RUY_PV).fenAfter, { 1: { depth: 14, type: 'cp', value: 40, pv: ['b8c6'] } }, 'b8c6');
        c.after = TV.tvBuildAnalysis(c.fenAfter, { 1: { depth: 14, type: 'cp', value: 200, pv: ['d2d4'] } }, 'd2d4');
        const f = V.follow(c, t.event, t.memory);
        expect(f.kind).toBe('forecast-miss');
        const answer = f.turns[1].text;
        expect(answer).toMatch(/cavall a c6/);
        expect(answer).toMatch(/empitjora clarament|imprecisió clara/);
        // Una desviació sense importància no es torna a comentar de seguida.
        const again = V.track(c, Object.assign({}, f.memory, { forecast: p.memory.forecast }));
        // Abans: −0,4 per a les blanques; després: −0,35. Les negres no hi perden res.
        const calm = Object.assign({}, c, { after: TV.tvBuildAnalysis(c.fenAfter, { 1: { depth: 14, type: 'cp', value: -35, pv: ['d2d4'] } }, 'd2d4') });
        expect(V.follow(calm, again.event, f.memory)).toBeNull();
    });

    test('després de la jugada clau o d’una desviació, la previsió es tanca', () => {
        const p = planned();
        const miss = V.track(ctxAfter(RUY.concat('g8f6'), ['b1c3']), p.memory);
        expect(miss.memory.forecast).toBeNull();
        expect(V.track(ctxAfter(RUY.concat('g8f6', 'b1c3'), ['f8b4']), miss.memory).event).toBeNull();
    });
});

describe('integració amb la retransmissió', () => {
    const allTexts = [];
    beforeAll(() => {
        for (const g of FIXTURES) for (const tier of ['basic', 'mid', 'advanced']) {
            simulate(g, tier).forEach(r => { if (r.dialogue) allTexts.push(...r.dialogue.map(t => t.text)); });
        }
    });

    test('a les partides reals, en Grau explica plans i en fa el seguiment', () => {
        let plans = 0, follows = 0;
        for (const g of FIXTURES) {
            const rows = simulate(g, 'mid');
            for (const r of rows) {
                if (r.dialogueEvent === 'plan') {
                    plans++;
                    expect(r.forecast.uci.length).toBeGreaterThanOrEqual(2);
                    // La línia anunciada és legal des de la posició de la jugada.
                    const chess = new Chess(r.fen);
                    r.forecast.uci.forEach(u => expect(chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' })).toBeTruthy());
                    expect(r.dialogue.length).toBeLessThanOrEqual(4);
                    expect(r.dialogue[0].role).toBe('presenter');
                    expect(r.dialogue[1].role).toBe('analyst');
                }
                if (/^forecast-/.test(r.dialogueEvent || '')) {
                    follows++;
                    const plan = rows.slice(0, r.ply).reverse().find(x => x.dialogueEvent === 'plan');
                    expect(plan).toBeTruthy();
                    expect(r.ply - plan.ply).toBeLessThanOrEqual(plan.forecast.uci.length);
                }
            }
        }
        expect(plans).toBeGreaterThanOrEqual(20);
        expect(follows).toBeGreaterThanOrEqual(5);
    });

    test('el duet llegeix cada torn amb la seva veu', () => {
        const rows = simulate(FIXTURES[0], 'mid');
        const row = rows.find(r => r.dialogueEvent === 'plan' && r.dialogue.length === 4);
        const turns = TV.tvDialogueTurns(row, true);
        expect(turns.map(t => t.voiceId)).toEqual(['matxa:central:elia', 'matxa:central:grau', 'matxa:central:elia', 'matxa:central:grau']);
        // Amb una sola veu, la primera pregunta es converteix en presentació.
        const solo = TV.tvDialogueTurns(row, false);
        expect(solo).toHaveLength(4);
        expect(solo[0].text).not.toMatch(/\?$/);
        expect(solo.every(t => t.voiceId === null)).toBe(true);
    });

    test('es pot desactivar i aleshores els comentaris són els d’abans', () => {
        const g = FIXTURES[2];
        const off = simulate(g, 'mid', { visio: null });
        expect(off.some(r => r.dialogueEvent === 'plan' || /^forecast-/.test(r.dialogueEvent || ''))).toBe(false);
        const on = simulate(g, 'mid');
        expect(on.map(r => r.comment)).toEqual(off.map(r => r.comment));
    });

    test('el pas de retransmissió no modifica la memòria que rep', () => {
        const g = FIXTURES[0];
        const rows = simulate(g, 'mid');
        const idx = rows.findIndex(r => r.dialogueEvent === 'plan');
        const chess = new Chess(g.startFen || undefined);
        let memory = TV.tvEmptyMemory();
        let prev = null;
        for (let i = 0; i <= idx; i++) {
            const fenBefore = chess.fen();
            const u = g.moves[i];
            const mv = chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' });
            const a = i >= g.prepared ? g.analyses[i] : null, b = i >= g.prepared ? g.analyses[i + 1] : null;
            const ctx = { ChessCtor: Chess, fenBefore, fenAfter: chess.fen(), move: mv, prevMove: prev, tier: 'mid', prepared: i < g.prepared,
                before: a ? TV.tvBuildAnalysis(a.fen, a.infos, a.bestUci) : null, after: b ? TV.tvBuildAnalysis(b.fen, b.infos, b.bestUci) : null,
                end: null, ply: i, memory: memory, gameId: g.name };
            const frozen = JSON.stringify(memory);
            const step = TV.tvBroadcastStep(ctx);
            expect(JSON.stringify(memory)).toBe(frozen);
            memory = step.memory;
            prev = mv;
        }
        expect(memory.visio.forecast).toEqual(expect.objectContaining({ ply: idx, matched: 0 }));
    });

    test('català: contraccions, apòstrofs i puntuació dels textos generats', () => {
        expect(allTexts.length).toBeGreaterThan(150);
        for (const t of allTexts) {
            expect(t).not.toMatch(/\b(de|per|a) el\b/);
            expect(t).not.toMatch(/\bde [aeiouh]\d/);       // «d’e4», no «de e4»
            expect(t).not.toMatch(/\bde (l’|la |el )?(un|una) casella/);
            expect(t).not.toMatch(/,\s*[,.;:]/);
            expect(t).not.toMatch(/\s{2,}/);
            expect(t).not.toMatch(/amb [^,.]* amb escac/);
            expect(t).not.toMatch(/undefined|null|NaN/);
            expect(t).toMatch(/[.?!]$/);
        }
    });

    test('varietat: les frases de lògica no es repeteixen seguides', () => {
        for (const g of FIXTURES) {
            const logic = simulate(g, 'mid').filter(r => r.dialogueEvent === 'plan')
                .map(r => r.dialogue.filter(t => t.role === 'analyst').slice(-1)[0].text.split('. ')[0]);
            for (let i = 1; i < logic.length; i++) expect(logic[i]).not.toBe(logic[i - 1]);
        }
    });
});

describe('banc de textos', () => {
    test('totes les famílies tenen diverses maneres de dir-ho', () => {
        const T = V.TEXTS;
        expect(T.PLAN_QUESTIONS.length).toBeGreaterThanOrEqual(12);
        expect(T.WHY_QUESTIONS.length).toBeGreaterThanOrEqual(8);
        expect(T.LINE_OPENERS.length).toBeGreaterThanOrEqual(8);
        Object.keys(T.THEME_TEXTS).forEach(k => expect(T.THEME_TEXTS[k].length).toBeGreaterThanOrEqual(2));
        const names = { me: 'les blanques', opp: 'les negres', Me: 'Les blanques', Opp: 'Les negres', S: 'les negres' };
        T.PLAN_QUESTIONS.forEach(q => expect(q(names)).toMatch(/\?$/));
        T.HIT_QUESTIONS.forEach(q => expect(q({})).toMatch(/\?$/));
        T.MISS_QUESTIONS.forEach(q => expect(q({ side: 'les negres' })).toMatch(/\?$/));
    });
});
