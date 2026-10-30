const P = require('../antidoteprogress.js');

function makeGame(id, day, results, options = {}) {
    return {
        id, mode: 'antidote',
        createdAt: new Date(Date.UTC(2026, 0, day)).toISOString(),
        timeControl: options.clock === undefined ? 'none' : options.clock,
        antidote: { tests: results.map((result, index) => Object.assign({
            id: id + '-t' + index, theme: options.theme || 'missed_tactic',
            phase: options.phase || 'middlegame', result: result
        }, (options.overrides || {})[index] || {})) }
    };
}
function sixGames(oldResult, newResult) {
    return [3, 3, 2, 3, 3, 2].map((count, index) =>
        makeGame('g' + index, index + 1, Array(count).fill(index < 3 ? oldResult : newResult)));
}
describe('Rival Antídot: seguiment del progrés real', () => {
    test('detecta millora sostinguda amb finestres de 8 decisions i 3 partides per finestra', () => {
        const r = P.analyze(sixGames('failed', 'passed'));
        expect(r.eligibleTests).toBe(16);
        expect(r.compared).toBe(1);
        expect(r.rows[0]).toMatchObject({
            n: 8, previousRate: 0, recentRate: 100, delta: 100,
            previousGames: 3, recentGames: 3, status: 'millora', consistent: true
        });
        expect(r.mostImproved.theme).toBe('missed_tactic');
    });

    test('detecta retrocés en diverses partides sense culpar el jugador', () => {
        const r = P.analyze(sixGames('passed', 'failed'));
        expect(r.rows[0].status).toBe('retrocess');
        expect(r.mostImproved).toBeNull();
    });

    test('amb poques proves, no inventa tendència', () => {
        const r = P.analyze([makeGame('a', 1, ['passed']), makeGame('b', 2, ['passed'])]);
        expect(r.compared).toBe(0);
        expect(r.rows[0]).toMatchObject({ status: 'insuficient', previousRate: null, delta: null });
    });

    test('moltes proves concentrades en una partida no demostren millora', () => {
        const r = P.analyze([makeGame('g1', 1, Array(8).fill('failed')),
            makeGame('g2', 2, Array(8).fill('passed'))]);
        expect(r.compared).toBe(0);
        expect(r.rows[0].status).toBe('insuficient');
    });

    test('primers intents, mai reintents que falsegin el resultat', () => {
        const g = sixGames('failed', 'passed');
        g[0].antidote.tests[0].firstResult = 'failed';
        g[0].antidote.tests[0].result = 'passed';
        g[0].antidote.tests[0].retried = true;
        expect(P.analyze(g).rows[0].previousRate).toBe(0);
        g[0].antidote.tests[1].retried = true;
        delete g[0].antidote.tests[1].firstResult;
        const r = P.analyze(g);
        expect(r.eligibleTests).toBe(15);
        expect(r.rows[0].n).toBe(7);
        expect(r.rows[0].status).toBe('indici-millora');
    });

    test('no mescla rellotge, fase, ni categories diferents', () => {
        const games = sixGames('failed', 'passed');
        games.slice(3).forEach(g => { g.timeControl = '3+2'; });
        expect(P.analyze(games).compared).toBe(0);
        games.forEach(g => { g.timeControl = 'none'; });
        games.slice(3).forEach(g => { g.antidote.tests.forEach(t => { t.phase = 'endgame'; }); });
        expect(P.analyze(games).compared).toBe(0);
        games.forEach(g => { g.antidote.tests.forEach(t => { t.phase = 'middlegame'; }); });
        games.slice(3).forEach(g => { g.antidote.tests.forEach(t => { t.theme = 'king_safety'; }); });
        expect(P.analyze(games).compared).toBe(0);
    });

    test('no confon un percentatge acumulat alt amb millora', () => {
        const games = sixGames('passed', 'passed');
        const r = P.analyze(games);
        expect(r.rows[0]).toMatchObject({ previousRate: 100, recentRate: 100, delta: 0, status: 'sense-canvi-clar' });
        expect(r.mostImproved).toBeNull();
    });

    test('sense evidència consistent, només informa d’un indici', () => {
        const games = [makeGame('a', 1, ['failed', 'failed']),
            makeGame('b', 2, ['failed', 'failed']),
            makeGame('c', 3, ['passed', 'passed']),
            makeGame('d', 4, ['passed', 'passed'])];
        const r = P.analyze(games);
        expect(r.rows[0]).toMatchObject({ n: 4, status: 'indici-millora', consistent: false });
        expect(r.mostImproved).toBeNull();
    });

    test('ignora inconclusives, pendents, importades, duplicats i dades corruptes', () => {
        const games = sixGames('failed', 'passed');
        const extra = makeGame('extra', 12, ['pending', 'inconclusive', 'passed']);
        extra.antidote.tests[2].id = 'repeated';
        extra.antidote.tests.push({ id: 'repeated', theme: 'missed_tactic', phase: 'middlegame', result: 'passed' });
        const imported = makeGame('imported', 13, Array(20).fill('failed'));
        imported.imported = true;
        const bad = makeGame('bad', 13, ['passed']);
        bad.createdAt = 'not-a-date';
        const r = P.analyze([null, ...games.slice().reverse(), ...games, extra, imported, bad]);
        expect(r.eligibleTests).toBe(17);
        expect(r.games).toBe(7);
        expect(r.rows[0].status).toBe('millora');
    });

    test('compatible amb registres antics sense fase o ritme, però sense barrejar-los amb els nous', () => {
        const old = sixGames('failed', 'passed').map(g => {
            delete g.timeControl;
            g.antidote.tests.forEach(t => { delete t.phase; });
            return g;
        });
        const r = P.analyze(old);
        expect(r.rows[0].context).toContain('fase no indicada');
        expect(r.rows[0].context).toContain('ritme no indicat');
        expect(r.rows[0].status).toBe('millora');
    });
});
