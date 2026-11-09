// Temporada de lliga (LLIGA.md §5-8): colors alternats, classificació amb
// desempats, rendiment, divisions, personalitat dels rivals i partides
// consecutives a les lligues de 30s i 1+0.
const Core = require('../core');
const TV = require('../stockfishtv');
const { Chess } = require('chess.js');
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const fnSource = name => {
    const a = source.indexOf(`function ${name}(`);
    if (a < 0) throw new Error(`no hi ha ${name}`);
    return source.slice(a, source.indexOf('\n}\n', a) + 2);
};
// La llista curada d'obertures de l'app, tal com és.
const CURATED = (() => {
    const a = source.indexOf('const CURATED_OPENINGS = [');
    const b = source.indexOf('\n];\n', a);
    return vm.runInNewContext(source.slice(a + 'const CURATED_OPENINGS = '.length, b + 2));
})();

describe('colors alternats (leaguePlayerColors)', () => {
    test('5 i 4, alternant, amb el primer a l\'atzar', () => {
        expect(Core.leaguePlayerColors(() => 0.1)).toEqual(['w', 'b', 'w', 'b', 'w', 'b', 'w', 'b', 'w']);
        expect(Core.leaguePlayerColors(() => 0.9)).toEqual(['b', 'w', 'b', 'w', 'b', 'w', 'b', 'w', 'b']);
        for (let k = 0; k < 50; k++) {
            const c = Core.leaguePlayerColors();
            const w = c.filter(x => x === 'w').length;
            expect([4, 5]).toContain(w);
            for (let i = 1; i < c.length; i++) expect(c[i]).not.toBe(c[i - 1]);
        }
    });

    test('a l\'app, la jornada fixa el color del jugador (abans, a l\'atzar a cada partida)', () => {
        expect(fnSource('startLeagueRound')).toMatch(/playerColor: getLeagueRoundColor\(currentLeague\.currentRound\)/);
        expect(source).toMatch(/else if \(leagueActiveMatch && \(leagueActiveMatch\.playerColor === 'w' \|\| leagueActiveMatch\.playerColor === 'b'\)\) \{\s*\/\/[^\n]*\n\s*playerColor = leagueActiveMatch\.playerColor;/);
    });
});

describe('classificació amb desempats (leagueStandings)', () => {
    const P = (id, pts, pg, elo) => ({ id, name: id, pts, pg, elo });
    const R = (a, b, s, round = 1) => ({ round, a, b, s });

    test('primer els punts', () => {
        const out = Core.leagueStandings([P('a', 1, 1, 1000), P('b', 3, 3, 900)], []);
        expect(out.map(p => p.id)).toEqual(['b', 'a']);
    });

    test('empatats a punts: mana l\'enfrontament directe, encara que l\'altre tingui més victòries', () => {
        const players = [P('a', 2, 2, 1000), P('b', 2, 1, 1000), P('c', 0, 0, 1000)];
        const results = [R('b', 'a', 1), R('a', 'c', 1), R('b', 'c', 0.5)];
        expect(Core.leagueStandings(players, results).map(p => p.id).slice(0, 2)).toEqual(['b', 'a']);
    });

    test('sense haver-se enfrontat tots, l\'enfrontament directe no compta i passen les victòries', () => {
        const players = [P('a', 1, 0, 1000), P('b', 1, 1, 900)];
        const results = [R('a', 'x', 0.5), R('a', 'y', 0.5), R('b', 'x', 1)];
        expect(Core.leagueStandings(players, results).map(p => p.id)).toEqual(['b', 'a']);
    });

    test('mateixos punts i victòries: Sonneborn-Berger (qui ha guanyat rivals més forts)', () => {
        const players = [P('a', 1, 1, 1000), P('b', 1, 1, 1000), P('strong', 2, 2, 1000), P('weak', 0, 0, 1000)];
        const results = [R('a', 'weak', 1), R('b', 'strong', 1), R('strong', 'weak', 1), R('strong', 'x', 1)];
        const out = Core.leagueStandings(players, results);
        expect(out.find(p => p.id === 'b').tb.sb).toBe(2);
        expect(out.find(p => p.id === 'a').tb.sb).toBe(0);
        expect(out.findIndex(p => p.id === 'b')).toBeLessThan(out.findIndex(p => p.id === 'a'));
    });

    test('lligues velles sense resultats: punts, victòries i ROC, com abans', () => {
        const out = Core.leagueStandings([P('a', 2, 1, 1200), P('b', 2, 2, 1000), P('c', 2, 1, 1300)], undefined);
        expect(out.map(p => p.id)).toEqual(['b', 'c', 'a']);
    });

    test('no muta els jugadors i hi afegeix tb', () => {
        const players = [P('a', 1, 1, 1000)];
        const out = Core.leagueStandings(players, []);
        expect(players[0].tb).toBeUndefined();
        expect(out[0].tb).toEqual({ sb: 0, h2h: 0 });
    });

    test('a l\'app, la taula, el rang i el «si guanyes» fan servir els resultats de la temporada', () => {
        expect(fnSource('leagueSort')).toMatch(/ElTaulerCore\.leagueStandings\(players, results\.concat\(extraResults\)\)/);
        expect(fnSource('simulateRankAfterWin')).toMatch(/a: 'me', b: opponentId, s: 1/);
    });
});

describe('rendiment (leaguePerformanceRating)', () => {
    const expected = (r, opps) => opps.reduce((s, o) => s + 1 / (1 + Math.pow(10, (o - r) / 400)), 0);

    test('és l\'ELO amb què l\'esperança contra aquests rivals és la puntuació feta', () => {
        const opps = [1000, 1100, 1200, 1300, 1400];
        for (const score of [1, 2.5, 4]) {
            const r = Core.leaguePerformanceRating(opps, score);
            expect(expected(r, opps)).toBeCloseTo(score, 1);
        }
        expect(Core.leaguePerformanceRating([1200, 1200], 1)).toBe(1200);
    });

    test('creix amb la puntuació; amb el 0% o el 100% compta mig punt', () => {
        const opps = [1100, 1200, 1300];
        const vals = [0, 0.5, 1, 2, 2.5, 3].map(s => Core.leaguePerformanceRating(opps, s));
        for (let i = 1; i < vals.length; i++) expect(vals[i]).toBeGreaterThanOrEqual(vals[i - 1]);
        expect(vals[0]).toBe(vals[1]);
        expect(vals[5]).toBe(vals[4]);
        expect(Number.isFinite(vals[5])).toBe(true);
    });

    test('sense partides, null', () => {
        expect(Core.leaguePerformanceRating([], 0)).toBe(null);
        expect(Core.leaguePerformanceRating([1200], NaN)).toBe(null);
    });
});

describe('escala de nivells (LLIGA.md §6)', () => {
    test('set nivells, del municipal al mundial, cada un 40 punts més fort; es comença al municipal', () => {
        expect(Core.LEAGUE_LEVELS.map(l => l.id)).toEqual(['municipal', 'comarcal', 'provincial', 'territorial', 'ppcc', 'europa', 'mundial']);
        expect(Core.LEAGUE_LEVELS.map(l => l.shift)).toEqual([-120, -80, -40, 0, 40, 80, 120]);
        expect(Core.LEAGUE_START_LEVEL).toBe(0);
        expect(Core.leagueLevel().level).toBe(0);
        expect(Core.leagueLevel(9).level).toBe(6);
        expect(Core.leagueLevel(-3).level).toBe(0);
    });

    test('dos o tres grups per ELO a cada nivell, ordenats i sense forats', () => {
        Core.LEAGUE_LEVELS.forEach((L, i) => {
            const g = Core.leagueLevelGroups(i);
            expect([2, 3]).toContain(g.length);
            expect(g[g.length - 1].id).toBe('A');
            expect(g[0].min).toBe(null);
            expect(g[g.length - 1].max).toBe(null);
            for (let k = 1; k < g.length; k++) expect(g[k].min).toBe(g[k - 1].max + 1);
        });
        // Els llindars pugen amb el nivell: al mundial, el grup B ja és fort.
        expect(Core.leagueLevelGroups(0).map(Core.leagueGroupRangeText)).toEqual(['fins a 599', '600–899', '900 o més']);
        expect(Core.leagueLevelGroups(6).map(Core.leagueGroupRangeText)).toEqual(['fins a 1499', '1500 o més']);
    });

    test('el grup surt de l\'ELO mitjà de la graella', () => {
        expect(['C', 'B', 'B', 'A'].map((id, k) => Core.leagueLevelGroup(0, [599, 600, 899, 900][k]).id)).toEqual(['C', 'B', 'B', 'A']);
        expect(Core.leagueLevelGroup(4, 1199).id).toBe('B');
        expect(Core.leagueLevelGroup(4, 1200).id).toBe('A');
        expect(Core.leagueLevelGroup(6, 100).id).toBe('B');
    });

    test('el podi puja, els tres últims baixen, la resta es queda; no se surt de l\'escala', () => {
        expect([1, 2, 3].map(r => Core.leagueNextLevel(2, r))).toEqual([3, 3, 3]);
        expect([4, 5, 6, 7].map(r => Core.leagueNextLevel(2, r))).toEqual([2, 2, 2, 2]);
        expect([8, 9, 10].map(r => Core.leagueNextLevel(2, r))).toEqual([1, 1, 1]);
        expect(Core.leagueNextLevel(6, 1)).toBe(6);
        expect(Core.leagueNextLevel(0, 10)).toBe(0);
    });

    test('noms de les lligues segons on juga el jugador', () => {
        const vic = { territory: 'cat', municipi: 'Vic', comarca: 'Osona', provincia: 'Barcelona' };
        expect([0, 1, 2, 3, 4, 5, 6].map(l => Core.leagueLevelName(l, vic))).toEqual([
            'Lliga de Vic', "Lliga Comarcal d'Osona", 'Lliga Provincial de Barcelona', 'Lliga Catalana',
            'Lliga dels Països Catalans', 'Lliga Europea', 'Lliga Mundial']);
        const gandia = { territory: 'val', municipi: 'Gandia', comarca: 'la Safor', provincia: 'València' };
        expect(Core.leagueLevelName(1, gandia)).toBe('Lliga Comarcal de la Safor');
        expect(Core.leagueLevelName(3, gandia)).toBe('Lliga Valenciana');
        expect(Core.leagueLevelShort(3, gandia)).toBe('Valenciana');
        expect(Core.leagueLevelName(3, { territory: 'fora', municipi: 'Lió', pais: 'França' })).toBe('Lliga Nacional de França');
        // Sense localitat, els genèrics.
        expect([0, 1, 2, 3].map(l => Core.leagueLevelName(l))).toEqual(['Lliga Local', 'Lliga Comarcal', 'Lliga Provincial', 'Lliga Catalana']);
        expect(Core.leagueFullName(1, 'B', vic)).toBe("Lliga Comarcal d'Osona · Grup B");
    });

    test('contraccions de «de»', () => {
        expect(['el Bages', 'els Ports', 'la Selva', "l'Anoia", 'les Garrigues', 'Osona', 'Igualada', 'Hostalric', 'Barcelona', 'Iàtova']
            .map(Core.catalanDe)).toEqual(['del Bages', 'dels Ports', 'de la Selva', "de l'Anoia", 'de les Garrigues',
            "d'Osona", "d'Igualada", "d'Hostalric", 'de Barcelona', 'de Iàtova']);
        expect(Core.catalanDe('')).toBe('');
    });

    test('el nivell desplaça la graella: els rivals giren al voltant de la referència + desplaçament', () => {
        const players = [{ id: 'me', elo: 1200 }, { id: 'b1', elo: 1200, offset: 0 }, { id: 'b2', elo: 1400, offset: 200 }];
        const out = Core.rebasedLeagueRatings(players, 1200, 1000, 200, 2000, 40);
        expect(out.map(p => p.elo)).toEqual([1000, 1040, 1240]);
        expect(fnSource('createNewLeague')).toMatch(/leagueOpponentRating\(baseRating \+ level\.shift, offset, ELO_MIN, ELO_MAX\)/);
    });

    test('les divisions de l\'antic sistema es continuen llegint', () => {
        expect(Core.LEAGUE_DIVISIONS.map(d => d.shift)).toEqual([-100, -50, 0, 50, 100]);
        expect(Core.leagueDivision(3).name).toBe('Primera Divisió');
    });
});

describe('temporada sencera a l\'app (applyLeagueAfterGame + finalizeLeagueSeason)', () => {
    function seasonCtx(myOutcome, { level = 2, legacy = false, career = null } = {}) {
        const store = career ? { chess_leagueCareer: JSON.stringify(career) } : {};
        const ids = ['me'].concat([1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => 'bot' + i));
        const players = ids.map((id, i) => ({ id, name: id, elo: 1000 + i * 10, pj: 0, pg: 0, pp: 0, pe: 0, pts: 0 }));
        const ctx = vm.createContext({
            ElTaulerCore: Core, Date, JSON, Math, Array, Number, Object, Set,
            localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
            saveStorage() {}, getLeagueTimeControlId: () => '1+0',
            simulateOutcomeByElo: (a, b) => Core.leagueSimulatedResult(a, b, '1+0'),
            leagueRoundAwaitingGame: null, LEAGUE_CAREER_KEY: 'chess_leagueCareer', LEAGUE_CAREER_MAX_SEASONS: 30,
            currentLeague: null, leagueActiveMatch: null
        });
        ['getLeaguePlayer', 'applyResult', 'leagueSort', 'getLeaguePerformance', 'loadLeagueCareer', 'saveLeagueCareer',
            'finalizeLeagueSeason', 'applyLeagueAfterGame', 'getMyOpponentForRound', 'buildRoundRobinSchedule']
            .forEach(n => vm.runInContext(fnSource(n), ctx));
        ctx.currentLeague = { id: 'L', name: 'Lliga de prova', players, schedule: ctx.buildRoundRobinSchedule(ids),
            currentRound: 1, completed: false, history: [], results: [],
            ...(legacy ? { division: 2, divisionShift: 0 } : { ladder: { level, group: 'B' }, divisionShift: Core.leagueLevel(level).shift }),
            colors: Core.leaguePlayerColors(() => 0.1) };
        for (let round = 1; round <= 9; round++) {
            const opp = ctx.getMyOpponentForRound(round - 1);
            ctx.leagueActiveMatch = { leagueId: 'L', round, opponentId: opp, opponentRoc: 1050, playerColor: ctx.currentLeague.colors[round - 1] };
            ctx.applyLeagueAfterGame(myOutcome);
        }
        return { ctx, store };
    }

    test('es desen els 45 resultats (5 per jornada) i el color de les partides del jugador', () => {
        const { ctx } = seasonCtx('win');
        const res = ctx.currentLeague.results;
        expect(res).toHaveLength(45);
        for (let r = 1; r <= 9; r++) expect(res.filter(x => x.round === r)).toHaveLength(5);
        const mine = res.filter(x => x.a === 'me');
        expect(mine.map(x => x.color)).toEqual(ctx.currentLeague.colors);
        // Cada parella s'enfronta exactament una vegada.
        const pairs = new Set(res.map(x => [x.a, x.b].sort().join('|')));
        expect(pairs.size).toBe(45);
    });

    test('guanyant-ho tot: campió, puja de nivell i queda al palmarès', () => {
        const { ctx, store } = seasonCtx('win');
        expect(ctx.currentLeague.completed).toBe(true);
        expect(ctx.currentLeague.final).toMatchObject({ rank: 1, pts: 9, level: 2, group: 'B', nextLevel: 3, movement: 'up' });
        const career = JSON.parse(store.chess_leagueCareer);
        expect(career.level).toBe(3);
        expect(career.bestLevel).toBe(3);
        expect(career.seasons).toHaveLength(1);
        expect(career.seasons[0]).toMatchObject({ name: 'Lliga de prova', rank: 1, timeControl: '1+0', level: 2, group: 'B', nextLevel: 3 });
    });

    test('perdent-ho tot: últim i baixa de nivell; al municipal no es baixa', () => {
        const { ctx } = seasonCtx('loss');
        expect(ctx.currentLeague.final).toMatchObject({ rank: 10, pts: 0, movement: 'down', nextLevel: 1 });
        const muni = seasonCtx('loss', { level: 0 }).ctx;
        expect(muni.currentLeague.final).toMatchObject({ rank: 10, level: 0, nextLevel: 0, movement: 'stay' });
    });

    test('el millor nivell no baixa en baixar', () => {
        const { store } = seasonCtx('loss', { level: 4, career: { level: 4, bestLevel: 5, seasons: [] } });
        const career = JSON.parse(store.chess_leagueCareer);
        expect(career.level).toBe(3);
        expect(career.bestLevel).toBe(5);
    });

    test('una lliga de l\'antic sistema es tanca amb la divisió i l\'escalada comença al municipal', () => {
        const { ctx, store } = seasonCtx('win', { legacy: true });
        expect(ctx.currentLeague.final).toMatchObject({ rank: 1, division: 2, nextLevel: 0, movement: 'start' });
        const career = JSON.parse(store.chess_leagueCareer);
        expect(career.level).toBe(0);
        expect(career.seasons[0]).toMatchObject({ division: 2 });
        expect(career.seasons[0].level).toBeUndefined();
    });

    test('el nivell nou es fa servir en crear la temporada següent', () => {
        const fn = fnSource('createNewLeague');
        expect(fn).toMatch(/const level = ElTaulerCore\.leagueLevel\(career\.level\);/);
        expect(fn).toMatch(/const group = ElTaulerCore\.leagueLevelGroup\(level\.level, baseRating \+ level\.shift\);/);
        expect(fn).toMatch(/ladder: \{ level: level\.level, group: group\.id \}/);
    });
});

describe('les partides de lliga puntuen', () => {
    const hgo = fnSource('handleGameOver');
    test('contra el ROC del rival: al ritme de la temporada amb rellotge, al principal sense', () => {
        expect(hgo).toMatch(/const isLeagueRatedGame = isLeagueMode && wasLeagueMatch && !blunderMode && !calibrationGameWasActive;/);
        expect(hgo).toMatch(/change = applyTimeControlEloDelta\(currentGameTimeControlId, resultScore, leagueOppRoc\);/);
        expect(hgo).toMatch(/change = ElTaulerCore\.ratedEloDelta\(userELO, leagueOppRoc, resultScore\);/);
    });
    test('i no es compten dues vegades (el bloc general continua excloent la lliga)', () => {
        expect(hgo).toMatch(/if \(!isTimedRatedGame && !calibrationGameWasActive && !isLeagueMode && !shouldContinuousAdjust/);
    });
});

describe('personalitat dels rivals', () => {
    test('estils de la TV, cap més de tres vegades', () => {
        for (let k = 0; k < 30; k++) {
            const styles = Core.leagueBotStyles(9);
            expect(styles).toHaveLength(9);
            styles.forEach(s => expect(TV.TV_STYLES[s]).toBeDefined());
            Core.LEAGUE_STYLE_IDS.forEach(id => expect(styles.filter(s => s === id).length).toBeLessThanOrEqual(3));
        }
    });

    test('repertori de la llista curada: una obertura amb blanques i defenses contra 1.e4 i 1.d4', () => {
        for (let k = 0; k < 30; k++) {
            const rep = Core.leagueBotRepertoire(CURATED);
            expect(CURATED[rep.white].cat).toBe('white');
            expect(CURATED[rep.blackE4].cat).toBe('black');
            expect(CURATED[rep.blackE4].moves[0]).toBe('e4');
            expect(CURATED[rep.blackD4].moves[0]).toBe('d4');
        }
        expect(Core.leagueBotRepertoire([])).toEqual({ white: null, blackE4: null, blackD4: null });
    });

    test('totes les línies de la llista són legals (el llibre no pot proposar cap jugada impossible)', () => {
        CURATED.forEach(o => {
            const c = new Chess();
            o.moves.forEach(m => expect(c.move(m, { sloppy: true })).not.toBe(null));
        });
    });

    test('llibre: segueix la línia mentre la partida la segueix, li toca i se la sap', () => {
        const italiana = { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6'] };
        expect(Core.leagueBookMove([italiana], [], 'w', 8).san).toBe('e4');
        expect(Core.leagueBookMove([italiana], ['e4', 'e5'], 'w', 8).san).toBe('Nf3');
        expect(Core.leagueBookMove([italiana], ['e4', 'c5'], 'w', 8)).toBe(null);          // s'ha sortit
        expect(Core.leagueBookMove([italiana], ['e4'], 'w', 8)).toBe(null);                // no li toca
        expect(Core.leagueBookMove([italiana], ['e4', 'e5', 'Nf3', 'Nc6'], 'w', 2)).toBe(null); // no se la sap
        const bogo = { moves: ['d4', 'Nf6', 'c4', 'e6', 'Nf3', 'Bb4+', 'Bd2'] };
        expect(Core.leagueBookMove([bogo], ['d4', 'Nf6', 'c4', 'e6', 'Nf3'], 'b', 8).san).toBe('Bb4+');
        expect(Core.leagueBookMove([bogo], ['d4', 'Nf6', 'c4', 'e6', 'Nf3', 'Bb4+'], 'w', 8).san).toBe('Bd2');
    });

    test('amb negres tria la defensa segons la primera jugada del jugador', () => {
        const fr = { moves: ['e4', 'e6', 'd4', 'd5'] }, sl = { moves: ['d4', 'd5', 'c4', 'c6'] };
        expect(Core.leagueBookMove([fr, sl], ['e4'], 'b', 8).san).toBe('e6');
        expect(Core.leagueBookMove([fr, sl], ['d4'], 'b', 8).san).toBe('d5');
        expect(Core.leagueBookMove([fr, sl], ['c4'], 'b', 8)).toBe(null);
    });

    test('com més ROC, més jugades de llibre', () => {
        expect(Core.leagueBookDepth(500)).toBe(3);
        expect(Core.leagueBookDepth(1000)).toBe(5);
        expect(Core.leagueBookDepth(1700)).toBe(8);
    });

    test('estil: només desempata dins de la finestra, i amb un mat a la vista no toca res', () => {
        const cands = [{ move: 'a', score: 30 }, { move: 'b', score: 25 }, { move: 'c', score: 10 }, { move: 'd', score: 40 }];
        const pref = { a: 0, b: 5, c: 9, d: 1 };
        // c fa més punts d'estil, però és a 20 cp de la triada: fora.
        expect(Core.leagueStyledChoice(cands, 'a', m => pref[m], 12)).toBe('b');
        expect(Core.leagueStyledChoice(cands, 'a', () => 0, 12)).toBe('a');
        expect(Core.leagueStyledChoice(cands.concat([{ move: 'm', score: 10000 }]), 'a', m => pref[m] || 0, 12)).toBe('a');
        expect(Core.leagueStyledChoice(cands, 'zz', m => pref[m], 12)).toBe('zz');
        expect(Core.LEAGUE_STYLE_WINDOW_CP).toBe(12);
    });

    test('la jugada canviada per l\'estil mai no és a més de la finestra de la triada', () => {
        for (let k = 0; k < 200; k++) {
            const cands = Array.from({ length: 12 }, (_, i) => ({ move: 'm' + i, score: Math.round(Math.random() * 200 - 100) }));
            const chosen = cands[Math.floor(Math.random() * cands.length)];
            const out = Core.leagueStyledChoice(cands, chosen.move, () => Math.random());
            const picked = cands.find(c => c.move === out);
            expect(Math.abs(picked.score - chosen.score)).toBeLessThanOrEqual(Core.LEAGUE_STYLE_WINDOW_CP);
        }
    });

    test('a l\'app: llibre abans de cercar i estil després de triar (mai sobre l\'errada per pressió)', () => {
        expect(fnSource('makeEngineMove')).toMatch(/if \(currentGameMode === 'league' && leagueActiveMatch && tryLeagueBookMove\(\)\) return;/);
        const a = source.indexOf("if (msg.indexOf('bestmove') !== -1 && isEngineThinking && !engineMoveApplyPending)");
        expect(source.slice(a, a + 3200)).toMatch(/if \(currentGameMode === 'league' && !slipArmed\) moveStr = leagueStyledMove\(moveStr\);/);
    });

    test('tryLeagueBookMove juga la primera jugada de l\'obertura del rival amb blanques', () => {
        const scheduled = [];
        const opp = { id: 'bot1', repertoire: { white: 'Obertura Italiana (Giuoco Piano)', blackE4: null, blackD4: null } };
        const ctx = vm.createContext({
            ElTaulerCore: Core, Chess, game: new Chess(), playerColor: 'b', currentGameMode: 'league',
            leagueActiveMatch: { opponentId: 'bot1' }, getLeaguePlayer: () => opp, getActiveStrengthElo: () => 1500,
            $: () => ({ text() {} }), nowMs: () => 0, engineReplyStartTs: null, resetEngineMoveCandidates() {},
            engineMoveSearchTrace: [], clearEngineMoveTimers() {}, computeHumanReplyDelayMs: () => 700,
            scheduleEngineMoveApply: (...args) => scheduled.push(args), isEngineThinking: false
        });
        vm.runInContext('const CURATED_OPENINGS = ' + JSON.stringify(CURATED) + ';', ctx);
        ['getLeagueMatchOpponent', 'leagueRepertoireLines', 'curatedOpeningByName', 'tryLeagueBookMove']
            .forEach(n => vm.runInContext(fnSource(n), ctx));
        expect(ctx.tryLeagueBookMove()).toBe(true);
        expect(scheduled).toEqual([['e2', 'e4', 'q', 700]]);
        expect(ctx.isEngineThinking).toBe(true);
        // Fora de llibre (el rival no té obertura amb aquest color): no fa res.
        ctx.playerColor = 'w';
        expect(ctx.tryLeagueBookMove()).toBe(false);
    });
});

describe('partides consecutives a les lligues de 30s i 1+0', () => {
    test('només a 30s i 1+0, amb 30 segons entre partida i partida', () => {
        expect(Core.leagueAutoChains('30s')).toBe(true);
        expect(Core.leagueAutoChains('1+0')).toBe(true);
        ['3+2', '5+0', '10+0', '15+10', 'none', undefined].forEach(tc => expect(Core.leagueAutoChains(tc)).toBe(false));
        expect(Core.LEAGUE_INTERLUDE_SECONDS).toBe(30);
    });

    function interludeCtx() {
        const overlay = { style: { display: 'flex' } };
        const texts = {};
        let now = 0;
        const ctx = vm.createContext({
            ElTaulerCore: Core, document: { hidden: false, getElementById: () => overlay },
            $: sel => ({ text: v => { texts[sel] = v; }, hide() {} }),
            nowMs: () => now, setInterval: () => 1, clearInterval() {},
            leagueInterlude: null, started: 0, startLeagueRound() { ctx.started++; }, hidePostGameStatusChip() {},
            currentLeague: { completed: false },
            // Tornada musical de la pantalla (radioambient.js): aquí només es compta.
            leagueJinglePlayer: null, musicStops: 0, stopLeagueInterludeMusic() { ctx.musicStops++; }
        });
        ['renderLeagueInterludeCount', 'tickLeagueInterlude', 'stopLeagueInterludeTimer', 'hideLeagueInterlude', 'startLeagueRoundFromInterlude']
            .forEach(n => vm.runInContext(fnSource(n), ctx));
        ctx.leagueInterlude = { remainingMs: 30000, lastTs: 0, timer: 1 };
        return { ctx, overlay, texts, advance: ms => { now += ms; ctx.tickLeagueInterlude(); } };
    }

    test('compte enrere de 30 a 0 i, a zero, la jornada següent comença sola', () => {
        const { ctx, texts, advance, overlay } = interludeCtx();
        advance(200);
        expect(texts['#li-count']).toBe('30');
        advance(9800);
        expect(texts['#li-count']).toBe('20');
        expect(ctx.started).toBe(0);
        advance(20000);
        expect(ctx.started).toBe(1);
        expect(ctx.leagueInterlude).toBe(null);
        expect(overlay.style.display).toBe('none');
        // En començar la jornada, la tornada s'apaga.
        expect(ctx.musicStops).toBeGreaterThanOrEqual(1);
    });

    test('amb l\'app amagada el compte enrere s\'atura', () => {
        const { ctx, texts, advance } = interludeCtx();
        ctx.document.hidden = true;
        advance(60000);
        expect(ctx.started).toBe(0);
        ctx.document.hidden = false;
        advance(1000);
        expect(texts['#li-count']).toBe('29');
    });

    test('si una altra pantalla l\'ha tancat, s\'atura i no comença cap partida d\'amagat', () => {
        const { ctx, overlay, advance } = interludeCtx();
        overlay.style.display = 'none';
        advance(40000);
        expect(ctx.started).toBe(0);
        expect(ctx.leagueInterlude).toBe(null);
    });

    test('quan es vol: lliga ràpida i encara amb jornades', () => {
        const ctx = vm.createContext({ ElTaulerCore: Core, currentLeague: { completed: false }, getLeagueTimeControlId: () => '1+0' });
        vm.runInContext(fnSource('leagueInterludeWanted'), ctx);
        expect(ctx.leagueInterludeWanted()).toBe(true);
        ctx.currentLeague.completed = true;
        expect(ctx.leagueInterludeWanted()).toBe(false);
        ctx.currentLeague.completed = false;
        ctx.getLeagueTimeControlId = () => '3+2';
        expect(ctx.leagueInterludeWanted()).toBe(false);
    });

    test('en acabar una jornada es mostra en lloc de la revisió; «Anar a l\'inici» l\'atura', () => {
        const hgo = fnSource('handleGameOver');
        expect(hgo).toMatch(/const leagueChainNext = wasLeagueMatch && !blunderMode && leagueInterludeWanted\(\);/);
        expect(hgo).toMatch(/if \(leagueChainNext\) \{\s*hidePostGameStatusChip\(\);\s*if \(showLeagueInterlude\(msg, leagueOutcome, \{ clock: finalClockSnapshot, playerColor, oppName: finalClockOppName,\s*eloChange: isLeagueRatedGame \? change : null, reason: timeoutColor \? 'time' : null,\s*precision: finalPrecision, playerMoves: totalPlayerMoves,\s*gameId: [^}]*\}\)\) \{\s*persistPostGameAfterPaint\('league-interlude'\);\s*return;/);
        expect(fnSource('leaveLeagueInterludeHome')).toMatch(/hideLeagueInterlude\(\);[\s\S]*goToHomeScreen\(\);/);
        expect(fnSource('returnToMainMenuImmediate')).toMatch(/hideLeagueInterlude\(\)/);
    });
});

describe('pantalla de la lliga: rajoles i colors', () => {
    const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
    function helpers() {
        const ctx = vm.createContext({ ElTaulerCore: Core, window: { ElTaulerStockfishTV: TV } });
        vm.runInContext(fnSource('formatPts'), ctx);
        ['leagueRankClass', 'leagueDivisionShort', 'leagueRecordText', 'leaguePointsLabel', 'leagueStyleLook', 'leagueStyleLabel']
            .forEach(n => vm.runInContext(fnSource(n), ctx));
        vm.runInContext(source.slice(source.indexOf('const LEAGUE_STYLE_LOOK = {'), source.indexOf('};', source.indexOf('const LEAGUE_STYLE_LOOK = {')) + 2), ctx);
        return ctx;
    }

    test('capçalera: quatre rajoles (jornada, rellotge, nivell, rendiment), l\'escalada i la franja del rival', () => {
        const a = html.indexOf('<div class="league-meta lg-meta">');
        const meta = html.slice(a, html.indexOf('<div class="league-table-wrap">', a));
        ['JORNADA', 'RELLOTGE', 'RENDIMENT'].forEach(t => expect(meta).toContain(`<small>${t}</small>`));
        // La tercera rajola és el nivell de l'escala (o la divisió, a les lligues velles).
        expect(meta).toContain('<small id="league-division-label">NIVELL</small>');
        expect(meta).toContain('id="league-ladder-steps"');
        expect(meta).toContain('id="btn-league-home"');
        expect(meta).toContain('id="league-tc-select"');   // el selector és dins la rajola del rellotge
        expect(meta).toContain('id="league-strip"');
        // Ja no hi ha el «Rellotge» repetit ni la línia de punts.
        expect(meta).not.toContain('setting-label');
        expect(meta).not.toContain('Punts: Victòria 1');
    });

    test('colors: posició (podi i descens), estils i punts', () => {
        const ctx = helpers();
        expect([1, 2, 3, 5, 8, 10].map(r => ctx.leagueRankClass(r, 10))).toEqual(['lgc-gold', 'lgc-silver', 'lgc-bronze', '', 'lgc-red', 'lgc-red']);
        // Al municipal no es baixa: la cua no va de vermell.
        expect([8, 10].map(r => ctx.leagueRankClass(r, 10, false))).toEqual(['', '']);
        expect(ctx.leagueStyleLook('attacker').cls).toBe('lgc-red');
        expect(ctx.leagueStyleLook('wall').cls).toBe('lgc-blue');
        expect(ctx.leagueStyleLook('hunter').cls).toBe('lgc-orange');
        expect(ctx.leagueStyleLook('strategist').cls).toBe('lgc-purple');
        expect(ctx.leagueStyleLook(undefined).cls).toBe('lgc-silver');
        expect(ctx.leagueStyleLabel('wall')).toBe('El Mur');
        // Cada classe de color té la seva regla, també en paper electrònic (grisos).
        ['teal', 'orange', 'purple', 'green', 'red', 'blue', 'gold', 'silver', 'bronze'].forEach(c => {
            expect(html).toContain(`.lgc-${c} { background: var(--lg-${c}); color: var(--lg-${c}-t); }`);
        });
        expect(html).toMatch(/body\.epaper-mode \{\s*--lg-teal: #e4e4e4/);
    });

    test('textos curts de les rajoles', () => {
        const ctx = helpers();
        expect(ctx.leagueDivisionShort('Segona Divisió')).toBe('Segona');
        expect(ctx.leagueDivisionShort("Divisió d'Honor")).toBe('Honor');
        expect(ctx.leagueRecordText([{ outcome: 'win' }, { outcome: 'loss' }])).toBe('1 victòria · 1 derrota');
        expect(ctx.leagueRecordText([{ outcome: 'win' }, { outcome: 'win' }, { outcome: 'draw' }, { outcome: 'loss' }, { outcome: 'loss' }]))
            .toBe('2 victòries · 1 empat · 2 derrotes');
        expect(ctx.leaguePointsLabel(1)).toBe('1 punt');
        expect(ctx.leaguePointsLabel(0)).toBe('0 punts');
        expect(ctx.leaguePointsLabel(1.5)).toBe('1,5 punts');
    });

    test('al mòbil la taula hi cap: s\'amaguen PJ i SB', () => {
        expect(html).toMatch(/@media \(max-width: 520px\) \{\s*table\.league-table, body\.device-mobile table\.league-table \{ min-width: 0; \}\s*\.league-table \.lg-col-pj, \.league-table \.lg-col-sb \{ display: none; \}/);
    });
});

describe('rellotge final amb el resultat', () => {
    function clockCtx() {
        const ctx = vm.createContext({ CLOCK_CENTIS_MS: 10000 });
        vm.runInContext(fnSource('escapeHtml'), ctx);
        vm.runInContext(source.slice(source.indexOf('function formatClock('), source.indexOf('// Quant ha de trigar el pròxim tic')), ctx);
        ['resultFinalClockHtml', 'leagueRoundClockText'].forEach(n => vm.runInContext(fnSource(n), ctx));
        return ctx;
    }

    test('amb rellotge: «Tu» i el rival, cadascun a la capsa del seu color', () => {
        const ctx = clockCtx();
        const html = ctx.resultFinalClockHtml({ white: 12400, black: 35000 }, 'b', 'Gambit');
        expect(html).toMatch(/history-clock-white"><span>Gambit<\/span><strong>0:12.4<\/strong>/);
        expect(html).toMatch(/history-clock-black"><span>Tu<\/span><strong>0:35.0<\/strong>/);
        expect(ctx.resultFinalClockHtml({ white: 0, black: 61000 }, 'w', null)).toMatch(/<span>Tu<\/span><strong>0:00.00<\/strong>[\s\S]*<span>Rival<\/span><strong>1:01<\/strong>/);
    });

    test('sense rellotge no surt res', () => {
        const ctx = clockCtx();
        expect(ctx.resultFinalClockHtml(null, 'w', 'X')).toBe('');
        expect(ctx.resultFinalClockHtml({ white: 100 }, 'w', 'X')).toBe('');
        expect(ctx.leagueRoundClockText({ oppName: 'X', outcome: 'loss' })).toBe('');
    });

    test('a «Les teves jornades», el temps del jugador primer', () => {
        const ctx = clockCtx();
        expect(ctx.leagueRoundClockText({ oppName: 'Gambit', color: 'b', clock: { white: 21300, black: 0 } }))
            .toBe('<span class="lh-clock">◷ Tu 0:00.00 · Gambit 0:21.3</span>');
    });

    test('es mostra a la revisió, al compte enrere i es desa a la jornada', () => {
        expect(fnSource('showPostGameReview')).toMatch(/\$\('#review-final-clock'\)\.html\(resultFinalClockHtml\(options\.finalClock, options\.playerColor, options\.oppName\)\)/);
        expect(fnSource('showLeagueInterlude')).toMatch(/\$\('#li-clock'\)\.html\(resultFinalClockHtml\(ci\.clock, ci\.playerColor, ci\.oppName\)\)/);
        expect(fnSource('handleGameOver')).toMatch(/const finalClockSnapshot = snapshotFinalClock\(\);/);
        expect(fnSource('applyLeagueAfterGame')).toMatch(/finalClock = snapshotFinalClock\(\)/);
        const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
        expect(html).toContain('<div id="review-final-clock"></div>');
        expect(html).toContain('<div class="li-clock" id="li-clock"></div>');
    });
});

describe('rellotge final: hi cap també amb la lletra gran del mòbil', () => {
    const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
    test('dues columnes que poden encongir-se, nom a dalt i temps a sota', () => {
        expect(html).toContain('.result-final-clock { grid-template-columns: repeat(2, minmax(0, 1fr));');
        expect(html).toMatch(/\.result-final-clock \.history-clock-side \{\s*flex-direction: column;[^}]*min-width: 0;/);
        expect(html).toMatch(/\.result-final-clock \.history-clock-side > span \{[^}]*text-overflow: ellipsis;/);
    });
    test('al compte enrere, la icona i el nom del rival no se separen', () => {
        expect(html).toMatch(/\.li-side-name \{[^}]*white-space: nowrap;/);
    });
});

describe('pantalla entre partides: poc text i les dues posicions marcades', () => {
    function interCtx() {
        const els = {};
        const el = sel => (els[sel] = els[sel] || { text: null, attrs: {}, html: null, css: {} });
        const $ = sel => {
            const e = el(sel);
            const api = {
                text(v) { e.text = v; return api; }, attr(k, v) { e.attrs[k] = v; return api; },
                html(v) { e.html = v; return api; }, css(k, v) { e.css[k] = v; return api; }
            };
            return api;
        };
        const overlay = { style: { display: 'none' } };
        const ids = ['me'].concat([1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => 'bot' + i));
        const players = ids.map((id, i) => ({ id, name: id === 'me' ? 'Tu' : 'Rival' + i, elo: 1000 + i, pts: 9 - i, pg: 9 - i, style: 'wall' }));
        const ctx = vm.createContext({
            ElTaulerCore: Core, window: { ElTaulerStockfishTV: TV }, $, document: { getElementById: () => overlay },
            currentLeague: { currentRound: 3, completed: false, players, results: [], colors: ['w', 'b', 'b'], division: 2 },
            getLeagueTimeControlId: () => '1+0', syncLeagueUserRoc() {}, getMyOpponentForRound: () => 'bot4',
            getLeaguePlayer: id => players.find(p => p.id === id), nowMs: () => 0, setInterval: () => 1, clearInterval() {},
            leagueInterlude: null, resultFinalClockHtml: () => '<div>rellotge</div>', escapeHtml: x => x,
            musicStarts: 0, startLeagueInterludeMusic() { ctx.musicStarts++; },
            accRenders: 0, renderLeagueInterludeAccuracy() { ctx.accRenders++; }
        });
        vm.runInContext(fnSource('formatPts'), ctx);
        vm.runInContext(fnSource('formatEloChange'), ctx);
        ['leagueInterludeWanted', 'stopLeagueInterludeTimer', 'renderLeagueInterludeCount', 'leagueSort', 'leagueOrdinal',
            'leaguePointsLabel', 'leagueIcon', 'leagueStyleLook', 'getLeagueRoundColor', 'leagueShortResult', 'showLeagueInterlude', 'tickLeagueInterlude']
            .forEach(n => vm.runInContext(fnSource(n), ctx));
        vm.runInContext(source.slice(source.indexOf('const LEAGUE_STYLE_LOOK = {'), source.indexOf('};', source.indexOf('const LEAGUE_STYLE_LOOK = {')) + 2), ctx);
        return { ctx, els, overlay };
    }

    test('resultat curt: paraula, «per temps» si cal i el canvi d\'ELO', () => {
        const { ctx } = interCtx();
        expect(ctx.leagueShortResult('win', { eloChange: 13 })).toBe('Victòria · +13');
        expect(ctx.leagueShortResult('loss', { eloChange: -9, reason: 'time' })).toBe('Derrota per temps · -9');
        expect(ctx.leagueShortResult('draw', {})).toBe('Taules');
    });

    test('la jornada gran, les dues posicions, els punts i el color', () => {
        const { ctx, els, overlay } = interCtx();
        expect(ctx.showLeagueInterlude('Victòria per temps! (+13 · Bullet 1+0)', 'win', { eloChange: 13, reason: 'time' })).toBe(true);
        expect(overlay.style.display).toBe('flex');
        // La tornada musical comença amb el compte enrere.
        expect(ctx.musicStarts).toBe(1);
        expect(els['#li-result'].text).toBe('Victòria per temps · +13');
        expect(els['#li-round-num'].text).toBe('3');
        expect(els['#li-label'].text).toBe('comença en');
        // Tu ets el primer (9 punts); el rival bot4, el cinquè (5 punts).
        expect(els['#li-me-pos'].text).toBe('1r');
        expect(els['#li-me-sub'].html).toBe('<span class="li-nw">9 punts</span> · <span class="li-nw">negres</span>');
        expect(els['#li-opp-pos'].html).toBe('5è<span class="li-pos-ic"><svg class="btn-ic" aria-hidden="true"><use href="#ic-wall"/></svg></span>');
        expect(els['#li-opp-pos'].attrs.class).toBe('li-pos lgc-blue');   // el Mur: blau
        expect(els['#li-opp-name'].text).toBe('Rival4');
        expect(els['#li-opp-sub'].html).toBe('<span class="li-nw">5 punts</span> · <span class="li-nw">ROC 1004</span>');
        // Ja no hi ha l'escala dels deu números.
        expect(els['#li-ladder']).toBeUndefined();
    });

    test('ja no hi ha les frases llargues (estil, obertura, divisió, nota final)', () => {
        const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
        const a = html.indexOf('id="league-interlude"');
        const block = html.slice(a, html.indexOf('id="promotion-modal"', a));
        expect(block).not.toContain('li-opp-meta');
        expect(block).not.toContain('Lliga ràpida: les jornades');
        expect(block).not.toContain('li-ladder');
        // La jornada que toca, en un requadre i gran.
        expect(block).toMatch(/<div class="li-round-box" id="li-round-box">\s*<small>JORNADA<\/small>\s*<span class="li-round-num"><b id="li-round-num">/);
        expect(html).toMatch(/\.li-round-box \{[^}]*border: 3px solid var\(--accent-gold\)/);
        expect(html).toMatch(/\.li-round-num b \{ font-size: 2\.2rem;/);
        // Els segons que falten, més grans que el número de la jornada.
        expect(html).toMatch(/\.li-count \{ font-size: clamp\(3\.2rem, 10vh, 4\.8rem\);/);
        expect(fnSource('showLeagueInterlude')).not.toMatch(/describeLeagueOpponent/);
    });
});

describe('final de la lliga: la posició, gran, a la revisió de la darrera jornada', () => {
    function finalCtx(career = null) {
        const store = career ? { chess_leagueCareer: JSON.stringify(career) } : {};
        const ctx = vm.createContext({ ElTaulerCore: Core, JSON, Math, Number, Array, Object,
            LEAGUE_CAREER_KEY: 'chess_leagueCareer',
            localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } } });
        vm.runInContext(fnSource('formatPts'), ctx);
        ['escapeHtml', 'leagueOrdinal', 'leaguePointsLabel', 'leagueRankClass', 'loadLeagueCareer', 'leagueHome',
            'leagueIcon', 'leagueFinalMove', 'leagueFinalReviewHtml']
            .forEach(n => vm.runInContext(fnSource(n), ctx));
        return ctx;
    }
    const base = { players: 10, pts: 7, performance: 1545, division: 2, champion: 'Gambit', name: 'Copa del Rei III' };

    test('posició gran amb el color del podi, punts, rendiment i divisió', () => {
        const ctx = finalCtx();
        const html = ctx.leagueFinalReviewHtml({ ...base, rank: 2, nextDivision: 3, movement: 'up' });
        expect(html).toContain('<span class="rlf-pos lgc-silver">2n</span>');
        expect(html).toContain('<b>de 10</b><span>7 punts · rendiment 1545</span>');
        expect(html).toContain('↑ Puges a Primera Divisió');
        expect(html).toContain('LLIGA ACABADA');
        expect(html).toContain('Copa del Rei III');
        expect(html).toContain('Campió: Gambit');
    });

    test('campió: or i trofeu; descens: vermell; a mitja taula, verd aigua', () => {
        const ctx = finalCtx();
        const champ = ctx.leagueFinalReviewHtml({ ...base, rank: 1, nextDivision: 3, movement: 'up', champion: 'Tu' });
        expect(champ).toContain('rlf-champion');
        expect(champ).toContain('<use href="#ic-trophy"/></svg>CAMPIÓ DE LA LLIGA');
        expect(champ).toContain('<span class="rlf-pos lgc-gold">1r</span>');
        expect(champ).not.toContain('Campió:');
        expect(ctx.leagueFinalReviewHtml({ ...base, rank: 9, nextDivision: 1, movement: 'down' }))
            .toMatch(/<span class="rlf-pos lgc-red">9è<\/span>[\s\S]*↓ Baixes a Tercera Divisió/);
        expect(ctx.leagueFinalReviewHtml({ ...base, rank: 5, nextDivision: 2, movement: 'stay' }))
            .toMatch(/<span class="rlf-pos lgc-teal">5è<\/span>[\s\S]*Continues a Segona Divisió/);
    });

    test('escala de nivells: es puja, es baixa o es continua a la lliga del lloc del jugador', () => {
        const home = { territory: 'cat', municipi: 'Vic', comarca: 'Osona', provincia: 'Barcelona' };
        const ctx = finalCtx({ level: 1, home, seasons: [] });
        const lad = { players: 10, pts: 7, performance: 1100, champion: 'Gambit', name: 'Lliga de Vic · Grup B' };
        expect(ctx.leagueFinalReviewHtml({ ...lad, rank: 2, level: 0, nextLevel: 1, movement: 'up' }))
            .toContain('↑ Puges a la Lliga Comarcal d&#39;Osona');
        expect(ctx.leagueFinalReviewHtml({ ...lad, rank: 9, level: 2, nextLevel: 1, movement: 'down' }))
            .toMatch(/<span class="rlf-pos lgc-red">9è<\/span>[\s\S]*↓ Baixes a la Lliga Comarcal d&#39;Osona/);
        // Al municipal la cua no és zona de descens.
        expect(ctx.leagueFinalReviewHtml({ ...lad, rank: 9, level: 0, nextLevel: 0, movement: 'stay' }))
            .toMatch(/<span class="rlf-pos lgc-teal">9è<\/span>[\s\S]*Continues a la Lliga de Vic/);
        const world = ctx.leagueFinalReviewHtml({ ...lad, rank: 1, level: 6, nextLevel: 6, movement: 'stay', champion: 'Tu' });
        expect(world).toContain('<use href="#ic-globe"/></svg>CAMPIÓ DEL MÓN');
        expect(world).toContain('Continues a la Lliga Mundial');
        expect(ctx.leagueFinalReviewHtml({ ...lad, rank: 4, division: 2, nextLevel: 0, movement: 'start' }))
            .toContain('L&#39;escalada comença a la Lliga de Vic');
    });

    test('fora de la darrera jornada no surt res', () => {
        expect(finalCtx().leagueFinalReviewHtml(null)).toBe('');
    });

    test('la revisió el pinta a dalt i el final de partida l\'hi passa', () => {
        const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
        expect(html).toMatch(/id="checkmate-image" class="checkmate-image">\s*<div id="review-league-final"><\/div>\s*<div class="review-modal-result"/);
        expect(html).toMatch(/\.rlf-pos \{[^}]*font-size: 3\.2rem;/);
        expect(fnSource('showPostGameReview')).toMatch(/\$\('#review-league-final'\)\.html\(leagueFinalReviewHtml\(options\.leagueFinal\)\)/);
        const hgo = fnSource('handleGameOver');
        expect(hgo).toMatch(/const leagueFinalInfo = \(wasLeagueMatch && currentLeague && currentLeague\.completed && currentLeague\.final\)/);
        expect(hgo).toMatch(/leagueFinal: leagueFinalInfo,/);
    });
});
