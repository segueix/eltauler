// Lliga de llegendes TV · mòdul pur (llegendes.js): perfils, calendari de lliga
// doble, classificació, rotació de lliga i textos amb els noms dels jugadors.
const { Chess } = require('chess.js');
const L = require('../llegendes');
const TV = require('../stockfishtv');

// Generador de nombres pseudoaleatoris reproduïble (mulberry32).
function seeded(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const SQUARE = /\b[a-h][1-8]\b/;

describe('Lliga de llegendes · els 10 perfils', () => {
    test('hi ha 10 jugadors diferents amb nom, biografia i estil', () => {
        expect(L.LEGENDS).toHaveLength(10);
        expect(new Set(L.IDS).size).toBe(10);
        expect(new Set(L.LEGENDS.map(p => p.name)).size).toBe(10);
        L.LEGENDS.forEach((p) => {
            expect(p.name).toContain(p.short);
            expect(p.bio.length).toBeGreaterThan(30);
            expect(p.style.length).toBeGreaterThan(10);
            expect(p.born).toBeGreaterThan(1800);
            expect(p.died === null || p.died > p.born).toBe(true);
        });
    });

    test('cada jugador té el motor que li escau, i s’usen tots dos motors', () => {
        const engines = L.LEGENDS.map(p => p.engine);
        engines.forEach(e => expect(['stockfish', 'lozza']).toContain(e));
        expect(engines).toContain('stockfish');
        expect(engines).toContain('lozza');
        // Els jugadors d'atac i combinació juguen amb Lozza (cerca curta); la
        // resta, amb Stockfish, que admet un perfil d'estil.
        ['morphy', 'alekhine', 'kasparov'].forEach(id => expect(L.legend(id).engine).toBe('lozza'));
        ['capablanca', 'karpov', 'carlsen', 'botvinnik'].forEach(id => expect(L.legend(id).engine).toBe('stockfish'));
        L.LEGENDS.forEach(p => expect(p.engineWhy.length).toBeGreaterThan(10));
    });

    test('els pesos del perfil només fan servir trets que tvMoveFeatures calcula', () => {
        const features = Object.keys(TV.tvMoveFeatures(Chess, new Chess().fen(), 'e2e4', 0));
        L.LEGENDS.forEach((p) => {
            expect(Object.keys(p.weights).length).toBeGreaterThan(3);
            Object.keys(p.weights).forEach(k => expect(features).toContain(k));
        });
    });

    test('les observacions parlen del jugador, amb un tret comprovable i sense caselles', () => {
        L.LEGENDS.forEach((p) => {
            expect(p.remarks.length).toBeGreaterThanOrEqual(3);
            p.remarks.forEach((r) => {
                expect(Object.keys(L.TRAITS)).toContain(r.when);
                expect(r.text.startsWith(p.short)).toBe(true);
                expect(r.text).not.toMatch(SQUARE);
            });
            expect(L.profileLine(p.id)).toContain(p.short);
            expect(L.profileLine(p.id)).not.toMatch(SQUARE);
        });
    });

    test('el perfil públic no exposa els pesos interns', () => {
        const roster = L.roster();
        expect(roster).toHaveLength(10);
        roster.forEach(p => { expect(p.weights).toBeUndefined(); expect(p.remarks).toBeUndefined(); });
    });
});

describe('Lliga de llegendes · calendari de dues voltes', () => {
    const fixtures = L.buildFixtures(1, seeded(7));

    test('90 partides: cada parella ordenada una sola vegada', () => {
        expect(fixtures).toHaveLength(90);
        const pairs = new Set(fixtures.map(f => f.white + '>' + f.black));
        expect(pairs.size).toBe(90);
        fixtures.forEach(f => expect(f.white).not.toBe(f.black));
    });

    test('cada parella es troba dues vegades, una amb cada color', () => {
        const key = (a, b) => [a, b].sort().join('|');
        const seen = {};
        fixtures.forEach((f) => { (seen[key(f.white, f.black)] = seen[key(f.white, f.black)] || []).push(f.white); });
        expect(Object.keys(seen)).toHaveLength(45);
        Object.values(seen).forEach((whites) => {
            expect(whites).toHaveLength(2);
            expect(whites[0]).not.toBe(whites[1]);
        });
    });

    test('18 jornades de 5 partides i tothom juga a cada jornada', () => {
        for (let r = 1; r <= 18; r++) {
            const games = fixtures.filter(f => f.round === r);
            expect(games).toHaveLength(5);
            const players = games.flatMap(f => [f.white, f.black]);
            expect(new Set(players).size).toBe(10);
        }
    });

    test('cada jugador fa 9 partides amb blanques i 9 amb negres', () => {
        L.IDS.forEach((id) => {
            expect(fixtures.filter(f => f.white === id)).toHaveLength(9);
            expect(fixtures.filter(f => f.black === id)).toHaveLength(9);
        });
    });

    test('el sorteig és aleatori però reproduïble amb la mateixa llavor', () => {
        const a = L.buildFixtures(1, seeded(11)).map(f => f.id).join();
        const b = L.buildFixtures(1, seeded(11)).map(f => f.id).join();
        const c = L.buildFixtures(1, seeded(12)).map(f => f.id).join();
        expect(a).toBe(b);
        expect(a).not.toBe(c);
    });

    test('un calendari vàlid no es regenera en normalitzar-lo', () => {
        const state = L.newSeason(3, seeded(5));
        expect(L.normalize(JSON.parse(JSON.stringify(state)), seeded(99))).toEqual(state);
    });
});

describe('Lliga de llegendes · partits i classificació', () => {
    test('els partits surten a l’atzar dins de la jornada en curs i no canvien fins que es juguen', () => {
        let state = L.newSeason(1, seeded(3));
        const first = L.pickFixture(state, seeded(1));
        expect(first.fixture.round).toBe(1);
        // Reobrir la TV no canvia el partit en curs.
        const again = L.pickFixture(first.state, seeded(2));
        expect(again.fixture.id).toBe(first.fixture.id);
        // «Nova partida» abandona el partit en curs i se'n tria un altre de la jornada.
        const skipped = L.pickFixture(L.skipCurrent(first.state), seeded(4));
        expect(skipped.fixture.round).toBe(1);
        state = skipped.state;
        // Fins que la jornada 1 no s'acaba, no es passa a la 2.
        const ids = [];
        for (let i = 0; i < 5; i++) {
            const p = L.pickFixture(state, seeded(10 + i));
            expect(p.fixture.round).toBe(1);
            ids.push(p.fixture.id);
            state = L.record(p.state, p.fixture.id, { result: '1/2', plies: 30 }, seeded(1)).state;
        }
        expect(new Set(ids).size).toBe(5);
        expect(L.pickFixture(state, seeded(20)).fixture.round).toBe(2);
        expect(L.progress(state)).toMatchObject({ round: 2, played: 5, total: 90, roundPlayed: 0, roundTotal: 5 });
    });

    test('la classificació suma 1 per victòria i ½ per taules', () => {
        let state = L.newSeason(1, seeded(3));
        const a = state.fixtures[0], b = state.fixtures[1];
        let out = L.record(state, a.id, { result: '1-0', plies: 40, reason: 'checkmate' }, seeded(1));
        expect(out.recorded).toBe(true);
        state = out.state;
        state = L.record(state, b.id, { result: '1/2', plies: 90 }, seeded(1)).state;
        const rows = L.table(state);
        const byId = Object.fromEntries(rows.map(r => [r.id, r]));
        expect(byId[a.white]).toMatchObject({ played: 1, wins: 1, points: 1 });
        expect(byId[a.black]).toMatchObject({ played: 1, losses: 1, points: 0 });
        expect(byId[b.white]).toMatchObject({ draws: 1, points: 0.5 });
        expect(rows[0].id).toBe(a.white);
        expect(rows.map(r => r.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });

    test('un resultat no es compta dues vegades ni accepta valors estranys', () => {
        const state = L.newSeason(1, seeded(3));
        const f = state.fixtures[0];
        const once = L.record(state, f.id, { result: '0-1', plies: 20 }, seeded(1));
        expect(L.record(once.state, f.id, { result: '1-0', plies: 20 }, seeded(1)).recorded).toBe(false);
        expect(L.record(state, f.id, { result: 'guanyen', plies: 20 }, seeded(1)).recorded).toBe(false);
        expect(L.record(state, 'no-existeix', { result: '1-0' }, seeded(1)).recorded).toBe(false);
        expect(L.progress(once.state).played).toBe(1);
    });

    test('amb els mateixos punts decideix l’enfrontament directe', () => {
        let state = L.newSeason(1, seeded(3));
        const [x, y] = ['capablanca', 'alekhine'];
        const games = state.fixtures.filter(f => [f.white, f.black].every(id => [x, y].includes(id)));
        expect(games).toHaveLength(2);
        // x guanya y; y guanya un tercer jugador i x en perd un altre: mateixos punts.
        const first = games.find(f => f.white === x), second = games.find(f => f.white === y);
        state = L.record(state, first.id, { result: '1-0' }, seeded(1)).state;
        state = L.record(state, second.id, { result: '1/2' }, seeded(1)).state;
        const rows = L.table(state);
        expect(rows.findIndex(r => r.id === x)).toBeLessThan(rows.findIndex(r => r.id === y));
    });
});

describe('Lliga de llegendes · final de lliga i lliga nova', () => {
    function playSeason(state, resultFor, random) {
        let out = null;
        let cur = state;
        for (let i = 0; i < 90; i++) {
            const p = L.pickFixture(cur, random);
            out = L.record(p.state, p.fixture.id, { result: resultFor(i, p.fixture), plies: 50, reason: 'checkmate' }, random);
            cur = out.state;
            if (i < 89) expect(out.finished).toBeNull();
        }
        return out;
    }

    test('quan tothom ha jugat dues vegades amb tothom, la lliga s’acaba i en comença una de nova', () => {
        const start = L.newSeason(1, seeded(1));
        // Un jugador (Carlsen) ho guanya tot: serà el campió amb 18 punts.
        const out = playSeason(start, (i, f) => f.white === 'carlsen' ? '1-0' : f.black === 'carlsen' ? '0-1' : '1/2', seeded(8));
        expect(out.finished).toMatchObject({ season: 1, champion: 'carlsen', points: 18 });
        expect(out.finished.table).toHaveLength(10);
        expect(out.finished.table[0].played).toBe(18);
        expect(out.roundDone).toBe(true);
        const next = out.state;
        expect(next.season).toBe(2);
        expect(next.fixtures).toHaveLength(90);
        expect(next.fixtures.every(f => f.result === null)).toBe(true);
        expect(next.fixtures[0].id.startsWith('2:')).toBe(true);
        expect(next.history).toEqual([{ season: 1, champion: 'carlsen', points: 18 }]);
        expect(next.lastSeason).toEqual({ season: 1, champion: 'carlsen', points: 18, announced: false });
        expect(L.table(next).every(r => r.played === 0)).toBe(true);
        expect(L.markAnnounced(next).lastSeason.announced).toBe(true);
    });

    test('l’historial conserva les últimes lligues', () => {
        let state = L.newSeason(1, seeded(1));
        for (let s = 0; s < 3; s++) state = playSeason(state, () => '1/2', seeded(30 + s)).state;
        expect(state.season).toBe(4);
        expect(state.history.map(h => h.season)).toEqual([3, 2, 1]);
    });

    test('un estat desat corrupte comença una lliga nova sense perdre l’historial vàlid', () => {
        const history = [{ season: 4, champion: 'fischer', points: 12 }, { season: 3, champion: 'no-existeix', points: 1 }];
        const broken = { version: 1, season: 5, fixtures: [{ id: 'x' }], history, current: 'x', lastSeason: null };
        const fixed = L.normalize(broken, seeded(2));
        expect(fixed.season).toBe(5);
        expect(fixed.fixtures).toHaveLength(90);
        expect(fixed.history).toEqual([{ season: 4, champion: 'fischer', points: 12 }]);
        [null, undefined, 'text', 42, [], { version: 2 }].forEach((raw) => {
            const s = L.normalize(raw, seeded(2));
            expect(s.season).toBe(1);
            expect(s.fixtures).toHaveLength(90);
        });
    });

    test('rebutja calendaris amb una parella repetida o un resultat invàlid', () => {
        const good = L.newSeason(1, seeded(2));
        const dup = JSON.parse(JSON.stringify(good));
        dup.fixtures[1] = Object.assign({}, dup.fixtures[0]);
        expect(L.normalize(dup, seeded(3)).fixtures.map(f => f.id)).not.toEqual(dup.fixtures.map(f => f.id));
        const bad = JSON.parse(JSON.stringify(good));
        bad.fixtures[0].result = 'victòria';
        expect(L.normalize(bad, seeded(3)).fixtures.every(f => f.result === null)).toBe(true);
        const polluted = JSON.parse('{"version":1,"season":2,"fixtures":[],"__proto__":{"x":1},"history":[]}');
        expect(L.normalize(polluted, seeded(3)).x).toBeUndefined();
    });
});

describe('Lliga de llegendes · textos amb els noms', () => {
    const table = L.table(L.newSeason(1, seeded(3)));

    test('la presentació diu els dos noms, els colors i la jornada, sense caselles', () => {
        for (let seq = 1; seq <= 12; seq++) {
            const text = L.intro({ white: 'capablanca', black: 'alekhine', season: 2, round: 5, rounds: 18, seq, table });
            expect(text).toContain('Capablanca');
            expect(text).toContain('Alekhine');
            expect(text).toMatch(/jornada 5/i);
            expect(text).not.toMatch(SQUARE);
            expect(text.split(/\s+/).length).toBeLessThan(60);
        }
        const texts = new Set([1, 2, 3, 4, 5, 6].map(seq => L.intro({ white: 'tal-no', black: 'carlsen', season: 1, round: 1, rounds: 18, seq })));
        expect(texts.size).toBe(1); // un jugador desconegut no s'inventa: text genèric
        const variants = new Set([1, 2, 3, 4, 5, 6].map(seq => L.intro({ white: 'fischer', black: 'karpov', season: 1, round: 2, rounds: 18, seq, table })));
        expect(variants.size).toBeGreaterThan(3);
    });

    test('la presentació diu amb quin motor juga cadascú i, amb Lozza caigut, el motor real', () => {
        const texts = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(seq => L.intro({ white: 'morphy', black: 'karpov', season: 1, round: 1, rounds: 18, seq,
            engines: { w: 'lozza', b: 'stockfish' }, table }));
        expect(texts.some(t => t.includes('Morphy juga amb Lozza; Karpov, amb Stockfish'))).toBe(true);
        const down = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(seq => L.intro({ white: 'morphy', black: 'karpov', season: 1, round: 1, rounds: 18, seq,
            engines: { w: 'stockfish', b: 'stockfish' }, table }));
        expect(down.some(t => t.includes('Morphy juga amb Stockfish'))).toBe(true);
        expect(down.some(t => t.includes('amb Lozza'))).toBe(false);
    });

    test('una lliga nova anuncia el campió de l’anterior (una sola vegada)', () => {
        const last = { season: 1, champion: 'carlsen', points: 14.5, announced: false };
        const text = L.intro({ white: 'steinitz', black: 'lasker', season: 2, round: 1, rounds: 18, seq: 1, table, lastSeason: last });
        expect(text).toContain('la lliga 1 va ser per a Carlsen, amb 14,5 punts');
        const later = L.intro({ white: 'steinitz', black: 'lasker', season: 2, round: 2, rounds: 18, seq: 2, table, lastSeason: Object.assign({}, last, { announced: true }) });
        expect(later).not.toContain('va ser per a');
    });

    test('el resultat explica qui guanya, la classificació i el final de jornada o de lliga', () => {
        const before = table;
        let state = L.newSeason(1, seeded(3));
        const f = state.fixtures[0];
        const out = L.record(state, f.id, { result: '1-0' }, seeded(1));
        const note = L.resultNote({ white: f.white, black: f.black, result: '1-0', round: 1, table: L.table(out.state), before, roundDone: false });
        expect(note).toContain('Victòria');
        expect(note).toContain(L.legend(f.white).short + ' lidera la lliga amb 1 punt');
        const draw = L.resultNote({ white: 'karpov', black: 'carlsen', result: '1/2', round: 3, table, before, roundDone: true });
        expect(draw).toContain('Taules entre Karpov i Carlsen: mig punt per a cadascú.');
        // Amb tots dos a zero punts, comparteixen el primer lloc: no es diu que un sigui líder.
        expect(draw).toContain('Karpov i Carlsen comparteixen el primer lloc amb 0 punts.');
        expect(draw).toContain('Acaba la jornada 3.');
        const end = L.resultNote({ white: 'alekhine', black: 'fischer', result: '0-1', round: 18, table, before, roundDone: true,
            finished: { season: 4, champion: 'fischer', points: 13, table } });
        expect(end).toContain('Victòria de Fischer davant d’Alekhine.');
        expect(end).toContain('Acaba la lliga 4: Fischer és el campió amb 13 punts. Comença la lliga 5.');
    });

    test('elisió correcta davant de noms que comencen per vocal', () => {
        expect(L.de('Alekhine')).toBe('d’Alekhine');
        expect(L.de('Capablanca')).toBe('de Capablanca');
        expect(L.points(1)).toBe('1 punt');
        expect(L.points(2.5)).toBe('2,5 punts');
        expect(L.points(0)).toBe('0 punts');
    });
});

describe('Lliga de llegendes · observacions durant la partida', () => {
    const ids = { w: 'capablanca', b: 'alekhine' };
    const engines = { w: 'stockfish', b: 'lozza' };
    const rich = { check: 0, sacrifice: 0, development: 0, castle: 0, trade: 1, rookFile: 0, centralization: 0, storm: 0, threat: 0, quiet: 0, captureValue: 3, promotion: 0 };

    test('no n’hi ha cap abans de la semijugada 10, amb una jugada preparada ni al final', () => {
        expect(L.remark({ ply: 4, color: 'w', features: rich, ids, engines }, null).remark).toBeNull();
        expect(L.remark({ ply: 12, color: 'w', features: rich, ids, engines, prepared: true }, null).remark).toBeNull();
        expect(L.remark({ ply: 12, color: 'w', features: rich, ids, engines, end: { result: '1-0' } }, null).remark).toBeNull();
        expect(L.remark({ ply: 12, color: 'x', features: rich, ids, engines }, null).remark).toBeNull();
    });

    test('primer el motor i el perfil del jugador que mou; després un tret comprovat', () => {
        const first = L.remark({ ply: 10, color: 'w', features: rich, ids, engines }, null);
        expect(first.remark).toMatchObject({ kind: 'profile', color: 'w', id: 'capablanca' });
        expect(first.remark.text).toContain('Capablanca juga amb Stockfish');
        // Massa aviat: cap observació fins que passin 10 semijugades.
        expect(L.remark({ ply: 14, color: 'w', features: rich, ids, engines }, first.memory).remark).toBeNull();
        const second = L.remark({ ply: 20, color: 'w', features: rich, ids, engines }, first.memory);
        expect(second.remark).toMatchObject({ kind: 'trait', id: 'capablanca' });
        expect(second.remark.text).toContain('Capablanca canvia peces');
        // El mateix tret no es repeteix dins la partida.
        const third = L.remark({ ply: 30, color: 'w', features: rich, ids, engines }, second.memory);
        expect(third.remark).toBeNull();
    });

    test('el tret només es diu si la jugada el compleix', () => {
        const start = L.remark({ ply: 10, color: 'b', features: null, ids, engines }, null);
        expect(start.remark.kind).toBe('profile');
        const quiet = Object.assign({}, rich, { trade: 0, captureValue: 0, quiet: 1 });
        // Alekhine: escac, amenaça i sacrifici; una jugada tranquil·la no n'activa cap.
        expect(L.remark({ ply: 21, color: 'b', features: quiet, ids, engines }, start.memory).remark).toBeNull();
        const check = L.remark({ ply: 21, color: 'b', features: Object.assign({}, quiet, { check: 1 }), ids, engines }, start.memory);
        expect(check.remark.text).toContain('Alekhine dona escac');
        expect(check.remark.text).not.toMatch(SQUARE);
    });

    test('si Lozza no es pot carregar, el perfil diu el motor real', () => {
        const out = L.remark({ ply: 10, color: 'b', features: null, ids, engines: { w: 'stockfish', b: 'stockfish' } }, null);
        expect(out.remark.text).toContain('Alekhine juga amb Stockfish');
        expect(out.remark.text).not.toContain('amb Lozza');
    });

    test('com a màxim unes quantes observacions per partida', () => {
        let memory = null, said = 0;
        for (let ply = 10; ply < 200; ply += 10) {
            const out = L.remark({ ply, color: ply % 20 === 0 ? 'w' : 'b',
                features: { check: 1, sacrifice: 1, threat: 1, development: 1, trade: 1, rookFile: 1, centralization: 1, castle: 1, storm: 1, quiet: 1 },
                ids, engines }, memory);
            memory = out.memory;
            if (out.remark) said++;
        }
        expect(said).toBeLessThanOrEqual(L.CONFIG.REMARKS_PER_GAME);
        expect(said).toBeGreaterThan(2);
    });
});

describe('Lliga de llegendes · veu, diàlegs i classificació en joc', () => {
    test('la veu pronuncia els noms amb grafia catalana; el text a pantalla no canvia', () => {
        expect(L.speakNames('Fischer, Kasparov i Alekhine contra Steinitz')).toBe('Fíxer, Kaspàrov i Aliókin contra Stàinits');
        expect(L.speakNames('Victòria d’Alekhine davant de Botvinnik.')).toBe('Victòria d’Aliókin davant de Botvínnik.');
        expect(L.speakNames('Capablanca i Carlsen')).toBe('Capablanca i Carlsen');
        L.LEGENDS.forEach(p => expect(typeof p.spoken).toBe('string'));
        // A la TV, la locució passa pel mateix filtre.
        expect(TV.tvSpeechText('Morphy juga amb Lozza; Karpov, amb Stockfish.')).toBe('Mòrfi juga amb Lozza; Kàrpov, amb Stock fish.');
    });

    test('la presentació és un diàleg: l’Èlia presenta i pregunta, en Grau respon', () => {
        const table = L.table(L.newSeason(1, seeded(3)));
        for (let seq = 1; seq <= 12; seq++) {
            const d = L.introDialogue({ white: 'fischer', black: 'karpov', season: 1, round: 2, rounds: 18, seq, table });
            expect(d.turns).toHaveLength(2);
            expect(d.turns[0]).toMatchObject({ role: 'presenter' });
            expect(d.turns[0].text).toMatch(/\?$/);
            expect(d.turns[0].text).toContain('Fischer');
            expect(d.turns[1].role).toBe('analyst');
            expect(d.turns[0].solo.endsWith('?')).toBe(false);
            expect(d.text).toBe(L.intro({ white: 'fischer', black: 'karpov', season: 1, round: 2, rounds: 18, seq, table }));
            d.turns.forEach(t => expect(t.text).not.toMatch(SQUARE));
        }
    });

    test('què hi ha en joc es calcula amb la classificació real (també el desempat)', () => {
        let state = L.newSeason(1, seeded(9));
        // Primera jornada: totes taules menys una victòria de les blanques.
        for (let i = 0; i < 5; i++) {
            const p = L.pickFixture(state, seeded(40 + i));
            state = L.record(p.state, p.fixture.id, { result: i === 0 ? '1-0' : '1/2' }, seeded(1)).state;
        }
        const p = L.pickFixture(state, seeded(50));
        const st = L.stakes(p.state, p.fixture.id);
        ['w', 'b'].forEach((c) => {
            const id = st[c].id, row = L.table(p.state).find(r => r.id === id);
            expect(st[c]).toMatchObject({ rank: row.rank, points: row.points });
            // Si guanya: la posició surt de la classificació calculada amb el resultat.
            const after = L.table(L.record(p.state, p.fixture.id, { result: c === 'w' ? '1-0' : '0-1' }, seeded(1)).state);
            expect(st[c].ifWin).toBe(after.find(r => r.id === id).rank);
            expect(st[c].ifWinPoints).toBe(row.points + 1);
        });
        expect(st.played).toBe(5);
        expect(L.stakes(p.state, 'no-existeix')).toBeNull();
    });

    test('el primer lloc compartit no es presenta com a liderat', () => {
        const rows = [{ id: 'a', rank: 1, points: 2 }, { id: 'b', rank: 2, points: 2 }, { id: 'c', rank: 3, points: 1 }];
        expect(L.placeOf(rows[0], rows)).toBe('comparteix el primer lloc amb 2 punts');
        expect(L.placeOf(rows[1], rows)).toBe('comparteix el primer lloc amb 2 punts');
        expect(L.placeOf(rows[2], rows)).toBe('és al lloc 3 amb 1 punt');
        const alone = [{ id: 'a', rank: 1, points: 3 }, { id: 'b', rank: 2, points: 2 }];
        expect(L.placeOf(alone[0], alone)).toBe('és líder amb 3 punts');
    });

    test('les observacions són diàlegs: perfil, què hi ha en joc, avantatge i tret', () => {
        let state = L.newSeason(1, seeded(9));
        for (let i = 0; i < 10; i++) {
            const p = L.pickFixture(state, seeded(60 + i));
            state = L.record(p.state, p.fixture.id, { result: ['1-0', '0-1', '1/2'][i % 3] }, seeded(1)).state;
        }
        const f = L.pickFixture(state, seeded(70)).fixture;
        const stakes = L.stakes(state, f.id);
        const ids = { w: f.white, b: f.black };
        const all = { check: 1, sacrifice: 1, threat: 1, development: 1, trade: 1, rookFile: 1, centralization: 1, castle: 1, storm: 1, quiet: 1 };
        let memory = null;
        const seen = [];
        for (let ply = 10; ply < 140; ply += 2) {
            const color = ply % 4 === 0 ? 'w' : 'b';
            const out = L.remark({ ply, color, features: all, ids, stakes, edge: ply >= 50 ? 'b' : null, lead: 'Les negres treuen el cavall.' }, memory);
            memory = out.memory;
            if (!out.remark) continue;
            seen.push(out.remark.kind);
            const turns = out.remark.turns;
            expect(turns).toHaveLength(2);
            expect(turns[0].role).toBe('presenter');
            expect(turns[1].role).toBe('analyst');
            turns.forEach(t => expect(t.text).not.toMatch(SQUARE));
            if (out.remark.kind === 'trait') {
                // L'Èlia diu el fet del tret i no hi enganxa una altra jugada.
                expect(turns[0].text).not.toContain('treuen el cavall');
                expect(turns[0].text.split(L.legend(out.remark.id).short).length - 1).toBeLessThanOrEqual(2);
            }
            if (out.remark.kind === 'stakes') expect(turns[1].text).toMatch(/lloc|líder/);
            if (out.remark.kind === 'edge') {
                expect(out.remark.id).toBe(f.black);
                expect(turns[1].text).toMatch(/lloc/);
            }
        }
        expect(seen).toContain('profile');
        expect(seen).toContain('stakes');
        expect(seen).toContain('edge');
        expect(seen).toContain('trait');
        // Cada mena d'informació fixa, un sol cop per partida.
        expect(seen.filter(k => k === 'stakes')).toHaveLength(1);
        expect(seen.filter(k => k === 'edge')).toHaveLength(1);
        expect(seen.length).toBeLessThanOrEqual(L.CONFIG.REMARKS_PER_GAME);
    });

    test('el tancament és un diàleg amb el resultat i la classificació', () => {
        const table = L.table(L.newSeason(1, seeded(3)));
        const d = L.resultDialogue({ white: 'alekhine', black: 'fischer', result: '0-1', round: 2, table, before: table, seq: 2 });
        expect(d.turns[0].text).toContain('Victòria de Fischer davant d’Alekhine.');
        expect(d.turns[0].text).toMatch(/\?$/);
        expect(d.turns[1].role).toBe('analyst');
        expect(d.text).toBe(L.resultNote({ white: 'alekhine', black: 'fischer', result: '0-1', round: 2, table, before: table, seq: 2 }));
    });
});

