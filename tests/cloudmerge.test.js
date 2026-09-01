const Core = require('../core.js');

// ---------------------------------------------------------------------------
// Fusió de sincronització: en aplicar una instantània del núvol, el mirall
// «última escriptura guanya» no pot fer retrocedir l'estat viu. El cas real
// que va motivar-ho: un aparell obert al cap de dies declarava «derrota per
// temps» a partides diàries en què l'usuari havia jugat fa poques hores des
// d'un altre aparell, i posava la ratxa a zero; en pujar-se, el retrocés
// s'escampava a tots els aparells. La fusió conserva sempre la versió més
// avançada i és convergent: s'apliqui a l'aparell que s'apliqui, tothom
// acaba amb el mateix resultat.
// ---------------------------------------------------------------------------

const H = 60 * 60 * 1000;
const T0 = 1_700_000_000_000;

function game(overrides) {
    return Object.assign({
        id: 'daily_1',
        playerColor: 'w',
        movesSan: ['e4', 'e5'],
        turnStartedAt: T0,
        status: 'active',
        result: null,
        resultReason: null
    }, overrides || {});
}

describe('dailyPickVersion (mateixa partida als dos costats)', () => {
    test('guanya la versió amb més jugades: una derrota per temps fabricada amb dades velles no trepitja la partida viva', () => {
        // El núvol (bo): l'usuari ha jugat fa 5 h i la partida segueix viva.
        const cloud = game({ movesSan: ['e4', 'e5', 'Nf3'], turnStartedAt: T0 + 40 * H, status: 'active' });
        // El costat endarrerit: encara no tenia la jugada i l'ha tancada per temps.
        const stale = game({ movesSan: ['e4', 'e5'], turnStartedAt: T0, status: 'finished', result: 'loss', resultReason: 'timeout' });
        expect(Core.dailyPickVersion(stale, cloud)).toBe(cloud);
        // I en la direcció inversa (el retrocés ja havia arribat al núvol),
        // la versió local més avançada es conserva.
        expect(Core.dailyPickVersion(cloud, stale)).toBe(cloud);
    });

    test('amb les mateixes jugades, una resolució legítima mana sobre la partida activa (venciment o rendició reals)', () => {
        const active = game({ status: 'active' });
        const resigned = game({ status: 'finished', result: 'loss', resultReason: 'resign' });
        expect(Core.dailyPickVersion(resigned, active)).toBe(resigned);
        expect(Core.dailyPickVersion(active, resigned)).toBe(resigned);
    });

    test('actives i iguals de jugades: mana la marca de torn més tardana (mai no escurça terminis)', () => {
        const older = game({ turnStartedAt: T0 });
        const newer = game({ turnStartedAt: T0 + 3 * H });
        expect(Core.dailyPickVersion(older, newer)).toBe(newer);
        expect(Core.dailyPickVersion(newer, older)).toBe(newer);
    });

    test('empat total: es queda la del núvol (convergència determinista)', () => {
        const a = game({ status: 'finished', result: 'loss', resultReason: 'timeout' });
        const b = game({ status: 'finished', result: 'loss', resultReason: 'resign' });
        expect(Core.dailyPickVersion(a, b)).toBe(b);
    });

    test('si falta un costat, es retorna l’altre', () => {
        const g = game();
        expect(Core.dailyPickVersion(null, g)).toBe(g);
        expect(Core.dailyPickVersion(g, null)).toBe(g);
    });
});

