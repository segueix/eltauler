const Core = require('../core.js');
const { Chess } = require('chess.js');

const H = Core.createRepertoireHelpers(Chess);

let seq = 0;
function game(moves, color, result, precision, extra) {
    return Object.assign({
        id: 'g' + (++seq),
        moves: moves.slice(),
        playerColor: color,
        result: result,
        precision: precision
    }, extra || {});
}

// Graf d'obertures mínim per provar la detecció de llibre, amb la mateixa
// forma que buildOpeningPositionGraph: Map(posició -> Set(SAN)).
function theoryGraphFor(lines) {
    const theory = new Map();
    const byPos = new Map();
    lines.forEach(({ moves, name, eco }) => {
        const chess = new Chess();
        for (const san of moves) {
            const key = Core.positionKeyFromFen(chess.fen());
            let set = theory.get(key);
            if (!set) { set = new Set(); theory.set(key, set); }
            set.add(san);
            chess.move(san, { sloppy: true });
        }
        if (name) {
            byPos.set(Core.positionKeyFromFen(chess.fen()), { eco: eco, name: name, ply: moves.length });
        }
    });
    return { theory, byPos };
}

const RUY = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'];
const ITALIAN = ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'];

describe('resultat de la partida', () => {
    test('llegeix les etiquetes que desa l\'historial', () => {
        expect(Core.historyEntryOutcome('Victòria')).toBe('win');
        expect(Core.historyEntryOutcome('Has guanyat!')).toBe('win');
        expect(Core.historyEntryOutcome('Derrota')).toBe('loss');
        expect(Core.historyEntryOutcome('T\'has rendit')).toBe('loss');
        expect(Core.historyEntryOutcome('Taules per ofegat')).toBe('draw');
        expect(Core.historyEntryOutcome('')).toBeNull();
        expect(Core.historyEntryOutcome(null)).toBeNull();
    });
});

describe('partides que compten per al repertori', () => {
    test('només les pròpies del color demanat', () => {
        const entries = [
            game(RUY, 'w', 'Victòria', 80),
            game(RUY, 'b', 'Derrota', 60),
            game(['e4'], 'w', 'Victòria', 80)   // massa curta
        ];
        expect(Core.repertoireEligibleGames(entries, 'w')).toHaveLength(1);
        expect(Core.repertoireEligibleGames(entries, 'b')).toHaveLength(1);
    });

    test('mai les importades d\'un PGN (poden ser d\'altres jugadors)', () => {
        const entries = [
            game(RUY, 'w', 'Victòria', 80, { imported: true }),
            game(RUY, 'w', 'Victòria', 80, { mode: 'imported' }),
            game(RUY, 'w', 'Victòria', 80)
        ];
        expect(Core.repertoireEligibleGames(entries, 'w')).toHaveLength(1);
    });

    test('ni les pràctiques d\'errades', () => {
        const entries = [game(RUY, 'w', 'Victòria', 80, { mode: 'bundle' })];
        expect(Core.repertoireEligibleGames(entries, 'w')).toHaveLength(0);
    });
});

