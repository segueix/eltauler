// Fase 1: lèxic i varietat expressiva verificable, sense generació lliure.
const E = require('../expressivitat');
const TV = require('../stockfishtv');
const { Chess } = require('chess.js');

const ctx = (overrides) => Object.assign({
    move: { piece: 'n', color: 'w', from: 'g1', to: 'f3', san: 'Nf3', flags: 'n' },
    tier: 'mid'
}, overrides || {});
const candidate = (kind) => ({ kind, family: kind, key: kind + ':w:f3',
    sig: 'f3', priority: 60, explanatory: true,
    variants: ['El comentari original és vàlid.'] });
const sentence = (text) => /^[A-ZÀ-Ü]/.test(text) && /[.!?]$/.test(text);

describe('Expressivitat — vocabulari català i concordança', () => {
    test('catàleg ampliat, sense dependències de xarxa i amb termes explicables', () => {
        const groups = Object.keys(E.LEXIC);
        expect(groups).toEqual(expect.arrayContaining(['peces', 'tactica', 'estrategia', 'finals', 'accions', 'connectors']));
        expect(groups.reduce((n, k) => n + E.LEXIC[k].length, 0)).toBeGreaterThanOrEqual(120);
        expect(E.glossari('atzucac')).toEqual(expect.objectContaining({ familia: 'finals' }));
        expect(E.glossari('forquilla').explicacio).toMatch(/dos objectius/);
        expect(E.glossari('paraula-inexistent')).toBeNull();
        expect(E.termesDe('finals')).toContain('oposició');
        expect(E.termesDe('absent')).toEqual([]);
    });
    test('articles, apostrofació, gènere i color de les peces', () => {
        expect(E.nomPeca('b', 'w', false, true)).toBe("l'alfil blanc");
        expect(E.nomPeca('q', 'b', true, true)).toBe('La dama negra');
        expect(E.nomPeca('r', 'w', false, true)).toBe('la torre blanca');
        expect(E.nomPeca('n', 'b', false, false)).toBe('el cavall');
        expect(E.nomPeca('q', '?')).toBeNull();
        expect(E.colorName('b', true)).toBe('Les negres');
    });
    test('registres segons nivell i peticions explícites', () => {
        expect(E.perfil('basic')).toBe('didactic');
        expect(E.perfil('mid')).toBe('natural');
        expect(E.perfil('advanced')).toBe('analitic');
        expect(E.perfil('basic', 'analitic')).toBe('analitic');
        expect(E.perfil('mid', 'fals')).toBe('natural');
    });
});

