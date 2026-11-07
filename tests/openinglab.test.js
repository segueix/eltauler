const fs = require('fs');
const path = require('path');
const { Chess } = require('chess.js');
const L = require('../tallerobertures.js');
const Core = require('../core.js');

// ---------------------------------------------------------------------------
// «La teva obertura» (tallerobertures.js): el taller d'un sol tauler. Aquí es
// prova amb chess.js REAL la lògica pura que fa servir la interfície: el
// llibre per posició i els noms en català, el pla (on va cada peça), la
// coherència, el repàs espaiat, la tria del rival i la lectura de Stockfish 19.
// ---------------------------------------------------------------------------

let DATA;
let logSpy;
beforeAll(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const src = fs.readFileSync(path.join(__dirname, '..', 'obertures.js'), 'utf8');
    DATA = new Function(`${src}\n;return OPENINGS_DATA;`)();
});
afterAll(() => { logSpy.mockRestore(); });

// Construeix nodes del repertori com ho fa la interfície: una línia (SAN) i
// la jugada de l'usuari al final.
function decide(nodes, line, extra) {
    const st = L.annotateLine(Chess, line.slice(0, -1));
    const mv = st.game.move(line[line.length - 1]);
    st.game.undo();
    const info = L.candidateInfo(st, mv);
    const key = L.positionKey(st.game.fen());
    nodes[key] = Object.assign({}, info, { line: line.slice(0, -1), created: Object.keys(nodes).length + 1, box: 1, due: 0 }, extra || {});
    return key;
}

describe('noms d’obertura en català', () => {
    test('famílies i variants', () => {
        expect(L.translateOpeningName('Sicilian Defense: Najdorf Variation, English Attack')).toBe('Defensa Siciliana: variant Najdorf, atac anglès');
        expect(L.translateOpeningName("Queen's Gambit Declined: Exchange Variation")).toBe('Gambit de Dama Refusat: variant del canvi');
        expect(L.translateOpeningName('French Defense: Advance Variation, Main Line')).toBe("Defensa Francesa: variant de l'avanç, línia principal");
        expect(L.translateOpeningName('Ruy Lopez: Closed Variation')).toBe('Obertura Espanyola: variant tancada');
        expect(L.translateOpeningName('London System, with Bd3')).toBe('Sistema Londres, amb Bd3');
        expect(L.translateOpeningName('Italian Game: Two Knights Defense')).toBe('Obertura Italiana: defensa dels dos cavalls');
    });
    test('els noms propis de diverses paraules no es destrossen', () => {
        expect(L.translateOpeningName("English Opening: King's English Variation")).toBe("Obertura Anglesa: variant King's English");
        expect(L.translateOpeningName('Indian Defense: West Indian Defense')).toBe('Defensa Índia: defensa West Indian');
    });
    test('totes les obertures de la base tenen un nom no buit', () => {
        DATA.forEach(op => expect(L.translateOpeningName(op.name).length).toBeGreaterThan(0));
    });
});