describe('arbre de jugades pròpies', () => {
    test('agrupa les partides que comparteixen inici', () => {
        const root = H.buildRepertoireTree([
            game(RUY, 'w', 'Victòria', 80),
            game(ITALIAN, 'w', 'Derrota', 60),
            game(['d4', 'd5'], 'w', 'Taules', 70)
        ], 'w', {});
        expect(root.games).toBe(3);
        expect(root.children['e4'].games).toBe(2);
        expect(root.children['d4'].games).toBe(1);
        expect(root.children['e4'].children['e5'].children['Nf3'].games).toBe(2);
    });

    test('marca de qui és cada jugada', () => {
        const root = H.buildRepertoireTree([game(RUY, 'w', 'Victòria', 80)], 'w', {});
        expect(root.children['e4'].mine).toBe(true);
        expect(root.children['e4'].children['e5'].mine).toBe(false);
    });

    test('amb negres, la primera jugada de l\'arbre és del rival', () => {
        const root = H.buildRepertoireTree([game(RUY, 'b', 'Derrota', 60)], 'b', {});
        expect(root.children['e4'].mine).toBe(false);
        expect(root.children['e4'].children['e5'].mine).toBe(true);
    });

    test('una jugada impossible atura aquella partida sense trencar la resta', () => {
        const root = H.buildRepertoireTree([
            game(['e4', 'e5', 'Qzz9', 'Nc6'], 'w', 'Victòria', 80),
            game(RUY, 'w', 'Victòria', 80)
        ], 'w', {});
        expect(root.children['e4'].children['e5'].games).toBe(2);
        expect(root.children['e4'].children['e5'].children['Nf3'].games).toBe(1);
    });

    test('no passa de la profunditat demanada', () => {
        const long = ['e4','e5','Nf3','Nc6','Bb5','a6','Ba4','Nf6','O-O','Be7','Re1','b5','Bb3','d6'];
        const root = H.buildRepertoireTree([game(long, 'w', 'Victòria', 80)], 'w', { maxPlies: 4 });
        let node = root, depth = 0;
        while (Object.keys(node.children).length) { node = node.children[Object.keys(node.children)[0]]; depth++; }
        expect(depth).toBe(4);
    });
});

describe('freqüència, resultat i precisió', () => {
    const entries = [
        game(RUY, 'w', 'Victòria', 80),
        game(RUY, 'w', 'Victòria', 90),
        game(ITALIAN, 'w', 'Derrota', 50),
        game(['d4', 'd5'], 'w', 'Taules', 70)
    ];

    test('quantes partides i quina part del total', () => {
        const rep = H.repertoireForColor(entries, 'w', {});
        expect(rep.games).toBe(4);
        const e4 = rep.branches.find(b => b.san === 'e4');
        expect(e4.games).toBe(3);
        expect(e4.share).toBe(75);
    });

    test('la puntuació és la clàssica (victòria 1, taules ½)', () => {
        const rep = H.repertoireForColor(entries, 'w', {});
        expect(rep.branches.find(b => b.san === 'e4').score).toBe(67);   // 2 de 3
        expect(rep.branches.find(b => b.san === 'd4').score).toBe(50);   // taules
    });

    test('la precisió és la mitjana de les partides que en tenen', () => {
        const rep = H.repertoireForColor(entries, 'w', {});
        expect(rep.branches.find(b => b.san === 'e4').precision).toBe(73); // (80+90+50)/3
    });

    test('sense resultat reconegut no s\'inventa cap puntuació', () => {
        const rep = H.repertoireForColor([game(RUY, 'w', 'Partida sense acabar', 80)], 'w', {});
        expect(rep.branches[0].score).toBeNull();
    });

    test('les branques surten de la més jugada a la menys', () => {
        const rep = H.repertoireForColor(entries, 'w', {});
        expect(rep.branches.map(b => b.san)).toEqual(['e4', 'd4']);
    });

    test('avisa quan encara no hi ha prou partides amb aquell color', () => {
        expect(H.repertoireForColor(entries, 'w', {}).enough).toBe(false);
        const many = [];
        for (let i = 0; i < 10; i++) many.push(game(RUY, 'w', 'Victòria', 80));
        expect(H.repertoireForColor(many, 'w', {}).enough).toBe(true);
    });
});

