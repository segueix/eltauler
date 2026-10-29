const { Chess } = require('chess.js');
const TV = require('../stockfishtv');
const N = require('../narrativa');
const Q = require('../auditoria');
const E = require('../expressivitat');
const H = require('../hieroclosure');
const J = require('../jeropedagogia');
const P = require('../prosodia');
const AuditScript = require('../scripts/audit-commentary');

function cand(kind, key, additional) {
    return Object.assign({ kind, key, sig: key, variants: ['El motiu és comprovat.'],
        tags: { color: 'w', squares: [] } }, additional || {});
}
function chosen(kind, key, text) {
    return { kind, key, sig: key, text: text || 'Les blanques ocupen la columna.',
        leadText: text || 'Les blanques ocupen la columna.' };
}
function step(story, c, candidate, ply, move) {
    return N.apply(story, c, { candidates: candidate ? [candidate] : [],
        ply, move: Object.assign({ piece: 'r', color: 'w', from: 'a1', to: 'a4', san: 'Ra4', flags: 'n' }, move || {}) });
}
describe('Fase 4 — qualitat i fiabilitat del català', () => {
    test('evita inicis idèntics quan existeix una alternativa de la mateixa jugada', () => {
        const list = ['Les blanques tenen activitat.', 'La torre guanya activitat.', 'Ara la torre és activa.'];
        expect(Q.preferVariety(list[0], list, [{ text: 'Les blanques ataquen.' }])).toBe(list[1]);
        expect(Q.preferVariety(list[0], list, [])).toBe(list[0]);
        expect(Q.preferVariety(list[0], ['única frase'], [{ text: 'Les blanques ataquen.' }])).toBe(list[0]);
        expect(Q.preferVariety(list[0], list, [{ text: 'La torre defensa.' }])).toBe(list[0]);
    });
    test('l’auditor diferencia repetició exacta, inicis repetits i frases incorrectes', () => {
        const rows = ['Les blanques juguen.', 'Les blanques ataquen.', 'Les blanques juguen.', null,
            'La torre de el cavall.'].map((text, ply) => ({ comment: text, ply, kind: 'describe' }));
        const report = Q.audit(rows);
        expect(report.plies).toBe(5);
        expect(report.exactRepeat).toBe(1);
        expect(report.repeatedOpenings).toBeGreaterThanOrEqual(1);
        expect(report.malformed).toBe(1);
        expect(report.maxSilence).toBe(1);
        expect(report.events.some(e => e.code === 'grammar')).toBe(true);
    });
    test('recorda la casella real del peó passat encara que no hi hagi comentari', () => {
        const first = step(N.empty(), chosen('passed-new', 'passed:w:a'),
            cand('passed-new', 'passed:w:a', { tags: { color: 'w', squares: ['a4'] } }), 2,
            { from: 'a3', to: 'a4', piece: 'p' });
        expect(first.story.threads[0].lastSquare).toBe('a4');
        const silent = step(first.story, null, null, 3, { color: 'w', from: 'a4', to: 'a5', piece: 'p' });
        expect(silent.story.threads[0].lastSquare).toBe('a5');
        const second = step(silent.story, chosen('passed-advance', 'passed:w:a'),
            cand('passed-advance', 'passed:w:a', { tags: { color: 'w', squares: ['a6'] } }), 12,
            { color: 'w', from: 'a5', to: 'a6', piece: 'p' });
        expect(second.story.threads[0].lastSquare).toBe('a6');
        expect(second.comment.narrative.event).toBe('return');
    });
    test('una captura o el moviment de la peça objectiu extingeix la pressió, també en silenci', () => {
        const first = step(N.empty(), chosen('pressure', 'press:w:d5'),
            cand('pressure', 'press:w:d5', { payload: { pressure: { color: 'w', targetSq: 'd5', targetType: 'q' } } }),
            2, { from: 'a1', to: 'd1' });
        expect(first.story.threads).toHaveLength(1);
        const moveAway = step(first.story, null, null, 3, { piece: 'q', color: 'b', from: 'd5', to: 'e5' });
        expect(moveAway.story.threads).toHaveLength(0);
        const captured = step(first.story, null, null, 3, { piece: 'r', color: 'w', from: 'd1', to: 'd5', captured: 'q' });
        expect(captured.story.threads).toHaveLength(0);
    });
    test('l’àudio per a Matxa manté majúscules i puntuació naturals', () => {
        expect(P.prepare('Escac; el rei ha de moure.')).toBe('Escac. El rei ha de moure.');
        expect(P.prepare('Taules Taules.')).toBe('Taules.');
        expect(P.prepare('El cavall a f 3.')).toBe('El cavall a efa tres.');
    });
    test('les captures del jeroglífic són gramaticals i les explicacions es basen en una seqüència legal', () => {
        const p = { fen: 'r5k1/8/8/8/8/8/8/R5K1 w - - 0 1',
            solutionMoves: ['g1f2','f2e2','a1a8'], replyMoves: ['g8f7','f7e7'] };
        const info = H.createVerifier(Chess).inspect(p);
        expect(info.kind).toBe('material');
        const puzzle = { ...p, conclusion: { version: H.VERSION, fen: p.fen,
            line: info.line, finalFen: info.finalFen, kind: info.kind, gain: info.gain } };
        const lesson = J.build(puzzle, Chess, H);
        expect(lesson.verified).toBe(true);
        expect(lesson.steps[2].text).toMatch(/captura una torre/);
        expect(lesson.steps[2].text).not.toMatch(/captura torre\b/);
    });
});

describe('Auditoria reproduïble de partides completes', () => {
    let results;
    beforeAll(() => { results = AuditScript.report(); });
    test('les partides de prova són legals i acaben de debò', () => {
        expect(results).toHaveLength(7);
        results.forEach(game => {
            expect(game.ended).toBe(true);
            expect(game.plies).toBeGreaterThanOrEqual(4);
        });
    });
    test('el repertori ampliat no injecta errors gramaticals evidents ni comentaris excessius', () => {
        for (const game of results) {
            expect(game.metrics.malformed).toBe(0);
            expect(game.metrics.tooLong).toBe(0);
            expect(game.metrics.unique).toBeGreaterThan(0);
        }
    });
    test('la retransmissió manté cobertura i la duplicació exacta queda acotada', () => {
        for (const game of results) {
            expect(game.metrics.coverage).toBeGreaterThan(0.15);
            expect(game.metrics.exactRepeat).toBeLessThanOrEqual(Math.max(3, Math.ceil(game.plies * 0.08)));
        }
    });
    afterAll(() => {
        if (results) console.log('AUDITORIA_FASE4', JSON.stringify(results.map(g => ({
            name: g.name, plies: g.plies, ended: g.ended,
            coverage: g.metrics.coverage, exactRepeat: g.metrics.exactRepeat,
            repeatedOpenings: g.metrics.repeatedOpenings,
            malformed: g.metrics.malformed, narration: g.metrics.narrativeLinks,
            timeMs: g.elapsedMs
        }))));
    });
});
