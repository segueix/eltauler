// La visió d'en Grau (visiograu.js): la línia de Stockfish dues o tres
// jugades endavant, explicada amb INTENCIONS (escac, clavada, forquilla,
// fer fora una peça, guanyar espai al centre...) i sense caselles, i el
// seguiment de la previsió (s'ha complert o un bàndol se n'ha sortit).
const fs = require('fs');
const path = require('path');
const { Chess } = require('chess.js');
const TV = require('../stockfishtv');
const V = require('../visiograu');

const FIXTURES = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'tv-games.json'), 'utf8')).games;
const SQUARE = /\b[a-h][1-8]\b/;

// Juga `moves` (UCI) des de l'inici fent el seguiment de la memòria d'en
// Grau, i dona el context de l'última jugada amb una anàlisi inventada.
function ctxAfter(moves, pv, opts = {}) {
    const chess = new Chess(opts.startFen || undefined);
    let memory = null, prevMove = null, ctx = null;
    moves.forEach((u, i) => {
        const fenBefore = chess.fen();
        const move = chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' });
        memory = V.track({ ply: i, fenBefore, move }, memory).memory;
        if (i < moves.length - 1) { prevMove = move; return; }
        const fenAfter = chess.fen();
        const info = { depth: opts.depth || 14, type: opts.type || 'cp', value: opts.value === undefined ? -40 : opts.value, pv: pv };
        ctx = { ChessCtor: Chess, fenBefore, fenAfter, move, prevMove, after: TV.tvBuildAnalysis(fenAfter, { 1: info }, pv[0]),
            ply: i + (opts.plyOffset || 0), tier: opts.tier || 'mid', gameId: 'prova',
            moveText: 'Les blanques porten el cavall a f3.', prepared: !!opts.prepared, end: null };
    });
    return { ctx, memory };
}
function lineOf(moves, pv) {
    const { ctx, memory } = ctxAfter(moves, pv);
    return V.readLine(Chess, ctx.fenAfter, pv, { prev: ctx.move, ids: memory.ids });
}
const RUY = ['e2e4', 'e7e5', 'g1f3'];
const RUY_PV = ['b8c6', 'f1b5', 'a7a6', 'b5a4', 'g8f6', 'e1g1'];
const words = t => String(t).trim().split(/\s+/).length;
const grauText = turns => turns.filter(t => t.role === 'analyst').map(t => t.text).join(' ');

function simulate(game, tier, extra) {
    return TV.tvSimulateCommentary(Chess, Object.assign({ startFen: game.startFen, moves: game.moves, analyses: game.analyses,
        prepared: game.prepared, tier: tier || 'mid', gameId: game.name }, extra || {}));
}

