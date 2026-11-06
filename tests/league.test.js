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

// ── ROC dels rivals (LLIGA.md §3) ───────────────────────────────────────────
const ROC_MIN = 200, ROC_MAX = 2000;   // rang que el motor juga de debò (ELO_MIN-ELO_MAX)

describe('leagueOpponentOffsets (on se sorteja cada rival)', () => {
    test('nou rivals, de 200 per sota a 200 per sobre cada 50, amb ±10 a l\'atzar', () => {
        expect(Core.LEAGUE_OPPONENT_OFFSETS).toEqual([-200, -150, -100, -50, 0, 50, 100, 150, 200]);
        for (const r of [0, 0.25, 0.5, 0.75, 0.9999]) {
            const offs = Core.leagueOpponentOffsets(() => r);
            expect(offs).toHaveLength(9);
            offs.forEach((o, i) => expect(Math.abs(o - Core.LEAGUE_OPPONENT_OFFSETS[i])).toBeLessThanOrEqual(10));
        }
        expect(Core.leagueOpponentOffsets(() => 0)[0]).toBe(-210);
        expect(Core.leagueOpponentOffsets(() => 0.9999)[8]).toBe(210);
    });

    test('la mitjana és la del jugador (±10) i els rivals no s\'encavalquen mai', () => {
        for (let k = 0; k < 200; k++) {
            const offs = Core.leagueOpponentOffsets();
            const mean = offs.reduce((a, b) => a + b, 0) / offs.length;
            expect(Math.abs(mean)).toBeLessThanOrEqual(10);
            for (let i = 1; i < offs.length; i++) expect(offs[i]).toBeGreaterThan(offs[i - 1]);
        }
    });

    test('cada jornada queda oberta: del 76% contra el més fluix al 24% contra el més fort', () => {
        const expected = d => 1 / (1 + Math.pow(10, d / 400));
        expect(expected(-200)).toBeCloseTo(0.76, 2);
        expect(expected(200)).toBeCloseTo(0.24, 2);
    });
});

describe('leagueOpponentRating (ROC del rival dins del rang del motor)', () => {
    test('al mig del rang: referència + desplaçament', () => {
        expect(Core.leagueOpponentRating(1240, -150, ROC_MIN, ROC_MAX)).toBe(1090);
        expect(Core.leagueOpponentRating(1240, 203, ROC_MIN, ROC_MAX)).toBe(1443);
        expect(Core.leagueOpponentRating(800, 0, ROC_MIN, ROC_MAX)).toBe(800);
    });

    test('a prop del mínim, els rivals més fluixos s\'hi encabeixen en ordre (i els forts no canvien)', () => {
        const out = Core.LEAGUE_OPPONENT_OFFSETS.map(o => Core.leagueOpponentRating(300, o, ROC_MIN, ROC_MAX));
        out.forEach(r => expect(r).toBeGreaterThanOrEqual(ROC_MIN));
        for (let i = 1; i < out.length; i++) expect(out[i]).toBeGreaterThan(out[i - 1]);
        expect(out.slice(4)).toEqual([300, 350, 400, 450, 500]);
    });

    test('a prop del màxim, el mateix pels forts', () => {
        const out = Core.LEAGUE_OPPONENT_OFFSETS.map(o => Core.leagueOpponentRating(1900, o, ROC_MIN, ROC_MAX));
        out.forEach(r => expect(r).toBeLessThanOrEqual(ROC_MAX));
        for (let i = 1; i < out.length; i++) expect(out[i]).toBeGreaterThan(out[i - 1]);
        expect(out.slice(0, 5)).toEqual([1700, 1750, 1800, 1850, 1900]);
    });

    test('mai no surt del rang, ni amb el jugador fora (ELO per sota de 200 o per sobre de 2000)', () => {
        for (const base of [50, 120, 200, 205, 1999, 2000, 2150]) {
            for (const o of [-210, -100, 0, 100, 210]) {
                const r = Core.leagueOpponentRating(base, o, ROC_MIN, ROC_MAX);
                expect(r).toBeGreaterThanOrEqual(ROC_MIN);
                expect(r).toBeLessThanOrEqual(ROC_MAX);
            }
        }
        expect(Core.leagueOpponentRating(50, 200, ROC_MIN, ROC_MAX)).toBe(400);
    });

    test('entrades invàlides no peten', () => {
        expect(Core.leagueOpponentRating(NaN, NaN, ROC_MIN, ROC_MAX)).toBe(ROC_MIN);
        expect(Core.leagueOpponentRating(1000, undefined)).toBe(1000);
    });
});

