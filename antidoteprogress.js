// Seguiment del progrés real del Rival Antídot.
// Derivat exclusivament de proves finalitzades de partides pròpies, sense
// comptadors paral·lels: l'historial sincronitzat és la font de veritat.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ElTaulerAntidoteProgress = factory();
})(typeof window === 'undefined' ? {} : window, function () {
    'use strict';

    const RESULTS = { passed: 1, partial: 0.5, failed: 0 };
    const PHASES = {
        opening: 'obertura',
        middlegame: 'mig joc',
        endgame: 'final'
    };
    const MAX_WINDOW = 8;
    const MIN_WINDOW = 4;

    function validResult(value) {
        return Object.prototype.hasOwnProperty.call(RESULTS, value);
    }

    function score(rows) {
        if (!rows.length) return null;
        return rows.reduce((sum, item) => sum + RESULTS[item.result], 0) / rows.length;
    }

    function uniqueGames(rows) {
        return new Set(rows.map(r => r.gameId)).size;
    }

    function dateOf(entry) {
        const raw = entry && (entry.date || entry.createdAt || entry.updatedAt);
        const n = typeof raw === 'number' ? raw : Date.parse(raw || '');
        return Number.isFinite(n) && n > 0 ? n : null;
    }

    // S'agrupen només decisions comparables: mateixa família, fase i control
    // de temps. Els registres sense fase/ritme explícits no es barregen amb
    // altres condicions (compatibilitat amb historials antics).
    function collect(entries) {
        const groups = new Map();
        const seenGames = new Set();
        let eligible = 0;
        (Array.isArray(entries) ? entries : []).forEach((entry, gameIndex) => {
            if (!entry || entry.mode !== 'antidote' ||
                entry.imported === true || entry.isImported === true ||
                entry.source === 'import') return;
            const when = dateOf(entry);
            if (when === null || !entry.antidote || !Array.isArray(entry.antidote.tests)) return;
            const gameId = entry.id ? String(entry.id) : 'local-' + gameIndex;
            if (seenGames.has(gameId)) return;
            seenGames.add(gameId);
            const clock = typeof entry.timeControl === 'string' && entry.timeControl.trim()
                ? entry.timeControl.trim() : 'desconegut';
            const seenTests = new Set();
            entry.antidote.tests.forEach((test, testIndex) => {
                if (!test || !test.theme || typeof test.theme !== 'string') return;
                // El primer intent no és substituïble pels reintents; si el
                // registre antic no el guarda, aquesta prova es descarta.
                const result = validResult(test.firstResult) ? test.firstResult
                    : (test.retried ? null : test.result);
                if (!validResult(result)) return;
                const testId = test.id ? String(test.id) : 'pos-' + testIndex;
                if (seenTests.has(testId)) return;
                seenTests.add(testId);
                const phase = Object.prototype.hasOwnProperty.call(PHASES, test.phase)
                    ? test.phase : 'desconeguda';
                const key = JSON.stringify([test.theme, phase, clock]);
                if (!groups.has(key)) groups.set(key, {
                    theme: test.theme, phase: phase, clock: clock, rows: []
                });
                groups.get(key).rows.push({
                    gameId: gameId, result: result, at: when,
                    index: gameIndex, testIndex: testIndex
                });
                eligible++;
            });
        });
        return { groups: groups, eligible: eligible, games: seenGames.size };
    }

    function compareGroup(group) {
        const items = group.rows.slice().sort((a, b) =>
            a.at - b.at || a.index - b.index || a.testIndex - b.testIndex);
        const windowSize = Math.min(MAX_WINDOW, Math.floor(items.length / 2));
        const recent = items.slice(-windowSize);
        const prior = items.slice(-windowSize * 2, -windowSize);
        const priorGames = uniqueGames(prior);
        const recentGames = uniqueGames(recent);
        const enough = windowSize >= MIN_WINDOW && priorGames >= 2 && recentGames >= 2;
        const before = enough ? score(prior) : null;
        const after = enough ? score(recent) : null;
        const delta = enough ? Math.round((after - before) * 100) : null;
        const consistent = enough && windowSize === MAX_WINDOW &&
            priorGames >= 3 && recentGames >= 3;
        let status = 'insuficient';
        if (enough) {
            // La diferència entre proporcions té una incertesa considerable.
            // Un marge conservador evita premiar una oscil·lació petita.
            const se = Math.sqrt(
                before * (1 - before) / windowSize +
                after * (1 - after) / windowSize
            );
            const signal = Math.abs(after - before) >= 0.16 &&
                Math.abs(after - before) > 1.28 * se;
            if (consistent && signal) status = delta > 0 ? 'millora' : 'retrocess';
            else if (Math.abs(delta) >= 20) status = delta > 0 ? 'indici-millora' : 'indici-retrocess';
            else status = 'sense-canvi-clar';
        }
        const phaseLabel = PHASES[group.phase] || 'fase no indicada';
        const clockLabel = group.clock === 'none' ? 'sense rellotge'
            : (group.clock === 'desconegut' ? 'ritme no indicat' : group.clock);
        return {
            theme: group.theme,
            phase: group.phase,
            clock: group.clock,
            context: phaseLabel + ' · ' + clockLabel,
            total: items.length,
            previousGames: priorGames,
            recentGames: recentGames,
            n: windowSize,
            previousRate: before === null ? null : Math.round(before * 100),
            recentRate: after === null ? null : Math.round(after * 100),
            delta: delta,
            status: status,
            consistent: consistent,
            lastAt: items.length ? items[items.length - 1].at : 0
        };
    }

    function analyze(entries) {
        const collected = collect(entries);
        const rows = Array.from(collected.groups.values()).map(compareGroup)
            .sort((a, b) => b.lastAt - a.lastAt || b.total - a.total);
        const compared = rows.filter(r => r.status !== 'insuficient');
        const improved = rows.filter(r => r.status === 'millora');
        const regressed = rows.filter(r => r.status === 'retrocess');
        return {
            games: collected.games,
            eligibleTests: collected.eligible,
            rows: rows,
            compared: compared.length,
            improved: improved,
            regressed: regressed,
            // Només una millora contrastada (no el percentatge acumulat més alt).
            mostImproved: improved.slice().sort((a, b) => b.delta - a.delta)[0] || null
        };
    }

    return { analyze: analyze, collect: collect, compareGroup: compareGroup };
});
