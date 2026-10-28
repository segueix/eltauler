const { Chess } = require('chess.js');
const TV = require('../stockfishtv');

const ABSOLUTE_PIN = '4k3/7p/2n5/8/8/8/P7/5BK1 w - - 0 1';
const RELATIVE_PIN = '4q1k1/7p/2n5/8/8/8/P7/5BK1 w - - 0 1';
const SKEWER = '4q3/7p/2k5/8/8/8/P7/5BK1 w - - 0 1';
const DISCOVERY = 'q6k/8/8/8/8/8/B6K/R7 w - - 0 1';
const DEFENDER = '7k/8/8/8/3q4/5n2/6B1/3R3K w - - 0 1';
const FORK = '4k3/8/8/2n1b3/8/2PP4/8/4K3 w - - 0 1';

function step(fen, san, memory, ply = 0, tier = 'mid') {
    const g = new Chess(fen);
    const move = g.move(san);
    if (!move) throw new Error('Jugada il·legal: ' + san);
    return { ...TV.tvBroadcastStep({ ChessCtor: Chess, fenBefore: fen, fenAfter: g.fen(), move,
        end: TV.tvGameEnd(g), memory, ply, tier }), fen: g.fen() };
}
function sequence(fen, sans) {
    let memory = TV.tvEmptyMemory();
    return sans.map((san, ply) => {
        const s = step(fen, san, memory, ply);
        fen = s.fen; memory = s.memory;
        return s;
    });
}
function candidate(fen, san, kind) { return step(fen, san).candidates.find(c => c.kind === kind); }

describe('motius tàctics en la retransmissió', () => {
    test('clavada absoluta: diu el nom i la restricció de la línia, sense prometre material', () => {
        const s = step(ABSOLUTE_PIN, 'Bb5', undefined, 0, 'basic');
        expect(s.comment.kind).toBe('pin');
        expect(s.comment.text).toMatch(/clava/);
        expect(s.comment.text).toMatch(/rei/);
        expect(s.comment.defined).toBe('pin-absolute');
        expect(s.comment.text).toMatch(/abandonar la línia/);
        expect(s.comment.text).not.toMatch(/guany|no es pot moure/);
        expect(s.memory.tactics[0].front).toBe('c6');
    });

    test('clavada relativa: no afirma que moure la peça sigui il·legal', () => {
        const pin = candidate(RELATIVE_PIN, 'Bb5', 'pin');
        expect(pin.text).toMatch(/cavall.*dama/);
        expect(pin.define.text).toMatch(/peça més valuosa/);
        expect(pin.variants.join(' ')).not.toMatch(/no pot|no es pot|obligat/);
    });

    test('també comenta les tàctiques de les negres amb el color correcte', () => {
        const pin = candidate('5bk1/p7/8/8/8/2N5/7P/4K3 b - - 0 1', 'Bb4', 'pin');
        expect(pin.text).toMatch(/alfil negre/);
        expect(pin.payload.tactic.color).toBe('b');
        expect(pin.payload.tactic.targets.every(t => t.color === 'w')).toBe(true);
    });

    test('una torre clavada pot moure’s al llarg de la línia', () => {
        const s = step('4k3/7p/4r3/8/8/8/P7/3R2K1 w - - 0 1', 'Re1');
        expect(s.comment.kind).toBe('pin');
        expect(new Chess(s.fen).move('Re7')).toBeTruthy();
        expect(s.comment.text).not.toMatch(/no es pot moure/);
    });

    test('enfilada al rei i la dama: comenta l’escac i no anuncia cap guany', () => {
        const s = step(SKEWER, 'Bb5+');
        expect(s.comment.kind).toBe('skewer');
        expect(s.comment.text).toMatch(/enfilada/i);
        expect(s.comment.text).toMatch(/escac/i);
        expect(s.comment.text).not.toMatch(/guany|captura la dama/);
    });

    test('ignora bloquejadors intermedis, peces iguals i atacants sense captura legal', () => {
        expect(candidate('4k3/3p4/2n5/8/8/8/P7/5BK1 w - - 0 1', 'Bb5', 'pin')).toBeUndefined();
        expect(candidate('4b1k1/7p/2n5/8/8/8/P7/5BK1 w - - 0 1', 'Bb5', 'pin')).toBeUndefined();
        expect(candidate('4r1k1/8/8/1q6/2n5/3P4/4B3/4K3 w - - 0 1', 'd4', 'pin')).toBeUndefined();
    });

    test('no repeteix una clavada que ja existia abans d’una jugada aliena', () => {
        const g = new Chess(ABSOLUTE_PIN);
        g.move('Bb5'); g.move('h6');
        expect(candidate(g.fen(), 'a3', 'pin')).toBeUndefined();
    });

    test('anomena la descoberta i conserva la seva amenaça en memòria', () => {
        const s = step(DISCOVERY, 'Bb3');
        expect(s.comment.kind).toBe('discovered-attack');
        expect(s.comment.text).toMatch(/descoberta/);
        expect(s.memory.tactics[0]).toMatchObject({ attackerSq: 'a1', targets: [{ sq: 'a8', type: 'q', color: 'b' }] });
    });

    test('eliminació d’un defensor que realment podia recapturar', () => {
        const s = step(DEFENDER, 'Bxf3');
        expect(s.comment.kind).toBe('remove-defender');
        expect(s.comment.text).toMatch(/defensor/);
        expect(s.comment.text).toMatch(/dama/);
        expect(s.comment.text).not.toMatch(/guanya|guanyat/);
        expect(candidate('7k/8/8/8/8/5p2/4r1B1/4R2K w - - 0 1', 'Bxf3', 'remove-defender')).toBeTruthy();
    });

    test('no presenta un defensor clavat com una defensa real', () => {
        expect(candidate('5k2/8/8/8/3q4/5n2/6B1/3R1R1K w - - 0 1', 'Bxf3', 'remove-defender')).toBeUndefined();
    });

    test('no anuncia eliminació si queda un altre defensor', () => {
        expect(candidate('7k/8/8/4p3/3q4/5n2/6B1/3R3K w - - 0 1', 'Bxf3', 'remove-defender')).toBeUndefined();
    });
});

