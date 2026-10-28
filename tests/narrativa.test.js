// Memòria narrativa: només records de motius validats i fets del tauler.
const N = require('../narrativa');
const TV = require('../stockfishtv');
const { Chess } = require('chess.js');
const move = (extra) => Object.assign({
    color: 'w', piece: 'r', from: 'd1', to: 'd4', san: 'Rd4', flags: 'n'
}, extra || {});
function selected(kind, key, text) {
    return { kind, key, sig: key, text: text || 'Les blanques ocupen una columna.', 
        leadText: text || 'Les blanques ocupen una columna.', extended: false, priority: 50 };
}
function candidate(kind, key, extra) {
    return Object.assign({ kind, key, sig: key, variants: ['Frase comprovada.'], tags: { color: 'w', squares: ['d4'] } }, extra || {});
}
function play(story, s, cand, ply, mv) {
    return N.apply(story, s, { ply, move: mv || move(), candidates: cand ? [cand] : [] });
}

describe('Fase 2: memòria narrativa de fets comprovats', () => {
    test('reconeix fils relacionats per color i columna, no només per frase', () => {
        expect(N.describeTopic(candidate('open-file', 'file:w:d'))).toMatchObject({ topic: 'file:w:d', color: 'w' });
        expect(N.describeTopic(candidate('doubled-rooks', 'dbl:w:d'))).toMatchObject({ topic: 'file:w:d', kind: 'doubled-rooks' });
        expect(N.describeTopic(candidate('passed-advance', 'passed:w:a'))).toMatchObject({ topic: 'passed:w:a', group: 'passed' });
        expect(N.describeTopic(candidate('pressure', 'press:b:e5'))).toMatchObject({ topic: 'pressure:b:e5' });
        expect(N.describeTopic(candidate('center', 'center-pawn:w:e4'))).toMatchObject({ topic: 'center:w:', group: 'center' });
        expect(N.describeTopic(candidate('majority', 'major:w:rei'))).toMatchObject({ group: 'majority', loc: 'rei' });
        expect(N.describeTopic(candidate('mate', 'mate:w'))).toBeNull();
        expect(N.describeTopic(candidate('pressure', 'press:w:z9'))).toBeNull();
    });

    test('les torres doblades recuperen la columna de què s’havia parlat abans', () => {
        const first = play(N.empty(), selected('open-file', 'file:w:d', 'Les blanques ocupen la columna d.'),
            candidate('open-file', 'file:w:d', { sig: 'ro' }), 5);
        expect(first.story.threads).toHaveLength(1);
        expect(first.comment.narrative).toBeUndefined();
        const second = play(first.story, selected('doubled-rooks', 'dbl:w:d', 'Les blanques doblen les torres a la columna d.'),
            candidate('doubled-rooks', 'dbl:w:d'), 14);
        expect(second.comment.text).toMatch(/Recordem la columna d/);
        expect(second.comment.narrative).toEqual(expect.objectContaining({ event: 'return', previousPly: 5 }));
        expect(second.story.lastNarrationPly).toBe(14);
        expect(second.story.threads).toHaveLength(1);
        expect(second.story.threads[0].kind).toBe('doubled-rooks');
        expect(second.comment).not.toHaveProperty('eval');
    });

    test('el peó passat es recorda només quan la nova jugada també està verificada', () => {
        const first = play(N.empty(), selected('passed-new', 'passed:w:a', 'Les blanques tenen un peó passat a a4.'),
            candidate('passed-new', 'passed:w:a', { sig: 'a4', tags: { color: 'w', squares: ['a4'] } }), 10,
            move({ piece: 'p', from: 'a3', to: 'a4' }));
        const next = play(first.story, selected('passed-advance', 'passed:w:a', 'El peó passat avança a a5.'),
            candidate('passed-advance', 'passed:w:a', { sig: 'a5', tags: { color: 'w', squares: ['a5'] } }), 20,
            move({ piece: 'p', from: 'a4', to: 'a5' }));
        expect(next.comment.text).toContain('Tornem al peó passat de la columna a');
        expect(next.story.threads[0].lastSquare).toBe('a5');
    });

    test('no inventa cap pla si el candidat és desconegut, absent o un tema que mai no s’ha comentat', () => {
        const known = selected('pressure', 'press:w:d5', 'Pressió sobre d5.');
        const noCandidate = play(N.empty(), known, null, 2);
        expect(noCandidate.story.threads).toHaveLength(0);
        expect(noCandidate.comment).toEqual(known);
        const silence = play(noCandidate.story, null, candidate('pressure', 'press:w:d5'), 8);
        expect(silence.story.threads).toHaveLength(0);
        expect(silence.comment).toBeNull();
    });

    test('les valoracions crítiques i els resums no reben prefixos narratius', () => {
        const first = play(N.empty(), selected('center', 'center-pawn:w:e4', 'Les blanques lluiten pel centre.'),
            candidate('center', 'center-pawn:w:e4'), 5);
        const summary = play(first.story, selected('summary', 'summary', 'Balanç de la partida.'),
            candidate('summary', 'summary'), 12);
        expect(summary.comment.text).toBe('Balanç de la partida.');
        expect(summary.story.threads).toHaveLength(1);
    });

    test('tanca una pressió anterior només si es captura exactament la peça objectiu', () => {
        const first = play(N.empty(), selected('pressure', 'press:w:d5', 'Les blanques pressionen la dama de d5.'),
            candidate('pressure', 'press:w:d5', { sig: '2/1',
                payload: { pressure: { color: 'w', targetSq: 'd5', targetType: 'q', attackers: 2, defenders: 1 } } }),
            4, move({ from: 'd1', to: 'd4' }));
        const wrong = play(first.story, selected('capture', 'capture:8', 'Les blanques capturen una peça.'),
            candidate('capture', 'capture:8'), 8,
            move({ from: 'c4', to: 'd5', captured: 'p' }));
        expect(wrong.comment.text).toBe('Les blanques capturen una peça.');
        const right = play(first.story, selected('capture', 'capture:10', 'Les blanques capturen la dama a d5.'),
            candidate('capture', 'capture:10'), 10, move({ from: 'c4', to: 'd5', captured: 'q' }));
        expect(right.comment.text).toMatch(/La pressió que havíem vist sobre d5 culmina/);
        expect(right.story.threads).toHaveLength(0);
        expect(right.comment.narrative.event).toBe('resolved');
    });

    test('tanca un peó passat quan aquell peó és capturat, mai amb una altra captura', () => {
        const first = play(N.empty(), selected('passed-new', 'passed:w:a', 'Les blanques tenen un peó passat a a4.'),
            candidate('passed-new', 'passed:w:a', { sig: 'a4', tags: { color: 'w', squares: ['a4'] } }), 3,
            move({ piece: 'p', from: 'a3', to: 'a4' }));
        const wrong = play(first.story, selected('capture', 'capture:8', 'Les negres capturen un peó.'),
            candidate('capture', 'capture:8'), 8,
            move({ color: 'b', piece: 'b', from: 'b5', to: 'c4', captured: 'p' }));
        expect(wrong.comment.narrative).toBeUndefined();
        const right = play(first.story, selected('capture', 'capture:10', 'Les negres capturen el peó a a4.'),
            candidate('capture', 'capture:10'), 10,
            move({ color: 'b', piece: 'b', from: 'b5', to: 'a4', captured: 'p' }));
        expect(right.comment.text).toMatch(/El peó passat que seguíem ha estat capturat/);
        expect(right.story.threads).toHaveLength(0);
    });

    test('no exagera la freqüència, no conserva fils antics i limita la memòria', () => {
        let story = N.empty();
        for (let i = 0; i < 30; i++) {
            const square = 'abcdefgh'[i % 8] + String(1 + Math.floor(i / 8));
            story = play(story, selected('pressure', 'press:w:' + square),
                candidate('pressure', 'press:w:' + square), i * 2, move()).story;
        }
        expect(story.threads.length).toBeLessThanOrEqual(N.MAX_THREADS);
        expect(story.threads.every(t => 58 - t.ply <= N.MAX_AGE)).toBe(true);
        const reset = N.empty();
        expect(reset.threads).toEqual([]);
        const clone = N.copy(story);
        clone.threads.pop();
        expect(clone.threads.length).toBeLessThan(story.threads.length);
    });

    test('la memòria és pura; no modifica els candidats ni els records antics', () => {
        const c = candidate('center', 'center-piece:w:e4', { sig: 'e4' });
        const selected0 = selected('center', 'center-piece:w:e4', 'Les blanques ocupen el centre.');
        const original = N.empty();
        const res = play(original, selected0, c, 2);
        expect(original.threads).toEqual([]);
        expect(selected0).not.toHaveProperty('narrative');
        expect(c.variants).toEqual(['Frase comprovada.']);
        const invalid = play(res.story, selected0, c, 20, { from: 'z9', to: 'e4', color: 'w' });
        expect(invalid.comment).toBe(selected0);
        expect(invalid.story.threads).toEqual(res.story.threads);
    });
});

