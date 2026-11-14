// Escala de lligues (LLIGA.md §6): la localitat del jugador (localitats.js),
// del municipi al món, amb dos o tres grups per ELO a cada nivell.
const Core = require('../core');
const Loc = require('../localitats');
const Noms = require('../nomslliga');
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
        // 33: l'Horta Oest es va suprimir el 2022 (els seus municipis tornen a l'Horta Sud i Paterna, a la Nord).
        expect(Loc.comarques('val')).toHaveLength(33);
        expect(Loc.normalizeHome({ territory: 'val', municipi: 'Torrent', comarca: "l'Horta Oest" }))
            .toMatchObject({ comarca: "l'Horta Sud", provincia: 'València' });
        expect(Loc.provinceOfComarca('val', 'la Safor')).toBe('València');
        expect(Loc.provinceOfComarca('val', 'Safor')).toBe('València');
        expect(Loc.provinceOfComarca('bal', 'Menorca')).toBe('Illes Balears');
        expect(Loc.provinceOfComarca('franja', 'el Matarranya')).toBe('Terol');
        expect(Loc.municipalities('and')).toHaveLength(7);
        Loc.TERRITORIES.filter(t => t.id !== 'fora').forEach(t => expect(Loc.comarques(t.id).length).toBeGreaterThan(0));
    });

    test('normalizeHome: mana la llista; si el municipi no hi és, la comarca dona la província', () => {
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

    test('la part de la lliga que representa cada jugador: comarca, illa, territori o país', () => {
        const vic = Loc.normalizeHome({ municipi: 'Vic' });
        expect(Loc.originArea(1, vic, 'Manlleu')).toBe('');
        expect(Loc.originArea(2, vic, 'Manlleu')).toBe('Osona');
        expect(Loc.originArea(3, vic, 'Reus')).toBe('Baix Camp');
        expect(Loc.originArea(4, vic, 'Gandia')).toBe('País Valencià');
        expect(Loc.originArea(4, vic, 'Andorra la Vella')).toBe('Andorra');
        expect(Loc.originArea(4, vic, "l'Alguer")).toBe('');
        expect(Loc.originArea(5, vic, 'Lió')).toBe('França');
        expect(Loc.originArea(6, vic, 'Tòquio')).toBe('Japó');
        // El jugador: la seva comarca, el seu territori.
        expect(Loc.originArea(2, vic, 'Vic')).toBe('Osona');
        expect(Loc.originArea(4, vic, 'Vic')).toBe('Catalunya');
        expect(Loc.originArea(5, Loc.normalizeHome({ territory: 'bal', municipi: 'Sóller' }), 'Sóller')).toBe('Illes Balears');
        // Illes i Catalunya Nord; a la Catalana del Nord, també els del Principat.
        const palma = Loc.normalizeHome({ territory: 'bal', municipi: 'Palma' });
        expect(Loc.originArea(3, palma, 'Maó')).toBe('Menorca');
        const perpinya = Loc.normalizeHome({ territory: 'nord', municipi: 'Perpinyà' });
        expect(Loc.originArea(2, perpinya, 'Ceret')).toBe('Vallespir');
        expect(Loc.originArea(3, perpinya, 'Reus')).toBe('Baix Camp');
        // Una temporada d'abans, amb la comarca o el país com a origen: res a afegir.
        expect(Loc.originArea(2, vic, 'el Bages')).toBe('');
        expect(Loc.originArea(5, vic, 'França')).toBe('');
        // A les Illes, cada illa hi és: a la Balear, de Mallorca, Menorca, Eivissa i Formentera.
        let k = 3;
        const rnd = () => ((k = (k * 16807) % 2147483647) / 2147483647);
        for (let i = 0; i < 30; i++) {
            const islands = Loc.rivalOrigins(3, palma, 9, rnd).map(n => Loc.findMunicipality(n, 'bal').comarca);
            expect(new Set(islands)).toEqual(new Set(['Mallorca', 'Menorca', 'Eivissa', 'Formentera']));
            // Mallorca, la més gran, en té més.
            expect(islands.filter(x => x === 'Mallorca').length).toBeGreaterThanOrEqual(4);
        }
        // Amb menys rivals que parts, parts diferents.
        const five = Loc.rivalOrigins(4, vic, 5, rnd);
        expect(new Set(five.map(Loc.ppccCityTerritory)).size).toBe(5);
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
        // Provincial: poblacions de la província, cadascuna d'una comarca diferent.
        const provincial = Loc.rivalOrigins(2, vic, 9, rnd).map(n => Loc.findMunicipality(n));
        provincial.forEach(m => { expect(m.province).toBe('Barcelona'); expect(m.name).not.toBe('Vic'); });
        expect(new Set(provincial.map(m => m.comarca)).size).toBe(9);
        // Catalana: poblacions de les quatre províncies, de comarques diferents.
        const catalana = Loc.rivalOrigins(3, vic, 9, rnd).map(n => Loc.findMunicipality(n));
        expect(new Set(catalana.map(m => m.province)).size).toBe(4);
        expect(new Set(catalana.map(m => m.comarca)).size).toBe(9);
        // Països Catalans: ciutats de tots set territoris.
        const ppcc = Loc.rivalOrigins(4, vic, 9, rnd);
        ppcc.forEach(n => expect(Loc.PPCC_CITIES).toContain(n));
        expect(new Set(ppcc.map(Loc.ppccCityTerritory)).size).toBe(7);
        // Europa i món: una ciutat de cada país, tots diferents.
        const eu = Loc.rivalOrigins(5, vic, 9, rnd);
        eu.forEach(n => expect(Loc.EUROPE).toContain(Loc.cityCountry(n)));
        expect(new Set(eu.map(Loc.cityCountry)).size).toBe(9);
        Loc.rivalOrigins(6, vic, 9, rnd).forEach(n => expect(Loc.WORLD).toContain(Loc.cityCountry(n)));
        Loc.EUROPE.concat(Loc.WORLD).forEach(c => expect(Loc.COUNTRY_CITIES[c].length).toBeGreaterThanOrEqual(3));
        // Sense dades (fora dels Països Catalans), en blanc als nivells de casa.
        expect(Loc.rivalOrigins(1, { territory: 'fora', municipi: 'Lió', comarca: 'Roine' }, 9)).toEqual(Array(9).fill(''));
        // Una comarca amb menys municipis que rivals els repeteix.
        const aran = Loc.rivalOrigins(1, Loc.normalizeHome({ municipi: 'Vielha e Mijaran' }), 9, rnd);
        expect(aran).toHaveLength(9);
        aran.forEach(n => expect(n).toBeTruthy());
    });
});

