const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Banc de tàctiques per temes (tema feble de «Què toca avui?»): posicions de
// la base oberta de problemes de Lichess (CC0) agrupades per forquilles,
// clavades, raigs X i finals. Cada grup ha de tenir prou posicions perquè una
// tanda del tema no es repeteixi de seguida, i cada posició ha de tenir la
// línia verificada al rebost (tactics.test.js ja comprova que la segona
// jugada té resultat palpable).
// ---------------------------------------------------------------------------
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const start = src.indexOf('const TACTICS_BANK = [');
const bankSrc = src.slice(start, src.indexOf('\n];', start));
const themed = bankSrc.slice(bankSrc.indexOf('Temes concrets per a «Què toca avui?»'));
const SOLUTIONS = (() => {
    const s = src.indexOf('const TACTICS_BANK_SOLUTIONS = ');
    const e = src.indexOf('\n};', s);
    return new Function(`${src.slice(s, e + 3)}\n;return TACTICS_BANK_SOLUTIONS;`)();
})();

function groups() {
    const out = {};
    let cur = null;
    themed.split('\n').forEach(line => {
        const head = line.match(/^ {4}\/\/ (Forquilles|Clavades|Raigs X \(enfilades\)|Finals)$/);
        if (head) { cur = head[1]; out[cur] = []; return; }
        const pos = line.match(/^ {4}'([^']+)', \/\/ Lichess (\w+) · (\d+)$/);
        if (pos && cur) out[cur].push({ fen: pos[1], id: pos[2], rating: Number(pos[3]) });
    });
    return out;
}

describe('banc de tàctiques per temes', () => {
    const g = groups();

    test('quatre grups amb prou posicions cadascun', () => {
        expect(Object.keys(g)).toEqual(['Forquilles', 'Clavades', 'Raigs X (enfilades)', 'Finals']);
        Object.keys(g).forEach(k => expect({ k, n: g[k].length >= 8 }).toEqual({ k, n: true }));
    });
    test('cada posició porta la seva referència de Lichess i no es repeteix', () => {
        const all = [].concat(...Object.values(g));
        expect(new Set(all.map(p => p.fen)).size).toBe(all.length);
        expect(new Set(all.map(p => p.id)).size).toBe(all.length);
        all.forEach(p => {
            expect(p.rating).toBeGreaterThanOrEqual(900);
            expect(p.rating).toBeLessThanOrEqual(2000);
        });
    });
    test('totes tenen la línia de dues jugades al rebost', () => {
        [].concat(...Object.values(g)).forEach(p => {
            const sol = SOLUTIONS[p.fen];
            expect({ id: p.id, ok: !!sol && sol.steps.length >= 2 && sol.replies.length >= 1 }).toEqual({ id: p.id, ok: true });
        });
    });
    test('la llicència i l’origen consten al banc', () => {
        expect(themed).toContain('https://database.lichess.org/#puzzles');
        expect(themed).toContain('CC0');
    });
});
