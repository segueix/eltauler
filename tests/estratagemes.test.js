// Les 36 estratagemes: frases originals que només acompanyen fets verificats.
const E = require('../estratagemes');
const A = require('../artdelaguerra');
const TV = require('../stockfishtv');
const base = (kind = 'fork', ply = 8, rest = {}) => ({
    gameId: 'duel-1', ply,
    comment: { kind, text: 'El cavall ataca alhora dues peces.', priority: 50 },
    certified: true, evidence: { source: 'rules', reliable: true }, ...rest
});

describe('Biblioteca de les 36 estratagemes', () => {
    test('26 estratagemes amb el número tradicional i 4 frases cadascun: 104 frases diferents', () => {
        expect(Object.keys(E.STRATAGEMS)).toHaveLength(26);
        expect(E.CATALOG).toHaveLength(104);
        expect(new Set(E.CATALOG.map(m => m.text)).size).toBe(104);
        expect(new Set(E.CATALOG.map(m => m.id)).size).toBe(104);
        const numbers = Object.values(E.STRATAGEMS).map(s => s.n);
        expect(new Set(numbers).size).toBe(26);
        numbers.forEach(n => { expect(n).toBeGreaterThanOrEqual(1); expect(n).toBeLessThanOrEqual(36); });
        expect(E.STRATAGEMS.soroll.title).toBe('Fer soroll a l’est i atacar a l’oest');
        expect(E.STRATAGEMS.prunera.title).toBe('Sacrificar la prunera per salvar el presseguer');
    });
    test('textos catalans breus, originals i sense afirmacions de victòria segura', () => {
        for (const m of E.CATALOG) {
            expect(m.attribution).toMatch(/original/);
            expect(m.text.trim()).toMatch(/[.!?]$/);
            expect(m.text.split(/\s+/).length).toBeLessThanOrEqual(28);
            expect(m.text).not.toMatch(/Stockfish|guanyarà|guanya segur|forçosament|inevitable|va dir/i);
        }
        // Cada estratagema s'anomena pel seu títol almenys en una frase.
        for (const [id, s] of Object.entries(E.STRATAGEMS)) {
            expect(s.texts.some(t => t.includes('«' + s.title + '»'))).toBe(true);
            expect(E.CATALOG.filter(m => m.stratagem === id)).toHaveLength(4);
        }
    });
    test('cada estratagema té almenys un motiu verificat i cap motiu desconegut rep frase', () => {
        const used = new Set(Object.values(E.KIND_TO_STRATAGEMS).flat());
        expect([...used].sort()).toEqual(Object.keys(E.STRATAGEMS).sort());
        expect(E.stratagemsFor('describe')).toEqual([]);
        expect(E.stratagemsFor('__proto__')).toEqual([]);
        expect(E.stratagemsFor('mate')).toEqual([]);
    });
    test('el motiu tria un estratagema adequat', () => {
        const cases = { fork: ['soroll'], pin: ['escala'], 'discovered-attack': ['ganivet'], 'remove-defender': ['tigre', 'llenya'],
            'threat-pawn': ['serp'], check: ['cap'], 'open-file': ['chencang'], structure: ['bigues'], opposition: ['porta'],
            'capture-free': ['cabra'], tension: ['riba', 'aigua'] };
        for (const [kind, expected] of Object.entries(cases)) {
            const r = E.choose(base(kind, 10));
            expect(expected).toContain(r.maxim.stratagem);
            expect(r.maxim.label).toBe('Les 36 estratagemes');
        }
    });
    test('no parla sense comentari certificat, amb urgències ni amb anàlisi poc fiable', () => {
        [
            base('fork', 8, { certified: false }),
            base('fork', 8, { comment: { kind: 'fork', text: '' } }),
            base('describe'), base('fork', -1),
            base('fork', 8, { evidence: { source: 'stockfish', reliable: true, depth: 6 } }),
            base('fork', 8, { evidence: { source: 'internet', reliable: true } }),
            base('fork', 8, { prepared: true }), base('fork', 8, { urgent: true }), base('fork', 8, { terminal: true }),
            base('mate'), base('fork-check'),
            base('fork', 8, { comment: { kind: 'fork', text: 'Forquilla.', priority: 90 } })
        ].forEach(ctx => expect(E.choose(ctx).maxim).toBeNull());
    });
    test('el sacrifici només amb una variant certificada', () => {
        expect(E.choose(base('sacrifice')).reason).toBe('sacrifice-not-certified');
        expect(E.choose(base('sacrifice', 8, { evidence: { source: 'certified-line', reliable: true } })).maxim.stratagem).toBe('prunera');
    });
    test('separa les frases 7 semijugades i no repeteix estratagema en 12', () => {
        const a = E.choose(base('fork', 8));
        expect(E.choose(base('pin', 14), a.memory).reason).toBe('too-soon');
        const b = E.choose(base('pin', 15), a.memory);
        expect(b.maxim.stratagem).toBe('escala');
        expect(E.choose(base('fork', 15), a.memory).reason).toBe('same-stratagem');
        expect(E.choose(base('fork', 22), b.memory).maxim.stratagem).toBe('soroll');
        // Amb dos estratagemes per al motiu, si un és recent es tria l'altre.
        const c = E.choose(base('tension', 40), b.memory);
        const d = E.choose(base('tension', 47), c.memory);
        expect(d.maxim.stratagem).not.toBe(c.maxim.stratagem);
    });
    test('determinista, pur i sense repetir frases mentre n’hi ha', () => {
        const ctx = base('fork', 25), mem = E.initialMemory();
        expect(E.choose(ctx, mem)).toEqual(E.choose(ctx, mem));
        expect(mem).toEqual(E.initialMemory());
        expect(ctx).toEqual(base('fork', 25));
        let memory = E.initialMemory();
        const ids = [];
        for (let ply = 0; ply < 4 * 14; ply += 14) { const r = E.choose(base('fork', ply), memory); ids.push(r.maxim.id); memory = r.memory; }
        expect(new Set(ids).size).toBe(4);
        const restored = E.normalizeMemory(JSON.parse(JSON.stringify(memory)));
        expect(restored).toEqual(memory);
        expect(E.normalizeMemory({ lastByStratagem: { __proto__: 3 }, recentIds: ['fals', 'soroll-1'], count: -1 }))
            .toEqual({ lastPly: -1000, lastByStratagem: {}, recentIds: ['soroll-1'], count: 0 });
    });
});

