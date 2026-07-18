const Core = require('../core.js');
const { Chess } = require('chess.js');
const H = Core.createBessoHelpers(Chess);

// Construeix una entrada d'historial jugable a partir d'una llista de SAN.
function gameEntry(moves, playerColor, reviews) {
    return {
        id: 'g_' + Math.random().toString(36).slice(2),
        moves: moves.slice(),
        playerColor: playerColor,
        moveReviews: reviews || []
    };
}

// Partida Ruy López curta per a les proves de llibre.
const RUY = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7'];
const ITALIAN = ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd3', 'd6'];

describe('fase de la posició', () => {
    test('les primeres jugades són obertura', () => {
        expect(Core.bessoPhaseOfPosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 0)).toBe('opening');
        expect(Core.bessoPhaseOfPosition('r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3', 6)).toBe('opening');
    });
    test('moltes peces i jugada avançada → mig joc', () => {
        const fen = 'r2q1rk1/ppp2ppp/2np1n2/2b1p3/2B1P1b1/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 8';
        expect(Core.bessoPhaseOfPosition(fen, 30)).toBe('middlegame');
    });
    test('poques peces → final, encara que el número de jugada sigui alt', () => {
        const fen = '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 40';
        expect(Core.bessoPhaseOfPosition(fen, 80)).toBe('endgame');
    });
});

describe('partides elegibles i color dominant', () => {
    test('descarta partides sense color o massa curtes', () => {
        const games = [
            gameEntry(RUY, 'w'),
            gameEntry(['e4', 'e5'], 'w'),        // massa curta
            gameEntry(RUY, null),                 // sense color
            { moves: null, playerColor: 'w' }     // sense jugades
        ];
        expect(Core.bessoEligibleGames(games).length).toBe(1);
    });
    test('el color dominant és el més freqüent', () => {
        const games = [gameEntry(RUY, 'w'), gameEntry(ITALIAN, 'w'), gameEntry(RUY, 'b')];
        expect(Core.bessoDominantColor(games)).toBe('w');
    });
});

describe('llibre personal', () => {
    test('recull les jugades pròpies com a blanques', () => {
        const book = H.bessoBuildBook([gameEntry(RUY, 'w')], 16);
        const start = new Chess();
        // A la posició inicial, el bessó (blanques) hauria de jugar e4.
        expect(H.bessoBookMove(book, start.fen())).toBe('e4');
    });
    test('NO recull les jugades del rival', () => {
        // Jugant amb blanques, la resposta negra 1...e5 no ha d'entrar al llibre.
        const book = H.bessoBuildBook([gameEntry(RUY, 'w')], 16);
        const afterE4 = new Chess();
        afterE4.move('e4');
        // Toca a les negres: el bessó juga amb blanques, no té jugada aquí.
        expect(H.bessoBookMove(book, afterE4.fen())).toBeNull();
    });
    test('pondera per freqüència: la línia més jugada surt amb un rng determinista', () => {
        // Tres partides amb 1.e4 i una amb 1.d4 → e4 domina.
        const games = [gameEntry(RUY, 'w'), gameEntry(ITALIAN, 'w'), gameEntry(RUY, 'w'),
            gameEntry(['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6'], 'w')];
        const book = H.bessoBuildBook(games, 16);
        const start = new Chess().fen();
        // rng=0 agafa la primera acumulada; amb 3 e4 vs 1 d4, gairebé tot el rang és e4.
        expect(H.bessoBookMove(book, start, () => 0.1)).toBe('e4');
        expect(H.bessoBookMove(book, start, () => 0.99)).toBe('d4');
    });
    test('posició fora del llibre → null', () => {
        const book = H.bessoBuildBook([gameEntry(RUY, 'w')], 16);
        const weird = new Chess('rnbqkbnr/pp1ppppp/8/2p5/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1').fen();
        expect(H.bessoBookMove(book, weird)).toBeNull();
    });
    test('jugades corruptes no trenquen la construcció', () => {
        const book = H.bessoBuildBook([gameEntry(['e4', 'e5', 'Zz9', 'Nc6'], 'w')], 16);
        expect(H.bessoBookMove(book, new Chess().fen())).toBe('e4');
    });
});