describe('la intenció de cada jugada, sense caselles', () => {
    test('a la línia de l’espanyola, cada jugada diu què busca', () => {
        const r = lineOf(RUY, RUY_PV);
        expect(r.steps.map(s => s.move.san)).toEqual(['Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O']);
        expect(r.steps.map(s => V.phrase(s).inf)).toEqual([
            'treure el cavall de la dama per protegir un peó central',
            'treure l’alfil del rei',
            'fer fora aquest alfil amb un peó',
            'posar l’alfil del rei a recer',
            'atacar un peó central amb el cavall del rei',
            'enrocar curt per posar el rei a recer'
        ]);
        r.steps.forEach(s => expect(V.phrase(s).inf).not.toMatch(SQUARE));
    });

    test('totes les formes del verb: present, condicional, subjuntiu i passat', () => {
        const ph = V.phrase(lineOf(RUY, RUY_PV).steps[0]);
        expect(ph.pres).toBe('treuen el cavall de la dama per protegir un peó central');
        expect(ph.cond).toBe('traurien el cavall de la dama per protegir un peó central');
        expect(ph.subj).toBe('treguin el cavall de la dama per protegir un peó central');
        expect(ph.past).toBe('traguessin el cavall de la dama per protegir un peó central');
    });

    test('forquilla, clavada i fianchetto, amb el nom de les peces de cada ala', () => {
        const fork = lineOf(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'f3g5', 'd7d5', 'e4d5', 'f6d5'], ['g5f7']);
        expect(V.phrase(fork.steps[0]).inf).toBe('fer una forquilla amb el cavall del rei a la dama i a la torre del rei negre');
        // El cavall acaba de jugar: «aquest cavall». Sense la jugada anterior, pel nom de l'ala.
        const pin = lineOf(['d2d4', 'g8f6', 'c2c4', 'e7e6', 'b1c3'], ['f8b4']);
        expect(V.phrase(pin.steps[0]).inf).toBe('clavar aquest cavall amb l’alfil del rei contra el rei');
        expect(V.phrase(pin.steps[0], { noDemo: true }).inf).toBe('clavar el cavall de la dama blanca amb l’alfil del rei contra el rei');
        const fian = lineOf(['g1f3', 'd7d5', 'g2g3', 'c7c5'], ['f1g2']);
        expect(V.phrase(fian.steps[0]).inf).toBe('fer el fianchetto amb l’alfil del rei');
    });

    test('escacs, canvis i peó passat', () => {
        const start = '6k1/1p3ppp/8/3P4/8/8/5PPP/R5K1 w - - 0 1';
        const { ctx } = ctxAfter(['g1f1'], ['g8f8', 'a1a7', 'f8e8', 'd5d6'], { startFen: start });
        const r = V.readLine(Chess, ctx.fenAfter, ctx.after.pv, { prev: ctx.move });
        expect(V.phrase(r.steps[1]).inf).toBe('atacar el peó passat amb la torre');
        expect(r.steps[1].facts.seventh).toBe(true);
        expect(V.phrase(r.steps[3]).inf).toBe('empènyer el peó passat');
        const swap = lineOf(['e2e4', 'd7d5'], ['e4d5', 'd8d5']);
        expect(V.phrase(swap.steps[0]).inf).toBe('canviar els peons');
        expect(V.phrase(swap.steps[1]).inf).toBe('completar el canvi');
    });

    test('la lectura s’atura a la primera jugada il·legal', () => {
        const { ctx, memory } = ctxAfter(RUY, RUY_PV);
        const r = V.readLine(Chess, ctx.fenAfter, ['b8c6', 'f1b5', 'h8h1', 'b5a4'], { prev: ctx.move, ids: memory.ids });
        expect(r.steps.map(s => s.uci)).toEqual(['b8c6', 'f1b5']);
    });

    test('la línia en notació per a la pantalla porta els números de jugada', () => {
        const { ctx } = ctxAfter(RUY, RUY_PV);
        const r = lineOf(RUY, RUY_PV);
        expect(V.sanLine(ctx.fenAfter, r.steps.slice(0, 4))).toBe('2…Nc6 3.Bb5 a6 4.Ba4');
    });
});