describe('rebasedLeagueRatings amb desplaçaments desats (lligues noves)', () => {
    const graellaNova = (base, offsets) => [{ id: 'me', name: 'Tu', elo: base }].concat(
        offsets.map((off, i) => ({ id: `bot${i + 1}`, name: `R${i + 1}`, elo: Core.leagueOpponentRating(base, off, ROC_MIN, ROC_MAX), offset: off })));

    test('els rivals es tornen a col·locar sobre la referència nova', () => {
        const players = graellaNova(1200, [-200, 0, 200]);
        const out = Core.rebasedLeagueRatings(players, 1200, 900, ROC_MIN, ROC_MAX);
        expect(out.map(p => p.elo)).toEqual([900, 700, 900, 1100]);
        expect(out[1].offset).toBe(-200);
    });

    test('baixar a prop del mínim no amuntega els rivals a 200 (lliga de bullet d\'un principiant)', () => {
        const players = graellaNova(900, Core.LEAGUE_OPPONENT_OFFSETS);
        const out = Core.rebasedLeagueRatings(players, 900, 260, ROC_MIN, ROC_MAX).filter(p => p.id !== 'me');
        out.forEach(p => expect(p.elo).toBeGreaterThanOrEqual(ROC_MIN));
        expect(new Set(out.map(p => p.elo)).size).toBe(out.length);
    });

    test('anar i tornar deixa la graella com era', () => {
        const players = graellaNova(1300, Core.leagueOpponentOffsets(() => 0.3));
        const back = Core.rebasedLeagueRatings(Core.rebasedLeagueRatings(players, 1300, 300, ROC_MIN, ROC_MAX), 300, 1300, ROC_MIN, ROC_MAX);
        expect(back.map(p => p.elo)).toEqual(players.map(p => p.elo));
    });

    test('el jugador porta la seva puntuació encara que sigui per sota del rang del motor', () => {
        const out = Core.rebasedLeagueRatings(graellaNova(800, [0]), 800, 120, ROC_MIN, ROC_MAX);
        expect(out[0].elo).toBe(120);
        expect(out[1].elo).toBe(ROC_MIN);
    });

    test('lligues velles (sense desplaçament): desplaçament en bloc, ara també amb sostre', () => {
        const out = Core.rebasedLeagueRatings(graella(1900, [25, -25]), 1900, 1990, ROC_MIN, ROC_MAX);
        expect(out.map(p => p.elo)).toEqual([1990, ROC_MAX, 1965]);
    });
});

describe('a l\'app: graella nova i lliga encara no començada', () => {
    const fs = require('fs');
    const vm = require('vm');
    const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
    const fnSource = name => {
        const a = source.indexOf(`function ${name}(`);
        return source.slice(a, source.indexOf('\n}\n', a) + 2);
    };

    test('createNewLeague sorteja els rivals amb leagueOpponentOffsets dins de ELO_MIN-ELO_MAX i en desa el desplaçament', () => {
        const fn = fnSource('createNewLeague');
        expect(fn).toMatch(/ElTaulerCore\.leagueOpponentOffsets\(\)/);
        expect(fn).toMatch(/ElTaulerCore\.leagueOpponentRating\(baseRating, offset, ELO_MIN, ELO_MAX\)/);
        expect(fn).toMatch(/offset: offset/);
        expect(fn).not.toMatch(/randInt\(-25, 25\)/);
    });

    function syncCtx({ base, locked = false, underway = false, saved = 1000 }) {
        const players = [{ id: 'me', elo: saved }, { id: 'bot1', elo: saved + 100, offset: 100 }];
        const ctx = vm.createContext({
            ElTaulerCore: Core, ELO_MIN: 200, ELO_MAX: 2000, saveStorage() { ctx.saves = (ctx.saves || 0) + 1; },
            currentLeague: { id: 'l1', players, baseRating: saved },
            getLeaguePlayer: id => ctx.currentLeague.players.find(p => p.id === id),
            getCurrentUserLeagueRoc: () => base, isLeagueTimeControlLocked: () => locked,
            leagueRoundUnderway: () => underway
        });
        vm.runInContext(fnSource('syncLeagueUserRoc'), ctx);
        ctx.syncLeagueUserRoc();
        return ctx;
    }

    test('sense cap jornada jugada, la graella segueix la puntuació actual', () => {
        const ctx = syncCtx({ base: 1300 });
        expect(ctx.currentLeague.baseRating).toBe(1300);
        expect(ctx.currentLeague.players.map(p => p.elo)).toEqual([1300, 1400]);
        expect(ctx.saves).toBe(1);
    });

    test('començada (o amb una jornada en joc), els rivals queden congelats i només es mou el jugador', () => {
        for (const opts of [{ locked: true }, { underway: true }]) {
            const ctx = syncCtx({ base: 1300, ...opts });
            expect(ctx.currentLeague.baseRating).toBe(1000);
            expect(ctx.currentLeague.players.map(p => p.elo)).toEqual([1300, 1100]);
        }
    });
});

