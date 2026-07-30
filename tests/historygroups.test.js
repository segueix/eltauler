const Core = require('../core.js');

// Data local a una hora concreta del dia, per poder provar que els grups van
// per dies de CALENDARI i no per finestres de 24 hores.
function at(year, month, day, hour, minute) {
    return new Date(year, month - 1, day, hour || 12, minute || 0, 0, 0);
}

const NOW = at(2026, 7, 30, 10, 30);      // dijous 30 de juliol de 2026, 10:30
const NOW_TS = NOW.getTime();

// Entrada mínima d'historial: al grup només li importen l'id i la data.
function entry(id, date) {
    return { id: id, date: date instanceof Date ? date.toISOString() : date };
}

describe('calendarDaysAgo (dies de calendari, no de 24 hores)', () => {
    test('el mateix dia són 0 dies, a qualsevol hora', () => {
        expect(Core.calendarDaysAgo(at(2026, 7, 30, 0, 1), NOW_TS)).toBe(0);
        expect(Core.calendarDaysAgo(at(2026, 7, 30, 23, 59), NOW_TS)).toBe(0);
    });

    test('les 23:50 d\'ahir són «1 dia», encara que no hagin passat 24 hores', () => {
        expect(Core.calendarDaysAgo(at(2026, 7, 29, 23, 50), NOW_TS)).toBe(1);
    });

    test('travessa canvis de mes i d\'any', () => {
        expect(Core.calendarDaysAgo(at(2026, 6, 30, 12, 0), NOW_TS)).toBe(30);
        expect(Core.calendarDaysAgo(at(2025, 7, 30, 12, 0), NOW_TS)).toBe(365);
    });

    test('una data invàlida o buida no rebenta: torna null', () => {
        expect(Core.calendarDaysAgo(null, NOW_TS)).toBeNull();
        expect(Core.calendarDaysAgo('no és una data', NOW_TS)).toBeNull();
        expect(Core.calendarDaysAgo(undefined, NOW_TS)).toBeNull();
    });
});

describe('historyAgeGroup (etiqueta del grup d\'antiguitat)', () => {
    const labelOf = date => Core.historyAgeGroup(date, NOW_TS).label;

    test('els dies propers van un per un', () => {
        expect(labelOf(at(2026, 7, 30, 9, 0))).toBe('Avui');
        expect(labelOf(at(2026, 7, 29, 20, 0))).toBe('Ahir');
        expect(labelOf(at(2026, 7, 28, 20, 0))).toBe('Fa 2 dies');
        expect(labelOf(at(2026, 7, 24, 20, 0))).toBe('Fa 6 dies');
    });

    test('a partir d\'una setmana s\'agrupa per setmanes', () => {
        expect(labelOf(at(2026, 7, 23, 12, 0))).toBe('Fa 1 setmana');   // 7 dies
        expect(labelOf(at(2026, 7, 17, 12, 0))).toBe('Fa 1 setmana');   // 13 dies
        expect(labelOf(at(2026, 7, 16, 12, 0))).toBe('Fa 2 setmanes');  // 14 dies
        expect(labelOf(at(2026, 7, 3, 12, 0))).toBe('Fa 3 setmanes');   // 27 dies
    });

    test('a partir del mes s\'agrupa per mesos, en singular i plural', () => {
        expect(labelOf(at(2026, 7, 2, 12, 0))).toBe('Fa 1 mes');        // 28 dies
        expect(labelOf(at(2026, 6, 1, 12, 0))).toBe('Fa 1 mes');        // 59 dies
        expect(labelOf(at(2026, 5, 31, 12, 0))).toBe('Fa 2 mesos');     // 60 dies
        expect(labelOf(at(2025, 10, 30, 12, 0))).toBe('Fa 9 mesos');
    });

    test('el darrer tram abans de l\'any no es passa de mesos', () => {
        // 364 dies: encara no és un any, però tampoc pot dir «fa 12 mesos».
        expect(labelOf(at(2025, 7, 31, 12, 0))).toBe('Fa 11 mesos');
    });

    test('a partir de l\'any s\'agrupa per anys', () => {
        expect(labelOf(at(2025, 7, 30, 12, 0))).toBe('Fa 1 any');
        expect(labelOf(at(2024, 7, 30, 12, 0))).toBe('Fa 2 anys');
        expect(labelOf(at(1972, 7, 30, 12, 0))).toBe('Fa 54 anys');     // PGN històric
    });

    test('una data del futur (rellotge desajustat) cau a «Avui», no desapareix', () => {
        const g = Core.historyAgeGroup(at(2026, 8, 5, 12, 0), NOW_TS);
        expect(g.label).toBe('Avui');
        expect(g.key).toBe('today');
    });

    test('sense data hi ha grup propi, i va l\'últim', () => {
        const g = Core.historyAgeGroup(null, NOW_TS);
        expect(g.label).toBe('Sense data');
        expect(g.days).toBeNull();
        expect(g.order).toBeGreaterThan(Core.historyAgeGroup(at(1900, 1, 1, 12, 0), NOW_TS).order);
    });

    test('les claus separen grups diferents i uneixen el mateix grup', () => {
        expect(Core.historyAgeGroup(at(2026, 7, 28, 8, 0), NOW_TS).key)
            .toBe(Core.historyAgeGroup(at(2026, 7, 28, 22, 0), NOW_TS).key);
        expect(Core.historyAgeGroup(at(2026, 7, 28, 8, 0), NOW_TS).key)
            .not.toBe(Core.historyAgeGroup(at(2026, 7, 27, 8, 0), NOW_TS).key);
    });
});

