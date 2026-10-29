// Biblioteca d'Art de la Guerra: la metàfora no substitueix mai la prova.
const A = require('../artdelaguerra');
const base = (kind = 'center', ply = 8, rest = {}) => ({
    gameId: 'duel-1',
    ply,
    comment: { kind, text: 'Les blanques controlen el centre.', priority: 46 },
    certified: true,
    evidence: { source: 'rules', reliable: true },
    ...rest
});

describe('Biblioteca original de l’Art de la Guerra', () => {
    test('12 famílies i 156 màximes, totes diferenciades', () => {
        expect(Object.keys(A.BANK)).toHaveLength(12);
        expect(A.CATALOG).toHaveLength(156);
        expect(new Set(A.CATALOG.map(m => m.text)).size).toBe(156);
        expect(new Set(A.CATALOG.map(m => m.id)).size).toBe(156);
        for (const family of Object.keys(A.BANK)) {
            expect(A.BANK[family]).toHaveLength(13);
            expect(A.LABELS[family]).toBeTruthy();
        }
    });
    test('text català limitat, no citacions falsament atribuïdes', () => {
        for (const m of A.CATALOG) {
            expect(m.attribution).toMatch(/original/);
            expect(m.text.trim()).toMatch(/[.!?]$/);
            expect(m.text.trim().split(/\s+/).length).toBeLessThanOrEqual(28);
            expect(m.register).toMatch(/^(sentencia|paradoxa|advertiment|imatge)$/);
            expect(m.text).not.toMatch(/Stockfish|Sun Tzu va dir|Sunzi va dir/i);
        }
    });
    test('no narra sense un comentari certificat i una prova fiable', () => {
        const inputs = [
            base('center', 8, {certified: false}),
            base('center', 8, {comment:{kind:'center',text:''}}),
            base('unknown'),
            base('center', -1),
            base('center', 8, {evidence:{source:'stockfish',reliable:false,depth:25}}),
            base('center', 8, {evidence:{source:'stockfish',reliable:true,depth:8}}),
            base('center', 8, {evidence:{source:'internet',reliable:true}}),
            base('center', 8, {prepared:true}),
            base('center', 8, {urgent:true}),
            base('center', 8, {terminal:true}),
            base('mate'),
            base('promotion'),
            base('fork-check'),
            base('fork', 8, {comment:{kind:'fork',text:'Forquilla.',priority:90}})
        ];
        inputs.forEach(ctx => expect(A.choose(ctx).maxim).toBeNull());
    });
    test('no presenta sacrificis sense variant certificada', () => {
        expect(A.choose(base('sacrifice')).maxim).toBeNull();
        expect(A.choose(base('sacrifice', 8, {
            evidence:{source:'stockfish',reliable:true,depth:28}
        })).reason).toBe('sacrifice-not-certified');
        const good = A.choose(base('sacrifice', 8, {
            evidence:{source:'certified-line',reliable:true}
        }));
        expect(good.maxim.family).toBe('cessio');
    });
    test('cada etiqueta selecciona una metàfora de la família correcta', () => {
        const cases = {
            center:'territori', development:'desplegament', fork:'dos_fronts',
            pin:'lligams', 'open-file':'camins', pressure:'setge',
            castle:'defensa', sacrifice:'cessio', 'passed-new':'peons',
            structure:'estructura', opposition:'final', missed:'decisions'
        };
        for (const [kind, expected] of Object.entries(cases)) {
            const evidence = kind==='sacrifice'
                ? {source:'certified-line',reliable:true}
                : {source:'rules',reliable:true};
            const r=A.choose(base(kind, 10, {evidence}));
            expect(r.maxim.family).toBe(expected);
        }
    });
    test('per a Stockfish cal profunditat fiable i no es fabriquen motius', () => {
        const c=base('center',10,{evidence:{source:'stockfish',reliable:true,depth:12}});
        expect(A.choose(c).maxim.family).toBe('territori');
        expect(A.familyFor('mate')).toBeNull();
        expect(A.familyFor('mate-threat')).toBeNull();
        expect(A.familyFor('__proto__')).toBeNull();
    });
    test('separa les intervencions almenys 7 semijugades i una família almenys 12', () => {
        const a=A.choose(base('center',8));
        expect(a.maxim).toBeTruthy();
        expect(A.choose(base('fork',14),a.memory).reason).toBe('too-soon');
        const b=A.choose(base('fork',15),a.memory);
        expect(b.maxim.family).toBe('dos_fronts');
        const c=A.choose(base('center',22),b.memory);
        expect(c.maxim.family).toBe('territori');
        expect(A.choose(base('center',30),c.memory).reason).toBe('same-family');
    });
    test('el selector és determinista i preserva memòries i dades originals', () => {
        const original=base('center',25);
        const memory=A.initialMemory();
        const a=A.choose(original,memory),b=A.choose(original,memory);
        expect(a).toEqual(b);
        expect(memory).toEqual(A.initialMemory());
        expect(original).toEqual(base('center',25));
        expect(a.memory.recentIds).toEqual([a.maxim.id]);
    });
    test('fa rotar les frases i no repeteix a la mateixa partida mentre n’hi ha', () => {
        let memory=A.initialMemory();
        const ids=[];
        for(let ply=0;ply<13*14;ply+=14) {
            const result=A.choose(base('center',ply),memory);
            expect(result.maxim).toBeTruthy();
            ids.push(result.maxim.id);
            memory=result.memory;
        }
        expect(new Set(ids).size).toBe(13);
        expect(memory.count).toBe(13);
    });
    test('la memòria és serialitzable, restaurable i resistent a dades estranyes', () => {
        const original=A.choose(base('pin',12)).memory;
        const restored=JSON.parse(JSON.stringify(original));
        expect(A.normalizeMemory(restored)).toEqual(original);
        const bad=A.normalizeMemory({lastByFamily:{__proto__:1,territori:4},
            recentIds:['fake','decisions-03'],count:-3,lastFamily:'__proto__'});
        expect(bad.lastFamily).toBeNull();
        expect(bad.recentIds).toEqual(['decisions-03']);
        expect(bad.count).toBe(0);
    });
});
