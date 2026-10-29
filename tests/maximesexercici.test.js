// Màximes dels llibres de la TV al botó «Màxima» dels exercicis de dues jugades.
const fs = require('fs');
const path = require('path');
const { Chess } = require('chess.js');
const M = require('../maximesexercici');
const A = require('../artdelaguerra');
const E = require('../estratagemes');
const TV = require('../stockfishtv');

const books = [A, E];
const detect = TV.tvCommentCandidates;
// Atac doble del cavall (Cc7: torre d'a8 i dama d'e6), la dama fuig i Cxa8.
const FORK = { fen: 'r6k/8/4q3/1N6/8/8/8/6K1 w - - 0 1', line: ['b5c7', 'e6e5', 'c7a8'] };
// Bxf7+ Rxf7: l'alfil es lliura per un peó i la línia continua.
const OFFER = { fen: '4k3/5p1p/8/8/2B5/8/P7/4K3 w - - 0 1', line: ['c4f7', 'e8f7', 'a2a4'] };
const run = (ex, step, memory, extra = {}) =>
    M.forStep({ ...ex, step, Chess, detect, books, lineVerified: true, ...extra }, memory);

// Finestres de tres semijugades (jugador, rival, jugador) de les partides reals de prova.
function fixtureExercises() {
    const FIX = require('./fixtures/tv-games.json');
    const out = [];
    for (const game of FIX.games) {
        const g = new Chess(game.startFen);
        const fens = [g.fen()], moves = [];
        for (const u of game.moves) {
            if (!g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] })) break;
            fens.push(g.fen()); moves.push(u);
        }
        for (let p = 8; p + 2 < moves.length; p++) out.push({ fen: fens[p], line: moves.slice(p, p + 3) });
    }
    return out;
}