describe('el pla d’en Grau', () => {
    test('l’Èlia diu la jugada i pregunta; en Grau explica dues jugades de cada bàndol i la lògica', () => {
        const { ctx, memory } = ctxAfter(RUY, RUY_PV);
        const p = V.plan(ctx, memory);
        expect(p).not.toBeNull();
        expect(p.turns[0].role).toBe('presenter');
        expect(p.turns[0].text.startsWith('Les blanques porten el cavall a f3.')).toBe(true);
        expect(p.turns[0].text.endsWith('?')).toBe(true);
        expect(p.turns[0].solo).not.toMatch(/\?$/);
        const grau = grauText(p.turns);
        expect(grau).not.toMatch(SQUARE);
        expect(grau).toMatch(/cavall de la dama per protegir un peó central/);
        expect(grau).toMatch(/fora aquest alfil amb un peó/);
        expect(grau).toMatch(/l’alfil del rei a recer/);
        // a6 fa fora l'alfil i les blanques l'han d'apartar: un temps guanyat.
        expect(p.theme).toBe('tempo');
        expect(p.side).toBe('b');
        expect(p.forecast).toEqual({ from: 3, san: '2…Nc6 3.Bb5 a6 4.Ba4', uci: ['b8c6', 'f1b5', 'a7a6', 'b5a4'] });
        expect(words(p.turns.map(t => t.text).join(' '))).toBeLessThanOrEqual(V.CONFIG.MAX_WORDS.mid);
    });

    test('els torns alternen presentadora i analista, i mai no passen de quatre', () => {
        for (const tier of ['basic', 'mid', 'advanced']) {
            const { ctx, memory } = ctxAfter(RUY, RUY_PV, { tier });
            const p = V.plan(ctx, memory);
            expect(p.turns.length).toBeGreaterThanOrEqual(2);
            expect(p.turns.length).toBeLessThanOrEqual(4);
            expect(p.turns[0].role).toBe('presenter');
            expect(p.turns[1].role).toBe('analyst');
            expect(words(p.turns.map(t => t.text).join(' '))).toBeLessThanOrEqual(V.CONFIG.MAX_WORDS[tier]);
            expect(grauText(p.turns)).not.toMatch(SQUARE);
        }
        const { ctx, memory } = ctxAfter(RUY, RUY_PV, { tier: 'basic' });
        const basic = V.plan(ctx, memory);
        expect(basic.forecast.uci).toHaveLength(2);
        expect(basic.turns.filter(t => t.role === 'presenter')).toHaveLength(1);
    });

    test('sense anàlisi fiable, amb mat, decidida o preparada no hi ha pla', () => {
        const plan = opts => { const { ctx, memory } = ctxAfter(RUY, RUY_PV, opts); return V.plan(ctx, memory); };
        expect(plan({ depth: 10 })).toBeNull();
        expect(plan({ type: 'mate', value: 3 })).toBeNull();
        expect(plan({ value: -900 })).toBeNull();
        expect(plan({ prepared: true })).toBeNull();
        const short = ctxAfter(RUY, ['b8c6', 'f1b5']);
        expect(V.plan(short.ctx, short.memory)).toBeNull();
        const other = ctxAfter(RUY, RUY_PV);
        other.ctx.after = Object.assign({}, other.ctx.after, { fen: ctxAfter(['e2e4'], RUY_PV).ctx.fenAfter });
        expect(V.plan(other.ctx, other.memory)).toBeNull();
    });

    test('entre dos plans hi ha marge, i més si tornaria a ser el mateix bàndol', () => {
        const { ctx, memory } = ctxAfter(RUY, RUY_PV);
        const first = V.plan(ctx, memory);
        const at = n => V.plan(Object.assign({}, ctx, { ply: ctx.ply + n }), first.memory);
        expect(at(V.CONFIG.SAME_SIDE_GAP_PLIES - 1)).toBeNull();
        expect(at(V.CONFIG.SAME_SIDE_GAP_PLIES)).not.toBeNull();
    });

    // El pla a una jugada concreta de la partida, amb l'anàlisi real i la
    // memòria del seguiment, sense dependre de quan toca el diàleg.
    function planAt(game, ply) {
        const chess = new Chess(game.startFen || undefined);
        let memory = null, prevMove = null, ctx = null;
        for (let i = 0; i <= ply; i++) {
            const fenBefore = chess.fen();
            const u = game.moves[i];
            const move = chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' });
            const a = game.analyses[i + 1];
            ctx = { ChessCtor: Chess, fenBefore, fenAfter: chess.fen(), move, prevMove, ply: i, tier: 'mid', gameId: game.name,
                prepared: i < (game.prepared || 0), end: null, moveText: 'La jugada.',
                after: a ? TV.tvBuildAnalysis(a.fen, a.infos, a.bestUci) : null };
            memory = V.track(ctx, memory).memory;
            prevMove = move;
        }
        return { san: ctx.move.san, plan: V.plan(ctx, memory) };
    }
    // Els textos del tema de material (l'última resposta d'en Grau).
    const GAIN = /guanyen (un|una|la|dos|tres) |de més|guany net per a /;
    const logicText = turns => turns.filter(t => t.role === 'analyst').slice(-1).map(t => t.text).join(' ');

    test('una recaptura no es presenta com a material guanyat', () => {
        const { san, plan } = planAt(FIXTURES[0], 36);
        expect(san).toBe('dxe5');
        expect(plan).not.toBeNull();
        expect(plan.theme).not.toBe('material');
        expect(logicText(plan.turns)).not.toMatch(GAIN);
    });

    test('la captura que s’acaba de fer no és el premi del pla', () => {
        // axb3 recupera material; la línia només canvia torres i no hi afegeix res.
        const { san, plan } = planAt(FIXTURES[0], 42);
        expect(san).toBe('axb3');
        expect(plan).not.toBeNull();
        expect(plan.theme).not.toBe('material');
        expect(logicText(plan.turns)).not.toMatch(GAIN);
    });

    test('el guany de material s’explica amb la causa comprovada', () => {
        const rows = simulate(FIXTURES[0], 'mid');
        const gains = rows.filter(r => r.dialogueEvent === 'plan' && GAIN.test(logicText(r.dialogue)));
        expect(gains.length).toBeGreaterThan(0);
        gains.forEach(row => expect(logicText(row.dialogue)).toMatch(/queda sense defensa|té més atacants que defensors/));
    });
});