describe('continuïtat del relat tàctic', () => {
    test('salvar una peça de la forquilla no salva l’altra; després narra la captura', () => {
        const rows = sequence(FORK, ['d4', 'Bf6', 'dxc5']);
        expect(rows[0].comment.kind).toBe('fork');
        expect(rows[1].comment.kind).toBe('tactic-reply');
        expect(rows[1].comment.text).toMatch(/però.*cavall.*sota atac/);
        expect(rows[1].comment.text).not.toMatch(/neutralitzen|eviten la forquilla/);
        expect(rows[2].comment.text).toMatch(/captura el cavall/);
        expect(rows[2].comment.text).not.toMatch(/guanya/);
        expect(rows[2].memory.tactics).toHaveLength(0);
    });

    test('capturar l’atacant neutralitza la forquilla', () => {
        const rows = sequence(FORK, ['d4', 'Bxd4']);
        expect(rows[1].comment.kind).toBe('tactic-reply');
        expect(rows[1].comment.text).toMatch(/neutralitzen la forquilla capturant el peó/);
    });

    test('un contraescac no es presenta com si les peces ja no estiguessin atacades', () => {
        const rows = sequence(FORK, ['d4', 'Bg3+']);
        expect(rows[1].comment.text).toMatch(/escac/i);
        expect(rows[1].comment.text).not.toMatch(/neutralitzen la forquilla|ja no queden atacades/);
    });

    test('el rei desfà la clavada quan abandona la línia', () => {
        const rows = sequence(ABSOLUTE_PIN, ['Bb5', 'Kf8']);
        expect(rows[1].comment.kind).toBe('tactic-reply');
        expect(rows[1].comment.text).toMatch(/desfan la clavada/);
    });

    test('moure una torre per la mateixa línia no desfà la clavada', () => {
        const rows = sequence('4k3/7p/4r3/8/8/8/P7/3R2K1 w - - 0 1', ['Re1', 'Re7']);
        expect(rows[0].comment.kind).toBe('pin');
        expect(rows[1].candidates.filter(c => c.kind === 'tactic-reply')).toHaveLength(0);
    });

    test('sortir d’una clavada relativa pot exposar la dama', () => {
        const rows = sequence(RELATIVE_PIN, ['Bb5', 'Na5', 'Bxe8']);
        expect(rows[1].comment.text).toMatch(/deixa la dama sota atac/);
        expect(rows[2].comment.text).toMatch(/captura la dama/);
    });

    test('segueix la peça posterior de l’enfilada després que es mogui el rei', () => {
        const rows = sequence(SKEWER, ['Bb5+', 'Kd6', 'Bxe8']);
        expect(rows[1].comment.text).toMatch(/rei.*però.*dama.*sota atac/);
        expect(rows[2].comment.text).toMatch(/captura la dama/);
    });

    test('comenta la fugida després d’una descoberta o d’eliminar el defensor', () => {
        expect(sequence(DISCOVERY, ['Bb3', 'Qb8'])[1].comment.text).toMatch(/neutralitzen l'atac a la descoberta/);
        expect(sequence(DEFENDER, ['Bxf3', 'Qc4'])[1].comment.text).toMatch(/s’aparta de l’atac després de quedar sense defensor/);
    });

    test('no recorda tàctiques que no s’han explicat ni reprèn una història caducada', () => {
        const first = step(FORK, 'd4');
        expect(step(first.fen, 'Bf6', TV.tvEmptyMemory(), 1).candidates.some(c => c.kind === 'tactic-reply')).toBe(false);
        expect(step(first.fen, 'Bf6', first.memory, 10).candidates.some(c => c.kind === 'tactic-reply')).toBe(false);
        // La memòria d’entrada és immutable (desfer una jugada la reutilitza).
        const snapshot = JSON.stringify(first.memory);
        step(first.fen, 'Bf6', first.memory, 1);
        expect(JSON.stringify(first.memory)).toBe(snapshot);
    });

    test('la definició no es repeteix i el nivell avançat la pot ometre', () => {
        const first = step(ABSOLUTE_PIN, 'Bb5', undefined, 0, 'basic');
        const pin = first.candidates.find(c => c.kind === 'pin');
        const nextPin = { ...pin, key: 'altra-clavada', sig: 'nova', variants: ['Una altra peça queda clavada.'] };
        expect(TV.tvSelectComment([nextPin], first.memory, { ply: 6, tier: 'basic' }).defined).toBeNull();
        expect(step(ABSOLUTE_PIN, 'Bb5', undefined, 0, 'advanced').comment.defined).toBeNull();
    });
});