describe('groupHistoryEntriesByAge (seccions de la llista)', () => {
    // Historial tal com el desa l'app: en ordre cronològic d'arribada.
    const entries = [
        entry('vella', at(2026, 1, 15, 12, 0)),      // fa ~6 mesos
        entry('setmana', at(2026, 7, 22, 12, 0)),    // fa 8 dies → 1 setmana
        entry('ahir-mati', at(2026, 7, 29, 9, 0)),
        entry('ahir-nit', at(2026, 7, 29, 23, 30)),
        entry('avui', at(2026, 7, 30, 8, 0))
    ];

    test('agrupa i ordena de la partida més recent a la més antiga', () => {
        const groups = Core.groupHistoryEntriesByAge(entries, NOW_TS);
        expect(groups.map(g => g.label)).toEqual(['Avui', 'Ahir', 'Fa 1 setmana', 'Fa 6 mesos']);
        expect(groups.map(g => g.count)).toEqual([1, 2, 1, 1]);
    });

    test('dins d\'un grup, la partida més nova va primer', () => {
        const groups = Core.groupHistoryEntriesByAge(entries, NOW_TS);
        const ahir = groups.find(g => g.label === 'Ahir');
        expect(ahir.entries.map(e => e.id)).toEqual(['ahir-nit', 'ahir-mati']);
    });

    test('no toca ni reordena la llista original', () => {
        const original = entries.map(e => e.id);
        Core.groupHistoryEntriesByAge(entries, NOW_TS);
        expect(entries.map(e => e.id)).toEqual(original);
    });

    test('cap partida no es perd pel camí', () => {
        const groups = Core.groupHistoryEntriesByAge(entries, NOW_TS);
        const total = groups.reduce((n, g) => n + g.entries.length, 0);
        expect(total).toBe(entries.length);
    });

    test('les entrades sense data van al seu grup, al final', () => {
        const groups = Core.groupHistoryEntriesByAge(
            entries.concat([entry('orfe', null)]), NOW_TS);
        expect(groups[groups.length - 1].label).toBe('Sense data');
        expect(groups[groups.length - 1].entries.map(e => e.id)).toEqual(['orfe']);
    });

    test('llistes buides, nul·les o amb forats no rebenten', () => {
        expect(Core.groupHistoryEntriesByAge([], NOW_TS)).toEqual([]);
        expect(Core.groupHistoryEntriesByAge(null, NOW_TS)).toEqual([]);
        expect(Core.groupHistoryEntriesByAge([null, undefined], NOW_TS)).toEqual([]);
    });

    test('sense data fiable es respecta l\'ordre d\'arribada, invertit', () => {
        const orfes = [entry('a', null), entry('b', null), entry('c', null)];
        const groups = Core.groupHistoryEntriesByAge(orfes, NOW_TS);
        expect(groups[0].entries.map(e => e.id)).toEqual(['c', 'b', 'a']);
    });
});

describe('historyGroupsOpenState (què arriba desplegat)', () => {
    const groupsOf = counts => counts.map((n, i) => ({ key: `g${i}`, count: n, entries: new Array(n).fill(0) }));

    test('el grup més recent sempre s\'obre, encara que sigui enorme', () => {
        expect(Core.historyGroupsOpenState(groupsOf([40, 5]), {}, 10)).toEqual([true, false]);
    });

    test('s\'obren grups fins a completar el pressupost de partides', () => {
        expect(Core.historyGroupsOpenState(groupsOf([2, 3, 6, 4, 9]), {}, 10))
            .toEqual([true, true, true, false, false]);
    });

    test('amb poques partides en total, tot queda obert', () => {
        expect(Core.historyGroupsOpenState(groupsOf([1, 1, 2]), {}, 10)).toEqual([true, true, true]);
    });

    test('el que ha triat l\'usuari mana sobre l\'automàtic', () => {
        const groups = groupsOf([2, 3, 4]);
        expect(Core.historyGroupsOpenState(groups, { g0: false }, 10)).toEqual([false, true, true]);
        expect(Core.historyGroupsOpenState(groups, { g2: false }, 10)).toEqual([true, true, false]);
    });

    test('obrir un grup vell a mà consumeix pressupost dels següents', () => {
        // g0 obert per l'usuari amb 12 partides: la resta ja arriba plegada.
        expect(Core.historyGroupsOpenState(groupsOf([12, 3, 3]), { g0: true }, 10))
            .toEqual([true, false, false]);
    });

    test('sense grups o amb entrades rares torna una llista coherent', () => {
        expect(Core.historyGroupsOpenState([], {}, 10)).toEqual([]);
        expect(Core.historyGroupsOpenState(null, null, 10)).toEqual([]);
    });

    test('el pressupost per defecte surt de la configuració', () => {
        expect(Core.HISTORY_GROUP_CONFIG.autoOpenGames).toBeGreaterThan(0);
        const groups = groupsOf([Core.HISTORY_GROUP_CONFIG.autoOpenGames + 1, 2]);
        expect(Core.historyGroupsOpenState(groups)).toEqual([true, false]);
    });
});
