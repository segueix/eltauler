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

// ── Jornada → partida de l'historial ───────────────────────────────────────
// La classificació enllaça cada jornada amb la seva partida guardada. Les
// jornades noves duen l'id desat; les velles s'han de reconèixer pel rival.

const LLIGA = 1_700_000_000_000;   // creació de la temporada (ms)

function jornada(round, oppName, extra) {
    return Object.assign({ round: round, oppName: oppName, outcome: 'win' }, extra || {});
}

// Partida tal com la desa recordGameHistory: id, mode i rival amb nom.
function partida(id, oppName, minutsDespres, extra) {
    return Object.assign({
        id: id,
        mode: 'league',
        date: new Date(LLIGA + minutsDespres * 60000).toISOString(),
        opponent: { id: 'bot', name: oppName, elo: 900 }
    }, extra || {});
}

describe('leagueRoundGameLinks (quina partida és cada jornada)', () => {
    test('la jornada que ja duu l\'id apunta a aquella partida', () => {
        const games = [partida('game_1', 'RocaNegra', 10)];
        const links = Core.leagueRoundGameLinks([jornada(1, 'RocaNegra', { gameId: 'game_1' })], games, { createdAt: LLIGA });
        expect(links).toEqual({ 1: 'game_1' });
    });

    test('les jornades velles (sense id) es reconeixen pel nom del rival', () => {
        const games = [
            partida('game_1', 'RocaNegra', 10),
            partida('game_2', 'AlfilFosc', 40),
            partida('game_3', 'CavallViu', 90)
        ];
        const rounds = [jornada(1, 'RocaNegra'), jornada(2, 'AlfilFosc'), jornada(3, 'CavallViu')];
        expect(Core.leagueRoundGameLinks(rounds, games, { createdAt: LLIGA }))
            .toEqual({ 1: 'game_1', 2: 'game_2', 3: 'game_3' });
    });

    test('l\'ordre de les jornades no depèn de com arribin', () => {
        const games = [partida('game_1', 'RocaNegra', 10), partida('game_2', 'AlfilFosc', 40)];
        const rounds = [jornada(2, 'AlfilFosc'), jornada(1, 'RocaNegra')];
        expect(Core.leagueRoundGameLinks(rounds, games, { createdAt: LLIGA }))
            .toEqual({ 1: 'game_1', 2: 'game_2' });
    });

    test('cap partida no serveix per a dues jornades', () => {
        const games = [partida('game_1', 'RocaNegra', 10)];
        const rounds = [jornada(1, 'RocaNegra'), jornada(2, 'RocaNegra')];
        const links = Core.leagueRoundGameLinks(rounds, games, { createdAt: LLIGA });
        expect(links).toEqual({ 1: 'game_1' });   // la 2 es queda sense
    });

    test('una partida d\'una lliga anterior no es cola a la d\'ara', () => {
        const vella = partida('game_vella', 'RocaNegra', -600);   // 10 h abans
        const links = Core.leagueRoundGameLinks([jornada(1, 'RocaNegra')], [vella], { createdAt: LLIGA });
        expect(links).toEqual({});
    });

    test('sense data de creació coneguda, es mira tot l\'historial', () => {
        const vella = partida('game_vella', 'RocaNegra', -600);
        expect(Core.leagueRoundGameLinks([jornada(1, 'RocaNegra')], [vella], {}))
            .toEqual({ 1: 'game_vella' });
    });

    test('les partides que no són de lliga no s\'hi enllacen mai', () => {
        const lliure = partida('game_lliure', 'RocaNegra', 10, { mode: 'free' });
        const importada = partida('game_pgn', 'RocaNegra', 20, { imported: true });
        expect(Core.leagueRoundGameLinks([jornada(1, 'RocaNegra')], [lliure, importada], { createdAt: LLIGA }))
            .toEqual({});
    });

    test('una jornada abandonada (sense partida desada) no rep cap enllaç', () => {
        const games = [partida('game_2', 'AlfilFosc', 40)];
        const rounds = [jornada(1, 'RocaNegra'), jornada(2, 'AlfilFosc')];
        expect(Core.leagueRoundGameLinks(rounds, games, { createdAt: LLIGA }))
            .toEqual({ 2: 'game_2' });
    });

    test('un id desat que ja no és a l\'historial no deixa un enllaç mort', () => {
        // La partida s'ha esborrat: no hi ha res a obrir, i tampoc no es pot
        // agafar la del rival següent per fer-hi bondat.
        const games = [partida('game_2', 'AlfilFosc', 40)];
        const rounds = [jornada(1, 'RocaNegra', { gameId: 'game_esborrada' }), jornada(2, 'AlfilFosc')];
        expect(Core.leagueRoundGameLinks(rounds, games, { createdAt: LLIGA }))
            .toEqual({ 2: 'game_2' });
    });

    test('l\'id desat mana sobre el nom, i no roba la partida a ningú', () => {
        // La jornada 2 duu l'id de la partida tardana; la 1, que va pel nom,
        // s'ha de quedar l'altra encara que totes dues siguin del mateix rival.
        const games = [partida('game_1', 'RocaNegra', 10), partida('game_2', 'RocaNegra', 80)];
        const rounds = [jornada(1, 'RocaNegra'), jornada(2, 'RocaNegra', { gameId: 'game_2' })];
        expect(Core.leagueRoundGameLinks(rounds, games, { createdAt: LLIGA }))
            .toEqual({ 1: 'game_1', 2: 'game_2' });
    });

    test('el nom es compara sense diferències de majúscules ni espais', () => {
        const games = [partida('game_1', ' rocanegra ', 10)];
        expect(Core.leagueRoundGameLinks([jornada(1, 'RocaNegra')], games, { createdAt: LLIGA }))
            .toEqual({ 1: 'game_1' });
    });

    test('entrades buides o invàlides no peten', () => {
        expect(Core.leagueRoundGameLinks(null, null, null)).toEqual({});
        expect(Core.leagueRoundGameLinks([], [], {})).toEqual({});
        expect(Core.leagueRoundGameLinks([{ oppName: 'X' }], [partida('g', 'X', 5)], {})).toEqual({});
        expect(Core.leagueRoundGameLinks([jornada(1, '')], [partida('g', '', 5)], {})).toEqual({});
    });
});