describe('línia principal', () => {
    test('segueix la continuació més jugada mentre hi hagi mostra', () => {
        const entries = [
            game(RUY, 'w', 'Victòria', 80),
            game(RUY, 'w', 'Victòria', 80),
            game(ITALIAN, 'w', 'Derrota', 60)
        ];
        const rep = H.repertoireForColor(entries, 'w', {});
        expect(rep.branches[0].line.map(s => s.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']);
    });

    test('s\'atura quan la continuació només s\'ha jugat una vegada', () => {
        const entries = [
            game(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'], 'w', 'Victòria', 80),
            game(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'], 'w', 'Derrota', 60)
        ];
        const rep = H.repertoireForColor(entries, 'w', {});
        // Bb5 i Bc4 empaten a 1: per sota del mínim, la línia principal s'atura.
        expect(rep.branches[0].line.map(s => s.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
    });
});

describe('on es deixa el llibre', () => {
    const graph = theoryGraphFor([
        { moves: RUY, name: 'Ruy López', eco: 'C60' },
        { moves: ITALIAN, name: 'Italiana', eco: 'C50' }
    ]);

    test('una línia sencera de llibre no marca cap desviació', () => {
        const entries = [game(RUY, 'w', 'Victòria', 80), game(RUY, 'w', 'Victòria', 80)];
        const rep = H.repertoireForColor(entries, 'w', graph);
        expect(rep.branches[0].offBookPly).toBeNull();
        expect(rep.branches[0].line.every(s => s.inTheory === true)).toBe(true);
    });

    test('detecta la jugada que surt del llibre i de qui és', () => {
        const rare = ['e4', 'e5', 'Nf3', 'Nc6', 'Bd3'];   // Bd3 no és al graf
        const entries = [game(rare, 'w', 'Victòria', 80), game(rare, 'w', 'Victòria', 80)];
        const rep = H.repertoireForColor(entries, 'w', graph);
        expect(rep.branches[0].offBookSan).toBe('Bd3');
        expect(rep.branches[0].offBookPly).toBe(4);
        expect(rep.branches[0].offBookBy).toBe('me');
    });

    test('també quan qui se surt del llibre és el rival', () => {
        const rare = ['e4', 'e5', 'Nf3', 'Na6'];   // Na6 no és al graf
        const entries = [game(rare, 'w', 'Victòria', 80), game(rare, 'w', 'Victòria', 80)];
        const rep = H.repertoireForColor(entries, 'w', graph);
        expect(rep.branches[0].offBookSan).toBe('Na6');
        expect(rep.branches[0].offBookBy).toBe('opponent');
    });

    test('bateja la línia amb el nom més profund que reconeix', () => {
        const entries = [game(RUY, 'w', 'Victòria', 80), game(RUY, 'w', 'Victòria', 80)];
        const rep = H.repertoireForColor(entries, 'w', graph);
        expect(rep.branches[0].name).toBe('Ruy López');
        expect(rep.branches[0].eco).toBe('C60');
    });

    test('sense graf, el llibre queda com a desconegut i no s\'inventa res', () => {
        const entries = [game(RUY, 'w', 'Victòria', 80), game(RUY, 'w', 'Victòria', 80)];
        const rep = H.repertoireForColor(entries, 'w', {});
        expect(rep.theoryKnown).toBe(false);
        expect(rep.branches[0].line.every(s => s.inTheory === null)).toBe(true);
        expect(rep.branches[0].offBookPly).toBeNull();
    });
});

describe('repertori complet', () => {
    test('separa blanques i negres i diu de qui és la primera jugada', () => {
        const rep = H.buildPersonalRepertoire([
            game(RUY, 'w', 'Victòria', 80),
            game(ITALIAN, 'b', 'Derrota', 60),
            game(ITALIAN, 'b', 'Victòria', 70)
        ], {});
        expect(rep.white.games).toBe(1);
        expect(rep.black.games).toBe(2);
        expect(rep.white.branchesAreMine).toBe(true);
        expect(rep.black.branchesAreMine).toBe(false);
        expect(rep.black.branches[0].san).toBe('e4');      // el que et juguen
        expect(rep.black.branches[0].line[1].san).toBe('e5'); // el que hi respons
        expect(rep.black.branches[0].line[1].mine).toBe(true);
    });

    test('un historial buit no trenca res', () => {
        const rep = H.buildPersonalRepertoire([], {});
        expect(rep.white.games).toBe(0);
        expect(rep.white.branches).toEqual([]);
        expect(rep.black.enough).toBe(false);
    });

    test('no ensenya més branques de les configurades', () => {
        const entries = [];
        ['e4', 'd4', 'c4', 'Nf3', 'b3', 'g3', 'f4', 'b4'].forEach(first => {
            entries.push(game([first, 'd5'], 'w', 'Victòria', 80));
        });
        const rep = H.repertoireForColor(entries, 'w', {});
        expect(rep.branches.length).toBe(Core.REPERTOIRE_CONFIG.maxBranches);
    });
});
