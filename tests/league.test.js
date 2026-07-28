const Core = require('../core.js');

// Terra de puntuació de la lliga, tal com el passa app.js.
const LEAGUE_MIN = 50;

// Graella tal com la sorteja createNewLeague: el jugador a la referència i els
// rivals repartits a ±25 al seu voltant.
function graella(base, offsets) {
    return [{ id: 'me', name: 'Tu', elo: base }].concat(
        offsets.map((off, i) => ({ id: `bot${i + 1}`, name: `Rival${i + 1}`, elo: base + off }))
    );
}

describe('leagueBaseRating (referència de la lliga segons el rellotge)', () => {
    test("amb ELO propi del ritme, mana l'ELO del ritme", () => {
        expect(Core.leagueBaseRating(1240, 800, LEAGUE_MIN)).toBe(1240);
    });

    test("el ritme mana encara que sigui MÉS BAIX que l'ELO principal", () => {
        // És el cas normal al bullet: s'hi juga pitjor que sense rellotge, i la
        // lliga d'aquell ritme ha de ser més fluixa, no més forta.
        expect(Core.leagueBaseRating(620, 900, LEAGUE_MIN)).toBe(620);
    });

    test("sense ELO de ritme (lliga sense rellotge) cau a l'ELO principal", () => {
        expect(Core.leagueBaseRating(null, 800, LEAGUE_MIN)).toBe(800);
        expect(Core.leagueBaseRating(undefined, 800, LEAGUE_MIN)).toBe(800);
    });

    test('arrodoneix i respecta el terra', () => {
        expect(Core.leagueBaseRating(1240.6, 800, LEAGUE_MIN)).toBe(1241);
        expect(Core.leagueBaseRating(10, 800, LEAGUE_MIN)).toBe(LEAGUE_MIN);
        expect(Core.leagueBaseRating(null, -100, LEAGUE_MIN)).toBe(LEAGUE_MIN);
    });

    test('entrades no numèriques no peten i cauen al terra', () => {
        expect(Core.leagueBaseRating(NaN, NaN, LEAGUE_MIN)).toBe(LEAGUE_MIN);
        expect(Core.leagueBaseRating('1200', 800, LEAGUE_MIN)).toBe(800);
    });
});

describe('rebasedLeagueRatings (canvi de rellotge abans de començar)', () => {
    test('el jugador passa a la referència nova i els rivals s\'hi desplacen en bloc', () => {
        const players = graella(800, [25, -10, 0]);
        const out = Core.rebasedLeagueRatings(players, 800, 1240, LEAGUE_MIN);
        expect(out.map(p => p.elo)).toEqual([1240, 1265, 1230, 1240]);
    });

    test('es conserven les diferències amb què es va sortejar la lliga', () => {
        const players = graella(900, [25, -25, 12]);
        const out = Core.rebasedLeagueRatings(players, 900, 620, LEAGUE_MIN);
        const me = out.find(p => p.id === 'me');
        out.filter(p => p.id !== 'me').forEach((p, i) => {
            expect(p.elo - me.elo).toBe(players[i + 1].elo - 900);
        });
    });

    test('no toca res més que la puntuació (punts i partides es mantenen)', () => {
        const players = [{ id: 'me', name: 'Tu', elo: 800, pj: 0, pg: 0, pts: 0 }];
        const out = Core.rebasedLeagueRatings(players, 800, 1000, LEAGUE_MIN);
        expect(out[0]).toEqual({ id: 'me', name: 'Tu', elo: 1000, pj: 0, pg: 0, pts: 0 });
        // No muta l'original: app.js en substitueix la llista sencera.
        expect(players[0].elo).toBe(800);
    });

    test('cap rival no baixa del terra encara que la referència nova sigui molt baixa', () => {
        const players = graella(800, [-25, 25]);
        const out = Core.rebasedLeagueRatings(players, 800, LEAGUE_MIN, LEAGUE_MIN);
        out.forEach(p => expect(p.elo).toBeGreaterThanOrEqual(LEAGUE_MIN));
    });

    test('sense referència antiga coneguda (lliga desada abans del canvi) no desplaça els rivals', () => {
        const players = graella(800, [25, -10]);
        const out = Core.rebasedLeagueRatings(players, undefined, 1000, LEAGUE_MIN);
        expect(out.map(p => p.elo)).toEqual([1000, 825, 790]);
    });

    test('entrades buides o invàlides tornen la llista sense petar', () => {
        expect(Core.rebasedLeagueRatings(null, 800, 1000, LEAGUE_MIN)).toEqual([]);
        const players = graella(800, [25]);
        expect(Core.rebasedLeagueRatings(players, 800, NaN, LEAGUE_MIN)).toEqual(players);
    });
});

describe('lliga i ritme: el recorregut sencer', () => {
    test('una lliga a 3+2 es genera al nivell de 3+2, no al principal', () => {
        const mainElo = 800;
        const blitzElo = 1240;
        const base = Core.leagueBaseRating(blitzElo, mainElo, LEAGUE_MIN);
        const players = graella(base, [25, -25]);
        expect(base).toBe(blitzElo);
        players.forEach(p => {
            expect(Math.abs(p.elo - blitzElo)).toBeLessThanOrEqual(25);
        });
    });

    test('canviar el rellotge de la lliga la mou al nivell del ritme nou', () => {
        const mainElo = 800;
        // Es crea sense rellotge (referència: ELO principal)...
        const base1 = Core.leagueBaseRating(null, mainElo, LEAGUE_MIN);
        const players = graella(base1, [25, -25]);
        // ...i abans de començar es tria bullet 1+0, on el jugador és més fluix.
        const base2 = Core.leagueBaseRating(560, mainElo, LEAGUE_MIN);
        const out = Core.rebasedLeagueRatings(players, base1, base2, LEAGUE_MIN);
        expect(out.map(p => p.elo)).toEqual([560, 585, 535]);
    });
});