describe('localitats: municipis dels altres territoris i orígens dels rivals', () => {
    let k = 0;
    const rnd = () => ((k = (k * 9301 + 49297) % 233280) / 233280);
    const home = (territory, municipi, comarca) => Loc.normalizeHome({ territory, municipi, comarca });

    test('municipis: 542 al País Valencià, 198 a la Catalunya Nord, 57 a la Franja i 67 a les Balears', () => {
        expect(Loc.municipalities('val')).toHaveLength(542);
        expect(Loc.municipalities('nord')).toHaveLength(198);
        expect(Loc.municipalities('franja')).toHaveLength(57);
        expect(Loc.municipalities('bal')).toHaveLength(67);
        ['val', 'nord', 'franja', 'bal'].forEach(t => {
            const list = Loc.municipalities(t);
            expect(new Set(list.map(m => m.name)).size).toBe(list.length);
            const coms = Loc.comarques(t).map(c => c.name);
            list.forEach(m => { expect(coms).toContain(m.comarca); expect(m.province).toBeTruthy(); });
        });
        // Cada comarca valenciana en té algun; a la Catalunya Nord, totes menys la Fenolleda (occitana).
        Loc.comarques('val').forEach(c => expect(Loc.municipalities('val').some(m => m.comarca === c.name)).toBe(true));
        expect(Loc.municipalities('nord').some(m => m.comarca === 'la Fenolleda')).toBe(false);
        // Mequinensa és del Baix Cinca però de la província de Saragossa.
        expect(Loc.findMunicipality('mequinensa', 'franja')).toMatchObject({ comarca: 'el Baix Cinca', province: 'Saragossa' });
        expect(home('val', 'gandia')).toMatchObject({ municipi: 'Gandia', comarca: 'la Safor', provincia: 'València' });
        expect(home('bal', 'es castell')).toMatchObject({ municipi: 'es Castell', comarca: 'Menorca' });
        expect(Loc.searchMunicipalities('vila-r', { territory: 'val' }).map(m => m.name)).toContain('Vila-real');
    });

    test('comarcal: municipis de la comarca (o de l\'illa), també fora de Catalunya', () => {
        Loc.rivalOrigins(1, home('val', 'Gandia'), 9, rnd).forEach(n => {
            expect(n).not.toBe('Gandia');
            expect(Loc.findMunicipality(n, 'val').comarca).toBe('la Safor');
        });
        Loc.rivalOrigins(1, home('nord', 'Prada'), 9, rnd).forEach(n => expect(Loc.findMunicipality(n, 'nord').comarca).toBe('el Conflent'));
        Loc.rivalOrigins(1, home('bal', 'Maó'), 9, rnd).forEach(n => expect(Loc.findMunicipality(n, 'bal').comarca).toBe('Menorca'));
        Loc.rivalOrigins(1, home('franja', 'Calaceit'), 9, rnd).forEach(n => expect(Loc.findMunicipality(n, 'franja').comarca).toBe('el Matarranya'));
        // Formentera (un sol municipi): els seus pobles. La Fenolleda: la Catalunya Nord.
        Loc.rivalOrigins(1, home('bal', 'Formentera'), 9, rnd).forEach(n => expect(n).toBeTruthy());
        Loc.rivalOrigins(1, home('nord', 'Sant Pau', 'la Fenolleda'), 9, rnd).forEach(n => expect(Loc.findMunicipality(n, 'nord')).toBeTruthy());
    });

    test('cap territori sense orígens fins als Països Catalans (ni l\'Alguer ni Andorra)', () => {
        const homes = [home('val', 'Gandia'), home('bal', 'Palma'), home('bal', 'Eivissa'), home('nord', 'Perpinyà'),
            home('and', 'Encamp'), home('franja', 'Fraga'), home('franja', 'Mequinensa'), home('alguer', "l'Alguer")];
        homes.forEach(h => [1, 2, 3].forEach(lv => {
            const o = Loc.rivalOrigins(lv, h, 9, rnd);
            expect(o).toHaveLength(9);
            o.forEach(n => expect(n).toBeTruthy());
        }));
    });

    test('provincial i territori: l\'àrea de cada lliga', () => {
        // Gimnèsies (Mallorca i Menorca) i Pitiüses (Eivissa i Formentera).
        Loc.rivalOrigins(2, home('bal', 'Palma'), 9, rnd)
            .forEach(n => expect(['Mallorca', 'Menorca']).toContain(Loc.findMunicipality(n, 'bal').comarca));
        Loc.rivalOrigins(2, home('bal', 'Eivissa'), 9, rnd)
            .forEach(n => expect(['Eivissa', 'Formentera']).toContain(Loc.findMunicipality(n, 'bal').comarca));
        expect(Loc.islandGroup('Menorca').name).toBe('les Gimnèsies');
        // La Catalunya Nord, i la Lliga Catalana amb rivals del Principat i del Nord.
        Loc.rivalOrigins(2, home('nord', 'Perpinyà'), 9, rnd).forEach(n => expect(Loc.findMunicipality(n, 'nord')).toBeTruthy());
        Loc.rivalOrigins(3, home('nord', 'Perpinyà'), 9, rnd)
            .forEach(n => expect(['nord', 'cat']).toContain(Loc.originTerritory(n)));
        // La Franja: municipis de la Franja de la mateixa província.
        Loc.rivalOrigins(2, home('franja', 'Mequinensa'), 9, rnd)
            .forEach(n => expect(Loc.findMunicipality(n, 'franja').province).toBe('Saragossa'));
        // L'Alguer: la Nurra, la província de Sàsser i Sardenya; mai l'Alguer.
        [1, 2, 3].forEach(lv => Loc.rivalOrigins(lv, home('alguer', "l'Alguer"), 9, rnd)
            .forEach(n => expect(n).not.toBe("l'Alguer")));
        expect(Loc.rivalOrigins(3, home('alguer', "l'Alguer"), 9, rnd)).not.toContain('Fertilia');
    });

    test('noms dels rivals: a l\'Alguer, cognoms catalans algueresos (i sards de la Nurra a Sardenya); a la Catalana del Nord, segons d\'on són', () => {
        let s = 3;
        const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
        const alguer = home('alguer', "l'Alguer");
        const share = (level, code) => {
            let n = 0;
            for (let i = 0; i < 2000; i++) if (Noms.cultureFor(level, alguer, 'Sàsser', { random: r }) === code) n++;
            return n / 2000;
        };
        // A la lliga de l'Alguer, tots algueresos; com més amunt, més sards
        // (i alguns italians), però la majoria sempre amb cognom alguerès.
        expect(share(0, 'alguer')).toBe(1);
        expect(share(1, 'alguer')).toBeGreaterThan(0.8);
        expect(share(3, 'alguer')).toBeGreaterThan(0.5);
        expect(share(3, 'sard')).toBeGreaterThan(0.25);
        expect(share(3, 'it')).toBeGreaterThan(0);
        const perpinya = home('nord', 'Perpinyà');
        const opts = { random: () => 0.99, territoryOf: Loc.originTerritory };
        expect(Noms.cultureFor(3, perpinya, 'Vic', opts)).toBe('cat');
        expect(Noms.cultureFor(3, perpinya, 'Prada', opts)).toBe('nord');
    });
});