describe('Màximes dels exercicis de dues jugades', () => {
    test('els fets surten del detector de la TV per a cada jugada del jugador', () => {
        const facts = M.stepFacts({ ...FORK, Chess, detect, lineVerified: true });
        expect(facts).toHaveLength(2);
        expect(facts[0][0].kind).toBe('fork');
        expect(facts[1].map(f => f.kind)).toContain('capture-free');
        facts.flat().forEach(f => expect(f.evidence).toEqual({ source: 'rules', reliable: true }));
    });

    test('pas 1: una visió de conjunt i una per a la jugada, de famílies diferents; pas 2: una sola', () => {
        const one = run(FORK, 1, null);
        expect(one.maxims.map(m => m.role)).toEqual(['general', 'pas']);
        const [general, own] = one.maxims;
        expect(own.fact).toBe('fork');
        expect(general.fact).toBe('capture-free');
        expect(general.book).not.toBe(own.book);
        const two = run(FORK, 2, one.memory);
        expect(two.maxims).toHaveLength(1);
        expect(two.maxims[0].role).toBe('pas');
        expect(two.maxims[0].text).not.toBe(general.text);
    });

    test('només textos dels llibres, amb el llibre i l\'atribució originals', () => {
        const catalog = new Map([...A.CATALOG, ...E.CATALOG].map(m => [m.text, m]));
        let memory = null;
        for (const ex of [FORK, OFFER]) for (const step of [1, 2]) {
            const r = run(ex, step, memory);
            memory = r.memory;
            r.maxims.forEach(m => {
                expect(catalog.has(m.text)).toBe(true);
                expect(m.attribution).toMatch(/original/i);
                expect(m.bookLabel).toBe(m.book === 'art' ? A.BOOK_LABEL : E.BOOK_LABEL);
            });
        }
    });

    test('la cessió de material només es menciona amb una línia verificada pel motor', () => {
        const verified = M.stepFacts({ ...OFFER, Chess, detect, lineVerified: true });
        expect(verified[0][0]).toMatchObject({ kind: 'sacrifice', evidence: { source: 'certified-line', reliable: true } });
        const r = run(OFFER, 1, null);
        expect(r.maxims.some(m => m.family === 'cessio' || m.stratagem === 'prunera')).toBe(true);

        const unverified = M.stepFacts({ ...OFFER, Chess, detect, lineVerified: false });
        expect(unverified.flat().map(f => f.kind)).not.toContain('sacrifice');
        const u = run(OFFER, 1, null, { lineVerified: false });
        expect(u.maxims.some(m => m.family === 'cessio' || m.stratagem === 'prunera')).toBe(false);
    });

    test('un canvi equivalent no és cap cessió', () => {
        // Cxe5 Cxe5: cavall per cavall.
        const ex = { fen: '4k3/3n3p/8/4n3/8/5N2/P7/4K3 w - - 0 1', line: ['f3e5', 'd7e5', 'a2a4'] };
        expect(M.stepFacts({ ...ex, Chess, detect, lineVerified: true }).flat().map(f => f.kind)).not.toContain('sacrifice');
    });

    test('funció pura amb memòria serialitzable', () => {
        const first = run(FORK, 1, null).memory;
        const snapshot = JSON.stringify(first);
        const again = run(FORK, 2, JSON.parse(snapshot));
        expect(JSON.stringify(first)).toBe(snapshot);
        expect(JSON.parse(JSON.stringify(again.memory))).toEqual(again.memory);
        // Mateixa entrada, mateix resultat.
        expect(run(FORK, 2, JSON.parse(snapshot)).maxims).toEqual(again.maxims);
    });

    test('sense detector, sense llibres o amb una línia il·legal no es trenca res', () => {
        expect(M.forStep({ ...FORK, step: 1, Chess, books }, null).maxims).toEqual([]);
        expect(M.forStep({ ...FORK, step: 1, Chess, detect, books: [] }, null).maxims).toEqual([]);
        expect(run({ fen: FORK.fen, line: ['a1a8'] }, 1, null).maxims).toEqual([]);
        expect(run({ fen: 'no és un FEN', line: FORK.line }, 1, null).maxims).toEqual([]);
        expect(run(FORK, 1, 'memòria corrupta').maxims.length).toBeGreaterThan(0);
    });

    test('partides reals: gairebé tots els exercicis tenen màxima, molt variades i sense repeticions seguides', () => {
        const exercises = fixtureExercises();
        expect(exercises.length).toBeGreaterThan(300);
        let memory = null, withMaxim = 0;
        const shown = [];
        const families = new Set();
        for (const ex of exercises) {
            let any = false;
            for (const step of [1, 2]) {
                const r = run(ex, step, memory);
                memory = JSON.parse(JSON.stringify(r.memory));
                r.maxims.forEach(m => { shown.push(m.id); if (m.family) families.add(m.family); });
                if (r.maxims.length) any = true;
            }
            if (any) withMaxim++;
        }
        expect(withMaxim / exercises.length).toBeGreaterThanOrEqual(0.9);
        expect(new Set(shown).size).toBeGreaterThanOrEqual(180);
        expect(families.size).toBeGreaterThanOrEqual(10);
        // Cap text no torna abans de vuit màximes.
        const last = {};
        shown.forEach((id, i) => {
            if (id in last) expect(i - last[id]).toBeGreaterThan(8);
            last[id] = i;
        });
    });
});

describe('Integració a l\'app', () => {
    const root = path.join(__dirname, '..');
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

    test('el mòdul es carrega abans d\'app.js', () => {
        expect(html.indexOf('<script src="maximesexercici.js?v=')).toBeGreaterThan(-1);
        expect(html.indexOf('maximesexercici.js')).toBeLessThan(html.indexOf('app.js?v='));
    });

    test('el botó «Màxima» prova primer els llibres i després OpenAI o el banc local', () => {
        const body = app.slice(app.indexOf('async function requestOpenAIBundleHint'));
        const books = body.indexOf('buildBundleBookMaximHtml()');
        expect(books).toBeGreaterThan(-1);
        expect(books).toBeLessThan(body.indexOf('if (!openaiApiKey)'));
    });

    test('la línia d\'emergència no compta com a verificada', () => {
        const fn = app.slice(app.indexOf('function buildEmergencyBundleSequence'));
        expect(fn.slice(0, fn.indexOf('\n}\n'))).toMatch(/lineSource = 'emergency'/);
        expect(app).toMatch(/lineVerified: bundleFixedSequence\.lineSource !== 'emergency'/);
    });

    test('la memòria es desa en una clau local que no se sincronitza', () => {
        expect(M.STORAGE_KEY.startsWith('chess_')).toBe(false);
        expect(M.STORAGE_KEY.startsWith('eltauler_')).toBe(false);
    });
});
