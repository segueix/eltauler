const fs = require('fs');
const path = require('path');
const { sound, reserveFenKey, addToPublicReserve } = require('../scripts/mine-hieroglyphics');
const shared = require('../jeroglifics-reserva.js');

describe('banc de jeroglífics comuns generat dues vegades al dia', () => {
    test('les posicions publicades són correctes i la reserva té mostres de prova', () => {
        expect(shared.length).toBeGreaterThanOrEqual(3);
        expect(shared.slice(0, 3).every(sound)).toBe(true);
    });

    test('un exercici nou entra al davant, es valida i no es repeteix mai en el mateix banc', () => {
        const now = 1793401200000;
        const initial = [{ ...shared[2] }];
        const next = addToPublicReserve(initial, shared[0], 240, now);
        expect(next).toHaveLength(2);
        expect(next[0].fen).toBe(shared[0].fen);
        expect(next[0]).toMatchObject({
            source: 'reserve', publishedAt: now, status: 'new',
            createdAt: 0, updatedAt: 0, attempts: 0
        });
        expect(sound(next[0])).toBe(true);
        expect(addToPublicReserve(next, shared[0], 240, now + 1)).toBeNull();
        expect(addToPublicReserve(next, { ...shared[0], fen: '' }, 240, now)).toBeNull();
        expect(reserveFenKey('8/8/8/8/8/8/8/8 w - - 5 1'))
            .toBe('8/8/8/8/8/8/8/8 w - -');
    });

    test('quan la reserva arriba al límit, el sistema continua afegint nous jeroglífics', () => {
        let bank = [shared[0], shared[1]];
        const next = addToPublicReserve(bank, shared[2], 2, Date.now());
        expect(next).toHaveLength(2);
        expect(next[0].fen).toBe(shared[2].fen);
        expect(next[1].fen).toBe(shared[0].fen);
        expect(bank).toHaveLength(2); // no muta la reserva original
    });

    test('GitHub disposa de dos horaris i desplega explícitament la reserva', () => {
        const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/jeroglifics-diaris.yml'), 'utf8');
        expect(workflow).toContain("cron: '17 6,18 * * *'");
        expect(workflow).toContain('node scripts/mine-hieroglyphics.js --add 3');
        expect(workflow).toContain('gh workflow run desplega-web.yml --ref main');
        expect(workflow).toContain('group: generacio-jeroglifics-compartits');
    });
});