describe('noms dels rivals: cap nom castellà a les lligues dels Països Catalans', () => {
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const opts = { random: rnd, territoryOf: Loc.originTerritory };
    const HOMES = [['cat', 'Vic'], ['val', 'Gandia'], ['bal', 'Palma'], ['and', 'Andorra la Vella'], ['nord', 'Perpinyà'],
        ['franja', 'Fraga'], ['alguer', "l'Alguer"]].map(([territory, municipi]) => Loc.normalizeHome({ territory, municipi }));
    const castilianTokens = new Set(Object.keys(Noms.CATALAN_FORMS));
    const words = list => list.join(' ').split(' ');

    test('del municipal als Països Catalans, des de cada territori: ni noms castellans ni formes castellanes', () => {
        HOMES.forEach(home => {
            for (let lv = 0; lv <= 4; lv++) {
                for (let k = 0; k < 120; k++) {
                    const names = Noms.rivalNames(lv, home, Loc.rivalOrigins(lv, home, 9, rnd), opts);
                    names.forEach(n => expect(Noms.isCastilianName(n)).toBe(false));
                    words(names).forEach(w => expect(castilianTokens.has(w)).toBe(false));
                }
            }
        });
        // Cap territori no barreja cap cultura castellana, i les llistes del
        // territori ja no tenen les formes castellanes d'abans.
        Object.values(Noms.DIVERSE).forEach(list => list.forEach(([code]) => expect(Noms.CASTILIAN_CULTURES).not.toContain(code)));
        Object.values(Noms.TERRITORY_CULTURE).forEach(code => {
            const c = Noms.CULTURES[code];
            words(c.f.concat(c.m, c.s)).forEach(w => expect(castilianTokens.has(w)).toBe(false));
        });
    });

    test('encara hi ha gent d’altres orígens i llengües (no castellans), i el castellà es manté a fora', () => {
        const vic = HOMES[0];
        const counts = {};
        for (let k = 0; k < 400; k++) {
            Noms.rivalNames(3, vic, [], Object.assign({ count: 9 }, opts)).forEach(n => {
                const code = ['cat', 'ma', 'ro', 'cn', 'pk'].find(c => {
                    const cu = Noms.CULTURES[c];
                    const p = n.split(' ');
                    const given = cu.order === 'family' ? p[p.length - 1] : p[0];
                    return cu.f.concat(cu.m).includes(given);
                });
                counts[code] = (counts[code] || 0) + 1;
            });
        }
        // A la Catalana, un 12 % d'altres orígens (40 % × 30 %): la resta, catalans.
        const total = Object.values(counts).reduce((a, b) => a + b, 0);
        expect(counts.cat / total).toBeGreaterThan(0.84);
        ['ma', 'ro', 'cn', 'pk'].forEach(c => expect(counts[c]).toBeGreaterThan(0));
        // Europa i món, i qui juga des de fora: els noms del país, castellans inclosos.
        expect(Noms.countryCulture('Espanya')).toBe('es');
        Noms.rivalNames(5, vic, Array(9).fill('Espanya'), opts).forEach(n => expect(Noms.isCastilianName(n)).toBe(true));
        const madrid = { territory: 'fora', municipi: 'Madrid', pais: 'Espanya' };
        Noms.rivalNames(2, madrid, [], Object.assign({ count: 9 }, opts)).forEach(n => expect(Noms.isCastilianName(n)).toBe(true));
    });

    test('temporades començades: el nom castellà d’un rival passa a català, del seu territori', () => {
        const vic = HOMES[0];
        let k = 5;
        const fixed = { random: () => ((k = (k * 16807) % 2147483647) / 2147483647), territoryOf: Loc.originTerritory };
        const taken = new Set();
        const got = Noms.catalanRivalName('Lucía Navarro', 2, vic, 'Manlleu', Object.assign({ taken }, fixed));
        expect(Noms.isCastilianName(got)).toBe(false);
        expect(Noms.CULTURES.cat.f.concat(Noms.CULTURES.cat.m)).toContain(got.split(' ')[0]);
        expect(taken.has(Noms.fold(got))).toBe(true);
        // No en repeteix cap de pres.
        const again = Noms.catalanRivalName('Sergio López', 2, vic, 'Manlleu', Object.assign({ taken }, fixed));
        expect(again).not.toBe(got);
        // Als Països Catalans, del territori de la ciutat del rival.
        const pal = Noms.catalanRivalName('Laura Romero', 4, vic, 'Palma', { random: () => 0.6, territoryOf: Loc.originTerritory });
        expect(Noms.CULTURES.bal.s).toContain(pal.split(' ').slice(1).join(' '));
        // Les formes castellanes d'abans, a la catalana; la resta no es toca.
        const gandia = HOMES[1];
        expect(Noms.catalanRivalName('Paco Soriano', 0, gandia, null)).toBe('Cento Fuster');
        expect(Noms.catalanRivalName('Carmen Blasco', 0, HOMES[5], null)).toBe('Carme Calvet');
        expect(Noms.catalanRivalName('Jordi Puig', 3, vic, 'Reus')).toBe('Jordi Puig');
        expect(Noms.catalanRivalName('Youssef Benali', 3, vic, 'Reus')).toBe('Youssef Benali');
        // Les formes convertides es reserven abans de donar noms nous: «Amparo
        // Calatayud» passa a «Fina Ribes», i cap nom nou no hi coincideix
        // encara que l'atzar l'hi porti.
        const gandiaHome = HOMES[1];
        const forced = [0.1, 0.01, 8.5 / 35];
        let lcg = 7;
        const rand = () => (forced.length ? forced.shift() : ((lcg = (lcg * 16807) % 2147483647) / 2147483647));
        const pair = Noms.catalanRivalNames([{ name: 'Iván Delgado', origin: '' }, { name: 'Amparo Calatayud', origin: '' }], 0, gandiaHome, { random: rand });
        expect(pair[1]).toBe('Fina Ribes');
        expect(pair[0]).not.toBe('Fina Ribes');
        expect(Noms.isCastilianName(pair[0])).toBe(false);
        // A Europa i per a qui juga des de fora, tal com era.
        expect(Noms.catalanRivalName('Lucía Navarro', 5, vic, 'Espanya')).toBe('Lucía Navarro');
        expect(Noms.catalanRivalName('Lucía Navarro', 2, { territory: 'fora', pais: 'Espanya' }, null)).toBe('Lucía Navarro');
    });
});

