const Store = require('../gamestore.js');
const Core = require('../core.js');

// Entrada d'historial com la que desa l'app: índex lleuger + cos pesat.
function entryWithBody(id, overrides) {
    return Object.assign({
        id: id,
        label: '29 jul 14:30',
        date: '2026-07-29T12:30:00.000Z',
        mode: 'free',
        result: 'Victòria',
        precision: 78,
        playerColor: 'w',
        moves: ['e4', 'e5', 'Nf3', 'Nc6'],
        keyMoment: { fen: '8/8/8/8/8/8/8/K6k w - - 0 1', ply: 3 },
        moveReviews: [
            { moveNumber: 2, color: 'w', quality: 'good', swing: 20, fen: 'f1', bestMovePv: ['a', 'b'] },
            { moveNumber: 3, color: 'w', quality: 'blunder', swing: 300, fen: 'f2', alternatives: [{ move: 'e2e4' }] }
        ],
        errors: [{ fen: 'f2', severity: 'blunder' }],
        severeErrors: [{ fen: 'f2', quality: 'blunder' }],
        review: [],
        aiReview: 'Una ressenya llarga.'
    }, overrides || {});
}

describe('separació índex / cos', () => {
    test("l'índex conserva els camps lleugers i no cap dels pesats", () => {
        const { index, body } = Store.splitEntry(entryWithBody('g1'));
        expect(index.id).toBe('g1');
        expect(index.result).toBe('Victòria');
        expect(index.moves).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
        expect(index.keyMoment).toBeTruthy();
        Store.HEAVY_FIELDS.forEach(field => expect(index[field]).toBeUndefined());
        expect(body.moveReviews).toHaveLength(2);
        expect(body.aiReview).toBe('Una ressenya llarga.');
    });

    test("l'índex resumeix si hi ha cos i quantes jugades s'han revisat", () => {
        const { index } = Store.splitEntry(entryWithBody('g1'));
        expect(index.hasBody).toBe(true);
        expect(index.reviewedMoves).toBe(2);
    });

    test('una partida sense analitzar no genera cap cos', () => {
        const raw = entryWithBody('g2', {
            moveReviews: [], errors: [], severeErrors: [], review: [], aiReview: null
        });
        const { index, body } = Store.splitEntry(raw);
        expect(body).toBeNull();
        expect(index.hasBody).toBe(false);
        expect(index.reviewedMoves).toBe(0);
    });

    test("partir una entrada que ja és només índex no perd els resums", () => {
        const light = Store.splitEntry(entryWithBody('g3')).index;
        const again = Store.splitEntry(light).index;
        expect(again.hasBody).toBe(true);
        expect(again.reviewedMoves).toBe(2);
    });

    test("l'índex és molt més petit que l'entrada sencera", () => {
        const full = JSON.stringify(entryWithBody('g4')).length;
        const light = JSON.stringify(Store.splitEntry(entryWithBody('g4')).index).length;
        expect(light).toBeLessThan(full / 2);
    });
});

describe('descàrrega i recuperació del cos', () => {
    test('shedBody treu els camps pesats però deixa els resums', () => {
        const entry = Store.shedBody(entryWithBody('g5'));
        Store.HEAVY_FIELDS.forEach(field => expect(field in entry).toBe(false));
        expect(entry.hasBody).toBe(true);
        expect(entry.reviewedMoves).toBe(2);
        expect(entry.moves).toHaveLength(4);
    });

    test('una entrada descarregada no compta com a hidratada', () => {
        expect(Store.isHydrated(entryWithBody('g6'))).toBe(true);
        expect(Store.isHydrated(Store.shedBody(entryWithBody('g6')))).toBe(false);
    });

    test('una partida que mai no ha tingut cos ja es considera hidratada', () => {
        const light = Store.splitEntry(entryWithBody('g7', {
            moveReviews: [], errors: [], severeErrors: [], review: [], aiReview: null
        })).index;
        expect(Store.isHydrated(light)).toBe(true);
    });

    test('shedBody + attachBody torna a deixar l\'entrada com estava', () => {
        const original = entryWithBody('g8');
        const body = Store.splitEntry(original).body;
        const entry = Store.shedBody(entryWithBody('g8'));
        Store.attachBody(entry, body);
        expect(Store.isHydrated(entry)).toBe(true);
        expect(entry.moveReviews).toEqual(original.moveReviews);
        expect(entry.severeErrors).toEqual(original.severeErrors);
        expect(entry.aiReview).toBe(original.aiReview);
    });

    test('hidratar sense cos deixa els camps buits, no absents', () => {
        const entry = Store.attachBody(Store.shedBody(entryWithBody('g9')), null);
        expect(entry.moveReviews).toEqual([]);
        expect(entry.errors).toEqual([]);
        expect(entry.aiReview).toBeNull();
        expect(entry.hasBody).toBe(false);
        expect(Store.isHydrated(entry)).toBe(true); // no es torna a demanar
    });

    test('reviewCount respon tant si el cos hi és com si no', () => {
        expect(Store.reviewCount(entryWithBody('g10'))).toBe(2);
        expect(Store.reviewCount(Store.shedBody(entryWithBody('g10')))).toBe(2);
        expect(Store.reviewCount(null)).toBe(0);
    });
});