describe('llibre d’obertures', () => {
    test('l’arbre de seqüències dona les respostes més jugades primer', () => {
        const trie = L.buildSequenceTrie(DATA);
        const first = L.bookMoves({ trie }, [], L.START_KEY);
        expect(first[0].san).toBe('e4');
        expect(first.map(m => m.san)).toEqual(expect.arrayContaining(['d4', 'c4', 'Nf3']));
        const vsE4 = L.bookMoves({ trie }, ['e4'], '');
        expect(vsE4.slice(0, 2).map(m => m.san).sort()).toEqual(['c5', 'e5']);
        for (let i = 1; i < vsE4.length; i++) expect(vsE4[i - 1].count).toBeGreaterThanOrEqual(vsE4[i].count);
    });

    test('el nom canvia jugada a jugada i ja es diu «Francesa» després d’1.e4 e6', () => {
        const trie = L.buildSequenceTrie(DATA);
        const name = sans => L.lineName({ trie }, sans, null).nameCa;
        expect(name(['e4'])).toMatch(/Peó de Rei/);
        expect(name(['e4', 'e6'])).toBe('Defensa Francesa');
        expect(name(['e4', 'c6'])).toBe('Defensa Caro-Kann');
        expect(name(['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'])).toMatch(/^Defensa Siciliana: variant Najdorf/);
    });

    test('amb el graf per posició, les transposicions mantenen el nom i el llibre', () => {
        const fenSeq = moves => { const g = new Chess(); return moves.map(m => { g.move(m, { sloppy: true }); return g.fen(); }); };
        const graph = Core.buildOpeningPositionGraph(DATA.filter(op => /^(D|E)/.test(op.eco)), fenSeq, Core.parsePgnToMoves);
        const trie = L.buildSequenceTrie([]);
        // Gambit de Dama Refusat per un ordre poc habitual (1.c4 e6 2.Nc3 d5 3.d4).
        const sans = ['c4', 'e6', 'Nc3', 'd5', 'd4'];
        const keys = L.annotateLine(Chess, sans).keys;
        const nm = L.lineName({ trie, graph }, sans, keys);
        expect(nm.inBook).toBe(true);
        expect(nm.nameCa).toMatch(/Gambit de Dama/);
        // Les continuacions surten del graf quan l'arbre no coneix l'ordre.
        expect(L.bookMoves({ trie, graph }, sans, keys[keys.length - 1]).length).toBeGreaterThan(0);
    });

    test('una línia pròpia marca on surt del llibre', () => {
        const trie = L.buildSequenceTrie(DATA);
        const sans = ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'a4', 'a5', 'h4'];
        const nm = L.lineName({ trie }, sans, L.annotateLine(Chess, sans).keys);
        expect(nm.inBook).toBe(false);
        expect(nm.leftAt).toBeGreaterThanOrEqual(7);
        expect(nm.nameCa).toMatch(/^Obertura Italiana/);
    });
});