describe('dailyMergeGames (llistes senceres)', () => {
    test('fusiona per id, agafa les noves del núvol i conserva les actives només locals', () => {
        const local = [
            game({ id: 'a', movesSan: ['e4'], status: 'active' }),                    // endarrerida
            game({ id: 'b', movesSan: [], status: 'active' }),                        // creada aquí, no pujada
            game({ id: 'c', movesSan: ['d4'], status: 'finished', result: 'win' })    // descartada al núvol
        ];
        const cloud = [
            game({ id: 'a', movesSan: ['e4', 'c5', 'Nf3'], status: 'active', turnStartedAt: T0 + 5 * H }),
            game({ id: 'd', movesSan: ['c4'], status: 'active' })                     // creada en un altre aparell
        ];
        const merged = Core.dailyMergeGames(local, cloud);
        const ids = merged.map(g => g.id).sort();
        expect(ids).toEqual(['a', 'b', 'd']);
        expect(merged.find(g => g.id === 'a').movesSan).toEqual(['e4', 'c5', 'Nf3']);
    });

    test('convergent: aplicar la fusió a l’altre costat dona el mateix resultat', () => {
        // Cada aparell ha avançat una partida diferent.
        const deviceA = [game({ id: 'g1', movesSan: ['e4', 'e5', 'Nf3'] }), game({ id: 'g2', movesSan: ['d4'] })];
        const deviceB = [game({ id: 'g1', movesSan: ['e4', 'e5'] }), game({ id: 'g2', movesSan: ['d4', 'd5'] })];
        const ab = Core.dailyMergeGames(deviceA, deviceB);
        const ba = Core.dailyMergeGames(deviceB, deviceA);
        const key = list => list.map(g => g.id + ':' + g.movesSan.join(',')).sort();
        expect(key(ab)).toEqual(key(ba));
        expect(key(ab)).toEqual(['g1:e4,e5,Nf3', 'g2:d4,d5']);
    });

    test('entrades degenerades no rebenten ni es colen', () => {
        expect(Core.dailyMergeGames(null, null)).toEqual([]);
        expect(Core.dailyMergeGames([null, {}, game({ id: 'x' })], undefined).map(g => g.id)).toEqual(['x']);
    });
});