describe('seguiment de la previsió', () => {
    const planned = () => { const { ctx, memory } = ctxAfter(RUY, RUY_PV); return V.plan(ctx, memory).memory; };
    // Continua la partida des de la memòria del pla.
    function play(memory, extra, pv) {
        const all = RUY.concat(extra);
        const chess = new Chess();
        all.slice(0, RUY.length).forEach(u => chess.move({ from: u.slice(0, 2), to: u.slice(2, 4) }));
        let mem = memory, ev = null, ctx = null, prev = chess.history({ verbose: true }).slice(-1)[0];
        extra.forEach((u, k) => {
            const fenBefore = chess.fen();
            const move = chess.move({ from: u.slice(0, 2), to: u.slice(2, 4) });
            ctx = { ChessCtor: Chess, fenBefore, fenAfter: chess.fen(), move, prevMove: prev, ply: RUY.length + k, tier: 'mid',
                gameId: 'prova', moveText: 'Jugada.', after: TV.tvBuildAnalysis(chess.fen(), { 1: { depth: 14, type: 'cp', value: 30, pv: pv || [] } }, (pv || [])[0]) };
            const t = V.track(ctx, mem);
            mem = t.memory; ev = t.event; prev = move;
        });
        return { ctx, memory: mem, event: ev };
    }

    test('quan arriba la jugada clau, en Grau confirma la previsió amb la intenció', () => {
        const mid = play(planned(), ['b8c6', 'f1b5']);
        expect(mid.event).toBeNull();
        const r = play(planned(), ['b8c6', 'f1b5', 'a7a6'], ['b5a4', 'g8f6']);
        expect(r.event).toEqual(expect.objectContaining({ kind: 'hit', ply: 2, index: 2, side: 'b' }));
        const f = V.follow(r.ctx, r.event, r.memory);
        expect(f.kind).toBe('forecast-hit');
        expect(f.turns[1].text).toMatch(/les negres fan fora l’alfil del rei blanc amb un peó/i);
        expect(f.turns[1].text).not.toMatch(SQUARE);
        expect(r.memory.forecast).toBeNull();
    });

    test('si un bàndol se’n surt, en Grau diu què esperava Stockfish i què li costa', () => {
        const r = play(planned(), ['d7d6'], ['d2d4']);
        expect(r.event).toEqual({ kind: 'miss', ply: 2, index: 0, expected: 'b8c6', side: 'b' });
        const fenPlan = ctxAfter(RUY, RUY_PV).ctx.fenAfter;
        r.ctx.before = TV.tvBuildAnalysis(fenPlan, { 1: { depth: 14, type: 'cp', value: 40, pv: ['b8c6'] } }, 'b8c6');
        r.ctx.after = TV.tvBuildAnalysis(r.ctx.fenAfter, { 1: { depth: 14, type: 'cp', value: 200, pv: ['d2d4'] } }, 'd2d4');
        const f = V.follow(r.ctx, r.event, r.memory);
        expect(f.kind).toBe('forecast-miss');
        expect(f.turns[1].text).toMatch(/cavall de la dama per protegir un peó central/);
        expect(f.turns[1].text).toMatch(/empitjora clarament|imprecisió clara/);
        expect(f.turns[1].text).not.toMatch(SQUARE);
        // Una desviació sense importància no es torna a comentar de seguida.
        const calm = Object.assign({}, r.ctx, { after: TV.tvBuildAnalysis(r.ctx.fenAfter, { 1: { depth: 14, type: 'cp', value: -35, pv: ['d2d4'] } }, 'd2d4') });
        expect(V.follow(calm, r.event, f.memory)).toBeNull();
    });

    test('després de la jugada clau o d’una desviació, la previsió es tanca', () => {
        const miss = play(planned(), ['g8f6']);
        expect(miss.memory.forecast).toBeNull();
        expect(play(planned(), ['g8f6', 'b1c3']).event).toBeNull();
    });

    test('les peces es reconeixen des de l’inici i segueixen l’enroc', () => {
        const { memory } = ctxAfter(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'e1g1'], ['f8c5']);
        expect(memory.ids).toEqual(expect.objectContaining({ f3: 'k', f1: 'k', a1: 'q', b1: 'q', c6: 'q', f6: 'k', a8: 'q', h8: 'k' }));
        expect(memory.ids.h1).toBeUndefined();
    });
});