describe('anotació de línies: quina peça fa cada jugada', () => {
    test('l’origen segueix la peça i l’enroc no compta com a jugada de torre', () => {
        const st = L.annotateLine(Chess, ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O', 'Nf6', 'Re1']);
        const by = san => st.moves.find(m => m.san === san);
        expect(by('Nf3')).toMatchObject({ origin: 'g1', first: true, piece: 'n' });
        expect(by('O-O')).toMatchObject({ origin: 'e1', castle: 'k', first: true });
        // La torre h1 ha anat a f1 amb l'enroc: Re1 és la seva PRIMERA jugada.
        expect(by('Re1')).toMatchObject({ origin: 'h1', first: true, piece: 'r' });
    });
    test('una segona jugada de la mateixa peça no és «primera»', () => {
        const st = L.annotateLine(Chess, ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4']);
        expect(st.moves[6]).toMatchObject({ san: 'Ba4', origin: 'f1', first: false });
    });
    test('la captura al pas treu la peça capturada del mapa', () => {
        const st = L.annotateLine(Chess, ['e4', 'a6', 'e5', 'd5', 'exd6']);
        expect(st.origins.d5).toBeUndefined();
        expect(st.origins.d6).toBe('e2');
    });
});

describe('el pla i la coherència', () => {
    function london() {
        const nodes = {};
        decide(nodes, ['d4']);
        decide(nodes, ['d4', 'd5', 'Nf3']);
        decide(nodes, ['d4', 'd5', 'Nf3', 'Nf6', 'Bf4']);
        decide(nodes, ['d4', 'Nf6', 'Nf3']);
        decide(nodes, ['d4', 'Nf6', 'Nf3', 'g6', 'Bf4']);
        return nodes;
    }

    test('el pla és el destí majoritari de cada peça, en l’ordre habitual', () => {
        const scheme = L.computeScheme(london());
        expect(L.schemeList(scheme).map(p => p.label)).toEqual(['d4', 'Nf3', 'Bf4']);
        expect(scheme.g1).toMatchObject({ to: 'f3', count: 2, total: 2 });
    });

    test('planCheck: segueix, nova peça, conflicte, repetició i jugades concretes', () => {
        const scheme = L.computeScheme(london());
        const st = L.annotateLine(Chess, ['d4', 'e6', 'Nf3', 'c5']);
        const info = san => { const mv = st.game.moves({ verbose: true }).find(m => m.san === san); return L.candidateInfo(st, mv); };
        expect(L.planCheck(scheme, info('Bf4')).kind).toBe('plan');
        expect(L.planCheck(scheme, info('e3')).kind).toBe('new');
        expect(L.planCheck(scheme, info('Bg5'))).toMatchObject({ kind: 'conflict', expected: 'Bf4' });
        expect(L.planCheck(scheme, info('Ne5')).kind).toBe('repeat');
        expect(L.planCheck(scheme, info('dxc5')).kind).toBe('concrete');
    });

    test('les jugades del pla en una posició nova', () => {
        const scheme = L.computeScheme(london());
        const st = L.annotateLine(Chess, ['d4', 'e6', 'Nf3', 'c5']);
        expect(L.planMoves(scheme, st).map(m => m.san)).toEqual(['Bf4']);
        expect(L.planMoveForOrigin(scheme, st, 'c1')).toEqual({ san: 'Bf4', uci: 'c1f4' });
    });

    test('informe: 100% quan totes les línies segueixen el pla, i menys amb un conflicte', () => {
        const nodes = london();
        expect(L.repertoireReport({ nodes }).coherencePct).toBe(100);
        const key = decide(nodes, ['d4', 'e6', 'Nf3', 'c5', 'Bg5']);
        const rep = L.repertoireReport({ nodes });
        expect(rep.coherencePct).toBeLessThan(100);
        expect(rep.issues).toEqual([expect.objectContaining({ key, kind: 'conflict', expected: 'Bf4' })]);
        // Una excepció justificada per Stockfish 19 no trenca la coherència.
        nodes[key].justified = true;
        expect(L.repertoireReport({ nodes }).coherencePct).toBe(100);
    });

    test('repetir peça sense motiu resta coherència; amb motiu (poca pèrdua o teoria) no', () => {
        const nodes = {};
        decide(nodes, ['e4']);
        const k = decide(nodes, ['e4', 'e5', 'Bc4']);
        decide(nodes, ['e4', 'e5', 'Bc4', 'Nf6', 'Bb5'], { loss: 60 });
        expect(L.repertoireReport({ nodes }).issues.map(i => i.kind)).toEqual(['repeat']);
        Object.keys(nodes).forEach(key => { if (key !== k && nodes[key].san === 'Bb5') nodes[key].loss = 10; });
        expect(L.repertoireReport({ nodes }).coherencePct).toBe(100);
    });

    test('una jugada sense validar no compta com a coherent', () => {
        const nodes = {};
        decide(nodes, ['e4'], { unverified: true });
        expect(L.repertoireReport({ nodes })).toMatchObject({ coherencePct: 0, issues: [expect.objectContaining({ kind: 'unverified' })] });
    });

    test('explicacions de les jugades', () => {
        const st = L.annotateLine(Chess, ['e4', 'e5', 'Nf3', 'Nc6', 'g3', 'Nf6', 'Bg2', 'Bc5', 'O-O']);
        const d = i => L.describeMove(st.moves[i]);
        expect(d(0)).toMatch(/centre/);
        expect(d(2)).toMatch(/cavall cap al centre/);
        expect(d(4)).toMatch(/fianchetto/);
        expect(d(6)).toMatch(/diagonal llarga/);
        expect(d(8)).toMatch(/Enroc curt/);
    });
});

describe('Stockfish 19: lectura i veredicte', () => {
    test('llegeix les línies MultiPV i descarta les de límit', () => {
        const i = L.parseInfoLine('info depth 14 seldepth 18 multipv 2 score cp -35 nodes 1000 nps 5000 pv e7e5 g1f3 b8c6');
        expect(i).toMatchObject({ depth: 14, multipv: 2, cp: -35, uci: 'e7e5' });
        expect(L.parseInfoLine('info depth 14 multipv 1 score cp 20 lowerbound nodes 1 pv e2e4')).toBeNull();
        expect(L.parseInfoLine('info depth 3 currmove e2e4 currmovenumber 1')).toBeNull();
        const mate = L.parseInfoLine('info depth 10 multipv 1 score mate 3 pv d1h5');
        expect(mate.cp).toBeGreaterThan(9000);
        expect(L.parseInfoLine('info depth 10 multipv 1 score mate -2 pv e1e2').cp).toBeLessThan(-9000);
    });
    test('veredicte segons els centipeons perduts', () => {
        expect(L.judgeMove(30, 25)).toMatchObject({ verdict: 'excellent', ok: true, loss: 5 });
        expect(L.judgeMove(30, -10)).toMatchObject({ verdict: 'good', ok: true });
        expect(L.judgeMove(30, -50)).toMatchObject({ verdict: 'playable', ok: true });
        expect(L.judgeMove(30, -100)).toMatchObject({ verdict: 'dubious', ok: false });
        // Una anàlisi més profunda pot valorar millor la jugada que la «millor».
        expect(L.judgeMove(20, 40).loss).toBe(0);
    });
    test('format de l’avaluació en català', () => {
        expect(L.formatCp(35)).toBe('+0,35');
        expect(L.formatCp(-120)).toBe('−1,20');
        expect(L.formatLoss(426)).toBe('4,26 peons');
    });
});

describe('repàs espaiat', () => {
    test('encerts pugen de caixa; errors tornen a la primera', () => {
        const now = 1e12;
        let n = { box: 1 };
        n = Object.assign(n, L.srsAfter(n, 'ok', now));
        expect(n.box).toBe(2);
        expect(n.due).toBe(now + L.SRS_INTERVALS[2]);
        n = Object.assign(n, L.srsAfter(n, 'ok', now));
        expect(n.box).toBe(3);
        expect(L.srsAfter(n, 'hinted', now).box).toBe(3);
        expect(L.srsAfter(n, 'fail', now)).toEqual({ box: 1, due: now + L.SRS_INTERVALS[1] });
        expect(L.isDue({ due: now - 1 }, now)).toBe(true);
        expect(L.isDue({ due: now + 1 }, now)).toBe(false);
    });
});

describe('resposta del rival', () => {
    const now = 1e12;
    test('només teoria que Stockfish 19 aprova, amb més pes a les més jugades', () => {
        const c = L.rivalCandidates({
            book: [{ san: 'c5', count: 400 }, { san: 'e5', count: 300 }, { san: 'g5', count: 5 }],
            engine: [{ san: 'c5', cp: -30 }, { san: 'e5', cp: -35 }, { san: 'e6', cp: -40 }, { san: 'g5', cp: -150 }],
            now
        });
        expect(c.map(x => x.san)).toEqual(['c5', 'e5']);
        expect(c[0].weight).toBeGreaterThan(c[1].weight);
        expect(c.every(x => x.source === 'book')).toBe(true);
    });
    test('fora de llibre, les millors de Stockfish 19', () => {
        const c = L.rivalCandidates({ book: [], engine: [{ san: 'Nf6', cp: 10 }, { san: 'd5', cp: 0 }, { san: 'h5', cp: -80 }], now });
        expect(c.map(x => x.san)).toEqual(['Nf6', 'd5']);
        expect(c.every(x => x.source === 'engine')).toBe(true);
    });
    test('sense motor, la teoria tal qual', () => {
        expect(L.rivalCandidates({ book: [{ san: 'd5', count: 4 }], engine: [], now }).map(x => x.san)).toEqual(['d5']);
    });
    test('porta on toca repassar o decidir abans que a posicions ja apreses', () => {
        const nodes = { due: { due: now - 1 }, later: { due: now + 1e9 } };
        const c = L.rivalCandidates({
            book: [{ san: 'a', count: 100 }, { san: 'b', count: 100 }, { san: 'c', count: 100 }],
            engine: [], now,
            nodeAfter: san => san === 'a' ? nodes.due : san === 'b' ? nodes.later : null
        });
        const w = Object.fromEntries(c.map(x => [x.san, x.weight]));
        expect(w.a).toBeGreaterThan(w.c);
        expect(w.c).toBeGreaterThan(w.b);
    });
    test('la tria ponderada respecta el generador', () => {
        const cands = [{ san: 'x', weight: 1 }, { san: 'y', weight: 3 }];
        expect(L.pickWeighted(cands, () => 0).san).toBe('x');
        expect(L.pickWeighted(cands, () => 0.99).san).toBe('y');
        expect(L.pickWeighted([], () => 0.5)).toBeNull();
    });
});

describe('les teves obertures amb nom', () => {
    // Repertori de blanques on la línia 1.d4 d5 2.Nf3 Nf6 3.Bf4 e6 4.e3 c5 5.h4
    // surt de la teoria amb una jugada pròpia (5.h4).
    const LINE = ['d4', 'd5', 'Nf3', 'Nf6', 'Bf4', 'e6', 'e3', 'c5', 'h4', 'Nc6'];
    function build(extra) {
        const nodes = {};
        for (let i = 0; i < LINE.length; i += 2) decide(nodes, LINE.slice(0, i + 1), extra && extra[LINE[i]]);
        return { name: '', nodes, named: [], declined: [] };
    }
    const keysOf = sans => L.annotateLine(Chess, sans).keys;

    test('una sortida pròpia, coherent i nova es pot anomenar', () => {
        const side = build();
        const c = L.namingCandidate({ side, sans: LINE, keys: keysOf(LINE), leftAt: 9, color: 'w' });
        expect(c).toMatchObject({ ok: true, leftPly: 9, leftSan: 'h4' });
        expect(c.leftKey).toBe(keysOf(LINE)[8]);
    });

    test('si en surt el rival, la sortida és la teva primera jugada fora de la teoria', () => {
        const side = build();
        const c = L.namingCandidate({ side, sans: LINE, keys: keysOf(LINE), leftAt: 8, color: 'w' });
        expect(c).toMatchObject({ ok: true, leftPly: 9, leftSan: 'h4', bookPly: 8 });
    });

    test('no es proposa si no surts tu del llibre, si és teoria o si no és coherent', () => {
        const side = build();
        expect(L.namingCandidate({ side, sans: LINE, keys: keysOf(LINE), leftAt: null, color: 'w' }).reason).toBe('book');
        // Surt del llibre el rival amb l'última jugada: no hi ha cap jugada teva fora de la teoria.
        expect(L.namingCandidate({ side, sans: LINE, keys: keysOf(LINE), leftAt: 10, color: 'w' }).reason).toBe('no-own-move');
        // Una jugada del repertori que trenca el pla (Bg5 contra un pla Bf4 majoritari).
        const conflictSide = build();
        decide(conflictSide.nodes, ['d4', 'Nf6', 'Nf3', 'e6', 'Bf4']);
        decide(conflictSide.nodes, ['d4', 'g6', 'Nf3', 'Bg7', 'Bf4']);
        const k = L.positionKey(L.annotateLine(Chess, ['d4', 'd5', 'Nf3', 'Nf6']).game.fen());
        const bad = Object.assign({}, conflictSide.nodes[k]);
        conflictSide.nodes[k] = Object.assign(bad, L.candidateInfo(L.annotateLine(Chess, ['d4', 'd5', 'Nf3', 'Nf6']),
            L.annotateLine(Chess, ['d4', 'd5', 'Nf3', 'Nf6']).game.moves({ verbose: true }).find(m => m.san === 'Bg5')));
        const line2 = ['d4', 'd5', 'Nf3', 'Nf6', 'Bg5', 'e6', 'e3', 'c5', 'h4'];
        for (let i = 4; i < line2.length; i += 2) decide(conflictSide.nodes, line2.slice(0, i + 1));
        expect(L.namingCandidate({ side: conflictSide, sans: line2, keys: keysOf(line2), leftAt: 9, color: 'w' }).reason).toBe('incoherent');
        // Una jugada que no és al repertori.
        const missing = build();
        delete missing.nodes[L.START_KEY];
        expect(L.namingCandidate({ side: missing, sans: LINE, keys: keysOf(LINE), leftAt: 9, color: 'w' }).reason).toBe('missing');
    });

    test('es desa amb les altres, no es duplica i es reconeix en altres línies', () => {
        const side = build();
        const c = L.namingCandidate({ side, sans: LINE, keys: keysOf(LINE), leftAt: 9, color: 'w' });
        const e = L.addNamedOpening(side, { name: '  El meu   Londres  ', sans: LINE, leftKey: c.leftKey, leftPly: c.leftPly, base: 'Sistema Londres', now: 5 });
        expect(e).toMatchObject({ name: 'El meu Londres', leftPly: 9, practiced: 0 });
        expect(side.named).toHaveLength(1);
        expect(L.addNamedOpening(side, { name: 'Un altre', sans: LINE, leftKey: c.leftKey })).toBeNull();
        expect(L.addNamedOpening(side, { name: '   ', sans: LINE, leftKey: 'x' })).toBeNull();
        // Ja és teva: no es torna a proposar...
        expect(L.namingCandidate({ side, sans: LINE, keys: keysOf(LINE), leftAt: 9, color: 'w' }).reason).toBe('known');
        // ...i una línia amb una altra resposta del rival després de 5.h4 hi passa.
        const other = LINE.slice(0, 9).concat(['h6']);
        expect(L.namedOpeningFor(side.named, keysOf(other))).toBe(e);
        expect(L.namedOpeningFor(side.named, keysOf(LINE.slice(0, 8)))).toBeNull();
    });

    test('una sortida descartada no es torna a demanar', () => {
        const side = build();
        const c = L.namingCandidate({ side, sans: LINE, keys: keysOf(LINE), leftAt: 9, color: 'w' });
        side.declined.push(c.leftKey);
        expect(L.namingCandidate({ side, sans: LINE, keys: keysOf(LINE), leftAt: 9, color: 'w' }).reason).toBe('declined');
    });

    test('la pràctica arriba fins al final de l’obertura desada', () => {
        expect(L.userMovesIn(LINE, 'w')).toBe(5);
        expect(L.userMovesIn(LINE, 'b')).toBe(5);
        expect(L.userMovesIn(LINE.slice(0, 9), 'b')).toBe(4);
    });

    test('el magatzem conserva les obertures amb nom i descarta les malmeses', () => {
        const s = L.normalizeStore({ sides: { w: { nodes: {}, named: [{ name: 'A', sans: ['e4'], leftKey: 'k' }, { name: '', sans: [], leftKey: 'x' }, null], declined: ['k2', 5] } } });
        expect(s.sides.w.named.map(o => o.name)).toEqual(['A']);
        expect(s.sides.w.declined).toEqual(['k2']);
        expect(s.sides.b).toEqual({ name: '', nodes: {}, named: [], declined: [] });
    });
});

describe('magatzem', () => {
    test('normalitza dades velles o malmeses', () => {
        const s = L.normalizeStore({ prefs: { color: 'b', depth: 99 }, sides: { w: { nodes: { k: { san: 'e4', origin: 'e2' }, bad: { foo: 1 } } } } });
        expect(s.prefs).toEqual({ color: 'b', depth: L.DEFAULT_DEPTH });
        expect(Object.keys(s.sides.w.nodes)).toEqual(['k']);
        expect(s.sides.b.nodes).toEqual({});
        expect(L.normalizeStore(null)).toEqual(L.emptyStore());
    });
    test('les anàlisis desades tenen un límit', () => {
        const s = L.emptyStore();
        for (let i = 0; i < 800; i++) L.rememberEval(s, 'k' + i, { d: 14, m: 4, l: [] });
        expect(Object.keys(s.evals).length).toBe(700);
        expect(s.evals.k799).toBeDefined();
        expect(s.evals.k0).toBeUndefined();
    });
    test('el repertori viatja amb la sincronització; la memòria cau del motor no', () => {
        expect(L.STORE_KEY.startsWith('chess_')).toBe(true);
        expect(L.EVALS_KEY.startsWith('eltauler_cloud_')).toBe(true);
    });
});

describe('integració a la pàgina', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    test('la secció d’Obertures és un sol tauler amb el taller', () => {
        expect(html).toMatch(/tallerobertures\.js\?v=\d+\.\d+\.\d+/);
        expect(html).toMatch(/tallerobertures\.css\?v=\d+\.\d+\.\d+/);
        const screen = html.slice(html.indexOf('<div id="opening-screen"'));
        // El taller va just després de la capçalera, abans dels blocs antics.
        expect(screen.indexOf('id="opening-lab"')).toBeGreaterThan(0);
        expect(screen.indexOf('id="opening-lab"')).toBeLessThan(screen.indexOf('id="personal-opening-banner"'));
        ['olab-board', 'olab-name', 'olab-feedback', 'olab-undo', 'olab-hint', 'olab-new', 'olab-stats', 'olab-plan', 'olab-named'].forEach(id => {
            expect(screen).toContain('id="' + id + '"');
        });
    });
    test('app.js obre el taller i el connecta a Stockfish 19', () => {
        const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
        expect(app).toMatch(/ElTaulerOpeningLab\.configure\(\{\s*stockfishUrl: HIERO_STOCKFISH_URL/);
        expect(app).toMatch(/ElTaulerOpeningLab\.open\(\)/);
    });
});