describe('Expressivitat — comentaris verificats', () => {
    test('expandeix sense modificar el candidat original ni perdre el text conegut', () => {
        const original = candidate('development');
        const res = E.expandCandidates([original], ctx());
        expect(res).toHaveLength(1);
        expect(res[0]).not.toBe(original);
        expect(res[0].variants[0]).toBe(original.variants[0]);
        expect(original.variants).toHaveLength(1);
        expect(res[0].variants.length).toBeGreaterThan(2);
        expect(res[0].variants.every(sentence)).toBe(true);
        expect(res[0].variants.join(' ')).toMatch(/al joc|casella inicial/);
    });
    test('tots els tipus de peça i colors respecten la contracció de + article', () => {
        const kinds = ['describe', 'center', 'fork', 'capture', 'check', 'recapture'];
        for (const color of ['w', 'b']) {
            for (const piece of ['p', 'n', 'b', 'r', 'q', 'k']) {
                const move = { piece, color, from: 'a1', to: 'a2', captured: 'p', san: 'Ra2+', flags: 'n' };
                for (const kind of kinds) {
                    const forms = E.alternatives(candidate(kind), ctx({ move }));
                    forms.forEach(t => expect(t).not.toMatch(/(?:^|\s)(?:de el|a el)\b/i));
                }
            }
        }
    });

    test('les variants no pressuposen valoracions, errors ni plans de l’ordinador', () => {
        const kinds = ['describe', 'development', 'activation', 'center', 'fork', 'pin',
            'skewer', 'remove-defender', 'discovered-attack', 'diagonal', 'open-file', 'passed-new', 'seventh'];
        for (const kind of kinds) {
            const vs = E.alternatives(candidate(kind), ctx());
            expect(vs.length).toBeGreaterThan(0);
            vs.forEach(s => {
                expect(sentence(s)).toBe(true);
                expect(s).not.toMatch(/avantatge (decisiu|guanyador)|és la millor jugada|Elo|Stockfish diu|sense defensa garantida/i);
                expect(s).not.toMatch(/(?:^|\s)(?:de el |a el |en alfil|en torre)/i);
            });
        }
    });
    test('captures i escacs només produeixen expressions quan hi ha una prova de la jugada', () => {
        const cap = { ...ctx().move, piece: 'r', to: 'a8', from: 'a1', captured: 'q', san: 'Rxa8+' };
        expect(E.alternatives(candidate('capture'), ctx({ move: cap })).length).toBeGreaterThan(0);
        expect(E.alternatives(candidate('capture'), ctx())).toEqual([]);
        expect(E.alternatives(candidate('check'), ctx())).toEqual([]);
        expect(E.alternatives(candidate('check'), ctx({ move: cap })).length).toBeGreaterThan(0);
        expect(E.alternatives(candidate('mate'), ctx({ move: cap }))).toEqual([]);
        expect(E.alternatives(candidate('mate'), ctx({ move: { ...cap, san: 'Rxa8#' } })).length).toBeGreaterThan(0);
    });
    test('la coronació especifica correctament el gènere de la peça', () => {
        const base = { ...ctx().move, piece: 'p', from: 'e7', to: 'e8', promotion: 'q', san: 'e8=Q+' };
        const a = E.alternatives(candidate('promotion'), ctx({ move: base }));
        expect(a.join(' ')).toContain('una dama');
        const b = E.alternatives(candidate('promotion'), ctx({ move: { ...base, promotion: 'b', san: 'e8=B' } }));
        expect(b.join(' ')).toContain('un alfil');
        expect(E.alternatives(candidate('promotion'), ctx({ move: { ...base, promotion: null } }))).toEqual([]);
    });
    test('cap afirmació nova amb posicions invàlides o jugades desconegudes', () => {
        expect(E.expandCandidates([candidate('development')], ctx({ move: { piece: 'n', color: 'w', from: 'z9', to: 'f3' } }))[0].variants).toHaveLength(1);
        expect(E.alternatives(candidate('fork'), ctx({ move: { piece: 'n', color: 'w', from: 'g1', to: 'z9' } }))).toEqual([]);
        expect(E.expandCandidates(null)).toEqual([]);
    });
    test('el text s’adapta als registres sense canviar el significat del motiu', () => {
        const a = E.alternatives(candidate('fork'), ctx({ tier: 'basic' }));
        const b = E.alternatives(candidate('fork'), ctx({ tier: 'advanced' }));
        expect(a[0]).not.toBe(b[0]);
        expect(a.join(' ')).toMatch(/forquilla/);
        expect(b.join(' ')).toMatch(/forquilla/);
    });
});

describe('Integració sense regressions a Stockfish vs Lozza TV', () => {
    test('la retransmissió incorpora alternatives però conserva els fets i les prioritats', () => {
        const g = new Chess(), fenBefore = g.fen(), move = g.move('Nf3');
        const props = { ChessCtor: Chess, fenBefore, fenAfter: g.fen(), move,
            ply: 0, tier: 'mid', before: null, after: null, end: null };
        const original = TV.tvBroadcastStep(props);
        const enriched = TV.tvBroadcastStep(Object.assign({}, props, { expression: E }));
        expect(enriched.candidates.map(c => c.kind)).toEqual(original.candidates.map(c => c.kind));
        const devOld = original.candidates.find(c => c.kind === 'development');
        const devNew = enriched.candidates.find(c => c.kind === 'development');
        expect(devOld).toBeDefined();
        expect(devNew.variants.length).toBeGreaterThan(devOld.variants.length);
        expect(devNew.variants.slice(0, devOld.variants.length)).toEqual(devOld.variants);
        expect(enriched.comment).toBeTruthy();
        expect(typeof enriched.comment.text).toBe('string');
    });
    test('el selector efectivament pot escollir una forma nova de comentar', () => {
        const variants = E.expandCandidates([candidate('development')], ctx());
        const original = candidate('development').variants[0];
        const selections = new Set();
        for (let ply = 0; ply < 15; ply++) {
            const c = TV.tvSelectComment(variants, TV.tvEmptyMemory(), { ply, tier: 'mid', color: 'w' });
            if (c) selections.add(c.text);
        }
        expect(selections.size).toBeGreaterThan(2);
        expect(Array.from(selections).some(t => t !== original)).toBe(true);
    });
});