describe('a l\'app: la lliga a l\'escala', () => {
    function appCtx({ career = null, base = 1000, league = null, underway = false, noms = true } = {}) {
        const store = career ? { chess_leagueCareer: JSON.stringify(career) } : {};
        const ctx = vm.createContext({
            ElTaulerCore: Core, JSON, Math, Date, Number, Array, Object, Set,
            window: { ElTaulerLocalitats: Loc, ElTaulerNomsLliga: noms ? Noms : undefined },
            localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
            ELO_MIN: 200, ELO_MAX: 2000, LEAGUE_CAREER_KEY: 'chess_leagueCareer', LEAGUE_CAREER_MAX_SEASONS: 30,
            TIME_CONTROLS: [{ id: 'none' }, { id: '3+2' }],
            getPendingLeagueTimeControlId: () => 'none', getLeagueTimeControlId: () => (ctx.currentLeague && ctx.currentLeague.timeControl) || 'none',
            getLeagueBaseRating: () => base, newLeagueBotRepertoire: () => ({ white: null, blackE4: null, blackD4: null }),
            leagueRoundUnderway: () => underway, saveStorage() {},
            currentLeague: league, leagueActiveMatch: null
        });
        vm.runInContext(constSource('LEAGUE_FALLBACK_NAMES'), ctx);
        vm.runInContext('const LEAGUE_RECENT_NAMES_MAX = 54;', ctx);
        ['shuffleArray', 'buildRoundRobinSchedule', 'loadLeagueCareer', 'saveLeagueCareer', 'createNewLeague',
            'isLeagueTimeControlLocked', 'leagueNotStartedYet', 'upgradeLegacyLeague', 'refreshLeagueLadderGroup', 'saveLeagueHome',
            'mulberry32', 'catalanizeLeagueRivals']
            .forEach(n => vm.runInContext(fnSource(n), ctx));
        return { ctx, store };
    }
    const vic = { territory: 'cat', municipi: 'Vic', comarca: 'Osona', provincia: 'Barcelona', pais: '' };

    test('sense trajectòria: es comença a la C de la lliga del territori (com a mínim)', () => {
        const { ctx } = appCtx({ base: 1000 });
        const L = ctx.createNewLeague(true);
        // El grup ja no surt de l'ELO, i no es comença a la lliga local: la
        // Lliga Catalana C (sense localitat, la catalana), rivals de −12.
        expect(L.ladder).toEqual({ level: 3, group: 'C', tier: 9 });
        expect(L.divisionShift).toBe(-12);
        expect(L.name).toBe('Lliga Catalana · Divisió C');
        expect(L.division).toBeUndefined();
        const bots = L.players.filter(p => p.id !== 'me');
        expect(bots).toHaveLength(9);
        bots.forEach(p => expect(Loc.findMunicipality(p.from)).toBeTruthy());
        const avg = bots.reduce((s, p) => s + p.elo, 0) / 9;
        expect(Math.abs(avg - 988)).toBeLessThan(15);
    });

    test('amb la localitat al País Valencià: Lliga Valenciana C, amb rivals de poblacions de les tres províncies', () => {
        const gandia = { territory: 'val', municipi: 'Gandia', comarca: 'la Safor', provincia: 'València', pais: '' };
        const L = appCtx({ career: { home: gandia, seasons: [] }, base: 1200 }).ctx.createNewLeague(true);
        expect(L.name).toBe('Lliga Valenciana · Divisió C');
        const towns = L.players.filter(p => p.id !== 'me').map(p => Loc.findMunicipality(p.from, 'val'));
        towns.forEach(m => expect(m).toBeTruthy());
        expect(new Set(towns.map(m => m.province))).toEqual(new Set(['Castelló', 'València', 'Alacant']));
        expect(new Set(towns.map(m => m.comarca)).size).toBe(9);
    });

    test('amb la localitat: noms del lloc, rivals de la comarca i noms del país d\'origen a Europa', () => {
        // Trajectòria d'abans dels graons (només el nivell): comença a la C.
        // Ja havia jugat a la Catalana (millor nivell 3) i havia baixat: no es puja.
        const { ctx } = appCtx({ career: { level: 1, bestLevel: 3, home: vic, seasons: [] }, base: 1150 });
        const L = ctx.createNewLeague(true);
        expect(L.ladder).toEqual({ level: 1, group: 'C', tier: 3 });
        expect(L.divisionShift).toBe(-84);
        expect(L.name).toBe("Lliga Comarcal d'Osona · Divisió C");
        expect(L.players.find(p => p.id === 'me').from).toBe('Vic');
        L.players.filter(p => p.id !== 'me').forEach(p => expect(Loc.findMunicipality(p.from).comarca).toBe('Osona'));
        // Noms de persona (nom i cognom), tots diferents.
        const names = L.players.filter(p => p.id !== 'me').map(p => p.name);
        expect(new Set(names).size).toBe(9);
        names.forEach(n => expect(n).toMatch(/^\S+ \S/));

        const eu = appCtx({ career: { tier: 16, home: vic, seasons: [] }, base: 1500 }).ctx.createNewLeague(true);
        expect(eu.name).toBe('Lliga Europea · Divisió B');
        eu.players.filter(p => p.id !== 'me').forEach(p => {
            expect(Loc.EUROPE).toContain(Loc.cityCountry(p.from));
            // El nom és del país de la ciutat del rival.
            const c = Noms.CULTURES[Noms.countryCulture(Loc.cityCountry(p.from))];
            const parts = c.order === 'family' ? p.name.split(' ').reverse() : p.name.split(' ');
            expect(c.f.concat(c.m)).toContain(parts[0]);
        });
    });

    test('els noms canvien de temporada en temporada: cap de les sis darreres es repeteix', () => {
        const { ctx, store } = appCtx({ career: { level: 0, home: vic, seasons: [] } });
        const seen = [];
        for (let k = 0; k < 6; k++) {
            const names = ctx.createNewLeague(true).players.filter(p => p.id !== 'me').map(p => p.name);
            names.forEach(n => expect(seen).not.toContain(n));
            seen.push(...names);
        }
        const recent = JSON.parse(store.chess_leagueCareer).recentNames;
        expect(recent).toHaveLength(54);
        expect(recent).toEqual(seen.slice(-54));
    });

    test('sense el mòdul de noms, els àlies de reserva', () => {
        const L = appCtx({ noms: false }).ctx.createNewLeague(true);
        L.players.filter(p => p.id !== 'me').forEach(p => expect(p.name).toMatch(/^[A-ZÀ-Ú][\wàèéíòóúç·]+$/i));
    });

    test('el grup és el graó: no canvia encara que la referència canviï abans de començar', () => {
        const { ctx } = appCtx({ career: { tier: 1, bestTier: 9, home: vic, seasons: [] }, base: 1000 });
        ctx.createNewLeague(true);
        expect(ctx.currentLeague.name).toBe('Lliga de Vic · Divisió B');
        ctx.currentLeague.baseRating = 600;
        ctx.refreshLeagueLadderGroup();
        expect(ctx.currentLeague.ladder.group).toBe('B');
        expect(ctx.currentLeague.name).toBe('Lliga de Vic · Divisió B');

        // Una lliga d'abans dels graons (sense `tier`) es recalcula com sempre.
        ctx.currentLeague.ladder = { level: 0, group: 'B' };
        ctx.currentLeague.divisionShift = -120;
        ctx.refreshLeagueLadderGroup();   // 600 − 120 = 480: grup C
        expect(ctx.currentLeague.ladder.group).toBe('C');
    });

    test('desar la localitat torna a sortejar la lliga no començada; la començada es manté', () => {
        const { ctx, store } = appCtx({ base: 1000 });
        ctx.createNewLeague(true);
        const before = ctx.currentLeague.id;
        ctx.saveLeagueHome(vic);
        expect(JSON.parse(store.chess_leagueCareer).home).toEqual(vic);
        expect(ctx.currentLeague.name).toBe('Lliga Catalana · Divisió C');
        expect(ctx.currentLeague.players.find(p => p.id === 'me').from).toBe('Vic');

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
        expect(fresh.currentLeague.ladder).toEqual({ level: 3, group: 'C', tier: 9 });
        expect(fresh.currentLeague.timeControl).toBe('3+2');

        const started = appCtx({ league: Object.assign(legacy(), { currentRound: 4 }) }).ctx;
        expect(started.upgradeLegacyLeague()).toBe(false);
        expect(started.currentLeague.id).toBe('old');

        const paused = appCtx({ league: legacy(), underway: true }).ctx;
        expect(paused.upgradeLegacyLeague()).toBe(false);
    });

    test('la trajectòria llegeix nivell, millor nivell i localitat (i les velles, sense)', () => {
        const { ctx } = appCtx({ career: { division: 3, seasons: [{ name: 'x', division: 3 }] } });
        // Mai no ha jugat a la lliga del territori: hi comença (el millor graó
        // jugat continua essent el que era).
        expect(ctx.loadLeagueCareer()).toMatchObject({ division: 3, tier: 9, level: 3, bestTier: 0, bestLevel: 3, home: null });
        expect(appCtx({}).ctx.loadLeagueCareer()).toMatchObject({ tier: 9, level: 3, seasons: [] });
        expect(appCtx({ career: { tier: 4, bestTier: 4, seasons: [] } }).ctx.loadLeagueCareer()).toMatchObject({ tier: 9 });
        expect(appCtx({ career: { tier: 7, bestTier: 10, seasons: [] } }).ctx.loadLeagueCareer()).toMatchObject({ tier: 7 });
        // Desar la trajectòria amb el graó del mínim no infla el millor graó:
        // una temporada d'abans, jugada per sota, encara acabarà pujant.
        const saved = appCtx({ career: { tier: 2, bestTier: 2, seasons: [] } });
        saved.ctx.saveLeagueCareer(saved.ctx.loadLeagueCareer());
        expect(JSON.parse(saved.store.chess_leagueCareer)).toMatchObject({ tier: 9, bestTier: 2 });
        expect(saved.ctx.loadLeagueCareer()).toMatchObject({ tier: 9, bestTier: 2 });
        const c2 = appCtx({ career: { level: 9, bestLevel: 2, home: { municipi: '' }, seasons: [] } }).ctx.loadLeagueCareer();
        // Només amb nivell (d'abans dels graons): la C del nivell.
        expect(c2).toMatchObject({ tier: 18, level: 6, bestLevel: 6, home: null });
        const c3 = appCtx({ career: { tier: 8, bestTier: 11, seasons: [] } }).ctx.loadLeagueCareer();
        expect(c3).toMatchObject({ tier: 8, level: 2, bestTier: 11, bestLevel: 3 });
    });
    test('una temporada començada amb noms castellans: els rivals passen a català, també a les jornades jugades', () => {
        const league = {
            id: 'league_1700000000000', ladder: { level: 3, group: 'C', tier: 9 },
            players: [
                { id: 'me', name: 'Tu' },
                { id: 'bot1', name: 'Lucía Navarro', from: 'Manlleu' },
                { id: 'bot2', name: 'Jordi Puig', from: 'Reus' },
                { id: 'bot3', name: 'Sergio García', from: 'Olot' },
                { id: 'bot4', name: 'Youssef Benali', from: 'Lleida' }
            ],
            history: [{ round: 1, oppName: 'Lucía Navarro' }, { round: 2, oppName: 'Jordi Puig' }]
        };
        const copy = JSON.parse(JSON.stringify(league));
        const { ctx } = appCtx({ career: { home: vic, seasons: [] }, league });
        ctx.leagueActiveMatch = { opponentId: 'bot3', opponentName: 'Sergio García' };
        expect(ctx.catalanizeLeagueRivals()).toBe(true);
        const names = league.players.map(p => p.name);
        expect(names[2]).toBe('Jordi Puig');
        expect(names[4]).toBe('Youssef Benali');
        [names[1], names[3]].forEach(n => expect(Noms.isCastilianName(n)).toBe(false));
        expect(new Set(names).size).toBe(names.length);
        // Sense repetir el cognom de cap altre rival.
        const surnames = names.slice(1).map(n => n.split(' ').slice(1).join(' '));
        expect(new Set(surnames).size).toBe(surnames.length);
        expect(league.history.map(h => h.oppName)).toEqual([names[1], 'Jordi Puig']);
        expect(ctx.leagueActiveMatch.opponentName).toBe(names[3]);
        // Ja no hi ha res a canviar; i la mateixa lliga dona sempre els mateixos noms.
        expect(ctx.catalanizeLeagueRivals()).toBe(false);
        const other = appCtx({ career: { home: vic, seasons: [] }, league: copy }).ctx;
        other.catalanizeLeagueRivals();
        expect(copy.players.map(p => p.name)).toEqual(names);
        // A Europa no es toca res.
        const europe = { id: 'x', ladder: { level: 5, group: 'C', tier: 15 }, players: [{ id: 'bot1', name: 'Lucía Navarro', from: 'Espanya' }] };
        expect(appCtx({ league: europe }).ctx.catalanizeLeagueRivals()).toBe(false);
        expect(europe.players[0].name).toBe('Lucía Navarro');
    });
});

