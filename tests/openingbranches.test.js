const fs = require('fs');
const path = require('path');
const Chess = require('chess.js').Chess;
const Core = require('../core.js');

const helpers = Core.createOpeningHieroglyphicHelpers(Chess);

// Dues obertures que comparteixen les dues primeres jugades: només el cinquè i
// el sisè ply diuen de quina obertura es parla.
const ESPANYOLA = {
    eco: 'C60', name: 'Obertura Espanyola', userColor: 'w', idea: 'Pressiona el cavall que defensa el centre.',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7']
};
const ITALIANA = {
    eco: 'C50', name: 'Obertura Italiana', userColor: 'w',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd3', 'd6']
};
const FRANCESA = {
    eco: 'C00', name: 'Defensa Francesa', userColor: 'b',
    moves: ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Nf6', 'Bg5', 'Be7', 'e5', 'Nfd7']
};

// Base ECO de joguina: branques de l'espanyola (rèpliques diferents del rival),
// una línia italiana i una de francesa. Com la base real, hi ha entrades a
// cada fondària: la mateixa variant hi surt curta i llarga.
const ECO = [
    { eco: 'C65', name: 'Ruy Lopez: Berlin Defense', pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5 Nf6' },
    { eco: 'C60', name: 'Ruy Lopez', pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5' },
    { eco: 'C65', name: 'Ruy Lopez: Berlin Defense', pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5 Nf6 4. O-O Nxe4 5. d4 Nd6' },
    { eco: 'C67', name: 'Ruy Lopez: Berlin, Rio Gambit', pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5 Nf6 4. O-O Nxe4 5. Re1 Nd6 6. Nxe5' },
    { eco: 'C68', name: 'Ruy Lopez: Exchange', pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Bxc6 dxc6 5. O-O f6 6. d4' },
    { eco: 'C70', name: 'Ruy Lopez: Morphy Defense', pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5' },
    { eco: 'C54', name: 'Italian Game: Giuoco Pianissimo', pgn: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d3 d6 6. O-O' },
    { eco: 'C11', name: 'French Defense: Steinitz', pgn: '1. e4 e6 2. d4 d5 3. Nc3 Nf6 4. e5 Nfd7 5. f4 c5 6. Nf3 Nc6' }
];
const REPERTORI = [ESPANYOLA, ITALIANA, FRANCESA];

describe('openingBranchAnchorPlies', () => {
    test('l’àncora s’allarga fins que l’obertura es distingeix de la resta', () => {
        // e4 e5 Nf3 Nc6 encara és compartit: cal el cinquè ply (Bb5 o Bc4).
        expect(Core.openingBranchAnchorPlies(ESPANYOLA, REPERTORI)).toBe(5);
        expect(Core.openingBranchAnchorPlies(ITALIANA, REPERTORI)).toBe(5);
        // La francesa ja és única al quart ply, i no s’escurça del mínim.
        expect(Core.openingBranchAnchorPlies(FRANCESA, REPERTORI)).toBe(4);
    });

    test('una obertura sola es queda amb el mínim', () => {
        expect(Core.openingBranchAnchorPlies(ESPANYOLA, [ESPANYOLA])).toBe(4);
    });

    test('entrades buides no rebenten', () => {
        expect(Core.openingBranchAnchorPlies(null, REPERTORI)).toBe(0);
        expect(Core.openingBranchAnchorPlies({ moves: [] }, REPERTORI)).toBe(0);
    });
});

describe('buildOpeningBranchIndex', () => {
    const index = Core.buildOpeningBranchIndex(REPERTORI, ECO);

    test('cada branca queda enganxada a l’obertura que li toca', () => {
        const byParent = {};
        index.slots.forEach(s => { byParent[s.parentName] = (byParent[s.parentName] || 0) + 1; });
        expect(Object.keys(byParent).sort()).toEqual(['Defensa Francesa', 'Obertura Espanyola', 'Obertura Italiana']);
        // La línia italiana NO pot caure sota l’espanyola encara que comparteixin
        // les dues primeres jugades.
        index.slots.forEach(s => {
            const prefix = s.parentName === 'Obertura Italiana' ? 'Bc4' : s.parentName === 'Obertura Espanyola' ? 'Bb5' : null;
            if (prefix) expect(s.moves[4]).toBe(prefix);
        });
    });

    test('les branques donen més exercicis que la línia catalogada sola', () => {
        const soles = helpers.openingHieroglyphicCandidates(REPERTORI).length;
        expect(index.slots.length).toBeGreaterThan(soles);
    });

    test('una posició, una resposta: mana la jugada que avalen més línies', () => {
        // Des de 1.e4 e5 2.Nf3 Nc6 3.Bb5 (exercici del 3r moviment de les
        // blanques) la posició de partida és única; la del 4t depèn de la
        // rèplica negra, i cada rèplica és un exercici diferent.
        const bySetup = new Map();
        index.slots.forEach(s => {
            const setup = s.key;
            expect(bySetup.has(setup)).toBe(false); // cap posició repetida
            bySetup.set(setup, s);
        });
        // ...a6 (dues línies ECO) guanya a ...Nf6 (dues línies) per ordre
        // d’aparició, i sigui quina sigui, l’exercici en proposa UNA de sola.
        const quart = index.slots.filter(s => s.parentName === 'Obertura Espanyola' && s.startMoveNumber === 4);
        quart.forEach(s => expect(typeof s.moves[6]).toBe('string'));
    });

    test('la variant que s’ensenya és la de la posició de partida, no la del final', () => {
        const berlin = index.slots.find(s => s.moves.slice(0, 6).join(' ') === 'e4 e5 Nf3 Nc6 Bb5 Nf6');
        expect(berlin.variation).toBe('Ruy Lopez: Berlin Defense');
        // El nom del final de la línia queda reservat per quan estigui resolt:
        // «Exchange», «Rio Gambit»… ja delatarien la jugada que es demana.
        expect(berlin.variation).not.toBe(berlin.solvedVariation);
    });

    test('les frases del repertori no viatgen a una branca que ja no les compleix', () => {
        const ambFrases = Object.assign({}, ESPANYOLA, {
            movePhrases: ESPANYOLA.moves.map((m, i) => `frase del ply ${i}`)
        });
        const ix = Core.buildOpeningBranchIndex([ambFrases, ITALIANA, FRANCESA], ECO);
        const berlin = ix.slots.find(s => s.moves.slice(0, 6).join(' ') === 'e4 e5 Nf3 Nc6 Bb5 Nf6');
        // La branca es desvia al ply 5 (...Nf6 en comptes de ...a6): les frases
        // arriben fins allà i ni una més.
        expect(berlin.movePhrases.length).toBe(5);
        const principal = ix.slots.find(s => s.moves.slice(0, 6).join(' ') === 'e4 e5 Nf3 Nc6 Bb5 a6');
        expect(principal.movePhrases.length).toBeGreaterThan(5);
    });

    test('sense repertori o sense base ECO no hi ha índex, però no hi ha error', () => {
        expect(Core.buildOpeningBranchIndex([], ECO).slots).toEqual([]);
        expect(Core.buildOpeningBranchIndex(null, ECO).slots).toEqual([]);
        // Sense base ECO, el repertori encara dona les seves pròpies línies.
        const nom = Core.buildOpeningBranchIndex(REPERTORI, []);
        expect(nom.slots.length).toBeGreaterThan(0);
        nom.slots.forEach(s => expect(s.main).toBe(true));
    });
});

describe('pickOpeningBranchSlot', () => {
    const index = Core.buildOpeningBranchIndex(REPERTORI, ECO);

    test('filtra per color', () => {
        const negres = [];
        for (let i = 0; i < 20; i++) negres.push(Core.pickOpeningBranchSlot(index, { userColor: 'b', rng: () => i / 20 }));
        negres.forEach(s => expect(s.userColor).toBe('b'));
    });

    test('evita els exercicis recents', () => {
        const recentKeys = index.slots.slice(1).map(s => s.key);
        const picked = Core.pickOpeningBranchSlot(index, { recentKeys, rng: () => 0.99 });
        expect(picked.key).toBe(index.slots[0].key);
    });

    test('si tot és recent, torna a permetre qualsevol exercici', () => {
        const picked = Core.pickOpeningBranchSlot(index, { recentKeys: index.slots.map(s => s.key), rng: () => 0 });
        expect(picked).not.toBeNull();
    });

    test('no repeteix obertura tot seguit si pot canviar-ne', () => {
        const primer = index.slots.find(s => s.parentName === 'Obertura Espanyola');
        const seguent = Core.pickOpeningBranchSlot(index, { recentKeys: [primer.key], rng: () => 0 });
        expect(seguent.parentName).not.toBe('Obertura Espanyola');
    });

    test('índex buit o nul no dona res', () => {
        expect(Core.pickOpeningBranchSlot(null, {})).toBeNull();
        expect(Core.pickOpeningBranchSlot({ slots: [] }, {})).toBeNull();
    });
});

describe('buildOpeningHieroglyphicFromSlot', () => {
    const index = Core.buildOpeningBranchIndex(REPERTORI, ECO);

    test('la branca es converteix en exercici legal i complet', () => {
        const berlin = index.slots.find(s => s.moves.slice(0, 6).join(' ') === 'e4 e5 Nf3 Nc6 Bb5 Nf6');
        const p = helpers.buildOpeningHieroglyphicFromSlot(berlin);
        expect(p.setupSan).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Nf6']);
        expect(p.solutionSan[0]).toBe('O-O');
        expect(p.userColor).toBe('w');
        expect(new Chess(p.fen).turn()).toBe('w');
        expect(p.isBranch).toBe(true);
        expect(p.variation).toBe('Ruy Lopez: Berlin Defense');
    });

    test('cada branca té la seva clau: no es trepitgen entre elles', () => {
        const keys = new Set(index.slots.map(s => helpers.buildOpeningHieroglyphicFromSlot(s)).filter(Boolean).map(p => p.key));
        expect(keys.size).toBe(index.slots.length);
    });

    test('una branca sense línia no dona exercici', () => {
        expect(helpers.buildOpeningHieroglyphicFromSlot(null)).toBeNull();
        expect(helpers.buildOpeningHieroglyphicFromSlot({ moves: [] })).toBeNull();
    });

    test('la tria construeix l’exercici de debò', () => {
        const p = helpers.pickOpeningBranchHieroglyphic(index, { rng: () => 0.5 });
        expect(p.solutionMoves.length).toBeGreaterThanOrEqual(2);
        expect(p.fen).toBeTruthy();
    });
});

// L'índex REAL: el repertori de l'app (CURATED_OPENINGS) contra la base ECO
// sencera (obertures.js, 3.626 línies). És el que veurà l'usuari.
describe('índex real (CURATED_OPENINGS × OPENINGS_DATA)', () => {
    function extreu(fitxer, nom) {
        const src = fs.readFileSync(path.join(__dirname, '..', fitxer), 'utf8');
        const inici = src.indexOf(`const ${nom} = [`);
        const fi = src.indexOf('\n];', inici);
        return new Function(`${src.slice(inici, fi + 3)}\n;return ${nom};`)();
    }
    const CURATED = extreu('app.js', 'CURATED_OPENINGS');
    const OPENINGS_DATA = extreu('obertures.js', 'OPENINGS_DATA');
    const index = Core.buildOpeningBranchIndex(CURATED, OPENINGS_DATA);

    test('les branques multipliquen els exercicis del repertori', () => {
        const soles = helpers.openingHieroglyphicCandidates(CURATED).length;
        expect(soles).toBeGreaterThan(50);
        expect(index.slots.length).toBeGreaterThan(soles * 5);
    });

    test('cap obertura del repertori es queda sense branques', () => {
        const cobertes = new Set(index.slots.map(s => s.parentIndex));
        CURATED.forEach((op, i) => {
            expect({ name: op.name, te: cobertes.has(i) }).toEqual({ name: op.name, te: true });
        });
    });

    test('hi ha exercicis dels dos colors i de tots els moviments d’arrencada', () => {
        const colors = new Set(index.slots.map(s => s.userColor));
        expect(Array.from(colors).sort()).toEqual(['b', 'w']);
        const starts = new Set(index.slots.map(s => s.startMoveNumber));
        expect(Array.from(starts).sort((a, b) => a - b)).toEqual(Core.OPENING_BRANCH_CONFIG.startMoveNumbers);
    });

    test('cap posició de partida repetida: una posició, un sol exercici', () => {
        expect(new Set(index.slots.map(s => s.key)).size).toBe(index.slots.length);
    });

    test('muntar l’índex és feina de text, no de tauler (ha de ser instantani)', () => {
        const t = Date.now();
        Core.buildOpeningBranchIndex(CURATED, OPENINGS_DATA);
        expect(Date.now() - t).toBeLessThan(3000);
    });

    // Fons de la qüestió: tota branca ha de ser jugable. Es comprova una mostra
    // ampla i determinista (construir-les totes amb chess.js costa minuts).
    test('les branques donen exercicis legals de cap a peus', () => {
        const mostra = index.slots.filter((s, i) => i % 6 === 0);
        expect(mostra.length).toBeGreaterThan(100);
        mostra.forEach(slot => {
            const p = helpers.buildOpeningHieroglyphicFromSlot(slot);
            expect({ key: slot.key, ok: !!p }).toEqual({ key: slot.key, ok: true });
            expect(p.solutionMoves.length).toBeGreaterThanOrEqual(Core.OPENING_BRANCH_CONFIG.minSteps);
            expect(p.solutionMoves.length).toBeLessThanOrEqual(Core.OPENING_HIERO_CONFIG.maxSteps);
            expect(p.replyMoves.length).toBe(p.solutionMoves.length - 1);
            const g = new Chess(p.fen);
            expect(g.turn()).toBe(p.userColor);
            expect(Number(p.fen.split(' ')[5])).toBe(p.startMoveNumber);
            p.solutionMoves.forEach((uci, i) => {
                const mv = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
                expect({ key: slot.key, legal: !!mv }).toEqual({ key: slot.key, legal: true });
                const reply = p.replyMoves[i];
                if (reply) {
                    const r = g.move({ from: reply.slice(0, 2), to: reply.slice(2, 4) });
                    expect({ key: slot.key, legal: !!r }).toEqual({ key: slot.key, legal: true });
                }
            });
            // L'última jugada de preparació és sempre del rival (es marca al tauler).
            expect(p.lastSetupMove.color).not.toBe(p.userColor);
        });
    }, 30000);

    test('la variant de sortida mai no delata la solució', () => {
        // Es mostra el nom de la posició de PARTIDA: cap nom pot venir d'una
        // línia més llarga que les jugades ja fetes.
        index.slots.filter((s, i) => i % 9 === 0).forEach(slot => {
            const p = helpers.buildOpeningHieroglyphicFromSlot(slot);
            if (!p || !slot.variation) return;
            const setup = p.setupSan.join(' ');
            const trobat = OPENINGS_DATA.some(o => o.name === slot.variation
                && setup.startsWith(Core.parsePgnToMoves(o.pgn).join(' ')));
            expect({ key: slot.key, delatat: !trobat }).toEqual({ key: slot.key, delatat: false });
        });
    }, 30000);
});
