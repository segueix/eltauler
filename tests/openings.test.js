const fs = require('fs');
const path = require('path');
const Core = require('../core.js');

// Petit conjunt d'obertures de prova (subconjunt amb l'estructura real {eco,name,pgn}).
const FIXTURE = [
    { eco: 'C60', name: 'Ruy Lopez', pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5' },
    { eco: 'C50', name: 'Italian Game', pgn: '1. e4 e5 2. Nf3 Nc6 3. Bc4' },
    { eco: 'B20', name: 'Sicilian Defense', pgn: '1. e4 c5' },
    { eco: 'D00', name: "Queen's Pawn Game", pgn: '1. d4 d5' }
];

describe('parsePgnToMoves', () => {
    test('elimina números i punts i parteix en moviments', () => {
        expect(Core.parsePgnToMoves('1. e4 e5 2. Nf3')).toEqual(['e4', 'e5', 'Nf3']);
    });

    test('cadena buida o nul·la dona llista buida', () => {
        expect(Core.parsePgnToMoves('')).toEqual([]);
        expect(Core.parsePgnToMoves(null)).toEqual([]);
        expect(Core.parsePgnToMoves(undefined)).toEqual([]);
    });

    test('gestiona enroc i captures', () => {
        expect(Core.parsePgnToMoves('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Bxc6 dxc6 5. O-O'))
            .toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Bxc6', 'dxc6', 'O-O']);
    });
});

describe('buildOpeningTrie + cerca', () => {
    const trie = Core.buildOpeningTrie(FIXTURE, Core.parsePgnToMoves);

    test('dades no vàlides retornen null', () => {
        expect(Core.buildOpeningTrie(null)).toBeNull();
        expect(Core.buildOpeningTrie(undefined)).toBeNull();
    });

    test('getValidOpeningMoves des de la posició inicial', () => {
        expect(Core.getValidOpeningMoves(trie, []).sort()).toEqual(['d4', 'e4']);
    });

    test('getValidOpeningMoves ramifica després de 1.e4 e5 2.Nf3 Nc6', () => {
        expect(Core.getValidOpeningMoves(trie, ['e4', 'e5', 'Nf3', 'Nc6']).sort())
            .toEqual(['Bb5', 'Bc4']);
    });

    test('una seqüència desconeguda no dona continuacions', () => {
        expect(Core.getValidOpeningMoves(trie, ['e4', 'h6'])).toEqual([]);
    });

    test('trie null és segur', () => {
        expect(Core.getValidOpeningMoves(null, ['e4'])).toEqual([]);
    });

    test('isValidOpeningMove distingeix moviments teòrics', () => {
        expect(Core.isValidOpeningMove(trie, ['e4', 'e5', 'Nf3', 'Nc6'], 'Bb5')).toBe(true);
        expect(Core.isValidOpeningMove(trie, ['e4', 'e5', 'Nf3', 'Nc6'], 'Qh5')).toBe(false);
    });

    test('getMatchingOpenings recull el subarbre', () => {
        const matches = Core.getMatchingOpenings(trie, ['e4', 'e5']);
        const names = matches.map(o => o.name).sort();
        expect(names).toEqual(['Italian Game', 'Ruy Lopez']);
    });

    test('getMatchingOpenings amb seqüència buida dona buit', () => {
        expect(Core.getMatchingOpenings(trie, [])).toEqual([]);
    });
});

describe('analyzeGameOpening', () => {
    const trie = Core.buildOpeningTrie(FIXTURE, Core.parsePgnToMoves);

    test('identifica una línia seguida completament', () => {
        const r = Core.analyzeGameOpening(trie, ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']);
        expect(r).toMatchObject({ name: 'Ruy Lopez', eco: 'C60', deviationMove: null });
        expect(r.depth).toBe(5);
    });

    test('detecta la desviació de la teoria', () => {
        const r = Core.analyzeGameOpening(trie, ['e4', 'e5', 'Nf3', 'Nc6', 'Qh5']);
        expect(r.deviationMove).toBe('Qh5');
        expect(r.deviationPly).toBe(4);
        expect(r.deviationBy).toBe('w'); // ply parell = blanques
        expect(r.depth).toBe(4);
    });

    test('llista de moviments buida o trie null dona null', () => {
        expect(Core.analyzeGameOpening(trie, [])).toBeNull();
        expect(Core.analyzeGameOpening(null, ['e4'])).toBeNull();
    });

    test('desviació molt aviat (profunditat < 2) no marca obertura', () => {
        const r = Core.analyzeGameOpening(trie, ['e4', 'a6']);
        expect(r).toBeNull();
    });
});

// Detecció per POSICIÓ (immune a transposicions). Per provar-la sense chess.js,
// fem servir un model sintètic de FEN on la "posició" depèn només del CONJUNT de
// jugades fetes (no de l'ordre) + el torn, de manera que dos ordres diferents
// que arriben al mateix conjunt es consideren la mateixa posició (transposició).
describe('analyzeGameOpeningByPositions (per posició)', () => {
    const POS_FIXTURE = [
        { eco: 'E01', name: 'Catalan', pgn: '1. d4 Nf6 2. c4 e6 3. g3' },
        { eco: 'C60', name: 'Ruy Lopez', pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5' },
        { eco: 'C70', name: 'Ruy Morphy', pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6' }
    ];
    // FEN sintètica: camp 1 = conjunt ordenat de jugades (sense espais),
    // camp 2 = torn (parell de plies → blanques), camp 3 = enrocs ('-').
    const synthFenSeq = (moves) => moves.map((_, idx) => {
        const i = idx + 1;
        const setKey = moves.slice(0, i).slice().sort().join(',');
        return `${setKey} ${i % 2 === 0 ? 'w' : 'b'} -`;
    });
    const graph = Core.buildOpeningPositionGraph(POS_FIXTURE, synthFenSeq, Core.parsePgnToMoves);
    const ana = (moves) => Core.analyzeGameOpeningByPositions(graph, synthFenSeq(moves), moves);

    test('dades no vàlides retornen null', () => {
        expect(Core.buildOpeningPositionGraph(null, synthFenSeq)).toBeNull();
        expect(Core.analyzeGameOpeningByPositions(null, [], [])).toBeNull();
        expect(Core.analyzeGameOpeningByPositions(graph, [], [])).toBeNull();
    });

    test('identifica una línia seguida en ordre', () => {
        const r = ana(['d4', 'Nf6', 'c4', 'e6', 'g3']);
        expect(r).toMatchObject({ name: 'Catalan', eco: 'E01', deviationMove: null });
    });

    test('reconeix la MATEIXA obertura per transposició (ordre diferent)', () => {
        const r = ana(['d4', 'e6', 'c4', 'Nf6', 'g3']);
        expect(r).toMatchObject({ name: 'Catalan', eco: 'E01' });
        // Una transposició no s'ha de marcar com a desviació de la teoria.
        expect(r.deviationMove).toBeNull();
    });

    test('detecta la desviació després d\'arribar a una posició amb nom', () => {
        const r = ana(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Bc5']);
        expect(r).toMatchObject({ name: 'Ruy Lopez', eco: 'C60' });
        expect(r.deviationMove).toBe('Bc5');
        expect(r.deviationPly).toBe(5);
        expect(r.deviationBy).toBe('b'); // ply senar = negres
        expect(r.theoryMoves).toContain('a6');
    });

    test('una partida fora de tota teoria coneguda dona null', () => {
        expect(ana(['h4', 'h5'])).toBeNull();
    });
});

// Connexió amb el repertori de l'app per POSICIÓ (transposicions incloses).
describe('findCuratedOpeningByPosition (repertori per posició)', () => {
    // Reutilitzem el model sintètic: la "posició" depèn del conjunt de jugades.
    const synthKeys = (moves) => moves.map((_, idx) => {
        const i = idx + 1;
        const setKey = moves.slice(0, i).slice().sort().join(',');
        return `${setKey} ${i % 2 === 0 ? 'w' : 'b'} -`;
    });
    const curatedList = [
        { index: 0, eco: 'E01', name: 'Obertura Catalana', keys: synthKeys(['d4', 'Nf6', 'c4', 'e6', 'g3', 'd5']) },
        { index: 1, eco: 'E60', name: 'Índia de Rei', keys: synthKeys(['d4', 'Nf6', 'c4', 'g6', 'Bg7', 'd6']) }
    ];

    test('reconeix la Catalana del repertori encara que sigui per transposició', () => {
        const game = synthKeys(['d4', 'd5', 'c4', 'e6', 'g3', 'Nf6']); // ordre diferent
        const r = Core.findCuratedOpeningByPosition(curatedList, game, 5);
        expect(r).not.toBeNull();
        expect(r.name).toBe('Obertura Catalana');
        expect(r.depth).toBeGreaterThanOrEqual(5);
    });

    test('no confon obertures que només comparteixen el principi (per sota del llindar)', () => {
        const game = synthKeys(['d4', 'd5']); // massa curt
        expect(Core.findCuratedOpeningByPosition(curatedList, game, 5)).toBeNull();
    });

    test('entrades no vàlides retornen null', () => {
        expect(Core.findCuratedOpeningByPosition(null, ['x'], 5)).toBeNull();
        expect(Core.findCuratedOpeningByPosition(curatedList, [], 5)).toBeNull();
    });
});

// Comprovació de sanitat sobre les dades REALS d'obertures (obertures.js),
// per detectar regressions de format/parseig al fitxer de dades.
describe('dades reals (obertures.js)', () => {
    const oberturesPath = path.join(__dirname, '..', 'obertures.js');
    let logSpy;
    beforeAll(() => { logSpy = jest.spyOn(console, 'log').mockImplementation(() => {}); });
    afterAll(() => { logSpy.mockRestore(); });

    const loadData = () => {
        const src = fs.readFileSync(oberturesPath, 'utf8');
        // El fitxer declara `const OPENINGS_DATA = [...]`; l'executem en un àmbit
        // de funció i el retornem (console queda disponible des del global).
        return new Function(`${src}\n;return OPENINGS_DATA;`)();
    };

    test('el fitxer existeix i carrega moltes obertures', () => {
        const data = loadData();
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBeGreaterThan(100);
    });

    test('el trie real reconeix línies conegudes', () => {
        const trie = Core.buildOpeningTrie(loadData(), Core.parsePgnToMoves);
        expect(trie).not.toBeNull();
        // Després de 1.e4 hi ha d'haver continuacions teòriques.
        expect(Core.getValidOpeningMoves(trie, ['e4']).length).toBeGreaterThan(0);
        // 1.e4 e5 ha de coincidir amb diverses obertures.
        expect(Core.getMatchingOpenings(trie, ['e4', 'e5']).length).toBeGreaterThan(0);
    });
});