describe('integració amb la retransmissió', () => {
    const grauTurns = [];
    beforeAll(() => {
        for (const g of FIXTURES) for (const tier of ['basic', 'mid', 'advanced']) {
            simulate(g, tier).forEach(r => {
                if (r.dialogue) grauTurns.push(...r.dialogue.filter(t => t.role === 'analyst').map(t => t.text));
            });
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

    test('en Grau no diu mai cap casella', () => {
        expect(grauTurns.length).toBeGreaterThan(150);
        grauTurns.forEach(t => expect(t).not.toMatch(SQUARE));
    });

    test('en Grau parla d’escacs, clavades, forquilles, canvis i zones del tauler', () => {
        const all = grauTurns.join(' ');
        ['escac', 'a recer', 'el centre', 'del flanc de', 'peó passat', 'canvi'].forEach(w => expect(all).toContain(w));
        expect(all).toMatch(/\b(fer|fan|farien|facin|fessin) fora\b/);
        expect(all).toMatch(/(el cavall|la torre) (del rei|de la dama)|l’alfil (del rei|de la dama)/);
    });

    test('els comentaris de cada jugada els llegeix l’Èlia; en Grau, els resums i els diàlegs', () => {
        const rows = simulate(FIXTURES[0], 'mid');
        rows.filter(r => r.comment && !r.dialogue && r.kind !== 'summary').forEach(r => {
            const turns = TV.tvDialogueTurns({ speech: r.speech, kind: r.kind, explanatory: r.explanatory, extended: r.extended, ply: r.ply }, true);
            turns.forEach(t => expect(t.role).not.toBe('analyst'));
        });
    });

    test('el duet llegeix cada torn amb la seva veu', () => {
        const row = simulate(FIXTURES[0], 'mid').find(r => r.dialogueEvent === 'plan' && r.dialogue.length === 4);
        const turns = TV.tvDialogueTurns(row, true);
        expect(turns.map(t => t.voiceId)).toEqual(['matxa:central:elia', 'matxa:central:grau', 'matxa:central:elia', 'matxa:central:grau']);
        const solo = TV.tvDialogueTurns(row, false);
        expect(solo).toHaveLength(4);
        expect(solo[0].text).not.toMatch(/\?$/);
        expect(solo.every(t => t.voiceId === null)).toBe(true);
    });

    test('es pot desactivar i aleshores no hi ha cap pla', () => {
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

    test('català: contraccions, apòstrofs i puntuació', () => {
        for (const t of grauTurns) {
            expect(t).not.toMatch(/\b(de|per|a) el\b/);
            expect(t).not.toMatch(/,\s*[,.;:]/);
            expect(t).not.toMatch(/\s{2,}/);
            expect(t).not.toMatch(/amb (el|la|l’|un|una) ?\S+ amb escac/);
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

describe('la veu de l’Èlia, també sense caselles', () => {
    test('l’Èlia anuncia la jugada per la intenció, i als diàlegs diu què s’ha jugat', () => {
        const { ctx, memory } = ctxAfter(RUY.concat('b8c6', 'f1b5'), ['a7a6']);
        expect(V.sayMove(ctx, memory)).toBe('Les blanques treuen l’alfil del rei.');
        expect(V.describeMove(ctx, memory)).toBe('Les blanques treuen l’alfil del rei.');
        const first = ctxAfter(['e2e4'], ['e7e5']);
        expect(V.describeMove(first.ctx, first.memory)).toBe('Les blanques avancen el peó de rei dues caselles.');
        expect(V.sayMove(first.ctx, first.memory)).toBe('Les blanques guanyen espai al centre.');
    });

    test('els fets amb caselles es diuen amb el nom de la peça que hi ha al tauler', () => {
        const { ctx, memory } = ctxAfter(RUY.concat('b8c6', 'f1b5'), ['a7a6']);
        const clean = t => V.clean(t, ctx, memory);
        expect(clean('Les blanques pressionen el cavall de c6. Ara l\'ataquen dues peces.'))
            .toBe('Les blanques pressionen el cavall de la dama negra. Ara l\'ataquen dues peces.');
        expect(clean('El cavall negre defensa el peó d\'e5, que estava atacat.')).toBe('El cavall negre defensa un peó central, que estava atacat.');
        expect(clean('Recordem la pressió sobre c6: més pressió.')).toBe('Recordem la pressió sobre el cavall de la dama negra: més pressió.');
        expect(clean('La dama blanca s\'aparta de l\'atac cap a c1.')).toBe('La dama blanca s\'aparta de l\'atac.');
        expect(clean('El peó passat negre avança fins a d2: li falta una casella per coronar.'))
            .toBe('El peó passat negre avança: li falta una casella per coronar.');
        expect(clean('Hi havia una jugada millor: avançar el peó de la columna h fins a h3.')).toBe('Hi havia una jugada millor: avançar el peó de torre.');
        // Si no es pot dir bé sense caselles, no es diu.
        expect(clean('Peó negre a a5.')).toBeNull();
    });

    test('a les partides reals, ni l’Èlia ni en Grau no diuen cap casella', () => {
        let texts = 0;
        for (const g of FIXTURES) for (const tier of ['basic', 'mid', 'advanced']) {
            simulate(g, tier).forEach(r => {
                const said = r.dialogue ? r.dialogue.map(t => t.text) : (r.say ? [r.say] : []);
                said.forEach(t => { texts++; expect(t).not.toMatch(SQUARE); expect(t).toMatch(/[.?!:]$/); });
                if (r.dialogue) r.dialogue.filter(t => t.solo).forEach(t => expect(t.solo).not.toMatch(SQUARE));
                // El fet verificat continua intacte per a la resta del sistema.
                if (r.comment && !r.dialogue) expect(r.speech).toBe(TV.tvSpeechText(r.say));
            });
        }
        expect(texts).toBeGreaterThan(1200);
    });

    test('en Grau no repeteix el que acaba de dir l’Èlia', () => {
        for (const g of FIXTURES) {
            simulate(g, 'mid').filter(r => r.dialogueEvent === 'move').forEach(r => {
                const elia = r.dialogue[0].text.split(/(?<=\.)\s/)[0].toLowerCase().replace(/\.$/, '');
                expect(r.dialogue[1].text.toLowerCase().replace(/^[^:]*: /, '').replace(/\.$/, '')).not.toBe(elia);
            });
        }
    });
});

describe('banc de textos', () => {
    test('totes les famílies tenen diverses maneres de dir-ho, i cap casella', () => {
        const T = V.TEXTS;
        expect(T.PLAN_QUESTIONS.length).toBeGreaterThanOrEqual(12);
        expect(T.WHY_QUESTIONS.length).toBeGreaterThanOrEqual(8);
        expect(T.LINE_OPENERS.length).toBeGreaterThanOrEqual(8);
        Object.keys(T.THEME_TEXTS).forEach(k => expect(T.THEME_TEXTS[k].length).toBeGreaterThanOrEqual(2));
        const names = { me: 'les blanques', opp: 'les negres', S: 'les negres' };
        T.PLAN_QUESTIONS.forEach(q => expect(q(names)).toMatch(/\?$/));
        T.HIT_QUESTIONS.forEach(q => expect(q({})).toMatch(/\?$/));
        T.MISS_QUESTIONS.forEach(q => expect(q({ side: 'les negres' })).toMatch(/\?$/));
        const p = { S: 'Les negres', s: 'les negres', Opp: 'Les blanques', opp: 'les blanques', oppAdj: 'blanc', word: 'un peó', because: '',
            nWord: 'tres', target: 'la dama', clitic: 'la', type: 'q', defClause: 'i la defensen dues', nMasc: 'tres', dMasc: 'dos defensors',
            left: 2, piece: 'el cavall del rei', n0: 4, n1: 8, kind: 'castle', open: true, absolute: true, fianchetto: true, lever: true };
        Object.keys(T.THEME_TEXTS).forEach(k => T.THEME_TEXTS[k].forEach(fn => expect(fn(p)).not.toMatch(SQUARE)));
    });
});