describe('perfil per fases', () => {
    // Jugant amb blanques, les jugades pròpies són les de moveNumber senar-parell
    // amb color 'w'. Construïm reviews amb swing gran a l'obertura i petit al mig joc.
    function reviewsWithPhaseLoss() {
        const rev = [];
        // Obertura (moveNumber 1..5) amb pèrdues grans.
        for (let m = 1; m <= 5; m++) rev.push({ moveNumber: m, color: 'w', swing: 200, fen: null });
        // Mig joc (moveNumber 15..25) amb pèrdues petites.
        for (let m = 15; m <= 25; m++) rev.push({ moveNumber: m, color: 'w', swing: 10, fen: null });
        return rev;
    }
    test('la fase pitjor rep un delta d\'ELO negatiu i la millor positiu', () => {
        const games = [];
        for (let i = 0; i < 3; i++) games.push(gameEntry(RUY, 'w', reviewsWithPhaseLoss()));
        const profile = Core.bessoProfileFromGames(games);
        expect(profile.phaseEloDelta.opening).toBeLessThan(0);      // pitjor que la mitjana
        expect(profile.phaseEloDelta.middlegame).toBeGreaterThan(0); // millor que la mitjana
    });
    test('poques mostres en una fase → sense ajust (delta 0)', () => {
        const profile = Core.bessoProfileFromGames([gameEntry(RUY, 'w', [
            { moveNumber: 1, color: 'w', swing: 300, fen: null }
        ])]);
        expect(profile.phaseEloDelta.opening).toBe(0);
    });
    test('ignora les jugades del rival al còmput', () => {
        const reviews = [{ moveNumber: 1, color: 'b', swing: 800, fen: null }];
        const profile = Core.bessoProfileFromGames([gameEntry(RUY, 'w', reviews)]);
        expect(profile.reviewedMoves).toBe(0);
    });
});

describe('força per fase', () => {
    test('aplica el desnivell de la fase sobre l\'ELO base', () => {
        const profile = { phaseEloDelta: { opening: -80, middlegame: 20, endgame: 0 } };
        expect(Core.bessoPhaseElo(1200, profile, 'opening')).toBe(1120);
        expect(Core.bessoPhaseElo(1200, profile, 'middlegame')).toBe(1220);
        expect(Core.bessoPhaseElo(1200, profile, 'endgame')).toBe(1200);
    });
    test('perfil buit → ELO base sense canvis', () => {
        expect(Core.bessoPhaseElo(1000, null, 'opening')).toBe(1000);
    });
});

describe('instantània del passat', () => {
    const NOW = Date.parse('2026-07-18T00:00:00Z');
    test('agafa la instantània prou antiga més recent', () => {
        const hist = [
            { date: '2026-01-01', elo: 900 },
            { date: '2026-05-01', elo: 1050 },  // ~78 dies enrere: elegible
            { date: '2026-07-10', elo: 1200 }   // massa recent
        ];
        const snap = Core.bessoPastSnapshot(hist, NOW, 21);
        expect(snap.elo).toBe(1050);
        expect(snap.daysAgo).toBeGreaterThanOrEqual(21);
    });
    test('sense instantànies prou antigues → null', () => {
        const hist = [{ date: '2026-07-15', elo: 1200 }];
        expect(Core.bessoPastSnapshot(hist, NOW, 21)).toBeNull();
    });
    test('historial buit → null', () => {
        expect(Core.bessoPastSnapshot([], NOW, 21)).toBeNull();
    });
    test('etiqueta llegible en català', () => {
        expect(Core.bessoDaysAgoLabel(1)).toBe('fa 1 dia');
        expect(Core.bessoDaysAgoLabel(3)).toBe('fa 3 dies');
        expect(Core.bessoDaysAgoLabel(30)).toBe('fa 1 mes');
        expect(Core.bessoDaysAgoLabel(365)).toBe('fa 1 any');
    });
});