describe('noms dels rivals (nomslliga.js): cada cop més internacionals', () => {
    const vic = Loc.normalizeHome({ municipi: 'Vic' });
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const opts = { random: rnd, territoryOf: Loc.ppccCityTerritory };
    // El nom i el cognom són tots dos d'aquella cultura.
    const inCulture = (name, code) => {
        const c = Noms.CULTURES[code];
        const parts = name.split(' ');
        const given = c.order === 'family' ? parts[parts.length - 1] : parts[0];
        const surname = c.order === 'family' ? parts[0] : parts.slice(1).join(' ');
        return c.f.concat(c.m).includes(given) && (c.s || []).concat(c.sf || [], c.sm || []).includes(surname);
    };

    test('cada cultura té noms de dona, d\'home i cognoms; cada país i ciutat d\'origen en té', () => {
        Object.entries(Noms.CULTURES).forEach(([code, c]) => {
            expect(c.f.length).toBeGreaterThanOrEqual(6);
            expect(c.m.length).toBeGreaterThanOrEqual(6);
            expect((c.s || c.sf).length).toBeGreaterThanOrEqual(5);
            if (c.sf) expect(c.sm.length).toBe(c.sf.length);
        });
        Loc.EUROPE.concat(Loc.WORLD).forEach(country => expect(Noms.CULTURES[Noms.countryCulture(country)]).toBeDefined());
        Loc.PPCC_CITIES.forEach(city => expect(Noms.TERRITORY_CULTURE[Loc.ppccCityTerritory(city)]).toBeDefined());
        Object.values(Noms.DIVERSE).forEach(list => list.forEach(([code]) => expect(Noms.CULTURES[code]).toBeDefined()));
    });

    test('cap cognom de grans jugadors d\'escacs ni cap persona coneguda', () => {
        const chess = ['Carlsen', 'Kasparov', 'Karpov', 'Anand', 'Nakamura', 'Caruana', 'Ding', 'Firouzja', 'Giri', 'Aronian',
            'Polgar', 'Polgár', 'Fischer', 'Tal', 'Botvinnik', 'Kramnik', 'Topalov', 'Nepomniachtchi', 'Radjabov', 'Mamedyarov',
            'So', 'Rapport', 'Duda', 'Vachier-Lagrave', 'Grischuk', 'Svidler', 'Ivanchuk', 'Hou', 'Ju', 'Gukesh', 'Erigaisi',
            'Abdusattorov', 'Keymer', 'Niemann', 'Shirov', 'Leko', 'Navara', 'Sindarov', 'Gujrathi', 'Petrosian', 'Spassky',
            'Capablanca', 'Alekhine', 'Lasker', 'Morphy', 'Kosteniuk', 'Muzychuk', 'Koneru', 'Dzagnidze', 'Abdumalik', 'Sargsyan'];
        Object.values(Noms.CULTURES).forEach(c => (c.s || []).concat(c.sf || [], c.sm || []).forEach(sur => expect(chess).not.toContain(sur)));
        expect(Noms.CULTURES.cn.m).not.toEqual(expect.arrayContaining(['Hao']));
        for (let k = 0; k < 200; k++) {
            for (let lv = 0; lv < 7; lv++) {
                Noms.rivalNames(lv, vic, Loc.rivalOrigins(lv, vic, 9, rnd), opts).forEach(n => expect(Noms.FAMOUS.has(Noms.fold(n))).toBe(false));
            }
        }
    });

    test('nou noms diferents, cap dels exclosos', () => {
        for (let k = 0; k < 100; k++) {
            const first = Noms.rivalNames(0, vic, [], Object.assign({ count: 9 }, opts));
            expect(new Set(first).size).toBe(9);
            const second = Noms.rivalNames(0, vic, [], Object.assign({ count: 9, exclude: first }, opts));
            second.forEach(n => expect(first).not.toContain(n));
        }
    });

    test('dels noms del poble als del món: a cada nivell, menys noms locals', () => {
        const share = lv => {
            let local = 0, total = 0;
            for (let k = 0; k < 300; k++) {
                Noms.rivalNames(lv, vic, Loc.rivalOrigins(lv, vic, 9, rnd), opts).forEach(n => { total++; if (inCulture(n, 'cat')) local++; });
            }
            return local / total;
        };
        const s = [0, 1, 2, 3, 4, 5, 6].map(share);
        expect(s[0]).toBe(1);                              // municipal: tots del país
        for (let lv = 1; lv <= 3; lv++) expect(s[lv]).toBeLessThan(s[lv - 1]);
        expect(s[3]).toBeGreaterThan(0.5);                 // la Catalana encara és majoritàriament catalana
        expect(s[4]).toBeLessThan(s[3]);                   // Països Catalans: valencians, mallorquins...
        expect(s[5]).toBe(0);                              // Europa i món: ni un nom català
        expect(s[6]).toBe(0);
    });

    test('als Països Catalans el nom va amb la ciutat; a Europa i al món, amb el país', () => {
        for (let k = 0; k < 50; k++) {
            const pp = Loc.rivalOrigins(4, vic, 9, rnd);
            const names = Noms.rivalNames(4, vic, pp, Object.assign({}, opts, { random: () => 0.99 }));   // sense diversitat
            names.forEach((n, i) => expect(inCulture(n, Noms.placeCulture(Loc.ppccCityTerritory(pp[i]), pp[i]))).toBe(true));
            for (const lv of [5, 6]) {
                const o = Loc.rivalOrigins(lv, vic, 9, rnd);
                Noms.rivalNames(lv, vic, o, Object.assign({}, opts, { countryOf: Loc.cityCountry }))
                    .forEach((n, i) => expect(inCulture(n, Noms.countryCulture(Loc.cityCountry(o[i])))).toBe(true));
                // Les temporades d'abans, amb el país com a origen, també.
                const countries = o.map(Loc.cityCountry);
                Noms.rivalNames(lv, vic, countries, Object.assign({}, opts, { countryOf: Loc.cityCountry }))
                    .forEach((n, i) => expect(inCulture(n, Noms.countryCulture(countries[i]))).toBe(true));
            }
        }
    });

    test('els cognoms catalans de cada lloc: País Valencià, cada illa, la Catalunya Nord i l\'Alguer', () => {
        const C = Noms.CULTURES;
        expect(C.val.s).toEqual(expect.arrayContaining(['Ferrer', 'Martí', 'Sanchis', 'Soler', 'Llopis', 'Vidal']));
        expect(C.bal.s).toEqual(expect.arrayContaining(['Pons', 'Ferrer', 'Vidal', 'Coll', 'Riera', 'Oliver', 'Bauzà']));
        expect(C.menorca.s).toEqual(expect.arrayContaining(['Pons', 'Seguí', 'Mercadal', 'Carreras', 'Sintes', 'Taltavull']));
        expect(C.pitiuses.s).toEqual(expect.arrayContaining(['Marí', 'Tur', 'Ribas', 'Torres', 'Prats', 'Planells']));
        expect(C.nord.s).toEqual(expect.arrayContaining(['Vidal', 'Bosch', 'Pujol', 'Font', 'Roca', 'Sicre']));
        expect(C.alguer.s).toEqual(expect.arrayContaining(['Pons', 'Serra', 'Canelles', 'Garau', 'Galceran']));
        // En català: cap grafia francesa a la Catalunya Nord ni cap cognom sard a l'Alguer.
        ['Garrigue', 'Escudier', 'Sarda', 'Py', 'Delonca', 'Bassole'].forEach(x => expect(C.nord.s).not.toContain(x));
        C.sard.s.forEach(x => expect(C.alguer.s).not.toContain(x));
        // Cada illa amb els seus: del lloc del rival o, si no se sap, del jugador.
        const maó = Loc.normalizeHome({ territory: 'bal', municipi: 'Maó', comarca: 'Menorca' });
        const eivissa = Loc.normalizeHome({ territory: 'bal', municipi: 'Sant Antoni de Portmany', comarca: 'Eivissa' });
        const palma = Loc.normalizeHome({ territory: 'bal', municipi: 'Palma', comarca: 'Mallorca' });
        expect(Noms.placeCulture('bal', '', maó)).toBe('menorca');
        expect(Noms.placeCulture('bal', '', eivissa)).toBe('pitiuses');
        expect(Noms.placeCulture('bal', '', { territory: 'bal', comarca: 'Formentera' })).toBe('pitiuses');
        expect(Noms.placeCulture('bal', '', palma)).toBe('bal');
        expect(Noms.placeCulture('bal', 'Ciutadella', palma)).toBe('menorca');
        expect(Noms.placeCulture('bal', 'es Pujols', palma)).toBe('pitiuses');
        expect(Noms.placeCulture('bal', 'Sóller', maó)).toBe('bal');
        // Un poble que no és a la llista: l'illa que ha triat el jugador.
        expect(Noms.placeCulture('bal', '', Loc.normalizeHome({ territory: 'bal', municipi: 'Fornells', comarca: 'Menorca' }))).toBe('menorca');
        expect(Noms.placeCulture('bal', '', Loc.normalizeHome({ territory: 'bal', municipi: 'Portinatx', comarca: 'Eivissa' }))).toBe('pitiuses');
        Noms.rivalNames(0, maó, [], Object.assign({ count: 9 }, opts)).forEach(n => expect(inCulture(n, 'menorca')).toBe(true));
        Noms.rivalNames(0, eivissa, [], Object.assign({ count: 9 }, opts)).forEach(n => expect(inCulture(n, 'pitiuses')).toBe(true));
        // A la Lliga Balear, cadascú amb els cognoms de la seva illa (sense
        // gent d'altres orígens, amb l'atzar alt).
        for (let k = 0; k < 20; k++) {
            const origins = Loc.rivalOrigins(3, palma, 9, rnd);
            Noms.rivalNames(3, palma, origins, { random: () => 0.99 }).forEach((n, i) =>
                expect(inCulture(n, Noms.placeCulture('bal', origins[i], palma))).toBe(true));
        }
    });

    test('territoris i fora dels Països Catalans: els noms del lloc del jugador', () => {
        const palma = Loc.normalizeHome({ territory: 'bal', municipi: 'Palma', comarca: 'Mallorca' });
        Noms.rivalNames(0, palma, [], Object.assign({ count: 9 }, opts)).forEach(n => expect(inCulture(n, 'bal')).toBe(true));
        const gandia = Loc.normalizeHome({ territory: 'val', municipi: 'Gandia', comarca: 'la Safor' });
        Noms.rivalNames(0, gandia, [], Object.assign({ count: 9 }, opts)).forEach(n => expect(inCulture(n, 'val')).toBe(true));
        const lio = { territory: 'fora', municipi: 'Lió', pais: 'França' };
        Noms.rivalNames(2, lio, [], Object.assign({ count: 9 }, opts)).forEach(n => expect(inCulture(n, 'fr')).toBe(true));
        // Cultures amb el cognom davant, amb segon nom i amb cognoms de dona i d'home.
        expect(Noms.makeName('kr', () => 0.9).name).toBe('Yoon Jae-won');
        expect(Noms.makeName('vn', () => 0.2).name).toBe('Trần Thị Hương');
        expect(Noms.makeName('pl', () => 0.2).name).toBe('Zofia Kowalska');
        expect(Noms.makeName('pl', () => 0.7).name).toBe('Michał Kamiński');
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
    test('localitats.js i nomslliga.js es carreguen entre core.js i app.js', () => {
        const core = html.indexOf('src="core.js?v=');
        const loc = html.indexOf('src="localitats.js?v=');
        const noms = html.indexOf('src="nomslliga.js?v=');
        expect(loc).toBeGreaterThan(core);
        expect(noms).toBeGreaterThan(core);
        expect(loc).toBeLessThan(html.indexOf('src="app.js?v='));
        expect(noms).toBeLessThan(html.indexOf('src="app.js?v='));
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