describe('mergeSyncSnapshots (instantànies clau→text senceres)', () => {
    test('el cas de l’error: un aparell endarrerit no imposa derrotes per temps ni ratxa zero', () => {
        // Núvol (bo): 3 partides vives amb la jugada de fa 5 h, ratxa de 2 dies.
        const cloudGames = ['a', 'b', 'c'].map(id =>
            game({ id, movesSan: ['e4', 'e5', 'Nf3'], turnStartedAt: T0 + 40 * H, status: 'active' }));
        // Local (endarrerit): les mateixes partides tancades per temps amb menys
        // jugades, i la ratxa escombrada.
        const staleGames = ['a', 'b', 'c'].map(id =>
            game({ id, movesSan: ['e4', 'e5'], status: 'finished', result: 'loss', resultReason: 'timeout' }));
        const merged = Core.mergeSyncSnapshots(
            {
                'chess_dailyGames': JSON.stringify(staleGames),
                'chess_streak': '0',
                'chess_lastPracticeDate': '2026-08-20',
                'chess_maxStreak': '2'
            },
            {
                'chess_dailyGames': JSON.stringify(cloudGames),
                'chess_streak': '2',
                'chess_lastPracticeDate': '2026-08-31',
                'chess_maxStreak': '2',
                'chess_userELO': '830'
            }
        );
        const games = JSON.parse(merged['chess_dailyGames']);
        expect(games.every(g => g.status === 'active')).toBe(true);
        expect(merged['chess_streak']).toBe('2');
        expect(merged['chess_lastPracticeDate']).toBe('2026-08-31');
        expect(merged['chess_userELO']).toBe('830'); // la resta de claus, mirall del núvol
    });

    test('i en la direcció inversa: si el retrocés ja és al núvol, el costat bo el desfà', () => {
        const goodGames = [game({ id: 'a', movesSan: ['e4', 'e5', 'Nf3'], turnStartedAt: T0 + 40 * H, status: 'active' })];
        const staleGames = [game({ id: 'a', movesSan: ['e4', 'e5'], status: 'finished', result: 'loss', resultReason: 'timeout' })];
        const merged = Core.mergeSyncSnapshots(
            { 'chess_dailyGames': JSON.stringify(goodGames), 'chess_streak': '2', 'chess_lastPracticeDate': '2026-08-31' },
            { 'chess_dailyGames': JSON.stringify(staleGames), 'chess_streak': '0', 'chess_lastPracticeDate': '2026-08-20' }
        );
        expect(JSON.parse(merged['chess_dailyGames'])[0].status).toBe('active');
        expect(merged['chess_streak']).toBe('2');
        expect(merged['chess_lastPracticeDate']).toBe('2026-08-31');
    });

    test('la ratxa viatja com un parell {ratxa, data}: guanya la data més recent, i a data igual la ratxa més alta', () => {
        // Data del núvol més recent → parell del núvol.
        let m = Core.mergeSyncSnapshots(
            { 'chess_streak': '9', 'chess_lastPracticeDate': '2026-08-29' },
            { 'chess_streak': '3', 'chess_lastPracticeDate': '2026-08-31' }
        );
        expect(m['chess_streak']).toBe('3');
        // Mateixa data → la ratxa més alta.
        m = Core.mergeSyncSnapshots(
            { 'chess_streak': '4', 'chess_lastPracticeDate': '2026-08-31' },
            { 'chess_streak': '2', 'chess_lastPracticeDate': '2026-08-31' }
        );
        expect(m['chess_streak']).toBe('4');
        // chess_maxStreak: el màxim de tots dos costats i de la ratxa triada.
        m = Core.mergeSyncSnapshots(
            { 'chess_streak': '7', 'chess_lastPracticeDate': '2026-08-31', 'chess_maxStreak': '5' },
            { 'chess_streak': '1', 'chess_lastPracticeDate': '2026-08-20', 'chess_maxStreak': '6' }
        );
        expect(m['chess_streak']).toBe('7');
        expect(m['chess_maxStreak']).toBe('7');
    });

    test('dies consecutius en aparells diferents: la ratxa continua, no es reinicia', () => {
        // Ahir 2 dies de ratxa al mòbil; avui es practica en un altre aparell
        // que anava endarrerit (hi constava ratxa 1 d’avui): la real és 3.
        let m = Core.mergeSyncSnapshots(
            { 'chess_streak': '1', 'chess_lastPracticeDate': '2026-09-01' },
            { 'chess_streak': '2', 'chess_lastPracticeDate': '2026-08-31' }
        );
        expect(m['chess_streak']).toBe('3');
        expect(m['chess_lastPracticeDate']).toBe('2026-09-01');
        // I en la direcció inversa (el costat més nou és el núvol).
        m = Core.mergeSyncSnapshots(
            { 'chess_streak': '2', 'chess_lastPracticeDate': '2026-08-31' },
            { 'chess_streak': '1', 'chess_lastPracticeDate': '2026-09-01' }
        );
        expect(m['chess_streak']).toBe('3');
        // Amb un forat de més d’un dia, no hi ha continuació.
        m = Core.mergeSyncSnapshots(
            { 'chess_streak': '9', 'chess_lastPracticeDate': '2026-08-29' },
            { 'chess_streak': '3', 'chess_lastPracticeDate': '2026-08-31' }
        );
        expect(m['chess_streak']).toBe('3');
    });

    test('valors illegibles o absents no rebenten: JSON corrupte, dates "null" i claus que falten', () => {
        const goodGames = [game({ id: 'a', status: 'active' })];
        const m = Core.mergeSyncSnapshots(
            {
                'chess_dailyGames': JSON.stringify(goodGames),
                'chess_lastPracticeDate': 'null',
                'chess_streak': 'abc'
            },
            {
                'chess_dailyGames': '{trencat',
                'chess_lastPracticeDate': '2026-08-31',
                'chess_streak': '2'
            }
        );
        // El JSON del núvol és illegible: mana el local llegible (partida viva conservada).
        expect(JSON.parse(m['chess_dailyGames'])[0].id).toBe('a');
        expect(m['chess_streak']).toBe('2');
        // I sense cap costat llegible, res no peta i el mirall queda intacte.
        const buit = Core.mergeSyncSnapshots({}, { 'chess_userELO': '600' });
        expect(buit).toEqual({ 'chess_userELO': '600' });
    });

    test('si el núvol no té partides diàries però aquí n’hi ha d’actives, no s’escombren', () => {
        const localGames = [
            game({ id: 'viva', status: 'active' }),
            game({ id: 'morta', status: 'finished', result: 'win' })
        ];
        const m = Core.mergeSyncSnapshots({ 'chess_dailyGames': JSON.stringify(localGames) }, {});
        expect(JSON.parse(m['chess_dailyGames']).map(g => g.id)).toEqual(['viva']);
        // …i si tampoc no n'hi ha cap de viva, la clau no reapareix.
        const m2 = Core.mergeSyncSnapshots(
            { 'chess_dailyGames': JSON.stringify([game({ id: 'morta', status: 'finished' })]) }, {});
        expect('chess_dailyGames' in m2).toBe(false);
    });
});