// ── Partides entre rivals (LLIGA.md §4) ─────────────────────────────────────
describe('leagueDrawChance (taules mesurades a Lichess)', () => {
    test('a tots els ritmes i nivells de l\'app, entre l\'1% i el 9% (el model antic en posava un 35%)', () => {
        for (const tc of ['30s', '1+0', '3+2', '5+0', '10+0', '15+10', 'none']) {
            for (let roc = 200; roc <= 2000; roc += 100) {
                const p = Core.leagueDrawChance(tc, roc, 0);
                expect(p).toBeGreaterThanOrEqual(0.008);
                expect(p).toBeLessThanOrEqual(0.09);
            }
        }
    });

    test('el bullet fa menys taules que els ritmes lents, al mateix nivell', () => {
        for (const roc of [600, 1200, 1800]) {
            expect(Core.leagueDrawChance('1+0', roc, 0)).toBeLessThan(Core.leagueDrawChance('3+2', roc, 0));
            expect(Core.leagueDrawChance('3+2', roc, 0)).toBeLessThan(Core.leagueDrawChance('none', roc, 0) + 1e-9);
        }
    });

    test('el nivell és el de la persona a qui s\'assemblen jugant (clockEloForRoc)', () => {
        // ROC 1604 juga com una persona de Lichess de 1025: taxa entre les franges 900 i 1100.
        const r = Core.LEAGUE_DRAW_RATES['3+2'];
        const expected = r[1] + (r[2] - r[1]) * (Core.clockEloForRoc(1604) - 900) / 200;
        expect(Core.leagueDrawChance('3+2', 1604, 0)).toBeCloseTo(expected, 10);
    });

    test('fins a 250 punts de diferència no canvia; després baixa fins a 0,65', () => {
        const p0 = Core.leagueDrawChance('5+0', 1200, 0);
        expect(Core.leagueDrawChance('5+0', 1200, 250)).toBe(p0);
        expect(Core.leagueDrawChance('5+0', 1200, -400)).toBeCloseTo(p0 * 0.79, 10);
        expect(Core.leagueDrawChance('5+0', 1200, 900)).toBeCloseTo(p0 * 0.65, 10);
    });

    test('un ritme desconegut fa servir el de sense rellotge', () => {
        expect(Core.leagueDrawChance('24h', 1200, 0)).toBe(Core.leagueDrawChance('none', 1200, 0));
    });
});

describe('leagueSimulatedResult (partida entre dos rivals)', () => {
    const tally = (a, b, tc, n = 40000) => {
        let seed = 12345;   // mulberry32: atzar reproduïble
        const rnd = () => {
            seed = (seed + 0x6D2B79F5) | 0;
            let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
        const c = { A: 0, B: 0, draw: 0 };
        for (let i = 0; i < n; i++) c[Core.leagueSimulatedResult(a, b, tc, rnd)]++;
        return { score: (c.A + c.draw / 2) / n, draws: c.draw / n };
    };

    test('la puntuació esperada és exactament la d\'Elo (el model antic la decantava cap al 50%)', () => {
        for (const [a, b] of [[1400, 1200], [1000, 1150], [600, 600], [1800, 1380]]) {
            const elo = 1 / (1 + Math.pow(10, (b - a) / 400));
            expect(tally(a, b, '3+2').score).toBeCloseTo(elo, 2);
        }
    });

    test('les taules surten amb la freqüència mesurada', () => {
        expect(tally(1200, 1220, '10+0').draws).toBeCloseTo(Core.leagueDrawChance('10+0', 1210, -20), 2);
        expect(tally(1200, 1220, '1+0').draws).toBeCloseTo(Core.leagueDrawChance('1+0', 1210, -20), 2);
    });

    test('amb l\'atzar als extrems: taules, guanya A, guanya B', () => {
        expect(Core.leagueSimulatedResult(1200, 1200, 'none', () => 0)).toBe('draw');
        expect(Core.leagueSimulatedResult(1200, 1200, 'none', () => 0.3)).toBe('A');
        expect(Core.leagueSimulatedResult(1200, 1200, 'none', () => 0.99)).toBe('B');
    });

    test('a l\'app, els resultats entre rivals surten d\'aquí amb el ritme de la temporada', () => {
        const src = require('fs').readFileSync(require.resolve('../app.js'), 'utf8');
        const a = src.indexOf('function simulateOutcomeByElo(');
        expect(src.slice(a, src.indexOf('\n}\n', a))).toMatch(/ElTaulerCore\.leagueSimulatedResult\(eloA, eloB, getLeagueTimeControlId\(\)\)/);
    });
});
