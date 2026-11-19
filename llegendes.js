// ============================================================================
// llegendes.js — «Lliga de llegendes TV»: 10 jugadors històrics, un motor per
// a cada perfil, calendari de lliga doble i classificació.
// ============================================================================
// Aquest mòdul és LÒGICA PURA (sense DOM, xarxa ni motors): dades dels perfils,
// calendari, classificació, rotació de lliga i textos amb els noms dels jugadors.
// stockfishtv.js hi posa els motors i la partida.
//
// Els 10 jugadors són una tria editorial (campions que van definir com
// s'entén el joc). Per canviar-ne un, n'hi ha prou amb editar LEGENDS.
//
// Cada perfil té:
//   · engine: 'stockfish' o 'lozza', segons el que s'adapta millor al jugador.
//     - Stockfish admet un perfil d'estil: entre les jugades gairebé iguals
//       (MultiPV) tria la que encaixa amb `weights` (vegeu tvMoveFeatures).
//     - Lozza, amb la cerca curta que fixa la TV, juga d'instint tàctic: és
//       l'estil propi del motor i no se li aplica cap pes artificial.
//     Tria de disseny, no mesurada: vegeu LLEGENDES.md. El motor i el nivell
//     són interns: ni la pantalla ni l'Èlia i en Grau no els diuen mai.
//   · weights: pesos dels trets de la jugada. Només actuen amb Stockfish (o si
//     Lozza no es pot carregar i Stockfish el substitueix).
//   · remarks: observacions curtes lligades a un fet comprovat de la jugada
//     (escac, canvi, enroc…) que expliquen el tret històric del jugador.
//
// La lliga és de dues voltes (90 partides): cada parella es troba dues
// vegades, una amb cada color. Són 18 jornades de 5 partides; l'ordre de les
// jornades i de les parelles és aleatori, i dins la jornada es juga en ordre
// aleatori. Quan tothom ha jugat dues vegades amb tothom, la lliga s'acaba, es
// proclama el campió i en comença una de nova.
//
// Es carrega com a:
//   - Navegador: <script src="llegendes.js"> → window.ElTaulerLlegendes
//   - Node/Jest: require('./llegendes') → module.exports
// ============================================================================
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.ElTaulerLlegendes = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const VERSION = '1.5.0';
    // Sense prefix chess_/eltauler_: la sincronització al núvol no la recull
    // (com la resta de dades de la TV).
    const KEY = 'tauler_tv_legends_v1';

    const CONFIG = {
        // Força de joc de tots els jugadors, de 0 a 1 sobre l'escala del motor.
        // Mateixa relació que fa servir la TV per aparellar un nivell de
        // Stockfish amb una profunditat de Lozza (vegeu tvMatchPlan). Tots dos
        // juguen igual de fort: els distingeix el motor i el perfil.
        POWER: 0.62,
        PLAYERS: 10,
        ROUNDS_PER_LEG: 9,
        SEASON_GAMES: 90,
        HISTORY: 12,
        // Observacions durant la partida: no abans d'aquesta semijugada, amb
        // aquesta distància entre dues i un màxim per partida.
        REMARK_FIRST_PLY: 10,
        REMARK_GAP_PLIES: 10,
        REMARKS_PER_GAME: 7
    };

    const ENGINE_NAME = { stockfish: 'Stockfish', lozza: 'Lozza' };

    // Cada `when` és un tret de tvMoveFeatures (vegeu TRAITS més avall).
    const LEGENDS = Object.freeze([
        {
            id: 'morphy', name: 'Paul Morphy', short: 'Morphy', spoken: 'Mòrfi', born: 1837, died: 1884, country: 'Estats Units',
            bio: 'Nord-americà de Nova Orleans, considerat el campió del món no oficial a finals de la dècada de 1850.',
            style: 'joc obert, desenvolupament ràpid i atac directe al rei',
            engine: 'lozza', engineWhy: 'cerca curta i instint tàctic, com el seu atac ràpid', tactical: true,
            weights: { check: 3, approach: 1.2, storm: 1, sacrifice: 1.2, development: 1.8, threat: 0.8, trade: -1, retreat: -0.8 },
            remarks: [
                { when: 'check', text: 'Morphy dona escac: l’atac directe al rei és el seu segell.' },
                { when: 'development', text: 'Morphy desplega una peça: sempre va donar prioritat al desenvolupament ràpid.' },
                { when: 'sacrifice', text: 'Morphy ofereix material: li agradava sacrificar per obrir línies contra el rei.' }
            ]
        },
        {
            id: 'steinitz', name: 'Wilhelm Steinitz', short: 'Steinitz', spoken: 'Stàinits', born: 1836, died: 1900, country: 'Àustria-Hongria',
            bio: 'Primer campió oficial del món (1886–1894) i pare de l’escola posicional.',
            style: 'acumula petits avantatges i construeix la posició pas a pas',
            engine: 'stockfish', engineWhy: 'tria, entre jugades gairebé iguals, la més posicional', tactical: false,
            weights: { centralization: 1.4, development: 1.4, castle: 1.5, quiet: 0.6, trade: 0.4, sacrifice: -2, storm: -1, check: -0.5, kingMove: -0.5 },
            remarks: [
                { when: 'centralization', text: 'Steinitz centralitza una peça: va ensenyar que la posició es construeix pas a pas.' },
                { when: 'development', text: 'Steinitz desplega una peça: acumular petits avantatges era la base de la seva escola.' },
                { when: 'trade', text: 'Steinitz canvia peces: el seu joc buscava conservar el petit avantatge que havia guanyat.' }
            ]
        },
        {
            id: 'lasker', name: 'Emanuel Lasker', short: 'Lasker', spoken: 'Làsker', born: 1868, died: 1941, country: 'Alemanya',
            bio: 'Campió del món durant 27 anys (1894–1921), el regnat més llarg de la història.',
            style: 'lluita pràctica, defensa tenaç i problemes constants per al rival',
            engine: 'lozza', engineWhy: 'cerca curta que crea complicacions tàctiques, com la seva lluita pràctica', tactical: false,
            weights: { threat: 1.4, captureValue: 0.6, rookFile: 1, centralization: 0.6, check: 0.4, trade: -0.3 },
            remarks: [
                { when: 'threat', text: 'Lasker crea una amenaça: era un gran lluitador i plantejava problemes pràctics al rival.' },
                { when: 'sacrifice', text: 'Lasker ofereix material: jugava tant contra el rival com contra la posició.' },
                { when: 'rookFile', text: 'Lasker activa una torre: la defensa tenaç i el contraatac formaven part del seu joc.' }
            ]
        },
        {
            id: 'capablanca', name: 'José Raúl Capablanca', short: 'Capablanca', spoken: 'Capablanca', born: 1888, died: 1942, country: 'Cuba',
            bio: 'Cubà, campió del món entre 1921 i 1927, mestre de la claredat i de la tècnica de final.',
            style: 'claredat, simplificació i tècnica de final',
            engine: 'stockfish', engineWhy: 'tria, entre jugades gairebé iguals, la que simplifica i aclareix', tactical: false,
            weights: { trade: 1, tradeAhead: 2, tradeBehind: -1, centralization: 1, quiet: 0.6, rookFile: 1.2, development: 1, castle: 1.5, sacrifice: -2, storm: -1.2, check: -0.5 },
            remarks: [
                { when: 'trade', text: 'Capablanca canvia peces: era un mestre en simplificar cap a un final favorable.' },
                { when: 'centralization', text: 'Capablanca centralitza una peça: la claredat posicional era el seu segell.' },
                { when: 'rookFile', text: 'Capablanca activa una torre: la seva tècnica de final és llegendària.' }
            ]
        },
        {
            id: 'alekhine', name: 'Alexander Alekhine', short: 'Alekhine', spoken: 'Aliókin', born: 1892, died: 1946, country: 'Rússia i França',
            bio: 'Campió del món el 1927–1935 i el 1937–1946, temut pels atacs combinatoris.',
            style: 'atacs combinatoris i complicacions profundes',
            engine: 'lozza', engineWhy: 'cerca curta que busca combinacions, com els seus atacs', tactical: true,
            weights: { threat: 1.6, check: 1.5, sacrifice: 1.5, approach: 1, storm: 0.8, captureValue: 0.5, trade: -1.2 },
            remarks: [
                { when: 'threat', text: 'Alekhine crea una amenaça: era un especialista en combinacions complicades.' },
                { when: 'check', text: 'Alekhine dona escac: els seus atacs podien ser molt profunds.' },
                { when: 'sacrifice', text: 'Alekhine ofereix material: no li feia por sacrificar per obtenir l’atac.' }
            ]
        },
        {
            id: 'botvinnik', name: 'Mikhail Botvinnik', short: 'Botvinnik', spoken: 'Botvínnik', born: 1911, died: 1995, country: 'Unió Soviètica',
            bio: 'Campió del món en tres etapes entre 1948 i 1963 i impulsor de l’escola soviètica.',
            style: 'preparació sistemàtica, joc estratègic i control del centre',
            engine: 'stockfish', engineWhy: 'tria, entre jugades gairebé iguals, la més estratègica', tactical: false,
            weights: { development: 1.5, centralization: 1.4, rookFile: 1.8, castle: 1, quiet: 0.4, trade: 0.3, sacrifice: -1 },
            remarks: [
                { when: 'rookFile', text: 'Botvinnik activa una torre: la preparació sistemàtica era el segell de l’escola soviètica.' },
                { when: 'centralization', text: 'Botvinnik centralitza una peça: buscava el control del centre abans d’atacar.' },
                { when: 'castle', text: 'Botvinnik enroca: prioritzava una posició sòlida abans de llançar-se a l’atac.' }
            ]
        },
        {
            id: 'fischer', name: 'Bobby Fischer', short: 'Fischer', spoken: 'Fíxer', born: 1943, died: 2008, country: 'Estats Units',
            bio: 'Nord-americà, va guanyar el títol mundial el 1972 a Reykjavík.',
            style: 'precisió, obertures ben preparades i joc directe',
            engine: 'stockfish', engineWhy: 'juga amb precisió i tria jugades directes', tactical: false,
            weights: { development: 1.5, castle: 1.5, centralization: 1, rookFile: 1, threat: 0.8, check: 0.2, trade: 0.4, sacrifice: -0.6 },
            remarks: [
                { when: 'development', text: 'Fischer desplega una peça: la seva preparació d’obertura era impecable.' },
                { when: 'castle', text: 'Fischer enroca: la precisió en el desplegament era la base del seu joc.' },
                { when: 'threat', text: 'Fischer crea una amenaça: jugava de manera directa i precisa.' }
            ]
        },
        {
            id: 'karpov', name: 'Anatoly Karpov', short: 'Karpov', spoken: 'Kàrpov', born: 1951, died: null, country: 'Unió Soviètica i Rússia',
            bio: 'Campió del món entre 1975 i 1985, conegut per l’estrangulament posicional.',
            style: 'estrangulament posicional i prevenció del contrajoc',
            engine: 'stockfish', engineWhy: 'tria, entre jugades gairebé iguals, la que restringeix el rival', tactical: false,
            weights: { quiet: 1.2, centralization: 1.2, retreat: 0.8, kingMove: -1, storm: -1.5, sacrifice: -2.5, check: -1, trade: 0.5, development: 0.8, castle: 1.2 },
            remarks: [
                { when: 'quiet', text: 'Karpov fa una jugada tranquil·la: l’estrangulament posicional era la seva especialitat.' },
                { when: 'centralization', text: 'Karpov centralitza una peça: restringia el joc rival a poc a poc.' },
                { when: 'trade', text: 'Karpov canvia peces: simplificava quan això li treia el contrajoc al rival.' }
            ]
        },
        {
            id: 'kasparov', name: 'Garry Kasparov', short: 'Kasparov', spoken: 'Kaspàrov', born: 1963, died: null, country: 'Unió Soviètica i Rússia',
            bio: 'Campió del món entre 1985 i 2000, conegut per l’energia i la preparació d’obertures.',
            style: 'iniciativa, dinamisme i preparació d’obertures',
            engine: 'lozza', engineWhy: 'cerca curta d’instint tàctic, com la seva iniciativa', tactical: true,
            weights: { check: 1.5, storm: 1.5, sacrifice: 1, approach: 1.2, threat: 1, development: 1, trade: -0.8 },
            remarks: [
                { when: 'check', text: 'Kasparov dona escac: la iniciativa i el dinamisme definien el seu joc.' },
                { when: 'sacrifice', text: 'Kasparov ofereix material: sabia sacrificar per mantenir la iniciativa.' },
                { when: 'storm', text: 'Kasparov avança peons contra el rei rival: l’atac dinàmic era el seu estil.' }
            ]
        },
        {
            id: 'carlsen', name: 'Magnus Carlsen', short: 'Carlsen', spoken: 'Carlsen', born: 1990, died: null, country: 'Noruega',
            bio: 'Noruec, campió del món del 2013 al 2023 i amb el millor Elo mai registrat (2882).',
            style: 'joc universal, que pressiona posicions iguals i exprimeix els finals',
            engine: 'stockfish', engineWhy: 'tria, entre jugades gairebé iguals, la més universal i flexible', tactical: false,
            weights: { trade: 0.6, tradeAhead: 1.2, quiet: 0.8, centralization: 0.8, rookFile: 0.8, threat: 0.5, sacrifice: -1, storm: -0.4, development: 0.6 },
            remarks: [
                { when: 'trade', text: 'Carlsen canvia peces: és conegut per exprimir finals en posicions aparentment iguals.' },
                { when: 'rookFile', text: 'Carlsen activa una torre: la seva tècnica de final és molt reconeguda.' },
                { when: 'centralization', text: 'Carlsen centralitza una peça: un estil universal que s’adapta a cada posició.' }
            ]
        }
    ]);
    const BY_ID = {};
    LEGENDS.forEach(p => { BY_ID[p.id] = p; });
    const IDS = LEGENDS.map(p => p.id);

    // Condicions sobre els trets de tvMoveFeatures (stockfishtv.js). Només
    // fets comprovats amb chess.js: cap interpretació d'intencions.
    const TRAITS = {
        check: f => f.check === 1,
        sacrifice: f => f.sacrifice === 1,
        development: f => f.development === 1,
        castle: f => f.castle === 1,
        trade: f => f.trade === 1,
        rookFile: f => f.rookFile >= 1,
        centralization: f => f.centralization >= 1,
        storm: f => f.storm === 1,
        threat: f => f.threat >= 1,
        quiet: f => f.quiet === 1 && f.centralization >= 1,
        capture: f => f.captureValue >= 3,
        promotion: f => f.promotion === 1
    };

    // ------------------------------------------------------------------
    // Utilitats
    // ------------------------------------------------------------------
    function legend(id) { return Object.prototype.hasOwnProperty.call(BY_ID, id) ? BY_ID[id] : null; }
    function isId(id) { return typeof id === 'string' && legend(id) !== null; }
    function clone(x) { return JSON.parse(JSON.stringify(x)); }
    function rnd(random) { return typeof random === 'function' ? random : Math.random; }
    function shuffle(list, random) {
        const r = rnd(random), a = list.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(r() * (i + 1)) % (i + 1);
            const t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    }
    function pick(list, random) { return list[Math.floor(rnd(random)() * list.length) % list.length]; }
    function de(name) { return /^[AEIOUÀÈÉÍÒÓÚ]/i.test(name) ? 'd’' + name : 'de ' + name; }
    function fmt(n) { return String(n).replace('.', ','); }
    function points(n) { return fmt(n) + (n === 1 ? ' punt' : ' punts'); }
    const RESULTS = ['1-0', '0-1', '1/2'];

    // Com es pronuncien els noms a la veu catalana (Matxa i la veu del
    // dispositiu): grafia adaptada a la lectura catalana, amb l'accent on va
    // la síl·laba tònica (Fíxer, Kaspàrov, Aliókin…). El text a pantalla
    // conserva sempre el nom original; això només s'aplica a la locució.
    function speakNames(text) {
        let t = String(text == null ? '' : text);
        LEGENDS.forEach((p) => {
            if (p.spoken && p.spoken !== p.short) t = t.replace(new RegExp('\\b' + p.short + '\\b', 'g'), p.spoken);
        });
        return t;
    }

    // Perfil públic d'un jugador (per a la interfície i les proves).
    function roster() {
        return LEGENDS.map(p => ({ id: p.id, name: p.name, short: p.short, born: p.born, died: p.died, country: p.country,
            bio: p.bio, style: p.style, engine: p.engine, engineWhy: p.engineWhy, tactical: p.tactical }));
    }

    // ------------------------------------------------------------------
    // Calendari: lliga doble tots contra tots (mètode del cercle)
    // ------------------------------------------------------------------
    // Cada jornada aparella tots els jugadors. A la segona volta es repeteixen
    // les parelles amb els colors canviats: cada jugador té 9 partides amb
    // blanques i 9 amb negres, i cada parella es troba dues vegades.
    function buildFixtures(season, random) {
        const ids = shuffle(IDS, random);
        const n = ids.length;
        let rot = ids.slice(1);
        const legRounds = [];
        for (let r = 0; r < n - 1; r++) {
            const arr = [ids[0]].concat(rot);
            const games = [];
            for (let i = 0; i < n / 2; i++) {
                const a = arr[i], b = arr[n - 1 - i];
                games.push(((i + r) % 2 === 0) ? { white: a, black: b } : { white: b, black: a });
            }
            legRounds.push(games);
            rot = [rot[rot.length - 1]].concat(rot.slice(0, -1));
        }
        const first = shuffle(legRounds, random);
        const second = shuffle(legRounds, random).map(g => g.map(x => ({ white: x.black, black: x.white })));
        const fixtures = [];
        first.concat(second).forEach((games, k) => {
            games.forEach((g) => {
                fixtures.push({ id: season + ':' + g.white + '>' + g.black, round: k + 1, white: g.white, black: g.black,
                    result: null, plies: 0, reason: '' });
            });
        });
        return fixtures;
    }

    function newSeason(season, random) {
        const s = Number.isSafeInteger(season) && season >= 1 ? season : 1;
        return { version: 1, season: s, fixtures: buildFixtures(s, random), current: null, history: [], lastSeason: null };
    }

    function validFixtures(list, season) {
        if (!Array.isArray(list) || list.length !== CONFIG.SEASON_GAMES) return false;
        const pairs = new Set(), perRound = {};
        for (const f of list) {
            if (!f || !isId(f.white) || !isId(f.black) || f.white === f.black) return false;
            if (f.id !== season + ':' + f.white + '>' + f.black) return false;
            if (!Number.isInteger(f.round) || f.round < 1 || f.round > CONFIG.ROUNDS_PER_LEG * 2) return false;
            if (f.result !== null && !RESULTS.includes(f.result)) return false;
            pairs.add(f.white + '>' + f.black);
            perRound[f.round] = (perRound[f.round] || 0) + 1;
        }
        if (pairs.size !== CONFIG.SEASON_GAMES) return false;
        for (let r = 1; r <= CONFIG.ROUNDS_PER_LEG * 2; r++) if (perRound[r] !== CONFIG.PLAYERS / 2) return false;
        return true;
    }

    function cleanHistory(list) {
        return (Array.isArray(list) ? list : []).filter(h => h && Number.isSafeInteger(h.season) && isId(h.champion)
            && typeof h.points === 'number' && isFinite(h.points)).slice(0, CONFIG.HISTORY)
            .map(h => ({ season: h.season, champion: h.champion, points: h.points }));
    }

    function cleanLast(x) {
        if (!x || !Number.isSafeInteger(x.season) || !isId(x.champion) || typeof x.points !== 'number' || !isFinite(x.points)) return null;
        return { season: x.season, champion: x.champion, points: x.points, announced: x.announced === true };
    }

    // Estat desat → estat vàlid. Si el calendari no és coherent (o no hi ha
    // res desat), comença una lliga nova sense perdre l'historial vàlid.
    function normalize(raw, random) {
        const src = raw && typeof raw === 'object' ? raw : null;
        const season = src && Number.isSafeInteger(src.season) && src.season >= 1 ? src.season : 1;
        const history = cleanHistory(src && src.history);
        const last = cleanLast(src && src.lastSeason);
        if (!src || src.version !== 1 || !validFixtures(src.fixtures, season)) {
            const fresh = newSeason(season, random);
            fresh.history = history;
            fresh.lastSeason = last;
            return fresh;
        }
        const fixtures = src.fixtures.map(f => ({ id: f.id, round: f.round, white: f.white, black: f.black,
            result: f.result,
            plies: Number.isSafeInteger(f.plies) && f.plies >= 0 ? f.plies : 0,
            reason: typeof f.reason === 'string' ? f.reason.slice(0, 40) : '' }));
        const current = typeof src.current === 'string' && fixtures.some(f => f.id === src.current && !f.result) ? src.current : null;
        return { version: 1, season, fixtures, current, history, lastSeason: last };
    }

    // ------------------------------------------------------------------
    // Classificació
    // ------------------------------------------------------------------
    function table(state) {
        const rows = {};
        IDS.forEach((id) => { rows[id] = { id, name: legend(id).name, short: legend(id).short, played: 0, wins: 0, draws: 0, losses: 0, points: 0 }; });
        const h2h = {};
        const give = (a, b, p) => { h2h[a + '|' + b] = (h2h[a + '|' + b] || 0) + p; };
        ((state && state.fixtures) || []).forEach((f) => {
            if (!f.result) return;
            const w = rows[f.white], b = rows[f.black];
            w.played++; b.played++;
            if (f.result === '1-0') { w.wins++; b.losses++; w.points += 1; give(f.white, f.black, 1); }
            else if (f.result === '0-1') { b.wins++; w.losses++; b.points += 1; give(f.black, f.white, 1); }
            else { w.draws++; b.draws++; w.points += 0.5; b.points += 0.5; give(f.white, f.black, 0.5); give(f.black, f.white, 0.5); }
        });
        // Punts, després enfrontaments directes, victòries i ordre alfabètic.
        const out = IDS.map(id => rows[id]).sort((a, b) =>
            b.points - a.points
            || (h2h[b.id + '|' + a.id] || 0) - (h2h[a.id + '|' + b.id] || 0)
            || b.wins - a.wins
            || a.short.localeCompare(b.short, 'ca'));
        out.forEach((r, i) => { r.rank = i + 1; });
        return out;
    }

    function progress(state) {
        const fixtures = (state && state.fixtures) || [];
        const played = fixtures.filter(f => f.result).length;
        const pending = fixtures.filter(f => !f.result);
        const round = pending.length ? Math.min.apply(null, pending.map(f => f.round)) : CONFIG.ROUNDS_PER_LEG * 2;
        const inRound = fixtures.filter(f => f.round === round);
        return { season: state ? state.season : 1, round, rounds: CONFIG.ROUNDS_PER_LEG * 2,
            played, total: fixtures.length, roundPlayed: inRound.filter(f => f.result).length, roundTotal: inRound.length };
    }

    // ------------------------------------------------------------------
    // Partits: el següent (aleatori dins la jornada) i el resultat
    // ------------------------------------------------------------------
    function publicFixture(f) { return { id: f.id, round: f.round, white: f.white, black: f.black }; }

    // Tria a l'atzar una de les partides pendents de la jornada en curs. Es
    // recorda fins que es juga, perquè reobrir la TV no canviï el partit.
    function pickFixture(state, random) {
        let s = clone(state);
        let pending = s.fixtures.filter(f => !f.result);
        if (!pending.length) { s = normalize(null, random); pending = s.fixtures.slice(); }
        const round = Math.min.apply(null, pending.map(f => f.round));
        const inRound = pending.filter(f => f.round === round);
        let f = inRound.find(x => x.id === s.current);
        if (!f) { f = pick(inRound, random); s.current = f.id; }
        return { state: s, fixture: publicFixture(f) };
    }

    // «Nova partida»: la que estava en curs no es juga; se'n torna a triar una.
    function skipCurrent(state) {
        const s = clone(state);
        s.current = null;
        return s;
    }

    // Anota el resultat d'una partida. Retorna l'estat nou i què ha passat:
    // { recorded, roundDone, finished } on `finished` (si la lliga s'ha acabat)
    // porta { season, champion, points, table }. Llavors `state` ja és la lliga
    // nova (el calendari nou s'ordena amb `random`).
    function record(state, fixtureId, outcome, random) {
        const s = clone(state);
        const f = s.fixtures.find(x => x.id === fixtureId);
        const result = outcome && outcome.result;
        if (!f || f.result || !RESULTS.includes(result)) return { state: s, recorded: false, roundDone: false, finished: null };
        f.result = result;
        f.plies = Number.isSafeInteger(outcome.plies) && outcome.plies >= 0 ? outcome.plies : 0;
        f.reason = typeof outcome.reason === 'string' ? outcome.reason.slice(0, 40) : '';
        if (s.current === f.id) s.current = null;
        const roundDone = s.fixtures.filter(x => x.round === f.round).every(x => x.result);
        if (!s.fixtures.every(x => x.result)) return { state: s, recorded: true, roundDone, finished: null };
        const rows = table(s);
        const champion = rows[0];
        const finished = { season: s.season, champion: champion.id, points: champion.points, table: rows };
        const next = newSeason(s.season + 1, random);
        next.history = [{ season: s.season, champion: champion.id, points: champion.points }].concat(s.history).slice(0, CONFIG.HISTORY);
        next.lastSeason = { season: s.season, champion: champion.id, points: champion.points, announced: false };
        return { state: next, recorded: true, roundDone: true, finished };
    }

    // La presentació de la lliga nova ja ha esmentat el campió anterior.
    function markAnnounced(state) {
        const s = clone(state);
        if (s.lastSeason) s.lastSeason.announced = true;
        return s;
    }

    // ------------------------------------------------------------------
    // Textos: presentació, resultat i observacions durant la partida
    // ------------------------------------------------------------------
    function rankOf(rows, id) { const r = rows.find(x => x.id === id); return r || null; }

    // Variant d'una llista segons un enter (sempre dins de la llista).
    function variant(list, n) { return list[((Math.floor(n) % list.length) + list.length) % list.length]; }

    // Què hi ha en joc: lloc i punts de cada jugador ara i, si guanyés, on
    // quedaria (amb el desempat de la lliga). Ho calcula sobre una còpia.
    function stakes(state, fixtureId) {
        const f = state && Array.isArray(state.fixtures) ? state.fixtures.find(x => x.id === fixtureId) : null;
        if (!f || f.result) return null;
        const now = table(state);
        const after = (result) => {
            const out = record(state, fixtureId, { result: result }, () => 0.5);
            return out.finished ? out.finished.table : table(out.state);
        };
        const ifW = after('1-0'), ifB = after('0-1');
        const side = (id, rows) => {
            const a = rankOf(now, id), b = rankOf(rows, id);
            return { id: id, rank: a.rank, points: a.points, played: a.played, ifWin: b.rank, ifWinPoints: b.points };
        };
        return { played: progress(state).played, table: now, w: side(f.white, ifW), b: side(f.black, ifB) };
    }

    // On és un jugador: «és líder amb 3 punts», «comparteix el primer lloc amb
    // 3 punts» (si algú altre en té els mateixos) o «és al lloc 4 amb 2 punts».
    function placeOf(row, rows) {
        const top = Array.isArray(rows) && rows.length ? rows[0].points : row.points;
        const shared = Array.isArray(rows) && rows.filter(r => r.points === top).length > 1;
        if (row.points === top && shared) return 'comparteix el primer lloc amb ' + points(row.points);
        if (row.rank === 1) return 'és líder amb ' + points(row.points);
        return 'és al lloc ' + row.rank + ' amb ' + points(row.points);
    }
    // Els dos jugadors de la partida a la classificació, en una frase.
    function pairStanding(wShort, rw, bShort, rb, rows) {
        const a = placeOf(rw, rows), b = placeOf(rb, rows);
        if (a === b && /^comparteix/.test(a)) return wShort + ' i ' + bShort + ' comparteixen el primer lloc amb ' + points(rw.points) + '.';
        return wShort + ' ' + a + '; ' + bShort + ' ' + b + '.';
    }

    // Què passaria si guanya un dels dos (només fets calculats).
    function stakesConsequence(st) {
        if (!st) return '';
        for (const c of ['w', 'b']) {
            const x = st[c], p = legend(x.id);
            if (x.rank !== 1 && x.ifWin === 1) return 'Si guanya ' + p.short + ', passarà a liderar la lliga.';
        }
        const rows = Array.isArray(st.table) ? st.table : [];
        for (const c of ['w', 'b']) {
            const x = st[c], p = legend(x.id);
            if (x.rank === 1 && /^és líder/.test(placeOf(x, rows))) return p.short + ' defensa el liderat.';
        }
        const best = ['w', 'b'].map(c => st[c]).sort((a, b) => (b.rank - b.ifWin) - (a.rank - a.ifWin))[0];
        if (best && best.ifWin < best.rank) return 'Una victòria portaria ' + legend(best.id).short + ' fins al lloc ' + best.ifWin + '.';
        return '';
    }

    // Presentació d'una partida en forma de diàleg: l'Èlia presenta (lliga,
    // jornada, noms i colors) i en Grau hi afegeix un detall que va canviant
    // (estils, classificació, qui són o el campió de la lliga anterior). El
    // motor i el nivell de cada jugador no surten mai: són interns del sistema.
    // Retorna { text, turns }; `turns` és el diàleg (presenter / analyst).
    function introDialogue(ctx) {
        const c = ctx || {};
        const W = legend(c.white), B = legend(c.black);
        if (!W || !B) {
            const plain = 'Comença una partida de la lliga de llegendes.';
            return { text: plain, turns: null };
        }
        const seq = Number.isInteger(c.seq) ? c.seq : 1;
        const rows = Array.isArray(c.table) ? c.table : [];
        const season = c.season || 1, round = c.round || 1, rounds = c.rounds || CONFIG.ROUNDS_PER_LEG * 2;
        const heads = [
            'Lliga de llegendes, lliga ' + season + ', jornada ' + round + ' de ' + rounds + ': ' + W.short + ' amb les blanques contra ' + B.short + '.',
            'Jornada ' + round + ' de la lliga ' + season + ': ' + W.short + ' porta les blanques i ' + B.short + ', les negres.',
            'Torna la lliga de llegendes, jornada ' + round + ': les blanques són ' + de(W.short) + ' i les negres, ' + de(B.short) + '.',
            'Comença una nova partida de la jornada ' + round + ': ' + W.short + ' contra ' + B.short + ', amb ' + W.short + ' a les blanques.'
        ];
        const head = variant(heads, seq);
        const details = [];
        const rw = rankOf(rows, W.id), rb = rankOf(rows, B.id);
        if (c.lastSeason && !c.lastSeason.announced && legend(c.lastSeason.champion)) {
            details.push({ ask: 'Grau, com va acabar l’última lliga?',
                say: 'Acaba de començar una lliga nova: la lliga ' + c.lastSeason.season + ' va ser per a '
                    + legend(c.lastSeason.champion).short + ', amb ' + points(c.lastSeason.points) + '.' });
        } else {
            details.push({ ask: variant(['Grau, quin duel ens espera?', 'Què n’esperes, Grau?', 'Grau, com es presenta la partida?'], seq + 1),
                say: 'Un duel d’estils. ' + W.short + ': ' + W.style + '. ' + B.short + ': ' + B.style + '.' });
            if (rw && rb && (rw.played || rb.played)) {
                const tail = stakesConsequence(c.stakes);
                details.push({ ask: variant(['Com arriben a la partida, Grau?', 'Grau, com està la classificació?', 'Què hi ha en joc, Grau?'], seq),
                    say: pairStanding(W.short, rw, B.short, rb, rows) + (tail ? ' ' + tail : '') });
            }
            // El motor i el nivell de cada jugador són interns: es parla de qui són.
            details.push({ ask: variant(['Grau, ens recordes qui són?', 'Qui són, Grau?'], seq),
                say: W.short + ': ' + lowerFirst(W.bio) + ' ' + B.short + ': ' + lowerFirst(B.bio) });
        }
        // El detall gira a part del començament: es recorren totes les combinacions.
        const k = c.lastSeason && !c.lastSeason.announced ? 0 : Math.max(0, Math.floor((seq - 1) / heads.length)) % details.length;
        const d = details[k];
        return { text: head + ' ' + d.say,
            turns: [{ role: 'presenter', text: head + ' ' + d.ask, solo: head }, { role: 'analyst', text: d.say }] };
    }

    // Text de la presentació (una sola veu).
    function intro(ctx) { return introDialogue(ctx).text; }

    // Resum curt en acabar la partida, amb la nova classificació.
    function resultNote(ctx) {
        const c = ctx || {};
        const W = legend(c.white), B = legend(c.black);
        if (!W || !B || !RESULTS.includes(c.result)) return '';
        const rows = Array.isArray(c.table) ? c.table : [];
        const before = Array.isArray(c.before) ? c.before : [];
        const parts = [];
        if (c.result === '1/2') {
            parts.push('Taules entre ' + W.short + ' i ' + B.short + ': mig punt per a cadascú.');
            const rw = rankOf(rows, W.id), rb = rankOf(rows, B.id);
            if (rw && rb) parts.push(pairStanding(W.short, rw, B.short, rb, rows));
        } else {
            const win = c.result === '1-0' ? W : B, lose = c.result === '1-0' ? B : W;
            parts.push('Victòria ' + de(win.short) + ' davant ' + de(lose.short) + '.');
            const now = rankOf(rows, win.id), was = rankOf(before, win.id);
            if (now) {
                const place = placeOf(now, rows);
                if (/^és líder/.test(place)) parts.push(win.short + ' lidera la lliga amb ' + points(now.points) + '.');
                else if (/^comparteix/.test(place)) parts.push(win.short + ' ' + place + '.');
                else if (was && was.rank > now.rank) parts.push(win.short + ' puja al lloc ' + now.rank + ' amb ' + points(now.points) + '.');
                else parts.push(win.short + ' és al lloc ' + now.rank + ' amb ' + points(now.points) + '.');
            }
        }
        if (c.roundDone) parts.push('Acaba la jornada ' + c.round + '.');
        if (c.finished && legend(c.finished.champion)) {
            parts.push('Acaba la lliga ' + c.finished.season + ': ' + legend(c.finished.champion).short
                + ' és el campió amb ' + points(c.finished.points) + '. Comença la lliga ' + (c.finished.season + 1) + '.');
        }
        return parts.join(' ');
    }

    // El tancament en forma de diàleg: l'Èlia diu el resultat i pregunta per la
    // classificació; en Grau la resumeix. Mateixos fets que `resultNote`.
    function resultDialogue(ctx) {
        const text = resultNote(ctx);
        if (!text) return { text: '', turns: null };
        const parts = text.match(/[^.]+\.(?:\s|$)/g) || [text];
        if (parts.length < 2) return { text: text, turns: null };
        const first = parts[0].trim(), rest = parts.slice(1).join('').trim();
        const asks = ['Com queda la classificació, Grau?', 'Grau, què vol dir per a la lliga?', 'I a la classificació, Grau?'];
        const n = (ctx && Number.isInteger(ctx.seq) ? ctx.seq : first.length);
        return { text: text, turns: [{ role: 'presenter', text: first + ' ' + variant(asks, n), solo: first }, { role: 'analyst', text: rest }] };
    }

    function lowerFirst(text) { const t = String(text || ''); return t.charAt(0).toLowerCase() + t.slice(1); }

    // Una línia sobre l'estil del jugador (informació fixa). El motor i el
    // nivell amb què juga són interns del sistema: no es diuen mai.
    function profileLine(id) {
        const p = legend(id);
        if (!p) return '';
        return p.short + ', en una frase: ' + p.style + '.';
    }

    function emptyRemarkMemory() { return { last: -100, count: 0, profile: { w: false, b: false }, used: [], stakes: false, edge: false, attack: { w: false, b: false }, slump: false, slips: 0, slipLast: -100 }; }

    // Imprecisions i errors (humanitzacio.js, classifyLoss): els comentaristes els
    // distingeixen per la variació REAL de l'avaluació (l'anàlisi de Stockfish) i,
    // si la jugada és compatible amb la manera de jugar del jugador, ho relacionen.
    // Només diuen fets: la classe (anàlisi), i el que la jugada és (chess.js).
    // Mai no atribueixen la jugada a res intern ni inventen conseqüències.
    const SLIP_ASKS = {
        imprecisio: [n => 'Diries que ' + n + ' ha comès una imprecisió?', n => 'Grau, és la millor jugada, aquesta de ' + n + '?'],
        error: [n => 'Això és un error de ' + n + ', Grau?', n => 'Grau, s’ha equivocat ' + n + '?'],
        errorGreu: [n => 'Grau, això és molt greu per a ' + n + '?', n => 'Un error de ' + n + '? Què ha passat, Grau?']
    };
    const SLIP_ANSWERS = {
        imprecisio: ['Sí, una imprecisió: l’anàlisi preferia una altra jugada, tot i que la diferència és petita.',
            'Una imprecisió, sí: n’hi havia una altra de lleugerament millor.'],
        error: ['Sí, és un error: l’anàlisi preferia una altra jugada i ara el rival hi guanya perspectives.',
            'Sí: perquè ara el rival disposa d’una continuació que abans no tenia.'],
        errorGreu: ['Sí, és un error greu: l’avaluació canvia de manera clara a favor del rival.',
            'Sí, i important: la posició passa a ser clarament millor per al rival.']
    };
    // La relació amb l'estil, només amb fets de la jugada (comprovats amb chess.js).
    const SLIP_LINKS = {
        iniciativa: 'Busca la iniciativa, com és propi del seu estil, però l’anàlisi preferia una altra jugada.',
        riscRei: 'És una jugada que toca l’entorn del seu propi rei, i això es paga.',
        materialSac: 'Ofereix material a canvi d’activitat, i l’anàlisi no ho troba prou compensat.',
        simplifica: 'Opta per simplificar amb un canvi de peces, però l’anàlisi preferia una altra opció.',
        passiva: 'Escull una jugada passiva quan n’hi havia una de més activa.',
        complicacio: 'Va cap a la complicació, que li agrada, però no era la millor continuació.',
        estructura: 'A més, la jugada deixa els peons en pitjor estat.',
        maniobraLenta: 'Prefereix una maniobra tranquil·la quan hi havia una jugada més directa.'
    };
    const SLIP_FIRST_PLY = 14, SLIP_GAP = 8, SLIP_MAX = 3;

    // Defalliment (stockfishtv.js, tvPlanSlump): un jugador baixa de precisió.
    const SLUMP_ASKS = [
        n => 'Grau, ' + n + ' sembla menys precís. Què li passa?',
        n => 'Què li passa a ' + n + ', Grau? No sembla el mateix.'
    ];
    const SLUMP_ANSWER = (n, mv) => 'Des de la jugada ' + mv + ', ' + n + ' juga amb menys precisió: ja no calcula com abans. Ara és més fàcil que s’equivoqui.';

    // Fase d'atac (stockfishtv.js, tvLateAttack): per què s'hi entra i què fa cada motor.
    const ATTACK_ASKS = {
        stalled: n => 'Fa estona que no hi ha captures ni moviments de peó. Grau, com ho pot desencallar ' + n + '?',
        repetition: n => 'Les posicions es comencen a repetir. Grau, què farà ' + n + '?',
        long: n => 'La partida s’allarga. Grau, què canvia ara per a ' + n + '?'
    };
    const ATTACK_ANSWERS = {
        stockfish: n => n + ' entra en fase d’atac: arrisca amb jugades més actives, encara que no siguin les més segures, per fer avançar la partida.',
        lozza: n => n + ' entra en fase d’atac: calcula més profund per trobar com fer avançar la partida.'
    };

    const PROFILE_ASKS = [
        n => 'Grau, què hem d’esperar ' + de(n) + '?',
        n => 'Com juga ' + n + ' en aquesta lliga, Grau?',
        n => 'Grau, recorda’ns com juga ' + n + '.',
        n => 'I ' + n + ', Grau? Quin és el seu joc?'
    ];
    // L'Èlia ja ha dit el nom amb el fet: la pregunta no el repeteix (tret d'una).
    const TRAIT_ASKS = [
        () => 'És el seu segell, Grau?',
        () => 'Molt típic, oi, Grau?',
        n => 'Grau, això és ' + n + ' en estat pur?',
        () => 'Ho reconeixes, Grau?',
        () => 'Grau, et sona aquesta manera de jugar?'
    ];
    const TRAIT_OPENERS = ['Sí: ', 'I tant: ', 'Exacte: ', 'Ben vist: '];
    const STAKES_ASKS = ['Grau, què hi ha en joc en aquesta partida?', 'Com arriben a aquesta partida, Grau?',
        'Grau, com afecta la classificació aquesta partida?'];
    const EDGE_ASKS = [n => 'Si ' + n + ' acaba guanyant, com quedaria la lliga, Grau?',
        n => 'Grau, què li suposaria a ' + n + ' guanyar aquesta partida?'];

    // Observacions sobre els jugadors durant la partida, en forma de diàleg
    // (l'Èlia pregunta i en Grau respon). Per ordre: el motor i el perfil del
    // jugador que mou (informació fixa); què hi ha en joc a la classificació
    // (calculat a `stakes`); si un bàndol té un avantatge decisiu segons
    // l'anàlisi, on el portaria guanyar; i un tret històric només quan la
    // jugada el compleix (comprovat amb chess.js). Mai no diu caselles.
    // ctx = { ply, color, features, ids: {w,b}, engines: {w,b}, stakes, edge,
    //         lead (frase de l'Èlia sobre la jugada, opcional), prepared, end,
    //         slip: { cls: 'imprecisio'|'error'|'errorGreu', link } (opcional) }
    // Retorna { memory, remark: { kind, color, id, text, turns } | null }.
    function remark(ctx, memory) {
        const c = ctx || {};
        const m = Object.assign(emptyRemarkMemory(), memory || {});
        m.profile = Object.assign({ w: false, b: false }, m.profile || {});
        m.used = Array.isArray(m.used) ? m.used.slice() : [];
        m.attack = Object.assign({ w: false, b: false }, m.attack || {});
        const none = { memory: m, remark: null };
        if (c.end || c.prepared || !Number.isInteger(c.ply) || !['w', 'b'].includes(c.color)) return none;
        // Una imprecisió o un error real (variació de l'avaluació) es comenta amb el seu nom.
        if (c.slip && SLIP_ASKS[c.slip.cls] && c.ply >= SLIP_FIRST_PLY && c.ply - (m.slipLast || -100) >= SLIP_GAP && (m.slips || 0) < SLIP_MAX) {
            const who = legend(c.ids && c.ids[c.color]);
            if (who) {
                const lead0 = typeof c.lead === 'string' && c.lead.trim() ? c.lead.trim() + ' ' : '';
                const k = c.ply + (m.slips || 0);
                const link = c.slip.link && SLIP_LINKS[c.slip.link] ? ' ' + SLIP_LINKS[c.slip.link] : '';
                const answer = variant(SLIP_ANSWERS[c.slip.cls], k) + link;
                m.slips = (m.slips || 0) + 1;
                m.slipLast = c.ply;
                m.last = Math.max(m.last, c.ply - CONFIG.REMARK_GAP_PLIES + 4);
                return { memory: m, remark: { kind: 'slip', color: c.color, id: who.id, text: answer,
                    turns: [{ role: 'presenter', text: lead0 + variant(SLIP_ASKS[c.slip.cls], k)(who.short), solo: lead0.trim() || null }, { role: 'analyst', text: answer }] } };
            }
        }
        if (c.ply < CONFIG.REMARK_FIRST_PLY || c.ply - m.last < CONFIG.REMARK_GAP_PLIES || m.count >= CONFIG.REMARKS_PER_GAME) return none;
        const p = legend(c.ids && c.ids[c.color]);
        if (!p) return none;
        const engine = c.engines && c.engines[c.color] ? c.engines[c.color] : p.engine;
        const lead = typeof c.lead === 'string' && c.lead.trim() ? c.lead.trim() + ' ' : '';
        const n = c.ply + m.count;
        let out = null;
        if (!m.profile[c.color]) {
            const answer = profileLine(p.id);
            out = { kind: 'profile', text: answer,
                turns: [{ role: 'presenter', text: lead + variant(PROFILE_ASKS, n)(p.short), solo: lead.trim() || null }, { role: 'analyst', text: answer }] };
            m.profile[c.color] = true;
        } else if (c.slump && !m.slump && legend(c.ids && c.ids[c.slump.color]) && c.ply >= c.slump.fromPly) {
            // Un dels dos ha començat a jugar amb menys precisió: es diu una sola vegada.
            const who = legend(c.ids[c.slump.color]);
            const answer = SLUMP_ANSWER(who.short, Math.floor(c.slump.fromPly / 2) + 1);
            out = { kind: 'slump', text: answer, id: who.id,
                turns: [{ role: 'presenter', text: lead + variant(SLUMP_ASKS, n)(who.short), solo: lead.trim() || null }, { role: 'analyst', text: answer }] };
            m.slump = true;
        } else if (c.attack && ATTACK_ASKS[c.attack[c.color]] && !m.attack[c.color]) {
            // El jugador que mou acaba d'entrar en fase d'atac: es diu una sola vegada.
            const answer = ATTACK_ANSWERS[engine === 'lozza' ? 'lozza' : 'stockfish'](p.short);
            out = { kind: 'attack', text: answer,
                turns: [{ role: 'presenter', text: lead + ATTACK_ASKS[c.attack[c.color]](p.short), solo: lead.trim() || null }, { role: 'analyst', text: answer }] };
            m.attack[c.color] = true;
        } else if (c.edge && !m.edge && c.stakes && c.stakes[c.edge]) {
            const x = c.stakes[c.edge], who = legend(x.id);
            const answer = x.ifWin === 1 ? (x.rank === 1 ? 'Es mantindria al primer lloc' : 'Pujaria al primer lloc') + ', amb ' + points(x.ifWinPoints) + '.'
                : 'Passaria al lloc ' + x.ifWin + ' amb ' + points(x.ifWinPoints) + (x.ifWin < x.rank ? ', ' + (x.rank - x.ifWin === 1 ? 'un lloc' : (x.rank - x.ifWin) + ' llocs') + ' més amunt.' : '.');
            out = { kind: 'edge', text: 'Si ' + who.short + ' guanya, ' + answer.charAt(0).toLowerCase() + answer.slice(1),
                turns: [{ role: 'presenter', text: lead + variant(EDGE_ASKS, n)(who.short), solo: lead.trim() || null }, { role: 'analyst', text: answer }] };
            m.edge = true;
        } else if (!m.stakes && c.stakes && c.ply >= CONFIG.REMARK_FIRST_PLY + 6) {
            const W = legend(c.stakes.w.id), B = legend(c.stakes.b.id);
            if (W && B) {
                const answer = c.stakes.played
                    ? pairStanding(W.short, c.stakes.w, B.short, c.stakes.b, c.stakes.table) + (stakesConsequence(c.stakes) ? ' ' + stakesConsequence(c.stakes) : '')
                    : 'És la primera partida de la lliga: tothom comença amb zero punts.';
                out = { kind: 'stakes', text: answer,
                    turns: [{ role: 'presenter', text: lead + variant(STAKES_ASKS, n), solo: lead.trim() || null }, { role: 'analyst', text: answer }] };
                m.stakes = true;
            }
        }
        if (!out && c.features) {
            const r = p.remarks.find(x => TRAITS[x.when] && TRAITS[x.when](c.features) && !m.used.includes(p.id + ':' + x.when));
            if (r) {
                const cut = r.text.indexOf(': ');
                const fact = cut > 0 ? r.text.slice(0, cut) + '.' : r.text;
                const reason = cut > 0 ? r.text.slice(cut + 2) : '';
                const answer = reason ? variant(TRAIT_OPENERS, n) + reason : fact;
                // L'Èlia diu el fet que mostra el tret (escac, canvi…): la pregunta hi fa referència.
                const ask = fact + ' ' + variant(TRAIT_ASKS, n)(p.short);
                out = { kind: 'trait', text: r.text, turns: [{ role: 'presenter', text: ask, solo: fact }, { role: 'analyst', text: answer }] };
                m.used.push(p.id + ':' + r.when);
            }
        }
        if (!out) return none;
        m.last = c.ply;
        m.count++;
        return { memory: m, remark: Object.assign({ color: c.color, id: p.id }, out, out.id ? { id: out.id } : {}) };
    }

    return {
        VERSION, KEY, CONFIG, LEGENDS, IDS, ENGINE_NAME, TRAITS,
        legend, roster, speakNames, buildFixtures, newSeason, normalize, table, progress,
        pickFixture, skipCurrent, record, markAnnounced,
        intro, introDialogue, stakes, resultNote, resultDialogue, placeOf, profileLine, remark, emptyRemarkMemory, de, points
    };
});