describe('llista llesta per al localStorage', () => {
    test('indexForStorage no deixa passar cap camp pesat', () => {
        const list = [entryWithBody('a'), Store.shedBody(entryWithBody('b'))];
        const stored = Store.indexForStorage(list);
        const serialized = JSON.stringify(stored);
        Store.HEAVY_FIELDS.forEach(field => expect(serialized).not.toContain(`"${field}"`));
        expect(stored).toHaveLength(2);
        expect(stored[0].hasBody).toBe(true);
        expect(stored[1].hasBody).toBe(true);
    });

    test('no toca la llista original', () => {
        const entry = entryWithBody('c');
        Store.indexForStorage([entry]);
        expect(entry.moveReviews).toHaveLength(2);
    });

    test('dues-centes partides indexades caben de sobres al document de sincronització', () => {
        const list = [];
        for (let i = 0; i < 200; i++) list.push(entryWithBody('g' + i));
        const bytes = JSON.stringify(Store.indexForStorage(list)).length;
        expect(bytes).toBeLessThan(1024 * 1024); // límit d'1 MiB per document de Firestore
    });
});

describe('resum per fases a l\'índex (perfil del bessó)', () => {
    // Perquè el bessó pugui mirar centenars de partides, el resum per fases
    // viatja a l'índex: el perfil ha de sortir igual amb revisions o sense.
    function reviewAt(moveNumber, swing, fen) {
        return { moveNumber: moveNumber, color: 'w', swing: swing, fen: fen };
    }
    const OPENING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const MIDDLE_FEN = 'r2q1rk1/ppp2ppp/2np1n2/2b1p3/2B1P1b1/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 8';

    function gameWithReviews() {
        const reviews = [];
        for (let i = 0; i < 10; i++) reviews.push(reviewAt(3, 10, OPENING_FEN));
        for (let i = 0; i < 10; i++) reviews.push(reviewAt(20, 200, MIDDLE_FEN));
        return {
            id: 'p1',
            playerColor: 'w',
            moves: ['e4', 'e5', 'Nf3', 'Nc6'],
            moveReviews: reviews
        };
    }

    test('bessoPhaseStatsFromGame compta pèrdua i jugades per fase', () => {
        const stats = Core.bessoPhaseStatsFromGame(gameWithReviews());
        expect(stats.opening).toEqual({ loss: 100, n: 10 });
        expect(stats.middlegame).toEqual({ loss: 2000, n: 10 });
        expect(stats.endgame).toEqual({ loss: 0, n: 0 });
    });

    test('només compta les jugades pròpies', () => {
        const game = gameWithReviews();
        game.moveReviews.push({ moveNumber: 4, color: 'b', swing: 900, fen: OPENING_FEN });
        expect(Core.bessoPhaseStatsFromGame(game).opening.n).toBe(10);
    });

    test('el perfil surt igual amb el resum desat que amb les revisions', () => {
        const withReviews = gameWithReviews();
        const stats = Core.bessoPhaseStatsFromGame(withReviews);
        const lightOnly = Store.shedBody(Object.assign({}, withReviews, { phaseStats: stats }));
        expect(Store.isHydrated(lightOnly)).toBe(false); // sense revisions a la memòria
        const fromReviews = Core.bessoProfileFromGames([withReviews]);
        const fromIndex = Core.bessoProfileFromGames([lightOnly]);
        expect(fromIndex.phaseEloDelta).toEqual(fromReviews.phaseEloDelta);
        expect(fromIndex.reviewedMoves).toBe(fromReviews.reviewedMoves);
        expect(fromIndex.avgCpLoss).toBe(fromReviews.avgCpLoss);
    });

    test('una partida vella sense resum ni revisions no aporta res, però no trenca res', () => {
        const legacy = Store.shedBody(Object.assign({}, gameWithReviews()));
        delete legacy.phaseStats;
        const profile = Core.bessoProfileFromGames([legacy]);
        expect(profile.games).toBe(1);          // segueix comptant per al llibre
        expect(profile.reviewedMoves).toBe(0);
        expect(profile.phaseEloDelta.opening).toBe(0);
    });

    test('un resum desat mal format es recalcula de les revisions', () => {
        const game = Object.assign(gameWithReviews(), { phaseStats: { opening: {} } });
        expect(Core.bessoGamePhaseStats(game).opening).toEqual({ loss: 100, n: 10 });
    });

    test('el perfil suma els resums de moltes partides', () => {
        const stats = Core.bessoPhaseStatsFromGame(gameWithReviews());
        const games = [];
        for (let i = 0; i < 50; i++) {
            games.push(Store.shedBody(Object.assign({}, gameWithReviews(), { id: 'g' + i, phaseStats: stats })));
        }
        const profile = Core.bessoProfileFromGames(games);
        expect(profile.games).toBe(50);
        expect(profile.reviewedMoves).toBe(1000);
        // L'obertura es juga molt millor que el mig joc → delta positiu.
        expect(profile.phaseEloDelta.opening).toBeGreaterThan(0);
        expect(profile.phaseEloDelta.middlegame).toBeLessThan(0);
    });
});