describe('Integració a la retransmissió', () => {
    test('el mòdul s’executa després de seleccionar un comentari real', () => {
        const chess = new Chess(), before = chess.fen();
        const mv = chess.move('e4');
        const mem = TV.tvEmptyMemory();
        let observed = null;
        const fakeNarrative = { apply(story, chosen, args) {
            observed = { story, chosen, args };
            return { story: { threads: [], lastNarrationPly: 10 },
                comment: chosen && Object.assign({}, chosen, { text: chosen.text + ' Fil narratiu comprovat.' }) };
        }};
        const result = TV.tvBroadcastStep({
            ChessCtor: Chess, fenBefore: before, fenAfter: chess.fen(), move: mv, ply: 0, memory: mem, narrative: fakeNarrative, tier: 'mid'
        });
        expect(observed).not.toBeNull();
        expect(observed.args.ply).toBe(0);
        expect(observed.args.candidates.length).toBeGreaterThan(0);
        expect(mem.story.threads).toHaveLength(0); // instantània anterior intacta
        expect(result.memory.story.lastNarrationPly).toBe(10);
        expect(result.comment.text).toMatch(/Fil narratiu comprovat/);
    });
    test('la simulació admet narrativa injectada sense canviar les jugades legals', () => {
        const calls = [];
        const narrative = { apply(story, chosen, args) {
            calls.push(args.ply);
            return { story: { threads: [], lastNarrationPly: -100 }, comment: chosen };
        }};
        const seq = ['e2e4', 'e7e5', 'g1f3', 'b8c6'];
        const rows = TV.tvSimulateCommentary(Chess, { moves: seq, narrative: narrative, tier: 'mid' });
        expect(calls).toEqual([0,1,2,3]);
        expect(rows).toHaveLength(seq.length);
        expect(rows.every(x => typeof x.fen === 'string')).toBe(true);
    });
});