describe('Prestatge de llibres a la TV: l’Art de la Guerra i les 36 estratagemes', () => {
    const shelf = TV.tvBookshelf([A, E]);
    const ctx = (kind, ply) => ({ gameId: 'g1', ply, comment: { kind, text: 'Fet verificat.', priority: 40 },
        certified: true, evidence: { source: 'rules', reliable: true } });
    test('amb un sol llibre es fa servir directament', () => {
        expect(TV.tvBookshelf([A])).toBe(A);
        expect(TV.tvBookshelf([null, E])).toBe(E);
        expect(TV.tvBookshelf([])).toBeNull();
    });
    test('alterna els llibres i marca d’on ve cada frase', () => {
        let memory = null;
        const books = [];
        for (let ply = 8; ply < 120; ply += 8) {
            const r = shelf.choose(ctx(['center', 'pin', 'fork', 'structure', 'tension'][ply / 8 % 5], ply), memory);
            memory = r.memory;
            if (r.maxim) { books.push(r.maxim.book); expect(r.maxim.bookLabel).toBe(r.maxim.book === 'art' ? 'L’Art de la Guerra' : 'Les 36 estratagemes'); }
        }
        expect(books.length).toBeGreaterThan(8);
        for (let i = 1; i < books.length; i++) expect(books[i]).not.toBe(books[i - 1]);
        expect(JSON.parse(JSON.stringify(memory))).toEqual(memory);
    });
    test('respecta l’espai entre frases i, si un llibre no té res per al motiu, parla l’altre', () => {
        const a = shelf.choose(ctx('center', 10), null);
        expect(a.maxim).toBeTruthy();
        expect(shelf.choose(ctx('fork', 14), a.memory).reason).toBe('too-soon');
        // L'Art no té frases per a «check»: ho cobreixen les estratagemes encara que sigui el torn de l'Art.
        const turnArt = a.maxim.book === 'art' ? a.memory : shelf.choose(ctx('center', 20), a.memory).memory;
        const check = shelf.choose(ctx('check', 40), turnArt);
        expect(check.maxim.book).toBe('estratagemes');
    });
    test('a la simulació, els comentaris factuals no canvien i hi surten tots dos llibres', () => {
        const { Chess } = require('chess.js');
        const FIX = require('./fixtures/tv-games.json');
        const games = Array.isArray(FIX) ? FIX : FIX.games;
        const books = new Set();
        games.forEach((g) => {
            const plain = TV.tvSimulateCommentary(Chess, Object.assign({}, g));
            const rich = TV.tvSimulateCommentary(Chess, Object.assign({}, g, { art: shelf }));
            expect(rich.map(r => r.comment)).toEqual(plain.map(r => r.comment));
            rich.filter(r => r.maxim).forEach(r => books.add(r.maxim.book));
        });
        expect([...books].sort()).toEqual(['art', 'estratagemes']);
    });
});

describe('corrector de català sobre les frases dels llibres', () => {
    const R = require('../redactor');
    test('«la iniciativa» no s’apostrofa (i àtona), «d’iniciativa» sí', () => {
        expect(R.corregirCatala('Prendre la iniciativa és canviar el paper de cadascú.')).toBe('Prendre la iniciativa és canviar el paper de cadascú.');
        expect(R.corregirCatala('Una qüestió de iniciativa.')).toBe("Una qüestió d'iniciativa.");
        expect(R.corregirCatala('la obertura')).toBe("l'obertura");
    });
    test('cap frase de les estratagemes no necessita correcció', () => {
        E.CATALOG.forEach(m => expect(R.corregirCatala(m.text)).toBe(m.text));
    });
});
