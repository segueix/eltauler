const Core = require('../core.js');

// L'historial de jeroglífics es desa del més recent al més antic. La fusió amb
// el núvol tallava per la cua de la llista (els 10 «últims» = els més antics) i
// a cada sincronització es perdien els jeroglífics que s'acabaven de resoldre.

const T0 = 1_700_000_000_000;
const entry = (n, extra = {}) => Object.assign({ id: 'hg_' + n, fen: 'fen ' + n, solved: true, ts: T0 + n * 1000, createdAt: T0 + n * 1000 }, extra);
const history = (from, to) => { const out = []; for (let n = to; n >= from; n--) out.push(entry(n)); return out; };

describe('fusió de l’historial de jeroglífics', () => {
    test('conserva els més recents, del més nou al més antic', () => {
        const local = history(1, 120);           // 120 jeroglífics, el 120 és el més nou
        const cloud = history(1, 100);
        const merged = Core.syncMergeHieroglyphicHistory(local, cloud);
        expect(merged).toHaveLength(100);
        expect(merged[0].fen).toBe('fen 120');
        expect(merged[99].fen).toBe('fen 21');
    });
    test('un jeroglífic nou d’un aparell no desapareix en fusionar amb un historial ple', () => {
        const cloud = history(1, 10);
        const local = [entry(11)].concat(history(2, 10));
        const merged = Core.syncMergeHieroglyphicHistory(local, cloud, 10);
        expect(merged.map(e => e.fen)).toContain('fen 11');
        expect(merged[0].fen).toBe('fen 11');
        expect(merged.map(e => e.fen)).not.toContain('fen 1');
    });
    test('el mateix jeroglífic amb ids diferents queda una sola vegada; guanya l’intent més recent sense perdre la marca neta', () => {
        const a = entry(5, { id: 'hg_a', solved: true, firstTry: true, cleanSolved: true, ts: T0 + 5000 });
        const b = entry(5, { id: 'hg_b', solved: false, cleanSolved: false, wrongMoves: 2, ts: T0 + 9000, createdAt: T0 + 8000 });
        const merged = Core.syncMergeHieroglyphicHistory([b], [a]);
        expect(merged).toHaveLength(1);
        expect(merged[0].ts).toBe(T0 + 9000);
        expect(merged[0].wrongMoves).toBe(2);
        expect(merged[0].cleanSolved).toBe(true);
        expect(merged[0].createdAt).toBe(T0 + 5000);
    });
    test('la fusió de la instantània fa servir aquesta regla i és convergent', () => {
        const local = { eltauler_hieroglyphic_history: JSON.stringify([entry(30)].concat(history(1, 12))) };
        const cloud = { eltauler_hieroglyphic_history: JSON.stringify([entry(25)].concat(history(1, 12))) };
        const ab = JSON.parse(Core.mergeSyncSnapshots(local, cloud).eltauler_hieroglyphic_history);
        const ba = JSON.parse(Core.mergeSyncSnapshots(cloud, local).eltauler_hieroglyphic_history);
        expect(ab.map(e => e.fen)).toEqual(ba.map(e => e.fen));
        expect(ab.slice(0, 2).map(e => e.fen)).toEqual(['fen 30', 'fen 25']);
        expect(ab).toHaveLength(14);
    });
    test('les altres llistes desades del més nou al més antic també conserven els més nous', () => {
        const tasks = (from, to) => { const out = []; for (let n = to; n >= from; n--) out.push({ type: 'tactics', theme: 't' + n, fen: null, timestamp: T0 + n }); return out; };
        const merged = JSON.parse(Core.mergeSyncSnapshots(
            { eltauler_growth_task_history: JSON.stringify(tasks(5, 24)) },
            { eltauler_growth_task_history: JSON.stringify(tasks(1, 20)) }).eltauler_growth_task_history);
        expect(merged).toHaveLength(20);
        expect(merged[0].theme).toBe('t24');
        expect(merged[19].theme).toBe('t5');
    });
});
