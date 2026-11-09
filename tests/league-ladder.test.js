// Escala de lligues (LLIGA.md §6): la localitat del jugador (localitats.js),
// del municipi al món, amb dos o tres grups per ELO a cada nivell.
const Core = require('../core');
const Loc = require('../localitats');
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
const fnSource = name => {
    const a = source.indexOf(`function ${name}(`);
    if (a < 0) throw new Error(`no hi ha ${name}`);
    return source.slice(a, source.indexOf('\n}\n', a) + 2);
};
const constSource = name => {
    const a = source.indexOf(`const ${name} = [`);
    if (a < 0) throw new Error(`no hi ha ${name}`);
    return source.slice(a, source.indexOf('\n];\n', a) + 3);
};

describe('localitats: municipis de Catalunya (Idescat)', () => {
    const all = Loc.catalanMunicipalities();

    test('947 municipis, 43 comarques i 4 províncies, tots amb comarca i província', () => {
        expect(all).toHaveLength(947);
        all.forEach(m => {
            expect(m.name).toBeTruthy();
            expect(m.comarca).toBeTruthy();
            expect(['Barcelona', 'Girona', 'Lleida', 'Tarragona']).toContain(m.province);
        });
        expect(new Set(all.map(m => m.comarca)).size).toBe(43);
        expect(new Set(all.map(m => m.name)).size).toBe(947);
        expect(Loc.provinces('cat').sort()).toEqual(['Barcelona', 'Girona', 'Lleida', 'Tarragona']);
    });

    test('l\'article va al davant i la comarca, amb article', () => {
        expect(Loc.findMunicipality('Vic')).toMatchObject({ comarca: 'Osona', province: 'Barcelona' });
        expect(Loc.findMunicipality('el masnou')).toMatchObject({ name: 'el Masnou', comarca: 'el Maresme' });
        expect(Loc.findMunicipality('Masnou')).toMatchObject({ name: 'el Masnou' });
        expect(Loc.findMunicipality("la Seu d'Urgell")).toMatchObject({ comarca: "l'Alt Urgell", province: 'Lleida' });
        expect(Loc.findMunicipality('Vielha e Mijaran')).toMatchObject({ comarca: "la Val d'Aran", province: 'Lleida' });
        expect(all.some(m => /, (el|la|els|les|l')$/.test(m.name))).toBe(false);
    });

    test('les comarques partides tenen la província de cada municipi', () => {
        expect(Loc.findMunicipality('Llívia')).toMatchObject({ comarca: 'la Cerdanya', province: 'Girona' });
        expect(Loc.findMunicipality('Bellver de Cerdanya')).toMatchObject({ comarca: 'la Cerdanya', province: 'Lleida' });
        expect(Loc.findMunicipality('Viladrau')).toMatchObject({ comarca: 'Osona', province: 'Girona' });
    });

    test('cerca sense accents ni majúscules: primer els que comencen pel text', () => {
        const r = Loc.searchMunicipalities('vic');
        expect(r[0].name).toBe('Vic');
        expect(r.length).toBeLessThanOrEqual(8);
        expect(Loc.searchMunicipalities('LLEIDA')[0].name).toBe('Lleida');
        expect(Loc.searchMunicipalities('sant cugat').map(m => m.name)).toContain('Sant Cugat del Vallès');
        expect(Loc.searchMunicipalities('alio')[0].name).toBe('Alió');
        expect(Loc.searchMunicipalities('v')).toEqual([]);
    });
});

describe('localitats: altres territoris i localitat neta', () => {
    test('comarques dels altres territoris amb la província', () => {
        expect(Loc.comarques('val')).toHaveLength(34);
        expect(Loc.provinceOfComarca('val', 'la Safor')).toBe('València');
        expect(Loc.provinceOfComarca('val', 'Safor')).toBe('València');
        expect(Loc.provinceOfComarca('bal', 'Menorca')).toBe('Illes Balears');
        expect(Loc.provinceOfComarca('franja', 'el Matarranya')).toBe('Terol');
        expect(Loc.municipalities('and')).toHaveLength(7);
        Loc.TERRITORIES.filter(t => t.id !== 'fora').forEach(t => expect(Loc.comarques(t.id).length).toBeGreaterThan(0));
    });

    test('normalizeHome: a Catalunya mana la llista; als altres, la comarca dona la província', () => {
        expect(Loc.normalizeHome({ municipi: '  vic ', comarca: 'Inventada' }))
            .toEqual({ territory: 'cat', municipi: 'Vic', comarca: 'Osona', provincia: 'Barcelona', pais: '' });
        expect(Loc.normalizeHome({ territory: 'val', municipi: 'Gandia', comarca: 'la Safor' }))
            .toEqual({ territory: 'val', municipi: 'Gandia', comarca: 'la Safor', provincia: 'València', pais: '' });
        expect(Loc.normalizeHome({ territory: 'fora', municipi: 'Lió', comarca: 'Roine', provincia: 'Alvèrnia-Roine-Alps', pais: 'França' }))
            .toMatchObject({ territory: 'fora', pais: 'França' });
        expect(Loc.normalizeHome({ territory: 'xx', municipi: 'Reus' })).toMatchObject({ territory: 'cat', comarca: 'el Baix Camp' });
        expect(Loc.normalizeHome({ municipi: '   ' })).toBe(null);
        expect(Loc.normalizeHome(null)).toBe(null);
    });

    test('origen dels rivals segons el nivell', () => {
        const vic = Loc.normalizeHome({ municipi: 'Vic' });
        let k = 0;
        const rnd = () => ((k = (k * 9301 + 49297) % 233280) / 233280);
        // Al municipal tots són del poble: no cal dir-ho.
        expect(Loc.rivalOrigins(0, vic, 9, rnd)).toEqual(Array(9).fill(''));
        const comarcal = Loc.rivalOrigins(1, vic, 9, rnd);
        expect(comarcal).toHaveLength(9);
        expect(new Set(comarcal).size).toBe(9);
        comarcal.forEach(n => {
            expect(n).not.toBe('Vic');
            expect(Loc.findMunicipality(n).comarca).toBe('Osona');
        });
        const provincial = Loc.rivalOrigins(2, vic, 9, rnd);
        const comarquesBcn = Loc.comarques('cat').filter(c => c.province === 'Barcelona').map(c => c.name);
        provincial.forEach(c => { expect(comarquesBcn).toContain(c); expect(c).not.toBe('Osona'); });
        Loc.rivalOrigins(3, vic, 9, rnd).forEach(n => expect(Loc.findMunicipality(n)).not.toBe(null));
        Loc.rivalOrigins(4, vic, 9, rnd).forEach(n => expect(Loc.PPCC_CITIES).toContain(n));
        Loc.rivalOrigins(5, vic, 9, rnd).forEach(n => expect(Loc.EUROPE).toContain(n));
        Loc.rivalOrigins(6, vic, 9, rnd).forEach(n => expect(Loc.WORLD).toContain(n));
        // Sense dades (fora dels Països Catalans), en blanc als nivells de casa.
        expect(Loc.rivalOrigins(1, { territory: 'fora', municipi: 'Lió', comarca: 'Roine' }, 9)).toEqual(Array(9).fill(''));
        // Una comarca amb menys municipis que rivals els repeteix.
        const aran = Loc.rivalOrigins(1, Loc.normalizeHome({ municipi: 'Vielha e Mijaran' }), 9, rnd);
        expect(aran).toHaveLength(9);
        aran.forEach(n => expect(n).toBeTruthy());
    });
});

describe('a l\'app: la lliga a l\'escala', () => {
    function appCtx({ career = null, base = 1000, league = null, underway = false } = {}) {
        const store = career ? { chess_leagueCareer: JSON.stringify(career) } : {};
        const ctx = vm.createContext({
            ElTaulerCore: Core, JSON, Math, Date, Number, Array, Object, Set,
            window: { ElTaulerLocalitats: Loc },
            localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
            ELO_MIN: 200, ELO_MAX: 2000, LEAGUE_CAREER_KEY: 'chess_leagueCareer', LEAGUE_CAREER_MAX_SEASONS: 30,
            TIME_CONTROLS: [{ id: 'none' }, { id: '3+2' }],
            getPendingLeagueTimeControlId: () => 'none', getLeagueTimeControlId: () => (ctx.currentLeague && ctx.currentLeague.timeControl) || 'none',
            getLeagueBaseRating: () => base, newLeagueBotRepertoire: () => ({ white: null, blackE4: null, blackD4: null }),
            leagueRoundUnderway: () => underway, saveStorage() {},
            currentLeague: league, leagueActiveMatch: null
        });
        vm.runInContext(constSource('LEAGUE_LOCAL_NAMES'), ctx);
        vm.runInContext(constSource('LEAGUE_INTL_NAMES'), ctx);
        ['shuffleArray', 'buildRoundRobinSchedule', 'loadLeagueCareer', 'saveLeagueCareer', 'createNewLeague',
            'isLeagueTimeControlLocked', 'leagueNotStartedYet', 'upgradeLegacyLeague', 'refreshLeagueLadderGroup', 'saveLeagueHome']
            .forEach(n => vm.runInContext(fnSource(n), ctx));
        return { ctx, store };
    }
    const vic = { territory: 'cat', municipi: 'Vic', comarca: 'Osona', provincia: 'Barcelona', pais: '' };

    test('sense trajectòria: lliga municipal, grup per ELO i noms genèrics', () => {
        const { ctx } = appCtx({ base: 1000 });
        const L = ctx.createNewLeague(true);
        // ELO mitjà 1000 − 120 = 880: grup B del municipal.
        expect(L.ladder).toEqual({ level: 0, group: 'B' });
        expect(L.divisionShift).toBe(-120);
        expect(L.name).toBe('Lliga Local · Grup B');
        expect(L.division).toBeUndefined();
        L.players.forEach(p => expect(p.from).toBeUndefined());
        const bots = L.players.filter(p => p.id !== 'me');
        expect(bots).toHaveLength(9);
        const avg = bots.reduce((s, p) => s + p.elo, 0) / 9;
        expect(Math.abs(avg - 880)).toBeLessThan(15);
    });

    test('amb la localitat: noms del lloc, rivals de la comarca i àlies internacionals a Europa', () => {
        const { ctx } = appCtx({ career: { level: 1, home: vic, seasons: [] }, base: 1150 });
        const L = ctx.createNewLeague(true);
        expect(L.ladder).toEqual({ level: 1, group: 'A' });   // 1150 − 80 = 1070
        expect(L.name).toBe("Lliga Comarcal d'Osona · Grup A");
        expect(L.players.find(p => p.id === 'me').from).toBe('Vic');
        L.players.filter(p => p.id !== 'me').forEach(p => expect(Loc.findMunicipality(p.from).comarca).toBe('Osona'));
        const local = new Set(vm.runInContext('LEAGUE_LOCAL_NAMES', ctx));
        L.players.filter(p => p.id !== 'me').forEach(p => expect(local.has(p.name)).toBe(true));

        const eu = appCtx({ career: { level: 5, home: vic, seasons: [] }, base: 1500 }).ctx.createNewLeague(true);
        expect(eu.name).toBe('Lliga Europea · Grup A');
        const intl = new Set(vm.runInContext('LEAGUE_INTL_NAMES', ctx));
        eu.players.filter(p => p.id !== 'me').forEach(p => {
            expect(intl.has(p.name)).toBe(true);
            expect(Loc.EUROPE).toContain(p.from);
        });
    });

    test('el grup es recalcula si la referència canvia abans de començar', () => {
        const { ctx } = appCtx({ career: { level: 0, home: vic, seasons: [] }, base: 1000 });
        ctx.createNewLeague(true);
        ctx.currentLeague.baseRating = 600;   // 600 − 120 = 480: grup C
        ctx.refreshLeagueLadderGroup();
        expect(ctx.currentLeague.ladder.group).toBe('C');
        expect(ctx.currentLeague.name).toBe('Lliga de Vic · Grup C');
    });

    test('desar la localitat torna a sortejar la lliga no començada; la començada es manté', () => {
        const { ctx, store } = appCtx({ base: 1000 });
        ctx.createNewLeague(true);
        const before = ctx.currentLeague.id;
        ctx.saveLeagueHome(vic);
        expect(JSON.parse(store.chess_leagueCareer).home).toEqual(vic);
        expect(ctx.currentLeague.name).toBe('Lliga de Vic · Grup B');

        ctx.currentLeague.currentRound = 2;
        const name = ctx.currentLeague.name;
        ctx.saveLeagueHome(Object.assign({}, vic, { municipi: 'Manlleu' }));
        expect(ctx.currentLeague.name).toBe(name);
        expect(JSON.parse(store.chess_leagueCareer).home.municipi).toBe('Manlleu');
        expect(before).toBeTruthy();
    });

    test('lligues de divisions: les no començades passen a l\'escala, les començades s\'acaben igual', () => {
        const legacy = () => ({ id: 'old', name: 'Copa del Rei III', timeControl: '3+2', division: 3, divisionShift: 50,
            currentRound: 1, completed: false, players: [{ id: 'me', pj: 0 }] });
        const fresh = appCtx({ league: legacy() }).ctx;
        expect(fresh.upgradeLegacyLeague()).toBe(true);
        expect(fresh.currentLeague.ladder).toEqual({ level: 0, group: 'B' });
        expect(fresh.currentLeague.timeControl).toBe('3+2');

        const started = appCtx({ league: Object.assign(legacy(), { currentRound: 4 }) }).ctx;
        expect(started.upgradeLegacyLeague()).toBe(false);
        expect(started.currentLeague.id).toBe('old');

        const paused = appCtx({ league: legacy(), underway: true }).ctx;
        expect(paused.upgradeLegacyLeague()).toBe(false);
    });

    test('la trajectòria llegeix nivell, millor nivell i localitat (i les velles, sense)', () => {
        const { ctx } = appCtx({ career: { division: 3, seasons: [{ name: 'x', division: 3 }] } });
        expect(ctx.loadLeagueCareer()).toMatchObject({ division: 3, level: 0, bestLevel: 0, home: null });
        const c2 = appCtx({ career: { level: 9, bestLevel: 2, home: { municipi: '' }, seasons: [] } }).ctx.loadLeagueCareer();
        expect(c2).toMatchObject({ level: 6, bestLevel: 6, home: null });
    });
});

describe('icones de la lliga: les de l\'app, cap emoji', () => {
    const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{25A0}-\u{25FF}\u{FE0F}]/u;
    const symbols = new Set([...html.matchAll(/<symbol id="(ic-[a-z0-9-]+)"/g)].map(m => m[1]));
    const between = (a, b) => html.slice(html.indexOf(a), html.indexOf(b, html.indexOf(a)));

    test('pantalla de la lliga, finestra «On jugues?», compte enrere i bàner de l\'inici sense emojis', () => {
        [between('<div id="league-screen"', 'id="opening-screen"'),
            between('id="league-home-modal"', 'id="username-modal"'),
            between('id="league-interlude"', 'id="promotion-modal"'),
            between('id="league-hero"', 'id="league-hero-play-label"')]
            .forEach(part => { expect(part.length).toBeGreaterThan(100); expect(part).not.toMatch(EMOJI); });
    });

    test('nivells, estils i dades dels rivals: símbols que existeixen al joc d\'icones', () => {
        Core.LEAGUE_LEVELS.forEach(L => expect(symbols.has(L.icon)).toBe(true));
        const ctx = vm.createContext({});
        vm.runInContext(fnSource('leagueStyleLook'), ctx);
        vm.runInContext(source.slice(source.indexOf('const LEAGUE_STYLE_LOOK = {'), source.indexOf('};', source.indexOf('const LEAGUE_STYLE_LOOK = {')) + 2), ctx);
        ['attacker', 'wall', 'hunter', 'strategist', undefined].forEach(st => expect(symbols.has(vm.runInContext(`leagueStyleLook(${JSON.stringify(st)}).icon`, ctx))).toBe(true));
        Loc.EUROPE.concat(Loc.WORLD, Loc.PPCC_CITIES).forEach(n => expect(n).not.toMatch(EMOJI));
    });

    test('cada leagueIcon(...) del codi apunta a un símbol que existeix', () => {
        const ids = [...source.matchAll(/leagueIcon\('(ic-[a-z0-9-]+)'/g)].map(m => m[1]);
        expect(ids.length).toBeGreaterThan(5);
        ids.forEach(id => expect(symbols.has(id)).toBe(true));
        const ctx = vm.createContext({});
        vm.runInContext(fnSource('leagueIcon'), ctx);
        expect(ctx.leagueIcon('ic-pin')).toBe('<svg class="btn-ic" aria-hidden="true"><use href="#ic-pin"/></svg>');
    });

    test('les funcions que pinten la lliga no hi posen cap emoji', () => {
        ['renderLeague', 'renderLeagueStrip', 'renderLeagueRivals', 'renderLeagueLadder', 'renderLeagueLadderSteps',
            'renderLeagueHomePreview', 'leagueFinalReviewHtml', 'leagueFinalMove', 'renderLeagueTimeControl',
            'submitLeagueHomeModal', 'showLeagueInterlude', 'renderLeagueHero']
            .forEach(n => expect(fnSource(n)).not.toMatch(EMOJI));
    });
});

describe('a la pàgina', () => {
    test('localitats.js es carrega entre core.js i app.js', () => {
        const core = html.indexOf('src="core.js?v=');
        const loc = html.indexOf('src="localitats.js?v=');
        expect(loc).toBeGreaterThan(core);
        expect(loc).toBeLessThan(html.indexOf('src="app.js?v='));
    });

    test('la finestra «On jugues?» té territori, municipi amb suggeriments, comarca, província i país', () => {
        const a = html.indexOf('id="league-home-modal"');
        const modal = html.slice(a, html.indexOf('id="username-modal"', a));
        ['league-home-territory', 'league-home-municipi', 'league-home-suggest', 'league-home-comarca',
            'league-home-provincia', 'league-home-pais', 'league-home-preview', 'league-home-save', 'league-home-skip']
            .forEach(id => expect(modal).toContain(`id="${id}"`));
    });

    test('obrir la lliga demana la localitat si no n\'hi ha (i no, si fa poc que es va dir «Ara no»)', () => {
        const open = fnSource('openLeague');
        expect(open).toMatch(/upgradeLegacyLeague\(\);/);
        expect(open).toMatch(/if \(!career\.home && !skippedRecently\) openLeagueHomeModal\(\);/);
        expect(fnSource('startLeagueRound')).toMatch(/upgradeLegacyLeague\(\);/);
        expect(fnSource('updateLeagueBannerData')).toMatch(/upgradeLegacyLeague\(\);/);
    });
});
